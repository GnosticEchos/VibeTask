use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};

/// Document lifecycle states for Knowledge Hub integration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentState {
    /// Initial draft state - document is being created/edited
    Draft,
    /// Under review - awaiting feedback or approval
    Review,
    /// Approved and ratified - ready for implementation
    Ratified,
    /// Replaced by newer version - archived
    Superseded,
}

impl DocumentState {
    /// Check if document can transition to implementation phase
    pub fn can_transition_to_plan(&self) -> bool {
        matches!(self, DocumentState::Ratified)
    }

    /// Check if document is in a final state
    pub fn is_final(&self) -> bool {
        matches!(self, DocumentState::Ratified | DocumentState::Superseded)
    }

    /// Parse state from document title markers
    pub fn from_title_marker(title: &str) -> Option<Self> {
        if title.contains("[RATIFIED]") {
            Some(DocumentState::Ratified)
        } else if title.contains("[REVIEW]") {
            Some(DocumentState::Review)
        } else if title.contains("[SUPERSEDED]") {
            Some(DocumentState::Superseded)
        } else if title.contains("[DRAFT]") {
            Some(DocumentState::Draft)
        } else {
            None
        }
    }
}

/// Specification document with ratification validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Specification {
    pub title: String,
    pub content: String,
    pub state: DocumentState,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub ratified_at: Option<DateTime<Utc>>,
    pub version: String,
}

impl Specification {
    /// Create new specification in draft state
    pub fn new(title: String, content: String) -> Self {
        let now = Utc::now();
        Self {
            title,
            content,
            state: DocumentState::Draft,
            created_at: now,
            updated_at: now,
            ratified_at: None,
            version: "1.0.0".to_string(),
        }
    }

    /// Validate specification for ratification
    pub fn validate_for_ratification(&self) -> Result<(), SpecificationError> {
        // Check minimum content requirements
        if self.content.len() < 100 {
            return Err(SpecificationError::InsufficientContent {
                current_length: self.content.len(),
                minimum_required: 100,
            });
        }

        // Check for required sections
        let required_sections = ["## Overview", "## Requirements", "## Acceptance Criteria"];
        for section in required_sections {
            if !self.content.contains(section) {
                return Err(SpecificationError::MissingRequiredSection(
                    section.to_string(),
                ));
            }
        }

        // Check title format
        if !self.title.contains("[RATIFIED]") && self.state == DocumentState::Ratified {
            return Err(SpecificationError::InvalidTitleFormat {
                title: self.title.clone(),
                expected_marker: "[RATIFIED]".to_string(),
            });
        }

        Ok(())
    }

    /// Ratify the specification
    pub fn ratify(&mut self) -> Result<(), SpecificationError> {
        self.validate_for_ratification()?;

        self.state = DocumentState::Ratified;
        self.ratified_at = Some(Utc::now());
        self.updated_at = Utc::now();

        // Add ratified marker to title if not present
        if !self.title.contains("[RATIFIED]") {
            self.title = format!("{} [RATIFIED]", self.title);
        }

        Ok(())
    }

    /// Check if specification is ready for implementation
    pub fn is_ready_for_implementation(&self) -> bool {
        self.state == DocumentState::Ratified && self.ratified_at.is_some()
    }
}

/// Task definition for implementation plans
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub estimated_files: u8,
    pub complexity_score: u8,
    pub requirements_refs: Vec<String>,
}

impl Task {
    /// Validate task atomicity according to requirements
    pub fn validate_atomicity(&self) -> Result<(), TaskAtomicityError> {
        // Max 3 modified files rule
        if self.estimated_files > 3 {
            return Err(TaskAtomicityError::TooManyFiles {
                task_name: self.name.clone(),
                file_count: self.estimated_files,
                max_allowed: 3,
            });
        }

        // Complexity limit
        if self.complexity_score > 8 {
            return Err(TaskAtomicityError::TooComplex {
                task_name: self.name.clone(),
                complexity: self.complexity_score,
                max_allowed: 8,
            });
        }

        // Name validation
        if self.name.is_empty() || self.name.len() > 100 {
            return Err(TaskAtomicityError::InvalidName {
                task_name: self.name.clone(),
                reason: "Name must be 1-100 characters".to_string(),
            });
        }

        // Requirements reference validation
        if self.requirements_refs.is_empty() {
            return Err(TaskAtomicityError::MissingRequirements {
                task_name: self.name.clone(),
            });
        }

        Ok(())
    }
}

