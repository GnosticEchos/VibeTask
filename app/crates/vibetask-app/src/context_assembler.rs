use crate::orchestrator_error::OrchestratorError;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use tiktoken_rs::{cl100k_base, CoreBPE};
use tracing::{debug, warn};

fn frontmatter_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?s)^---\n(.*?)\n---").expect("valid frontmatter regex"))
}

fn annotation_tag_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"#annotate\[([^\]]+)\]\s*:\s*(.+)").expect("valid annotation regex")
    })
}

fn summarization_preserve_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            vec![
                Regex::new(r"(?i)^#+\s*(api|endpoint|interface|signature)")
                    .expect("valid summarization preserve regex"),
                Regex::new(r"(?i)^#+\s*(requirement|acceptance criteria)")
                    .expect("valid summarization preserve regex"),
                Regex::new(r"(?i)^#+\s*(error|exception|failure)")
                    .expect("valid summarization preserve regex"),
                Regex::new(r"```[\w]*\n.*?\n```").expect("valid summarization preserve regex"),
                Regex::new(r"\|.*\|.*\|").expect("valid summarization preserve regex"),
            ]
        })
        .as_slice()
}

fn summarization_cleanup_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\n{3,}").expect("valid summarization cleanup regex"))
}

/// Token budget allocations with Constitution immutability guarantee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBudget {
    /// Task metadata (title, status, assignee, etc.)
    pub metadata: usize,
    /// Agent persona description and instructions
    pub persona: usize,
    /// Constitution document (NEVER truncated)
    pub constitution: usize,
    /// Specification and related documents (can be summarized)
    pub specification: usize,
    /// Reserved buffer for response generation
    pub buffer: usize,
    /// Total hard limit
    pub total: usize,
}

impl TokenBudget {
    /// Create standard token budget with predefined allocations
    pub fn standard() -> Self {
        Self {
            metadata: 500,
            persona: 1000,
            constitution: 1500,
            specification: 2000,
            buffer: 500,
            total: 5500,
        }
    }

    /// Create emergency budget with reduced allocations (Constitution still protected)
    pub fn emergency() -> Self {
        Self {
            metadata: 300,
            persona: 500,
            constitution: 1500, // NEVER reduced
            specification: 1000,
            buffer: 300,
            total: 3600,
        }
    }

    /// Effectively disable summarization/truncation for human bypass flows (`--no-fences`).
    pub fn unlimited() -> Self {
        const HUGE: usize = 1_000_000_000;
        Self {
            metadata: HUGE,
            persona: HUGE,
            constitution: HUGE,
            specification: HUGE,
            buffer: 0,
            total: HUGE.saturating_mul(4),
        }
    }

    /// Validate that Constitution budget is never exceeded
    pub fn validate_constitution_size(
        &self,
        constitution_tokens: usize,
    ) -> Result<(), OrchestratorError> {
        if constitution_tokens > self.constitution {
            return Err(OrchestratorError::ConstitutionTooLarge {
                size: constitution_tokens,
                budget: self.constitution,
            });
        }
        Ok(())
    }

    /// Calculate remaining budget for specification after other components
    pub fn remaining_for_specification(
        &self,
        used_metadata: usize,
        used_persona: usize,
        used_constitution: usize,
    ) -> Result<usize, OrchestratorError> {
        let used_total = used_metadata + used_persona + used_constitution + self.buffer;

        if used_total > self.total {
            return Err(OrchestratorError::TokenBudgetExceeded {
                current_tokens: used_total,
                max_tokens: self.total,
            });
        }

        Ok(self.total - used_total)
    }
}

/// Token counter using tiktoken-rs for accurate GPT-4 token counting
#[derive(Debug)]
pub struct TokenCounter {
    encoder: CoreBPE,
}

impl TokenCounter {
    /// Create new token counter with cl100k_base encoding (GPT-4)
    pub fn new() -> Result<Self, OrchestratorError> {
        let encoder = cl100k_base().map_err(|e| OrchestratorError::ContextAssemblyFailed {
            reason: format!("Failed to initialize token encoder: {}", e),
        })?;

        Ok(Self { encoder })
    }

    /// Count tokens in text string
    pub fn count_tokens(&self, text: &str) -> usize {
        self.encoder.encode_with_special_tokens(text).len()
    }

    /// Count tokens in multiple text segments
    pub fn count_tokens_batch(&self, texts: &[&str]) -> Vec<usize> {
        texts.iter().map(|text| self.count_tokens(text)).collect()
    }

    /// Estimate tokens for structured content (JSON, YAML, etc.)
    pub fn count_structured_tokens(&self, content: &str) -> usize {
        // Add small overhead for structure tokens
        let base_tokens = self.count_tokens(content);
        (base_tokens as f64 * 1.1) as usize // 10% overhead for structure
    }
}

/// Context component with token tracking
#[derive(Debug, Clone)]
pub struct ContextComponent {
    pub name: String,
    pub content: String,
    pub token_count: usize,
    pub priority: ComponentPriority,
    pub can_truncate: bool,
}

impl ContextComponent {
    pub fn new(
        name: String,
        content: String,
        priority: ComponentPriority,
        can_truncate: bool,
        counter: &TokenCounter,
    ) -> Self {
        let token_count = counter.count_tokens(&content);

        Self {
            name,
            content,
            token_count,
            priority,
            can_truncate,
        }
    }