/// Implementation plan with task parsing and atomicity validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImplementationPlan {
    pub title: String,
    pub content: String,
    pub tasks: Vec<Task>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub validated_at: Option<DateTime<Utc>>,
}

impl ImplementationPlan {
    /// Create new implementation plan
    pub fn new(title: String, content: String) -> Self {
        let now = Utc::now();
        Self {
            title,
            content,
            tasks: Vec::new(),
            created_at: now,
            updated_at: now,
            validated_at: None,
        }
    }

    /// Parse tasks from markdown content
    pub fn parse_tasks_from_content(&mut self) -> Result<(), PlanParsingError> {
        let task_regex = Regex::new(r"(?m)^- \[ \] (\d+(?:\.\d+)*)\s+(.+)$")
            .map_err(|e| PlanParsingError::RegexError(e.to_string()))?;

        let mut tasks = Vec::new();
        let mut task_names = std::collections::HashSet::new();

        for cap in task_regex.captures_iter(&self.content) {
            let id = cap[1].to_string();
            let name = cap[2].trim().to_string();

            // Check for duplicate names
            if task_names.contains(&name) {
                return Err(PlanParsingError::DuplicateTaskName(name));
            }
            task_names.insert(name.clone());

            // Extract additional details from following lines
            let (description, dependencies, estimated_files, requirements_refs) =
                self.extract_task_details(&name)?;

            let task = Task {
                id,
                name,
                description,
                dependencies: dependencies.clone(),
                estimated_files,
                complexity_score: self.calculate_complexity_score(estimated_files, &dependencies),
                requirements_refs,
            };

            // Validate atomicity
            task.validate_atomicity()
                .map_err(PlanParsingError::AtomicityError)?;

            tasks.push(task);
        }

        self.tasks = tasks;
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Extract task details from markdown content
    fn extract_task_details(
        &self,
        task_name: &str,
    ) -> Result<(String, Vec<String>, u8, Vec<String>), PlanParsingError> {
        // Find the task in content and extract details from following lines
        let lines: Vec<&str> = self.content.lines().collect();
        let mut description = String::new();
        let mut dependencies = Vec::new();
        let mut estimated_files = 1u8; // Default
        let mut requirements_refs = Vec::new();

        for (i, line) in lines.iter().enumerate() {
            if line.contains(task_name) {
                // Look at following lines for details
                for detail_line in lines.iter().skip(i + 1) {
                    let detail_line = detail_line.trim();

                    if detail_line.starts_with("- ") && detail_line.contains("_Requirements:") {
                        // Extract requirements references
                        if let Some(reqs_part) = detail_line.split("_Requirements:").nth(1) {
                            let reqs = reqs_part
                                .trim_end_matches('_')
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            requirements_refs = reqs;
                        }
                    } else if detail_line.starts_with("- ") {
                        // Task description or dependency
                        if detail_line.contains("depends on") || detail_line.contains("after") {
                            // Extract dependency
                            // This is a simplified extraction - could be more sophisticated
                            dependencies.push(detail_line.to_string());
                        } else {
                            // Add to description
                            if !description.is_empty() {
                                description.push('\n');
                            }
                            description.push_str(detail_line);
                        }
                    } else if detail_line.starts_with("- [ ]") {
                        // Next task, stop processing
                        break;
                    }
                }
                break;
            }
        }

        // Estimate files based on description content
        if description.contains("Create") || description.contains("Implement") {
            estimated_files = 2;
        }
        if description.contains("multiple") || description.contains("several") {
            estimated_files = 3;
        }

        Ok((
            description,
            dependencies,
            estimated_files,
            requirements_refs,
        ))
    }

    /// Calculate complexity score based on files and dependencies
    fn calculate_complexity_score(&self, estimated_files: u8, dependencies: &[String]) -> u8 {
        let base_score = estimated_files;
        let dependency_score = (dependencies.len() as u8).min(5);
        (base_score + dependency_score).min(10)
    }

    /// Validate all tasks for atomicity
    pub fn validate_atomicity(&mut self) -> Result<(), PlanValidationError> {
        // Check for dependency cycles
        self.check_dependency_cycles()?;

        // Validate each task
        for task in &self.tasks {
            task.validate_atomicity()
                .map_err(|e| PlanValidationError::TaskAtomicity {
                    task_name: task.name.clone(),
                    error: e,
                })?;
        }

        self.validated_at = Some(Utc::now());
        Ok(())
    }

    /// Check for dependency cycles using DFS
    fn check_dependency_cycles(&self) -> Result<(), PlanValidationError> {
        let mut visited = std::collections::HashSet::new();
        let mut rec_stack = std::collections::HashSet::new();

        for task in &self.tasks {
            if !visited.contains(&task.id)
                && self.has_cycle_dfs(&task.id, &mut visited, &mut rec_stack)?
            {
                return Err(PlanValidationError::DependencyCycle {
                    task_id: task.id.clone(),
                });
            }
        }

        Ok(())
    }

    /// DFS helper for cycle detection
    fn has_cycle_dfs(
        &self,
        task_id: &str,
        visited: &mut std::collections::HashSet<String>,
        rec_stack: &mut std::collections::HashSet<String>,
    ) -> Result<bool, PlanValidationError> {
        visited.insert(task_id.to_string());
        rec_stack.insert(task_id.to_string());

        // Find task by ID
        let task = self
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| PlanValidationError::TaskNotFound(task_id.to_string()))?;

        // Check dependencies
        for dep in &task.dependencies {
            if !visited.contains(dep) {
                if self.has_cycle_dfs(dep, visited, rec_stack)? {
                    return Ok(true);
                }
            } else if rec_stack.contains(dep) {
                return Ok(true);
            }
        }

        rec_stack.remove(task_id);
        Ok(false)
    }
}

/// Integrity check result for work validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityCheck {
    pub requirements_met: bool,
    pub tests_passing: bool,
    pub code_quality_ok: bool,
    pub documentation_complete: bool,
    pub no_breaking_changes: bool,
    pub security_validated: bool,
}

impl IntegrityCheck {
    /// Create new integrity check with all false
    pub fn new() -> Self {
        Self {
            requirements_met: false,
            tests_passing: false,
            code_quality_ok: false,
            documentation_complete: false,
            no_breaking_changes: false,
            security_validated: false,
        }
    }

    /// Check if all integrity checks pass (mandatory for completion)
    pub fn all_checks_pass(&self) -> bool {
        self.requirements_met
            && self.tests_passing
            && self.code_quality_ok
            && self.documentation_complete
            && self.no_breaking_changes
            && self.security_validated
    }

    /// Get list of failed checks
    pub fn failed_checks(&self) -> Vec<String> {
        let mut failed = Vec::new();

        if !self.requirements_met {
            failed.push("Requirements not fully met".to_string());
        }
        if !self.tests_passing {
            failed.push("Tests not passing".to_string());
        }
        if !self.code_quality_ok {
            failed.push("Code quality issues".to_string());
        }
        if !self.documentation_complete {
            failed.push("Documentation incomplete".to_string());
        }
        if !self.no_breaking_changes {
            failed.push("Breaking changes detected".to_string());
        }
        if !self.security_validated {
            failed.push("Security validation failed".to_string());
        }

        failed
    }
}

impl Default for IntegrityCheck {
    fn default() -> Self {
        Self::new()
    }
}

/// Work log with integrity check and TLDR generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkLog {
    pub task_id: String,
    pub task_name: String,
    pub work_summary: String,
    pub files_touched: Vec<String>,
    pub integrity_check: IntegrityCheck,
    pub tldr: String,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub agent_name: String,
}

/// Knowledge Hub document with lifecycle management and version pinning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeDocument {
    pub id: Option<i32>,
    pub title: String,
    pub content: String,
    pub role: DocumentRole,
    pub version: String,
    pub state: DocumentState,
    pub project_id: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: String,
    pub annotations: Vec<DocumentAnnotation>,
    pub version_pin: Option<String>,
    pub metadata: DocumentMetadata,
}

/// Document role types for Knowledge Hub integration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentRole {
    /// Constitution document (governance)
    Constitution,
    /// Specification document
    Specification,
    /// Implementation plan
    Plan,
    /// Work log from agent execution
    WorkLog,
    /// Reference material
    Reference,
    /// Research notes
    Research,
    /// General notes
    Notes,
}

/// Document annotation for collaborative memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentAnnotation {
    pub id: String,
    pub annotation_type: AnnotationType,
    pub content: String,
    pub agent_name: String,
    pub created_at: DateTime<Utc>,
    pub tags: Vec<String>,
    pub context: AnnotationContext,
}

/// Types of annotations for collaborative insights
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AnnotationType {
    /// Technical insight or learning
    Insight,
    /// Warning or caution
    Warning,
    /// Best practice recommendation
    BestPractice,
    /// Cross-reference to related work
    CrossReference,
    /// Question or clarification needed
    Question,
    /// Solution or resolution
    Solution,
}