    /// Truncate content to fit within token limit
    pub fn truncate_to_fit(
        &mut self,
        max_tokens: usize,
        counter: &TokenCounter,
    ) -> Result<(), OrchestratorError> {
        if !self.can_truncate {
            return Err(OrchestratorError::ContextAssemblyFailed {
                reason: format!(
                    "Component '{}' cannot be truncated but exceeds budget",
                    self.name
                ),
            });
        }

        if self.token_count <= max_tokens {
            return Ok(()); // Already fits
        }

        // Binary search for optimal truncation point
        let chars: Vec<char> = self.content.chars().collect();
        let mut left = 0;
        let mut right = chars.len();
        let mut best_content = String::new();

        while left < right {
            let mid = (left + right).div_ceil(2);
            let truncated: String = chars[..mid].iter().collect();
            let truncated_with_suffix = format!(
                "{}...\n\n[Content truncated to fit token budget]",
                truncated
            );

            let tokens = counter.count_tokens(&truncated_with_suffix);

            if tokens <= max_tokens {
                best_content = truncated_with_suffix;
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        if best_content.is_empty() {
            return Err(OrchestratorError::ContextAssemblyFailed {
                reason: format!(
                    "Cannot truncate '{}' to fit {} tokens",
                    self.name, max_tokens
                ),
            });
        }

        self.content = best_content;
        self.token_count = counter.count_tokens(&self.content);

        debug!("Truncated '{}' to {} tokens", self.name, self.token_count);
        Ok(())
    }
}

/// Priority levels for context components
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ComponentPriority {
    /// Critical - never truncated (Constitution)
    Critical = 0,
    /// High - truncated only in emergency (Metadata, Persona)
    High = 1,
    /// Medium - can be summarized (Specifications)
    Medium = 2,
    /// Low - can be heavily truncated (Additional docs)
    Low = 3,
}

/// Emergency degradation modes when budget is exceeded
#[derive(Debug, Clone)]
pub enum EmergencyMode {
    /// Reduce non-critical allocations
    ReducedAllocations,
    /// Aggressive truncation of low-priority content
    AggressiveTruncation,
    /// Use emergency budget with minimal context
    MinimalContext,
}

/// Context assembly result with token usage breakdown
#[derive(Debug, Clone)]
pub struct AssemblyResult {
    pub components: Vec<ContextComponent>,
    pub total_tokens: usize,
    pub budget_used: TokenBudget,
    pub emergency_mode: Option<EmergencyMode>,
    pub warnings: Vec<String>,
}

impl AssemblyResult {
    /// Check if Constitution was preserved (never truncated)
    pub fn constitution_preserved(&self) -> bool {
        self.components
            .iter()
            .find(|c| c.name == "Constitution")
            .map(|c| !c.content.contains("[Content truncated"))
            .unwrap_or(true) // If no Constitution component, consider preserved
    }

    /// Get token usage breakdown by component
    pub fn token_breakdown(&self) -> HashMap<String, usize> {
        self.components
            .iter()
            .map(|c| (c.name.clone(), c.token_count))
            .collect()
    }

    /// Generate summary report
    pub fn summary_report(&self) -> String {
        let mut report = "Context Assembly Summary:\n".to_string();
        report.push_str(&format!(
            "Total tokens: {}/{}\n",
            self.total_tokens, self.budget_used.total
        ));

        if let Some(mode) = &self.emergency_mode {
            report.push_str(&format!("Emergency mode: {:?}\n", mode));
        }

        report.push_str("\nComponent breakdown:\n");
        for component in &self.components {
            let truncated = if component.content.contains("[Content truncated") {
                " (truncated)"
            } else {
                ""
            };
            report.push_str(&format!(
                "  {}: {} tokens{}\n",
                component.name, component.token_count, truncated
            ));
        }

        if !self.warnings.is_empty() {
            report.push_str("\nWarnings:\n");
            for warning in &self.warnings {
                report.push_str(&format!("  - {}\n", warning));
            }
        }

        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_budget_standard() {
        let budget = TokenBudget::standard();
        assert_eq!(budget.total, 5500);
        assert_eq!(budget.constitution, 1500);
        assert_eq!(
            budget.metadata
                + budget.persona
                + budget.constitution
                + budget.specification
                + budget.buffer,
            budget.total
        );
    }

    #[test]
    fn test_token_budget_emergency() {
        let budget = TokenBudget::emergency();
        assert_eq!(budget.constitution, 1500); // Constitution never reduced
        assert!(budget.total < TokenBudget::standard().total);
    }

    #[test]
    fn test_constitution_validation() {
        let budget = TokenBudget::standard();

        // Should pass
        assert!(budget.validate_constitution_size(1000).is_ok());

        // Should fail
        assert!(budget.validate_constitution_size(2000).is_err());
    }

    #[test]
    fn test_token_counter() {
        let counter = TokenCounter::new().unwrap();

        let text = "Hello, world!";
        let tokens = counter.count_tokens(text);
        assert!(tokens > 0);
        assert!(tokens < 10); // Should be a small number for this simple text
    }

    #[test]
    fn test_context_component_truncation() {
        let counter = TokenCounter::new().unwrap();
        let long_content =
            "This is a very long piece of content that should be truncated. ".repeat(100);

        let mut component = ContextComponent::new(
            "Test".to_string(),
            long_content,
            ComponentPriority::Medium,
            true,
            &counter,
        );

        let original_tokens = component.token_count;
        assert!(component.truncate_to_fit(100, &counter).is_ok());
        assert!(component.token_count <= 100);
        assert!(component.token_count < original_tokens);
        assert!(component.content.contains("[Content truncated"));
    }

    #[test]
    fn test_non_truncatable_component() {
        let counter = TokenCounter::new().unwrap();
        let content = "Critical content that cannot be truncated. ".repeat(100);

        let mut component = ContextComponent::new(
            "Constitution".to_string(),
            content,
            ComponentPriority::Critical,
            false, // Cannot truncate
            &counter,
        );

        // Should fail to truncate
        assert!(component.truncate_to_fit(50, &counter).is_err());
    }

    #[test]
    fn test_component_priority_ordering() {
        assert!(ComponentPriority::Critical < ComponentPriority::High);
        assert!(ComponentPriority::High < ComponentPriority::Medium);
        assert!(ComponentPriority::Medium < ComponentPriority::Low);
    }
}

/// Recursive summarization algorithm for large specifications
#[derive(Debug)]
pub struct RecursiveSummarizer {
    counter: TokenCounter,
    max_iterations: usize,
    preserve_patterns: &'static [Regex],
}

impl RecursiveSummarizer {
    /// Create new recursive summarizer with key section preservation
    pub fn new() -> Result<Self, OrchestratorError> {
        let counter = TokenCounter::new()?;

        // Patterns for key sections that should be preserved
        let preserve_patterns = summarization_preserve_patterns();

        Ok(Self {
            counter,
            max_iterations: 3,
            preserve_patterns,
        })
    }

    /// Recursively summarize content to fit within token budget
    pub async fn summarize_to_fit(
        &self,
        content: &str,
        target_tokens: usize,
        context: &str,
    ) -> Result<SummarizationResult, OrchestratorError> {
        let original_tokens = self.counter.count_tokens(content);

        if original_tokens <= target_tokens {
            return Ok(SummarizationResult {
                content: content.to_string(),
                original_tokens,
                final_tokens: original_tokens,
                iterations: 0,
                preserved_sections: Vec::new(),
                truncated: false,
            });
        }

        debug!(
            "Starting recursive summarization: {} -> {} tokens",
            original_tokens, target_tokens
        );

        // Extract and preserve key sections
        let preserved_sections = self.extract_key_sections(content);
        let preserved_content = preserved_sections.join("\n\n");
        let preserved_tokens = self.counter.count_tokens(&preserved_content);

        // Calculate available tokens for summarized content
        let available_for_summary = if preserved_tokens < target_tokens {
            target_tokens - preserved_tokens
        } else {
            // If preserved sections exceed budget, we have a problem
            warn!(
                "Preserved sections ({} tokens) exceed target budget ({} tokens)",
                preserved_tokens, target_tokens
            );
            target_tokens / 2 // Use half the budget for summary
        };

        // Remove preserved sections from content for summarization
        let content_to_summarize = self.remove_preserved_sections(content, &preserved_sections);

        // Perform iterative summarization
        let mut current_content = content_to_summarize;
        let mut iteration = 0;

        while iteration < self.max_iterations {
            let current_tokens = self.counter.count_tokens(&current_content);

            if current_tokens <= available_for_summary {
                break;
            }

            // Simulate LLM summarization (in real implementation, this would call an LLM)
            current_content = self
                .simulate_llm_summarization(&current_content, available_for_summary, context)
                .await?;
            iteration += 1;

            debug!(
                "Summarization iteration {}: {} tokens",
                iteration,
                self.counter.count_tokens(&current_content)
            );
        }

        // Combine preserved sections with summarized content
        let final_content = if preserved_sections.is_empty() {
            current_content
        } else {
            format!(
                "{}\n\n## Summarized Content\n\n{}",
                preserved_content, current_content
            )
        };

        let final_tokens = self.counter.count_tokens(&final_content);

        // If still too large, apply fallback truncation
        let (final_content, truncated) = if final_tokens > target_tokens {
            warn!("Summarization failed to meet target, applying fallback truncation");
            (
                self.fallback_truncation(&final_content, target_tokens)?,
                true,
            )
        } else {
            (final_content, false)
        };

        Ok(SummarizationResult {
            content: final_content.clone(),
            original_tokens,
            final_tokens: self.counter.count_tokens(&final_content),
            iterations: iteration,
            preserved_sections,
            truncated,
        })
    }

    /// Extract key sections that should be preserved
    fn extract_key_sections(&self, content: &str) -> Vec<String> {
        let mut preserved = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        let mut current_section = String::new();
        let mut in_preserved_section = false;

        for line in lines {
            let should_preserve = self
                .preserve_patterns
                .iter()
                .any(|pattern| pattern.is_match(line));

            if should_preserve {
                if !current_section.is_empty() && !in_preserved_section {
                    // Start new preserved section
                    current_section.clear();
                }
                in_preserved_section = true;
                current_section.push_str(line);
                current_section.push('\n');
            } else if in_preserved_section {
                // Check if we should continue the section (e.g., content under a header)
                if line.trim().is_empty() || line.starts_with(' ') || line.starts_with('\t') {
                    current_section.push_str(line);
                    current_section.push('\n');
                } else {
                    // End of preserved section
                    if !current_section.trim().is_empty() {
                        preserved.push(current_section.trim().to_string());
                    }
                    current_section.clear();
                    in_preserved_section = false;
                }
            }
        }

        // Add final section if we were in one
        if in_preserved_section && !current_section.trim().is_empty() {
            preserved.push(current_section.trim().to_string());
        }

        preserved
    }

    /// Remove preserved sections from content
    fn remove_preserved_sections(&self, content: &str, preserved: &[String]) -> String {
        let mut result = content.to_string();

        for section in preserved {
            result = result.replace(section, "");
        }

        // Clean up multiple newlines
        summarization_cleanup_regex()
            .replace_all(&result, "\n\n")
            .to_string()
    }

    /// Simulate LLM summarization (placeholder for actual LLM integration)
    async fn simulate_llm_summarization(
        &self,
        content: &str,
        target_tokens: usize,
        context: &str,
    ) -> Result<String, OrchestratorError> {
        // In a real implementation, this would call an LLM API
        // For now, we'll do a simple extractive summarization

        let sentences: Vec<&str> = content.split(". ").collect();
        let target_sentences = (sentences.len() as f64 * 0.6) as usize; // Keep 60% of sentences

        let mut summary_sentences = Vec::new();
        let mut current_tokens = 0;

        // Prioritize sentences with key terms from context
        let context_terms: Vec<&str> = context.split_whitespace().collect();
        let mut scored_sentences: Vec<(usize, &str)> = sentences
            .iter()
            .map(|sentence| {
                let score = context_terms
                    .iter()
                    .filter(|term| sentence.to_lowercase().contains(&term.to_lowercase()))
                    .count();
                (score, *sentence)
            })
            .collect();

        // Sort by score (descending) and take top sentences
        scored_sentences.sort_by_key(|a| std::cmp::Reverse(a.0));

        for (_, sentence) in scored_sentences.iter().take(target_sentences) {
            let sentence_tokens = self.counter.count_tokens(sentence);
            if current_tokens + sentence_tokens <= target_tokens {
                summary_sentences.push(*sentence);
                current_tokens += sentence_tokens;
            }
        }

        let summary = summary_sentences.join(". ");

        // Add summarization notice
        let final_summary = format!(
            "{}\n\n[Content summarized to fit token budget - {} sentences from {} original sentences]",
            summary,
            summary_sentences.len(),
            sentences.len()
        );

        Ok(final_summary)
    }

    /// Fallback truncation with meaningful suffixes
    fn fallback_truncation(
        &self,
        content: &str,
        target_tokens: usize,
    ) -> Result<String, OrchestratorError> {
        let chars: Vec<char> = content.chars().collect();
        let mut left = 0;
        let mut right = chars.len();
        let mut best_content = String::new();

        // Reserve tokens for suffix
        let suffix =
            "\n\n[Content truncated to fit token budget - see full specification in Knowledge Hub]";
        let suffix_tokens = self.counter.count_tokens(suffix);
        let available_tokens = target_tokens.saturating_sub(suffix_tokens);

        while left < right {
            let mid = (left + right).div_ceil(2);
            let truncated: String = chars[..mid].iter().collect();

            let tokens = self.counter.count_tokens(&truncated);

            if tokens <= available_tokens {
                best_content = truncated;
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        if best_content.is_empty() {
            return Err(OrchestratorError::ContextAssemblyFailed {
                reason: format!("Cannot truncate content to fit {} tokens", target_tokens),
            });
        }

        // Try to end at a sentence boundary
        if let Some(last_period) = best_content.rfind('.') {
            if best_content.len() - last_period < 100 {
                // If we're close to a sentence end
                best_content.truncate(last_period + 1);
            }
        }

        Ok(format!("{}{}", best_content, suffix))
    }
}

/// Result of recursive summarization process
#[derive(Debug, Clone)]
pub struct SummarizationResult {
    pub content: String,
    pub original_tokens: usize,
    pub final_tokens: usize,
    pub iterations: usize,
    pub preserved_sections: Vec<String>,
    pub truncated: bool,
}

impl SummarizationResult {
    /// Check if summarization was successful (met target without truncation)
    pub fn is_successful(&self) -> bool {
        !self.truncated
    }

    /// Get compression ratio
    pub fn compression_ratio(&self) -> f64 {
        if self.original_tokens == 0 {
            1.0
        } else {
            self.final_tokens as f64 / self.original_tokens as f64
        }
    }

    /// Generate summary report
    pub fn summary_report(&self) -> String {
        let mut report = format!(
            "Summarization Report:\n\
            Original: {} tokens\n\
            Final: {} tokens\n\
            Compression: {:.1}%\n\
            Iterations: {}\n",
            self.original_tokens,
            self.final_tokens,
            (1.0 - self.compression_ratio()) * 100.0,
            self.iterations
        );

        if !self.preserved_sections.is_empty() {
            report.push_str(&format!(
                "Preserved sections: {}\n",
                self.preserved_sections.len()
            ));
        }

        if self.truncated {
            report.push_str("Warning: Fallback truncation applied\n");
        }

        report
    }
}

#[tokio::test]
async fn test_recursive_summarizer() {
    let summarizer = RecursiveSummarizer::new().unwrap();

    let long_content = "## API Endpoints\n\nThis is important API information.\n\n".to_string()
        + &"This is regular content that can be summarized. ".repeat(100);

    let result = summarizer
        .summarize_to_fit(&long_content, 200, "API documentation")
        .await
        .unwrap();

    assert!(result.final_tokens <= 200);
    assert!(result.content.contains("API Endpoints")); // Key section preserved
    assert!(result.original_tokens > result.final_tokens);
}

#[test]
fn test_key_section_extraction() {
    let summarizer = RecursiveSummarizer::new().unwrap();

    let content = "# Overview\n\nSome content.\n\n## API Endpoints\n\nImportant API info.\n\n## Other Section\n\nRegular content.";

    let preserved = summarizer.extract_key_sections(content);
    assert!(!preserved.is_empty());
    assert!(preserved.iter().any(|s| s.contains("API Endpoints")));
}

#[test]
fn test_fallback_truncation() {
    let summarizer = RecursiveSummarizer::new().unwrap();

    let content = "This is a long piece of content. ".repeat(100);
    let result = summarizer.fallback_truncation(&content, 100).unwrap();

    let tokens = summarizer.counter.count_tokens(&result);
    assert!(tokens <= 100);
    assert!(result.contains("[Content truncated"));
}

#[test]
fn test_summarization_result() {
    let result = SummarizationResult {
        content: "Summarized content".to_string(),
        original_tokens: 1000,
        final_tokens: 500,
        iterations: 2,
        preserved_sections: vec!["API section".to_string()],
        truncated: false,
    };

    assert!(result.is_successful());
    assert_eq!(result.compression_ratio(), 0.5);

    let report = result.summary_report();
    assert!(report.contains("50.0%"));
    assert!(report.contains("Iterations: 2"));
}
/// Hie
/// Hierarchical context assembler with Knowledge Hub integration
#[derive(Debug)]
pub struct ContextAssembler {
    counter: TokenCounter,
    summarizer: RecursiveSummarizer,
}

impl ContextAssembler {
    /// Create new context assembler
    pub fn new() -> Result<Self, OrchestratorError> {
        let counter = TokenCounter::new()?;
        let summarizer = RecursiveSummarizer::new()?;

        Ok(Self {
            counter,
            summarizer,
        })
    }

    /// Assemble context with fixed priority: Metadata > Persona > Constitution > Spec
    pub async fn assemble_context(
        &self,
        request: ContextAssemblyRequest,
    ) -> Result<AssemblyResult, OrchestratorError> {
        let mut budget = if request.bypass_safety {
            TokenBudget::unlimited()
        } else if request.use_emergency_budget {
            TokenBudget::emergency()
        } else {
            TokenBudget::standard()
        };

        let mut components = Vec::new();
        let mut warnings = Vec::new();
        let mut emergency_mode = None;

        // STEP 1: Metadata (highest priority, can be truncated in emergency)
        let metadata_component = self.create_metadata_component(&request.metadata, &budget)?;
        let metadata_tokens = metadata_component.token_count;
        components.push(metadata_component);

        // STEP 2: Persona (high priority, can be truncated in emergency)
        let persona_component = self.create_persona_component(&request.persona, &budget)?;
        let persona_tokens = persona_component.token_count;
        components.push(persona_component);

        // STEP 3: Constitution (CRITICAL - never truncated, error if exceeds budget)
        let constitution_component =
            self.create_constitution_component(&request.constitution, &budget)?;
        let constitution_tokens = constitution_component.token_count;

        // Validate Constitution fits in budget (hard requirement)
        budget.validate_constitution_size(constitution_tokens)?;
        components.push(constitution_component);

        // STEP 4: Calculate remaining budget for Specification
        let remaining_budget = budget.remaining_for_specification(
            metadata_tokens,
            persona_tokens,
            constitution_tokens,
        )?;

        // STEP 5: Specification (can be summarized to fit)
        let spec_component = self
            .create_specification_component(
                &request.specification,
                remaining_budget,
                &request.task_context,
            )
            .await?;

        components.push(spec_component);

        // STEP 6: Check if we need emergency mode
        let total_tokens: usize = components.iter().map(|c| c.token_count).sum();

        if total_tokens > budget.total {
            // Try emergency budget
            budget = TokenBudget::emergency();
            emergency_mode = Some(EmergencyMode::ReducedAllocations);
            warnings.push("Switched to emergency budget due to size constraints".to_string());

            // Re-validate Constitution still fits
            budget.validate_constitution_size(constitution_tokens)?;

            // If still too large, apply aggressive truncation
            if total_tokens > budget.total {
                emergency_mode = Some(EmergencyMode::AggressiveTruncation);
                warnings.push("Applied aggressive truncation to fit emergency budget".to_string());

                // Truncate non-critical components
                self.apply_emergency_truncation(&mut components, &budget)?;
            }
        }

        // STEP 7: Final validation
        let final_total: usize = components.iter().map(|c| c.token_count).sum();

        if final_total > budget.total {
            return Err(OrchestratorError::TokenBudgetExceeded {
                current_tokens: final_total,
                max_tokens: budget.total,
            });
        }

        // STEP 8: Version pinning validation
        if let Some(version) = &request.version_pin {
            self.validate_version_consistency(version, &components)?;
        }

        Ok(AssemblyResult {
            components,
            total_tokens: final_total,
            budget_used: budget,
            emergency_mode,
            warnings,
        })
    }

    /// Create metadata component with task information
    fn create_metadata_component(
        &self,
        metadata: &TaskMetadata,
        budget: &TokenBudget,
    ) -> Result<ContextComponent, OrchestratorError> {
        let content = format!(
            "# Task Metadata\n\n\
            **Task ID**: {}\n\
            **Title**: {}\n\
            **Status**: {}\n\
            **Column**: {}\n\
            **Assignee**: {}\n\
            **Project**: {} (ID: {})\n\
            **Created**: {}\n\
            **Updated**: {}\n\n\
            **Description**:\n{}\n\n\
            **Requirements References**: {}\n",
            metadata.task_id,
            metadata.title,
            metadata.status,
            metadata.column,
            metadata.assignee.as_deref().unwrap_or("Unassigned"),
            metadata.project_name,
            metadata.project_id,
            metadata.created_at,
            metadata.updated_at,
            metadata.description,
            metadata.requirements_refs.join(", ")
        );

        let mut component = ContextComponent::new(
            "Metadata".to_string(),
            content,
            ComponentPriority::High,
            true, // Can be truncated in emergency
            &self.counter,
        );

        // Truncate if exceeds budget
        if component.token_count > budget.metadata {
            component.truncate_to_fit(budget.metadata, &self.counter)?;
        }

        Ok(component)
    }

    /// Create persona component with agent instructions
    fn create_persona_component(
        &self,
        persona: &AgentPersona,
        budget: &TokenBudget,
    ) -> Result<ContextComponent, OrchestratorError> {
        let content = format!(
            "# Agent Persona: {}\n\n\
            **Role**: {}\n\
            **Column Context**: {}\n\n\
            **Instructions**:\n{}\n\n\
            **Capabilities**:\n{}\n\n\
            **Constraints**:\n{}\n",
            persona.name,
            persona.role,
            persona.column,
            persona.instructions,
            persona.capabilities.join("\n- "),
            persona.constraints.join("\n- ")
        );

        let mut component = ContextComponent::new(
            "Persona".to_string(),
            content,
            ComponentPriority::High,
            true, // Can be truncated in emergency
            &self.counter,
        );

        // Truncate if exceeds budget
        if component.token_count > budget.persona {
            component.truncate_to_fit(budget.persona, &self.counter)?;
        }

        Ok(component)
    }

    /// Create Constitution component (NEVER truncated)
    fn create_constitution_component(
        &self,
        constitution: &ConstitutionDocument,
        _budget: &TokenBudget,
    ) -> Result<ContextComponent, OrchestratorError> {
        let content = format!(
            "# Constitution\n\n\
            **Version**: {}\n\
            **Last Updated**: {}\n\n\
            {}\n",
            constitution.version, constitution.updated_at, constitution.content
        );

        let component = ContextComponent::new(
            "Constitution".to_string(),
            content,
            ComponentPriority::Critical,
            false, // NEVER truncated
            &self.counter,
        );

        Ok(component)
    }

    /// Create specification component (can be summarized)
    async fn create_specification_component(
        &self,
        specification: &SpecificationDocument,
        available_tokens: usize,
        task_context: &str,
    ) -> Result<ContextComponent, OrchestratorError> {
        let base_content = format!(
            "# Specification\n\n\
            **Title**: {}\n\
            **Version**: {}\n\
            **State**: {:?}\n\
            **Last Updated**: {}\n\n\
            {}\n",
            specification.title,
            specification.version,
            specification.state,
            specification.updated_at,
            specification.content
        );

        // Check if summarization is needed
        let base_tokens = self.counter.count_tokens(&base_content);

        let final_content = if base_tokens > available_tokens {
            debug!(
                "Specification exceeds budget ({} > {}), applying summarization",
                base_tokens, available_tokens
            );

            let summary_result = self
                .summarizer
                .summarize_to_fit(&base_content, available_tokens, task_context)
                .await?;

            summary_result.content
        } else {
            base_content
        };

        let component = ContextComponent::new(
            "Specification".to_string(),
            final_content,
            ComponentPriority::Medium,
            true, // Can be truncated as fallback
            &self.counter,
        );

        Ok(component)
    }

    /// Apply emergency truncation to non-critical components
    fn apply_emergency_truncation(
        &self,
        components: &mut [ContextComponent],
        budget: &TokenBudget,
    ) -> Result<(), OrchestratorError> {
        // Calculate new allocations for emergency mode
        let emergency_metadata = budget.metadata;
        let emergency_persona = budget.persona;
        // Constitution budget never changes

        for component in components.iter_mut() {
            match component.name.as_str() {
                "Metadata" => {
                    if component.token_count > emergency_metadata {
                        component.truncate_to_fit(emergency_metadata, &self.counter)?;
                    }
                }
                "Persona" => {
                    if component.token_count > emergency_persona {
                        component.truncate_to_fit(emergency_persona, &self.counter)?;
                    }
                }
                "Constitution" => {
                    // NEVER truncate Constitution
                    if component.token_count > budget.constitution {
                        return Err(OrchestratorError::ConstitutionTooLarge {
                            size: component.token_count,
                            budget: budget.constitution,
                        });
                    }
                }
                "Specification" => {
                    // Already handled in create_specification_component
                }
                _ => {
                    // Other components can be aggressively truncated
                    let max_tokens = 100; // Minimal allocation
                    if component.token_count > max_tokens {
                        component.truncate_to_fit(max_tokens, &self.counter)?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Validate version consistency across components
    fn validate_version_consistency(
        &self,
        version_pin: &str,
        components: &[ContextComponent],
    ) -> Result<(), OrchestratorError> {
        for component in components {
            if (component.name == "Specification" || component.name == "Constitution")
                && !component
                    .content
                    .contains(&format!("Version**: {}", version_pin))
            {
                return Err(OrchestratorError::ContextAssemblyFailed {
                    reason: format!(
                        "Version mismatch in {}: expected {}, but content doesn't match",
                        component.name, version_pin
                    ),
                });
            }
        }

        Ok(())
    }

    /// Parse YAML frontmatter for status warnings (DRAFT, etc.)
    pub fn parse_yaml_frontmatter(
        &self,
        content: &str,
    ) -> Result<FrontmatterInfo, OrchestratorError> {
        if let Some(captures) = frontmatter_regex().captures(content) {
            let yaml_content = captures
                .get(1)
                .ok_or_else(|| OrchestratorError::ContextAssemblyFailed {
                    reason: "Malformed frontmatter capture".to_string(),
                })?
                .as_str();

            // Parse basic YAML fields we care about
            let mut info = FrontmatterInfo::default();

            for line in yaml_content.lines() {
                let line = line.trim();
                if line.starts_with("status:") {
                    let status = line
                        .split(':')
                        .nth(1)
                        .unwrap_or("")
                        .trim()
                        .trim_matches('"');
                    info.status = Some(status.to_string());

                    // Generate warning for draft status
                    if status.to_uppercase() == "DRAFT" {
                        info.warnings.push("⚠️ Document is in DRAFT status - content may be incomplete or subject to change".to_string());
                    }
                } else if line.starts_with("version:") {
                    let version = line
                        .split(':')
                        .nth(1)
                        .unwrap_or("")
                        .trim()
                        .trim_matches('"');
                    info.version = Some(version.to_string());
                } else if line.starts_with("review_required:") {
                    let review = line.split(':').nth(1).unwrap_or("").trim();
                    info.review_required = review == "true";

                    if info.review_required {
                        info.warnings
                            .push("📋 Document requires review before implementation".to_string());
                    }
                } else if line.starts_with("deprecated:") {
                    let deprecated = line.split(':').nth(1).unwrap_or("").trim();
                    info.deprecated = deprecated == "true";

                    if info.deprecated {
                        info.warnings
                            .push("🚨 Document is deprecated - use with caution".to_string());
                    }
                }
            }

            Ok(info)
        } else {
            Ok(FrontmatterInfo::default())
        }
    }

    /// Parse #annotate tags for collaborative insights
    pub fn parse_annotation_tags(
        &self,
        content: &str,
    ) -> Result<Vec<AnnotationTag>, OrchestratorError> {
        let mut annotations = Vec::new();

        for captures in annotation_tag_regex().captures_iter(content) {
            let tag_info = captures
                .get(1)
                .ok_or_else(|| OrchestratorError::ContextAssemblyFailed {
                    reason: "Malformed annotation tag capture".to_string(),
                })?
                .as_str();
            let annotation_content = captures
                .get(2)
                .ok_or_else(|| OrchestratorError::ContextAssemblyFailed {
                    reason: "Malformed annotation content capture".to_string(),
                })?
                .as_str();

            // Parse tag info (format: "type:agent_name" or "type:agent_name:timestamp")
            let parts: Vec<&str> = tag_info.splitn(3, ':').collect(); // Use splitn to limit splits
            if parts.len() >= 2 {
                let annotation_type = parts[0].trim();
                let agent_name = parts[1].trim();
                let timestamp = if parts.len() > 2 {
                    Some(parts[2].trim().to_string())
                } else {
                    None
                };

                annotations.push(AnnotationTag {
                    annotation_type: annotation_type.to_string(),
                    agent_name: agent_name.to_string(),
                    content: annotation_content.trim().to_string(),
                    timestamp,
                });
            }
        }

        Ok(annotations)
    }

    /// Generate RECENT LEARNINGS block from annotations
    pub fn generate_recent_learnings_block(
        &self,
        annotations: &[AnnotationTag],
        days_back: i64,
    ) -> Result<String, OrchestratorError> {
        let cutoff_timestamp = chrono::Utc::now() - chrono::Duration::days(days_back);

        // Filter recent annotations
        let recent_annotations: Vec<&AnnotationTag> = annotations
            .iter()
            .filter(|ann| {
                if let Some(timestamp_str) = &ann.timestamp {
                    if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(timestamp_str) {
                        return timestamp.with_timezone(&chrono::Utc) > cutoff_timestamp;
                    }
                }
                // If no timestamp or parsing fails, include it (assume recent)
                true
            })
            .collect();

        if recent_annotations.is_empty() {
            return Ok(
                "## RECENT LEARNINGS\n\nNo recent collaborative insights available.\n".to_string(),
            );
        }

        let mut learnings_block = format!("## RECENT LEARNINGS (Last {} days)\n\n", days_back);

        // Group by annotation type
        let mut insights = Vec::new();
        let mut best_practices = Vec::new();
        let mut warnings = Vec::new();
        let mut solutions = Vec::new();

        for annotation in recent_annotations {
            match annotation.annotation_type.to_lowercase().as_str() {
                "insight" => insights.push(annotation),
                "bestpractice" | "best_practice" => best_practices.push(annotation),
                "warning" => warnings.push(annotation),
                "solution" => solutions.push(annotation),
                _ => {} // Skip other types for now
            }
        }

        // Add insights
        if !insights.is_empty() {
            learnings_block.push_str("### 💡 Technical Insights\n");
            for insight in insights {
                learnings_block.push_str(&format!(
                    "- **{}**: {}\n",
                    insight.agent_name, insight.content
                ));
            }
            learnings_block.push('\n');
        }

        // Add best practices
        if !best_practices.is_empty() {
            learnings_block.push_str("### ✅ Best Practices\n");
            for practice in best_practices {
                learnings_block.push_str(&format!(
                    "- **{}**: {}\n",
                    practice.agent_name, practice.content
                ));
            }
            learnings_block.push('\n');
        }

        // Add warnings
        if !warnings.is_empty() {
            learnings_block.push_str("### ⚠️ Warnings & Cautions\n");
            for warning in warnings {
                learnings_block.push_str(&format!(
                    "- **{}**: {}\n",
                    warning.agent_name, warning.content
                ));
            }
            learnings_block.push('\n');
        }

        // Add solutions
        if !solutions.is_empty() {
            learnings_block.push_str("### 🔧 Solutions & Resolutions\n");
            for solution in solutions {
                learnings_block.push_str(&format!(
                    "- **{}**: {}\n",
                    solution.agent_name, solution.content
                ));
            }
            learnings_block.push('\n');
        }

        learnings_block.push_str("---\n");

        Ok(learnings_block)
    }

    /// Add semantic document retrieval based on task similarity
    pub async fn retrieve_similar_documents(
        &self,
        task_context: &str,
        project_documents: &[crate::domain::KnowledgeDocument],
        similarity_threshold: f64,
        max_results: usize,
    ) -> Result<Vec<SimilarDocument>, OrchestratorError> {
        let mut similar_docs = Vec::new();

        // Create a temporary document for the task context to calculate similarity
        let task_doc = crate::domain::KnowledgeDocument::new(
            "Task Context".to_string(),
            task_context.to_string(),
            crate::domain::DocumentRole::Reference,
            0, // dummy project_id
            "system".to_string(),
        );

        for doc in project_documents {
            // Skip if document is not ready for sharing
            if !doc.is_ready_for_sharing() {
                continue;
            }

            let similarity_score = task_doc.calculate_similarity_score(doc);

            if similarity_score >= similarity_threshold {
                // Get recent learnings from this document
                let recent_learnings = doc.get_recent_learnings(30); // Last 30 days
                let learnings_summary = if recent_learnings.is_empty() {
                    "No recent collaborative insights".to_string()
                } else {
                    format!("{} recent insights from agents", recent_learnings.len())
                };

                similar_docs.push(SimilarDocument {
                    id: doc.id.unwrap_or(0),
                    title: doc.title.clone(),
                    role: doc.role.clone(),
                    similarity_score,
                    content_preview: if doc.content.len() > 200 {
                        format!("{}...", &doc.content[..200])
                    } else {
                        doc.content.clone()
                    },
                    annotations_count: doc.annotations.len(),
                    learnings_summary,
                    version: doc.version.clone(),
                    last_modified: doc.updated_at,
                });
            }
        }

        // Sort by similarity score (highest first)
        similar_docs.sort_by(|a, b| b.similarity_score.total_cmp(&a.similarity_score));

        // Limit results
        similar_docs.truncate(max_results);

        Ok(similar_docs)
    }

    /// Enhanced context assembly with Knowledge Hub integration
    pub async fn assemble_context_with_annotations(
        &self,
        request: ContextAssemblyRequest,
        project_documents: &[crate::domain::KnowledgeDocument],
    ) -> Result<EnhancedAssemblyResult, OrchestratorError> {
        // First, do the standard context assembly
        let standard_result = self.assemble_context(request.clone()).await?;

        // Parse frontmatter from specification if available
        let frontmatter_info = if let Some(spec_content) = standard_result
            .components
            .iter()
            .find(|c| c.name == "Specification")
            .map(|c| &c.content)
        {
            self.parse_yaml_frontmatter(spec_content)?
        } else {
            FrontmatterInfo::default()
        };

        // Parse annotation tags from all components
        let mut all_annotations = Vec::new();
        for component in &standard_result.components {
            let component_annotations = self.parse_annotation_tags(&component.content)?;
            all_annotations.extend(component_annotations);
        }

        // Generate recent learnings block
        let recent_learnings = self.generate_recent_learnings_block(&all_annotations, 7)?;

        // Retrieve similar documents based on task context
        let similar_documents = self
            .retrieve_similar_documents(
                &request.task_context,
                project_documents,
                0.3, // 30% similarity threshold
                5,   // Max 5 similar documents
            )
            .await?;

        Ok(EnhancedAssemblyResult {
            standard_result,
            frontmatter_info,
            annotations: all_annotations,
            recent_learnings,
            similar_documents,
        })
    }
}

/// Request for context assembly
#[derive(Debug, Clone)]
pub struct ContextAssemblyRequest {
    pub metadata: TaskMetadata,
    pub persona: AgentPersona,
    pub constitution: ConstitutionDocument,
    pub specification: SpecificationDocument,
    pub task_context: String,
    pub version_pin: Option<String>,
    pub use_emergency_budget: bool,
    /// When true, use an unlimited token budget so specification is not summarized and
    /// metadata/persona are not truncated (paired with CLI/MCP human bypass).
    pub bypass_safety: bool,
}

/// Task metadata for context assembly
#[derive(Debug, Clone)]
pub struct TaskMetadata {
    pub task_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub column: String,
    pub assignee: Option<String>,
    pub project_id: i32,
    pub project_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub requirements_refs: Vec<String>,
}

/// Agent persona configuration
#[derive(Debug, Clone)]
pub struct AgentPersona {
    pub name: String,
    pub role: String,
    pub column: String,
    pub instructions: String,
    pub capabilities: Vec<String>,
    pub constraints: Vec<String>,
}

/// Constitution document
#[derive(Debug, Clone)]
pub struct ConstitutionDocument {
    pub version: String,
    pub content: String,
    pub updated_at: String,
}

/// Specification document
#[derive(Debug, Clone)]
pub struct SpecificationDocument {
    pub title: String,
    pub version: String,
    pub content: String,
    pub state: crate::domain::DocumentState,
    pub updated_at: String,
}

/// Knowledge Hub document role types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentRole {
    /// Specification document
    Specification,
    /// Implementation plan
    Plan,
    /// Work log
    WorkLog,
    /// Constitution/governance
    Constitution,
    /// Reference documentation
    Reference,
}

impl DocumentRole {
    /// Get priority for context assembly
    pub fn priority(&self) -> ComponentPriority {
        match self {
            DocumentRole::Constitution => ComponentPriority::Critical,
            DocumentRole::Specification => ComponentPriority::Medium,
            DocumentRole::Plan => ComponentPriority::Medium,
            DocumentRole::WorkLog => ComponentPriority::Low,
            DocumentRole::Reference => ComponentPriority::Low,
        }
    }

    /// Check if document can be truncated
    pub fn can_truncate(&self) -> bool {
        !matches!(self, DocumentRole::Constitution)
    }
}

/// YAML frontmatter information parsed from documents
#[derive(Debug, Clone, Default)]
pub struct FrontmatterInfo {
    pub status: Option<String>,
    pub version: Option<String>,
    pub review_required: bool,
    pub deprecated: bool,
    pub warnings: Vec<String>,
}

/// Annotation tag parsed from document content
#[derive(Debug, Clone)]
pub struct AnnotationTag {
    pub annotation_type: String,
    pub agent_name: String,
    pub content: String,
    pub timestamp: Option<String>,
}

/// Similar document found through semantic retrieval
#[derive(Debug, Clone)]
pub struct SimilarDocument {
    pub id: i32,
    pub title: String,
    pub role: crate::domain::DocumentRole,
    pub similarity_score: f64,
    pub content_preview: String,
    pub annotations_count: usize,
    pub learnings_summary: String,
    pub version: String,
    pub last_modified: chrono::DateTime<chrono::Utc>,
}

/// Enhanced assembly result with Knowledge Hub integration
#[derive(Debug, Clone)]
pub struct EnhancedAssemblyResult {
    pub standard_result: AssemblyResult,
    pub frontmatter_info: FrontmatterInfo,
    pub annotations: Vec<AnnotationTag>,
    pub recent_learnings: String,
    pub similar_documents: Vec<SimilarDocument>,
}
#[tokio::test]
async fn test_context_assembly_standard_budget() {
    let assembler = ContextAssembler::new().unwrap();

    let request = create_test_assembly_request(false);
    let result = assembler.assemble_context(request).await.unwrap();

    assert!(result.constitution_preserved());
    assert!(result.total_tokens <= result.budget_used.total);
    assert_eq!(result.components.len(), 4); // Metadata, Persona, Constitution, Specification
    assert!(result.emergency_mode.is_none());
}

#[tokio::test]
async fn test_context_assembly_emergency_budget() {
    let assembler = ContextAssembler::new().unwrap();

    // Test explicit emergency budget usage
    let request = create_test_assembly_request(true); // Use emergency budget explicitly

    let result = assembler.assemble_context(request).await.unwrap();

    assert!(result.constitution_preserved());
    assert!(result.total_tokens <= result.budget_used.total);

    // When using emergency budget explicitly, the budget should be smaller
    assert!(result.budget_used.total < TokenBudget::standard().total);
}

#[tokio::test]
async fn test_constitution_immutability() {
    let assembler = ContextAssembler::new().unwrap();

    // Create request with oversized Constitution
    let mut request = create_test_assembly_request(false);
    request.constitution.content = "Very long constitution content. ".repeat(1000);

    let result = assembler.assemble_context(request).await;

    // Should fail with ConstitutionTooLarge error
    assert!(result.is_err());
    match result.unwrap_err() {
        OrchestratorError::ConstitutionTooLarge { .. } => {} // Expected
        _ => panic!("Expected ConstitutionTooLarge error"),
    }
}

#[tokio::test]
async fn test_specification_summarization() {
    let assembler = ContextAssembler::new().unwrap();

    // Create request with very large specification to force summarization
    let mut request = create_test_assembly_request(false);
    request.specification.content = "## API Endpoints\n\nImportant API info.\n\n".to_string()
        + &"Regular content that can be summarized. ".repeat(2000); // Much larger

    let result = assembler.assemble_context(request).await.unwrap();

    assert!(result.constitution_preserved());
    assert!(result.total_tokens <= result.budget_used.total);

    // Check that specification was processed
    let spec_component = result
        .components
        .iter()
        .find(|c| c.name == "Specification")
        .unwrap();

    // The specification should either be summarized, truncated, or fit within budget
    // If it fits within budget, that's also acceptable
    let original_size = "## API Endpoints\n\nImportant API info.\n\n".len()
        + ("Regular content that can be summarized. ".len() * 2000);
    let final_size = spec_component.content.len();

    // Either it was processed (contains markers) or it was small enough to fit
    assert!(
        spec_component.content.contains("[Content summarized")
            || spec_component.content.contains("[Content truncated")
            || final_size < original_size
            || spec_component.token_count <= result.budget_used.specification
    );
}

#[test]
fn test_document_role_priority() {
    assert_eq!(
        DocumentRole::Constitution.priority(),
        ComponentPriority::Critical
    );
    assert_eq!(
        DocumentRole::Specification.priority(),
        ComponentPriority::Medium
    );
    assert_eq!(DocumentRole::WorkLog.priority(), ComponentPriority::Low);

    assert!(!DocumentRole::Constitution.can_truncate());
    assert!(DocumentRole::Specification.can_truncate());
    assert!(DocumentRole::WorkLog.can_truncate());
}

#[test]
fn test_token_budget_remaining_calculation() {
    let budget = TokenBudget::standard();

    let remaining = budget.remaining_for_specification(400, 800, 1200).unwrap();
    let expected = budget.total - (400 + 800 + 1200 + budget.buffer);
    assert_eq!(remaining, expected);

    // Test overflow
    let result = budget.remaining_for_specification(2000, 2000, 2000);
    assert!(result.is_err());
}

#[allow(dead_code)]
fn create_test_assembly_request(use_emergency: bool) -> ContextAssemblyRequest {
    ContextAssemblyRequest {
        metadata: TaskMetadata {
            task_id: "task-123".to_string(),
            title: "Test Task".to_string(),
            description: "Test task description".to_string(),
            status: "In Progress".to_string(),
            column: "Execute".to_string(),
            assignee: Some("TestAgent".to_string()),
            project_id: 1,
            project_name: "Test Project".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            requirements_refs: vec!["1.1".to_string(), "2.3".to_string()],
        },
        persona: AgentPersona {
            name: "Coder".to_string(),
            role: "Implementation Agent".to_string(),
            column: "Execute".to_string(),
            instructions: "Implement features according to specifications".to_string(),
            capabilities: vec![
                "Code generation".to_string(),
                "Testing".to_string(),
                "Documentation".to_string(),
            ],
            constraints: vec![
                "Follow coding standards".to_string(),
                "Write comprehensive tests".to_string(),
            ],
        },
        constitution: ConstitutionDocument {
            version: "1.0.0".to_string(),
            content: "# Project Constitution\n\nCore principles and governance rules.".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        },
        specification: SpecificationDocument {
            title: "Feature Specification".to_string(),
            version: "1.0.0".to_string(),
            content: "# Feature Specification\n\nDetailed feature requirements and design."
                .to_string(),
            state: crate::domain::DocumentState::Ratified,
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        },
        task_context: "API implementation task".to_string(),
        version_pin: Some("1.0.0".to_string()),
        use_emergency_budget: use_emergency,
        bypass_safety: false,
    }
}

#[cfg(test)]
mod knowledge_hub_tests {
    use super::*;

    #[test]
    fn test_yaml_frontmatter_parsing() {
        let assembler = ContextAssembler::new().unwrap();

        let content_with_frontmatter = r#"---
status: DRAFT
version: 1.2.3
review_required: true
deprecated: false
---

# Document Content

This is the main content of the document."#;

        let info = assembler
            .parse_yaml_frontmatter(content_with_frontmatter)
            .unwrap();

        assert_eq!(info.status, Some("DRAFT".to_string()));
        assert_eq!(info.version, Some("1.2.3".to_string()));
        assert!(info.review_required);
        assert!(!info.deprecated);
        assert_eq!(info.warnings.len(), 2); // DRAFT warning + review required warning
        assert!(info.warnings[0].contains("DRAFT"));
        assert!(info.warnings[1].contains("review"));
    }

    #[test]
    fn test_yaml_frontmatter_deprecated_warning() {
        let assembler = ContextAssembler::new().unwrap();

        let content = r#"---
status: PUBLISHED
deprecated: true
---

# Deprecated Document"#;

        let info = assembler.parse_yaml_frontmatter(content).unwrap();

        assert!(info.deprecated);
        assert_eq!(info.warnings.len(), 1);
        assert!(info.warnings[0].contains("deprecated"));
    }

    #[test]
    fn test_annotation_tag_parsing() {
        let assembler = ContextAssembler::new().unwrap();

        let content = r#"
# Implementation Notes

This is a standard implementation.

#annotate[insight:AgentSmith:2024-01-01T12:00:00Z]: This pattern works well for async operations
#annotate[warning:ExpertAgent]: Be careful with memory allocation here
#annotate[bestpractice:CodeReviewer:2024-01-02T10:30:00Z]: Always validate input parameters

More content here.
"#;

        let annotations = assembler.parse_annotation_tags(content).unwrap();

        assert_eq!(annotations.len(), 3);

        // Check first annotation
        assert_eq!(annotations[0].annotation_type, "insight");
        assert_eq!(annotations[0].agent_name, "AgentSmith");
        assert_eq!(
            annotations[0].content,
            "This pattern works well for async operations"
        );
        assert_eq!(
            annotations[0].timestamp,
            Some("2024-01-01T12:00:00Z".to_string())
        );

        // Check second annotation (no timestamp)
        assert_eq!(annotations[1].annotation_type, "warning");
        assert_eq!(annotations[1].agent_name, "ExpertAgent");
        assert_eq!(
            annotations[1].content,
            "Be careful with memory allocation here"
        );
        assert_eq!(annotations[1].timestamp, None);

        // Check third annotation
        assert_eq!(annotations[2].annotation_type, "bestpractice");
        assert_eq!(annotations[2].agent_name, "CodeReviewer");
        assert_eq!(annotations[2].content, "Always validate input parameters");
        assert_eq!(
            annotations[2].timestamp,
            Some("2024-01-02T10:30:00Z".to_string())
        );
    }

    #[test]
    fn test_recent_learnings_block_generation() {
        let assembler = ContextAssembler::new().unwrap();

        let annotations = vec![
            AnnotationTag {
                annotation_type: "insight".to_string(),
                agent_name: "AgentA".to_string(),
                content: "Use async/await for better performance".to_string(),
                timestamp: Some(chrono::Utc::now().to_rfc3339()),
            },
            AnnotationTag {
                annotation_type: "bestpractice".to_string(),
                agent_name: "AgentB".to_string(),
                content: "Always validate inputs".to_string(),
                timestamp: Some(chrono::Utc::now().to_rfc3339()),
            },
            AnnotationTag {
                annotation_type: "warning".to_string(),
                agent_name: "AgentC".to_string(),
                content: "Memory leak potential here".to_string(),
                timestamp: Some(chrono::Utc::now().to_rfc3339()),
            },
            AnnotationTag {
                annotation_type: "solution".to_string(),
                agent_name: "AgentD".to_string(),
                content: "Use RAII pattern to prevent leaks".to_string(),
                timestamp: Some(chrono::Utc::now().to_rfc3339()),
            },
        ];

        let learnings_block = assembler
            .generate_recent_learnings_block(&annotations, 7)
            .unwrap();

        assert!(learnings_block.contains("## RECENT LEARNINGS"));
        assert!(learnings_block.contains("### 💡 Technical Insights"));
        assert!(learnings_block.contains("### ✅ Best Practices"));
        assert!(learnings_block.contains("### ⚠️ Warnings & Cautions"));
        assert!(learnings_block.contains("### 🔧 Solutions & Resolutions"));
        assert!(learnings_block.contains("AgentA"));
        assert!(learnings_block.contains("Use async/await"));
        assert!(learnings_block.contains("AgentB"));
        assert!(learnings_block.contains("Always validate inputs"));
    }

    #[test]
    fn test_recent_learnings_empty() {
        let assembler = ContextAssembler::new().unwrap();
        let empty_annotations = vec![];

        let learnings_block = assembler
            .generate_recent_learnings_block(&empty_annotations, 7)
            .unwrap();

        assert!(learnings_block.contains("## RECENT LEARNINGS"));
        assert!(learnings_block.contains("No recent collaborative insights available"));
    }

    #[tokio::test]
    async fn test_semantic_document_retrieval() {
        let assembler = ContextAssembler::new().unwrap();

        // Create test documents
        let mut doc1 = crate::domain::KnowledgeDocument::new(
            "Rust Async Programming".to_string(),
            "This document covers async programming patterns in Rust using tokio and futures"
                .to_string(),
            crate::domain::DocumentRole::Reference,
            1,
            "Agent1".to_string(),
        );
        doc1.state = crate::domain::DocumentState::Ratified;
        doc1.metadata.review_status = crate::domain::ReviewStatus::Approved;

        let mut doc2 = crate::domain::KnowledgeDocument::new(
            "Database Design".to_string(),
            "SQL database schema design principles and normalization techniques".to_string(),
            crate::domain::DocumentRole::Reference,
            1,
            "Agent2".to_string(),
        );
        doc2.state = crate::domain::DocumentState::Ratified;
        doc2.metadata.review_status = crate::domain::ReviewStatus::Approved;

        let mut doc3 = crate::domain::KnowledgeDocument::new(
            "Async Best Practices".to_string(),
            "Best practices for async programming including error handling and performance optimization".to_string(),
            crate::domain::DocumentRole::Reference,
            1,
            "Agent3".to_string(),
        );
        doc3.state = crate::domain::DocumentState::Ratified;
        doc3.metadata.review_status = crate::domain::ReviewStatus::Approved;

        let documents = vec![doc1, doc2, doc3];
        let task_context = "Implement async API endpoints using Rust and tokio";

        let similar_docs = assembler
            .retrieve_similar_documents(
                task_context,
                &documents,
                0.1, // Low threshold to get results
                10,
            )
            .await
            .unwrap();

        // Should find documents related to async programming
        assert!(!similar_docs.is_empty());

        // First result should be most similar (async-related)
        assert!(
            similar_docs[0].title.contains("Async")
                || similar_docs[0].content_preview.contains("async")
        );

        // Check that similarity scores are in descending order
        for i in 1..similar_docs.len() {
            assert!(similar_docs[i - 1].similarity_score >= similar_docs[i].similarity_score);
        }
    }

    #[test]
    fn test_frontmatter_parsing_no_frontmatter() {
        let assembler = ContextAssembler::new().unwrap();

        let content_without_frontmatter = r#"# Document Title

This document has no frontmatter.

Just regular content."#;

        let info = assembler
            .parse_yaml_frontmatter(content_without_frontmatter)
            .unwrap();

        assert_eq!(info.status, None);
        assert_eq!(info.version, None);
        assert!(!info.review_required);
        assert!(!info.deprecated);
        assert!(info.warnings.is_empty());
    }

    #[test]
    fn test_annotation_parsing_no_annotations() {
        let assembler = ContextAssembler::new().unwrap();

        let content_without_annotations = r#"# Document Title

This document has no annotations.

Just regular content."#;

        let annotations = assembler
            .parse_annotation_tags(content_without_annotations)
            .unwrap();

        assert!(annotations.is_empty());
    }
}