/// Context information for annotations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationContext {
    pub task_similarity_score: Option<f64>,
    pub related_tasks: Vec<String>,
    pub technology_stack: Vec<String>,
    pub complexity_level: u8,
}

/// Document metadata for enhanced management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub word_count: usize,
    pub last_modified_by: String,
    pub review_status: ReviewStatus,
    pub linked_tasks: Vec<String>,
    pub dependencies: Vec<String>,
    pub tags: Vec<String>,
}

/// Review status for document lifecycle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReviewStatus {
    /// Not yet reviewed
    Pending,
    /// Under review
    InReview,
    /// Approved
    Approved,
    /// Needs changes
    NeedsChanges,
    /// Rejected
    Rejected,
}

impl KnowledgeDocument {
    /// Create new Knowledge Hub document
    pub fn new(
        title: String,
        content: String,
        role: DocumentRole,
        project_id: i32,
        created_by: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            title,
            content: content.clone(),
            role,
            version: "1.0.0".to_string(),
            state: DocumentState::Draft,
            project_id,
            created_at: now,
            updated_at: now,
            created_by: created_by.clone(),
            annotations: Vec::new(),
            version_pin: None,
            metadata: DocumentMetadata {
                word_count: content.split_whitespace().count(),
                last_modified_by: created_by,
                review_status: ReviewStatus::Pending,
                linked_tasks: Vec::new(),
                dependencies: Vec::new(),
                tags: Vec::new(),
            },
        }
    }

    /// Add annotation for collaborative memory
    pub fn add_annotation(
        &mut self,
        annotation_type: AnnotationType,
        content: String,
        agent_name: String,
        tags: Vec<String>,
        context: AnnotationContext,
    ) -> String {
        let annotation_id = format!("ann_{}", nanoid::nanoid!(8));
        let annotation = DocumentAnnotation {
            id: annotation_id.clone(),
            annotation_type,
            content,
            agent_name,
            created_at: Utc::now(),
            tags,
            context,
        };

        self.annotations.push(annotation);
        self.updated_at = Utc::now();
        annotation_id
    }

    /// Pin version for consistency during agent work
    pub fn pin_version(&mut self, version: String) -> Result<(), DocumentError> {
        if version.is_empty() {
            return Err(DocumentError::InvalidVersion {
                version,
                reason: "Version cannot be empty".to_string(),
            });
        }

        self.version_pin = Some(version);
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Update document content with version increment
    pub fn update_content(
        &mut self,
        new_content: String,
        modified_by: String,
    ) -> Result<(), DocumentError> {
        if new_content.trim().is_empty() {
            return Err(DocumentError::EmptyContent);
        }

        self.content = new_content.clone();
        self.metadata.word_count = new_content.split_whitespace().count();
        self.metadata.last_modified_by = modified_by;
        self.updated_at = Utc::now();

        // Increment patch version
        self.increment_version()?;

        Ok(())
    }

    /// Increment version number
    fn increment_version(&mut self) -> Result<(), DocumentError> {
        let parts: Vec<&str> = self.version.split('.').collect();
        if parts.len() != 3 {
            return Err(DocumentError::InvalidVersion {
                version: self.version.clone(),
                reason: "Version must be in format major.minor.patch".to_string(),
            });
        }

        let major: u32 = parts[0]
            .parse()
            .map_err(|_| DocumentError::InvalidVersion {
                version: self.version.clone(),
                reason: "Invalid major version number".to_string(),
            })?;
        let minor: u32 = parts[1]
            .parse()
            .map_err(|_| DocumentError::InvalidVersion {
                version: self.version.clone(),
                reason: "Invalid minor version number".to_string(),
            })?;
        let patch: u32 = parts[2]
            .parse()
            .map_err(|_| DocumentError::InvalidVersion {
                version: self.version.clone(),
                reason: "Invalid patch version number".to_string(),
            })?;

        self.version = format!("{}.{}.{}", major, minor, patch + 1);
        Ok(())
    }

    /// Link to task for cross-agent knowledge sharing
    pub fn link_to_task(&mut self, task_id: String) {
        if !self.metadata.linked_tasks.contains(&task_id) {
            self.metadata.linked_tasks.push(task_id);
            self.updated_at = Utc::now();
        }
    }

    /// Get annotations by type for collaborative insights
    pub fn get_annotations_by_type(
        &self,
        annotation_type: &AnnotationType,
    ) -> Vec<&DocumentAnnotation> {
        self.annotations
            .iter()
            .filter(|ann| &ann.annotation_type == annotation_type)
            .collect()
    }

    /// Get recent learnings for context assembly
    pub fn get_recent_learnings(&self, days: i64) -> Vec<&DocumentAnnotation> {
        let cutoff = Utc::now() - chrono::Duration::days(days);
        self.annotations
            .iter()
            .filter(|ann| {
                ann.created_at > cutoff
                    && matches!(
                        ann.annotation_type,
                        AnnotationType::Insight
                            | AnnotationType::BestPractice
                            | AnnotationType::Solution
                    )
            })
            .collect()
    }

    /// Check if document is ready for cross-agent sharing
    pub fn is_ready_for_sharing(&self) -> bool {
        matches!(self.state, DocumentState::Ratified | DocumentState::Review)
            && matches!(
                self.metadata.review_status,
                ReviewStatus::Approved | ReviewStatus::InReview
            )
    }

    /// Generate semantic similarity score with another document
    pub fn calculate_similarity_score(&self, other: &KnowledgeDocument) -> f64 {
        // Simplified similarity calculation based on content overlap
        // In production, this could use more sophisticated NLP techniques
        let self_content_lower = self.content.to_lowercase();
        let other_content_lower = other.content.to_lowercase();

        let self_words: std::collections::HashSet<&str> =
            self_content_lower.split_whitespace().collect();
        let other_words: std::collections::HashSet<&str> =
            other_content_lower.split_whitespace().collect();

        let intersection = self_words.intersection(&other_words).count();
        let union = self_words.union(&other_words).count();

        if union == 0 {
            0.0
        } else {
            intersection as f64 / union as f64
        }
    }
}

impl WorkLog {
    /// Create new work log
    pub fn new(task_id: String, task_name: String, agent_name: String) -> Self {
        Self {
            task_id,
            task_name,
            work_summary: String::new(),
            files_touched: Vec::new(),
            integrity_check: IntegrityCheck::new(),
            tldr: String::new(),
            created_at: Utc::now(),
            completed_at: None,
            agent_name,
        }
    }

    /// Generate TLDR with FILES TOUCHED header
    pub fn generate_tldr(&mut self) -> Result<(), WorkLogError> {
        if self.work_summary.is_empty() {
            return Err(WorkLogError::EmptyWorkSummary);
        }

        // Generate TLDR from work summary (simplified - could use LLM)
        let summary_words: Vec<&str> = self.work_summary.split_whitespace().collect();
        let tldr_text = if summary_words.len() > 50 {
            // Take first 30 words and add ellipsis
            format!("{}...", summary_words[..30].join(" "))
        } else {
            self.work_summary.clone()
        };

        // Format with FILES TOUCHED header
        let files_list = if self.files_touched.is_empty() {
            "No files modified".to_string()
        } else {
            self.files_touched.join(", ")
        };

        self.tldr = format!("📁 [FILES TOUCHED]: {}\n\n{}", files_list, tldr_text);

        Ok(())
    }

    /// Validate work log for completion
    pub fn validate_for_completion(&self) -> Result<(), WorkLogError> {
        if self.work_summary.is_empty() {
            return Err(WorkLogError::EmptyWorkSummary);
        }

        if !self.integrity_check.all_checks_pass() {
            return Err(WorkLogError::IntegrityChecksFailed {
                failed_checks: self.integrity_check.failed_checks(),
            });
        }

        if self.tldr.is_empty() {
            return Err(WorkLogError::MissingTldr);
        }

        Ok(())
    }

    /// Complete the work log
    pub fn complete(&mut self) -> Result<(), WorkLogError> {
        self.validate_for_completion()?;
        self.completed_at = Some(Utc::now());
        Ok(())
    }

    /// Add file to touched files list
    pub fn add_touched_file(&mut self, file_path: String) {
        if !self.files_touched.contains(&file_path) {
            self.files_touched.push(file_path);
        }
    }

    /// Update integrity check
    pub fn update_integrity_check(&mut self, check: IntegrityCheck) {
        self.integrity_check = check;
    }
}

// Error types for domain models

#[derive(Debug, thiserror::Error)]
pub enum SpecificationError {
    #[error(
        "Insufficient content: {current_length} characters, minimum required: {minimum_required}"
    )]
    InsufficientContent {
        current_length: usize,
        minimum_required: usize,
    },

    #[error("Missing required section: {0}")]
    MissingRequiredSection(String),

    #[error("Invalid title format: '{title}', expected marker: '{expected_marker}'")]
    InvalidTitleFormat {
        title: String,
        expected_marker: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum TaskAtomicityError {
    #[error(
        "Task '{task_name}' modifies too many files: {file_count}, max allowed: {max_allowed}"
    )]
    TooManyFiles {
        task_name: String,
        file_count: u8,
        max_allowed: u8,
    },

    #[error("Task '{task_name}' is too complex: {complexity}, max allowed: {max_allowed}")]
    TooComplex {
        task_name: String,
        complexity: u8,
        max_allowed: u8,
    },

    #[error("Task '{task_name}' has invalid name: {reason}")]
    InvalidName { task_name: String, reason: String },

    #[error("Task '{task_name}' missing requirements references")]
    MissingRequirements { task_name: String },
}

#[derive(Debug, thiserror::Error)]
pub enum PlanParsingError {
    #[error("Regex error: {0}")]
    RegexError(String),

    #[error("Duplicate task name: {0}")]
    DuplicateTaskName(String),

    #[error("Task atomicity error: {0}")]
    AtomicityError(#[from] TaskAtomicityError),
}

#[derive(Debug, thiserror::Error)]
pub enum PlanValidationError {
    #[error("Task atomicity error for '{task_name}': {error}")]
    TaskAtomicity {
        task_name: String,
        error: TaskAtomicityError,
    },

    #[error("Dependency cycle detected starting from task: {task_id}")]
    DependencyCycle { task_id: String },

    #[error("Task not found: {0}")]
    TaskNotFound(String),
}

#[derive(Debug, thiserror::Error)]
pub enum WorkLogError {
    #[error("Work summary is empty")]
    EmptyWorkSummary,

    #[error("Integrity checks failed: {failed_checks:?}")]
    IntegrityChecksFailed { failed_checks: Vec<String> },

    #[error("TLDR is missing")]
    MissingTldr,
}

#[derive(Debug, thiserror::Error)]
pub enum DocumentError {
    #[error("Document content cannot be empty")]
    EmptyContent,

    #[error("Invalid version '{version}': {reason}")]
    InvalidVersion { version: String, reason: String },

    #[error("Document not found: {id}")]
    NotFound { id: String },

    #[error("Version pin mismatch: expected '{expected}', found '{actual}'")]
    VersionPinMismatch { expected: String, actual: String },

    #[error("Annotation not found: {annotation_id}")]
    AnnotationNotFound { annotation_id: String },

    #[error("Document state transition not allowed: {from:?} -> {to:?}")]
    InvalidStateTransition {
        from: DocumentState,
        to: DocumentState,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_state_transitions() {
        assert!(DocumentState::Ratified.can_transition_to_plan());
        assert!(!DocumentState::Draft.can_transition_to_plan());
        assert!(!DocumentState::Review.can_transition_to_plan());
        assert!(!DocumentState::Superseded.can_transition_to_plan());
    }

    #[test]
    fn test_document_state_from_title() {
        assert_eq!(
            DocumentState::from_title_marker("My Spec [RATIFIED]"),
            Some(DocumentState::Ratified)
        );
        assert_eq!(
            DocumentState::from_title_marker("My Spec [DRAFT]"),
            Some(DocumentState::Draft)
        );
        assert_eq!(DocumentState::from_title_marker("My Spec"), None);
    }

    #[test]
    fn test_specification_ratification() {
        let mut spec = Specification::new(
            "Test Spec".to_string(),
            "## Overview\nTest content\n## Requirements\nReq 1\n## Acceptance Criteria\nCriteria 1"
                .repeat(5),
        );

        assert!(spec.ratify().is_ok());
        assert_eq!(spec.state, DocumentState::Ratified);
        assert!(spec.title.contains("[RATIFIED]"));
        assert!(spec.ratified_at.is_some());
    }

    #[test]
    fn test_task_atomicity_validation() {
        let task = Task {
            id: "1".to_string(),
            name: "Test Task".to_string(),
            description: "Test description".to_string(),
            dependencies: vec![],
            estimated_files: 2,
            complexity_score: 5,
            requirements_refs: vec!["1.1".to_string()],
        };

        assert!(task.validate_atomicity().is_ok());

        let invalid_task = Task {
            id: "2".to_string(),
            name: "Invalid Task".to_string(),
            description: "Test description".to_string(),
            dependencies: vec![],
            estimated_files: 5, // Too many files
            complexity_score: 5,
            requirements_refs: vec!["1.1".to_string()],
        };

        assert!(invalid_task.validate_atomicity().is_err());
    }

    #[test]
    fn test_integrity_check() {
        let mut check = IntegrityCheck::new();
        assert!(!check.all_checks_pass());
        assert_eq!(check.failed_checks().len(), 6);

        check.requirements_met = true;
        check.tests_passing = true;
        check.code_quality_ok = true;
        check.documentation_complete = true;
        check.no_breaking_changes = true;
        check.security_validated = true;

        assert!(check.all_checks_pass());
        assert!(check.failed_checks().is_empty());
    }

    #[test]
    fn test_work_log_tldr_generation() {
        let mut work_log = WorkLog::new(
            "task-1".to_string(),
            "Test Task".to_string(),
            "TestAgent".to_string(),
        );

        work_log.work_summary = "Implemented feature X with tests and documentation".to_string();
        work_log.add_touched_file("src/main.rs".to_string());
        work_log.add_touched_file("tests/test.rs".to_string());

        assert!(work_log.generate_tldr().is_ok());
        assert!(work_log.tldr.contains("📁 [FILES TOUCHED]"));
        assert!(work_log.tldr.contains("src/main.rs, tests/test.rs"));
    }

    #[test]
    fn test_knowledge_document_creation() {
        let doc = KnowledgeDocument::new(
            "Test Specification".to_string(),
            "This is a test specification document with requirements and acceptance criteria."
                .to_string(),
            DocumentRole::Specification,
            1,
            "TestAgent".to_string(),
        );

        assert_eq!(doc.title, "Test Specification");
        assert_eq!(doc.role, DocumentRole::Specification);
        assert_eq!(doc.version, "1.0.0");
        assert_eq!(doc.state, DocumentState::Draft);
        assert_eq!(doc.project_id, 1);
        assert_eq!(doc.created_by, "TestAgent");
        assert_eq!(doc.metadata.word_count, 11); // Updated count
        assert!(doc.annotations.is_empty());
    }

    #[test]
    fn test_document_annotation_system() {
        let mut doc = KnowledgeDocument::new(
            "Test Doc".to_string(),
            "Content for testing annotations".to_string(),
            DocumentRole::Reference,
            1,
            "TestAgent".to_string(),
        );

        let context = AnnotationContext {
            task_similarity_score: Some(0.8),
            related_tasks: vec!["task-1".to_string(), "task-2".to_string()],
            technology_stack: vec!["Rust".to_string(), "MCP".to_string()],
            complexity_level: 5,
        };

        let annotation_id = doc.add_annotation(
            AnnotationType::Insight,
            "This approach works well for async operations".to_string(),
            "ExpertAgent".to_string(),
            vec!["async".to_string(), "best-practice".to_string()],
            context,
        );

        assert_eq!(doc.annotations.len(), 1);
        assert_eq!(doc.annotations[0].id, annotation_id);
        assert_eq!(doc.annotations[0].annotation_type, AnnotationType::Insight);
        assert_eq!(doc.annotations[0].agent_name, "ExpertAgent");
        assert_eq!(doc.annotations[0].tags, vec!["async", "best-practice"]);

        let insights = doc.get_annotations_by_type(&AnnotationType::Insight);
        assert_eq!(insights.len(), 1);
        assert_eq!(
            insights[0].content,
            "This approach works well for async operations"
        );
    }

    #[test]
    fn test_document_version_management() {
        let mut doc = KnowledgeDocument::new(
            "Test Doc".to_string(),
            "Initial content".to_string(),
            DocumentRole::Plan,
            1,
            "TestAgent".to_string(),
        );

        assert_eq!(doc.version, "1.0.0");

        // Test version pinning
        assert!(doc.pin_version("1.0.0".to_string()).is_ok());
        assert_eq!(doc.version_pin, Some("1.0.0".to_string()));

        // Test content update with version increment
        assert!(doc
            .update_content(
                "Updated content with more details".to_string(),
                "UpdateAgent".to_string()
            )
            .is_ok());
        assert_eq!(doc.version, "1.0.1");
        assert_eq!(doc.metadata.last_modified_by, "UpdateAgent");
        assert_eq!(doc.metadata.word_count, 5); // Updated count

        // Test invalid version pinning
        assert!(doc.pin_version("".to_string()).is_err());
    }

    #[test]
    fn test_document_task_linking() {
        let mut doc = KnowledgeDocument::new(
            "Test Doc".to_string(),
            "Content".to_string(),
            DocumentRole::WorkLog,
            1,
            "TestAgent".to_string(),
        );

        doc.link_to_task("task-1".to_string());
        doc.link_to_task("task-2".to_string());
        doc.link_to_task("task-1".to_string()); // Duplicate should be ignored

        assert_eq!(doc.metadata.linked_tasks.len(), 2);
        assert!(doc.metadata.linked_tasks.contains(&"task-1".to_string()));
        assert!(doc.metadata.linked_tasks.contains(&"task-2".to_string()));
    }

    #[test]
    fn test_document_similarity_calculation() {
        let doc1 = KnowledgeDocument::new(
            "Rust Implementation".to_string(),
            "This document describes Rust async programming patterns and best practices"
                .to_string(),
            DocumentRole::Reference,
            1,
            "Agent1".to_string(),
        );

        let doc2 = KnowledgeDocument::new(
            "Async Patterns".to_string(),
            "Best practices for async programming in Rust with tokio framework".to_string(),
            DocumentRole::Reference,
            1,
            "Agent2".to_string(),
        );

        let doc3 = KnowledgeDocument::new(
            "Database Design".to_string(),
            "SQL database schema design principles and normalization techniques".to_string(),
            DocumentRole::Reference,
            1,
            "Agent3".to_string(),
        );

        let similarity_high = doc1.calculate_similarity_score(&doc2);
        let similarity_low = doc1.calculate_similarity_score(&doc3);

        assert!(similarity_high > similarity_low);
        assert!(similarity_high > 0.0);
        assert!(similarity_low >= 0.0);
    }

    #[test]
    fn test_document_sharing_readiness() {
        let mut doc = KnowledgeDocument::new(
            "Test Doc".to_string(),
            "Content".to_string(),
            DocumentRole::Specification,
            1,
            "TestAgent".to_string(),
        );

        // Initially not ready (Draft state, Pending review)
        assert!(!doc.is_ready_for_sharing());

        // Set to Review state but still pending review
        doc.state = DocumentState::Review;
        assert!(!doc.is_ready_for_sharing()); // Review state with Pending status is not ready

        // Set to InReview status
        doc.metadata.review_status = ReviewStatus::InReview;
        assert!(doc.is_ready_for_sharing()); // Review state with InReview status is ready

        // Approve the review
        doc.metadata.review_status = ReviewStatus::Approved;
        assert!(doc.is_ready_for_sharing()); // Review state with Approved status is ready

        // Ratify the document
        doc.state = DocumentState::Ratified;
        assert!(doc.is_ready_for_sharing()); // Ratified state with Approved status is ready
    }

    #[test]
    fn test_recent_learnings_filtering() {
        let mut doc = KnowledgeDocument::new(
            "Test Doc".to_string(),
            "Content".to_string(),
            DocumentRole::WorkLog,
            1,
            "TestAgent".to_string(),
        );

        let context = AnnotationContext {
            task_similarity_score: None,
            related_tasks: vec![],
            technology_stack: vec![],
            complexity_level: 1,
        };

        // Add recent insight (should be included)
        doc.add_annotation(
            AnnotationType::Insight,
            "Recent learning about async patterns".to_string(),
            "Agent1".to_string(),
            vec![],
            context.clone(),
        );

        // Add old warning (should be excluded)
        let old_annotation = DocumentAnnotation {
            id: "old_ann".to_string(),
            annotation_type: AnnotationType::Warning,
            content: "Old warning".to_string(),
            agent_name: "Agent2".to_string(),
            created_at: Utc::now() - chrono::Duration::days(10),
            tags: vec![],
            context: context.clone(),
        };
        doc.annotations.push(old_annotation);

        // Add recent best practice (should be included)
        doc.add_annotation(
            AnnotationType::BestPractice,
            "Use this pattern for better performance".to_string(),
            "Agent3".to_string(),
            vec![],
            context,
        );

        let recent_learnings = doc.get_recent_learnings(7);
        assert_eq!(recent_learnings.len(), 2); // Only recent insight and best practice

        let learning_types: Vec<&AnnotationType> = recent_learnings
            .iter()
            .map(|ann| &ann.annotation_type)
            .collect();
        assert!(learning_types.contains(&&AnnotationType::Insight));
        assert!(learning_types.contains(&&AnnotationType::BestPractice));
        assert!(!learning_types.contains(&&AnnotationType::Warning));
    }
}
