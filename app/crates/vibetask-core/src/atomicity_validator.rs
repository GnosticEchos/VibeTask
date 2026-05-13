use crate::domain::{Task, TaskAtomicityError};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// Task atomicity validator with complexity limits and business rules
pub struct TaskAtomicityValidator {
    /// Maximum number of files a single task can modify
    max_files_per_task: u8,
    /// Maximum complexity score allowed
    max_complexity_score: u8,
    /// Reserved task names that cannot be used
    reserved_names: HashSet<String>,
    /// Regex patterns for detecting complexity indicators
    complexity_patterns: Vec<(Regex, u8)>,
    /// Requirement reference format (e.g. `1.1`), compiled once per process
    requirements_ref_regex: &'static Regex,
}

fn requirements_ref_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\d+\.\d+$").expect("valid requirements ref regex"))
}

fn complexity_patterns_cached() -> Vec<(Regex, u8)> {
    static PATTERNS: OnceLock<Vec<(Regex, u8)>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            vec![
                (
                    Regex::new(r"(?i)\b(refactor|restructure|redesign)\b")
                        .expect("valid complexity regex"),
                    3,
                ),
                (
                    Regex::new(r"(?i)\b(integrate|migration|upgrade)\b")
                        .expect("valid complexity regex"),
                    2,
                ),
                (
                    Regex::new(r"(?i)\b(multiple|several|many)\b").expect("valid complexity regex"),
                    2,
                ),
                (
                    Regex::new(r"(?i)\b(complex|complicated|advanced)\b")
                        .expect("valid complexity regex"),
                    2,
                ),
                (
                    Regex::new(r"(?i)\b(database|api|network|security)\b")
                        .expect("valid complexity regex"),
                    1,
                ),
            ]
        })
        .clone()
}

impl TaskAtomicityValidator {
    /// Create new validator with default limits
    pub fn new() -> Self {
        let reserved_names = [
            "setup", "init", "cleanup", "teardown", "main", "test", "build", "deploy",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();

        let complexity_patterns = complexity_patterns_cached();

        Self {
            max_files_per_task: 3,
            max_complexity_score: 8,
            reserved_names,
            complexity_patterns,
            requirements_ref_regex: requirements_ref_regex(),
        }
    }

    /// Create validator with custom limits
    pub fn with_limits(max_files: u8, max_complexity: u8) -> Self {
        let mut validator = Self::new();
        validator.max_files_per_task = max_files;
        validator.max_complexity_score = max_complexity;
        validator
    }

    /// Validate a single task for atomicity
    pub fn validate_task(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        // Check file count limit
        self.validate_file_count(task)?;

        // Check complexity score
        self.validate_complexity(task)?;

        // Check name validity
        self.validate_name(task)?;

        // Check requirements references
        self.validate_requirements(task)?;

        // Check description for complexity indicators
        self.validate_description_complexity(task)?;

        Ok(())
    }

    /// Validate multiple tasks for duplicate names and dependencies
    pub fn validate_task_set(&self, tasks: &[Task]) -> Result<(), ValidationSetError> {
        // Check for duplicate names
        self.check_duplicate_names(tasks)?;

        // Check for reserved names
        self.check_reserved_names(tasks)?;

        // Validate dependency graph
        self.validate_dependency_graph(tasks)?;

        // Validate each individual task
        for task in tasks {
            self.validate_task(task)
                .map_err(|e| ValidationSetError::TaskValidation {
                    task_name: task.name.clone(),
                    error: e,
                })?;
        }

        Ok(())
    }

    /// Validate file count doesn't exceed limit
    fn validate_file_count(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        if task.estimated_files > self.max_files_per_task {
            return Err(TaskAtomicityError::TooManyFiles {
                task_name: task.name.clone(),
                file_count: task.estimated_files,
                max_allowed: self.max_files_per_task,
            });
        }
        Ok(())
    }

    /// Validate complexity score doesn't exceed limit
    fn validate_complexity(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        if task.complexity_score > self.max_complexity_score {
            return Err(TaskAtomicityError::TooComplex {
                task_name: task.name.clone(),
                complexity: task.complexity_score,
                max_allowed: self.max_complexity_score,
            });
        }
        Ok(())
    }

    /// Validate task name format and content
    fn validate_name(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        if task.name.is_empty() {
            return Err(TaskAtomicityError::InvalidName {
                task_name: task.name.clone(),
                reason: "Name cannot be empty".to_string(),
            });
        }

        if task.name.len() > 100 {
            return Err(TaskAtomicityError::InvalidName {
                task_name: task.name.clone(),
                reason: "Name cannot exceed 100 characters".to_string(),
            });
        }

        // Check for invalid characters
        if task.name.contains('\n') || task.name.contains('\t') {
            return Err(TaskAtomicityError::InvalidName {
                task_name: task.name.clone(),
                reason: "Name cannot contain newlines or tabs".to_string(),
            });
        }

        // Check for vague names
        let vague_patterns = [
            "fix", "update", "change", "modify", "improve", "enhance", "optimize",
        ];

        for pattern in &vague_patterns {
            if task.name.to_lowercase() == *pattern {
                return Err(TaskAtomicityError::InvalidName {
                    task_name: task.name.clone(),
                    reason: format!("Name '{}' is too vague, be more specific", pattern),
                });
            }
        }

        Ok(())
    }

    /// Validate requirements references exist
    fn validate_requirements(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        if task.requirements_refs.is_empty() {
            return Err(TaskAtomicityError::MissingRequirements {
                task_name: task.name.clone(),
            });
        }

        // Validate requirement reference format (e.g., "1.1", "2.3", etc.)
        for req_ref in &task.requirements_refs {
            if !self.requirements_ref_regex.is_match(req_ref) {
                return Err(TaskAtomicityError::InvalidName {
                    task_name: task.name.clone(),
                    reason: format!("Invalid requirement reference format: '{}'", req_ref),
                });
            }
        }

        Ok(())
    }

    /// Validate description doesn't indicate excessive complexity
    fn validate_description_complexity(&self, task: &Task) -> Result<(), TaskAtomicityError> {
        let mut complexity_penalty = 0u8;

        for (pattern, penalty) in &self.complexity_patterns {
            if pattern.is_match(&task.description) {
                complexity_penalty += penalty;
            }
        }

        // If description indicates high complexity, adjust the validation
        let effective_complexity = task.complexity_score + complexity_penalty;
        if effective_complexity > self.max_complexity_score {
            return Err(TaskAtomicityError::TooComplex {
                task_name: task.name.clone(),
                complexity: effective_complexity,
                max_allowed: self.max_complexity_score,
            });
        }

        Ok(())
    }

    /// Check for duplicate task names
    fn check_duplicate_names(&self, tasks: &[Task]) -> Result<(), ValidationSetError> {
        let mut seen_names = HashSet::new();

        for task in tasks {
            if seen_names.contains(&task.name) {
                return Err(ValidationSetError::DuplicateName {
                    name: task.name.clone(),
                });
            }
            seen_names.insert(task.name.clone());
        }

        Ok(())
    }

    /// Check for reserved names
    fn check_reserved_names(&self, tasks: &[Task]) -> Result<(), ValidationSetError> {
        for task in tasks {
            if self.reserved_names.contains(&task.name.to_lowercase()) {
                return Err(ValidationSetError::ReservedName {
                    name: task.name.clone(),
                });
            }
        }

        Ok(())
    }

    /// Validate dependency graph for cycles and missing references
    fn validate_dependency_graph(&self, tasks: &[Task]) -> Result<(), ValidationSetError> {
        // Create task ID to name mapping
        let task_map: HashMap<String, &Task> = tasks.iter().map(|t| (t.id.clone(), t)).collect();

        // Check all dependencies exist
        for task in tasks {
            for dep_id in &task.dependencies {
                if !task_map.contains_key(dep_id) {
                    return Err(ValidationSetError::MissingDependency {
                        task_name: task.name.clone(),
                        dependency_id: dep_id.clone(),
                    });
                }
            }
        }

        // Check for cycles using DFS
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();

        for task in tasks {
            if !visited.contains(&task.id)
                && self.has_cycle_dfs(&task.id, &task_map, &mut visited, &mut rec_stack)?
            {
                return Err(ValidationSetError::DependencyCycle {
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
        task_map: &HashMap<String, &Task>,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
    ) -> Result<bool, ValidationSetError> {
        visited.insert(task_id.to_string());
        rec_stack.insert(task_id.to_string());

        let task = task_map
            .get(task_id)
            .ok_or_else(|| ValidationSetError::MissingDependency {
                task_name: "unknown".to_string(),
                dependency_id: task_id.to_string(),
            })?;

        for dep_id in &task.dependencies {
            if !visited.contains(dep_id) {
                if self.has_cycle_dfs(dep_id, task_map, visited, rec_stack)? {
                    return Ok(true);
                }
            } else if rec_stack.contains(dep_id) {
                return Ok(true);
            }
        }

        rec_stack.remove(task_id);
        Ok(false)
    }

    /// Calculate complexity score based on task attributes
    pub fn calculate_complexity_score(&self, task: &Task) -> u8 {
        let mut score = task.estimated_files;

        // Add dependency complexity
        score += (task.dependencies.len() as u8).min(3);

        // Add description complexity
        for (pattern, penalty) in &self.complexity_patterns {
            if pattern.is_match(&task.description) {
                score += penalty;
            }
        }

        // Add requirements complexity (more requirements = more complex)
        score += (task.requirements_refs.len() as u8 / 2).min(2);

        score.min(10) // Cap at 10
    }
}

impl Default for TaskAtomicityValidator {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors for validating sets of tasks
#[derive(Debug, thiserror::Error)]
pub enum ValidationSetError {
    #[error("Duplicate task name: '{name}'")]
    DuplicateName { name: String },

    #[error("Reserved task name: '{name}'")]
    ReservedName { name: String },

    #[error("Task '{task_name}' references missing dependency: '{dependency_id}'")]
    MissingDependency {
        task_name: String,
        dependency_id: String,
    },

    #[error("Dependency cycle detected starting from task: '{task_id}'")]
    DependencyCycle { task_id: String },

    #[error("Task validation failed for '{task_name}': {error}")]
    TaskValidation {
        task_name: String,
        error: TaskAtomicityError,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Task;

    fn create_test_task(id: &str, name: &str, files: u8, deps: Vec<String>) -> Task {
        Task {
            id: id.to_string(),
            name: name.to_string(),
            description: "Test task description".to_string(),
            dependencies: deps,
            estimated_files: files,
            complexity_score: files + 1,
            requirements_refs: vec!["1.1".to_string()],
        }
    }

    #[test]
    fn test_validate_file_count() {
        let validator = TaskAtomicityValidator::new();

        let valid_task = create_test_task("1", "Valid Task", 2, vec![]);
        assert!(validator.validate_task(&valid_task).is_ok());

        let invalid_task = create_test_task("2", "Invalid Task", 5, vec![]);
        assert!(validator.validate_task(&invalid_task).is_err());
    }

    #[test]
    fn test_validate_complexity() {
        let validator = TaskAtomicityValidator::with_limits(3, 5);

        let mut complex_task = create_test_task("1", "Complex Task", 2, vec![]);
        complex_task.complexity_score = 6;

        assert!(validator.validate_task(&complex_task).is_err());
    }

    #[test]
    fn test_validate_name() {
        let validator = TaskAtomicityValidator::new();

        let empty_name_task = create_test_task("1", "", 1, vec![]);
        assert!(validator.validate_task(&empty_name_task).is_err());

        let vague_name_task = create_test_task("2", "fix", 1, vec![]);
        assert!(validator.validate_task(&vague_name_task).is_err());

        let valid_task = create_test_task("3", "Implement user authentication", 2, vec![]);
        assert!(validator.validate_task(&valid_task).is_ok());
    }

    #[test]
    fn test_duplicate_names() {
        let validator = TaskAtomicityValidator::new();

        let tasks = vec![
            create_test_task("1", "Task A", 1, vec![]),
            create_test_task("2", "Task A", 1, vec![]), // Duplicate name
        ];

        assert!(validator.validate_task_set(&tasks).is_err());
    }

    #[test]
    fn test_reserved_names() {
        let validator = TaskAtomicityValidator::new();

        let tasks = vec![
            create_test_task("1", "setup", 1, vec![]), // Reserved name
        ];

        assert!(validator.validate_task_set(&tasks).is_err());
    }

    #[test]
    fn test_dependency_cycle() {
        let validator = TaskAtomicityValidator::new();

        let tasks = vec![
            create_test_task("1", "Task A", 1, vec!["2".to_string()]),
            create_test_task("2", "Task B", 1, vec!["1".to_string()]), // Cycle
        ];

        assert!(validator.validate_task_set(&tasks).is_err());
    }

    #[test]
    fn test_missing_dependency() {
        let validator = TaskAtomicityValidator::new();

        let tasks = vec![
            create_test_task("1", "Task A", 1, vec!["999".to_string()]), // Missing dep
        ];

        assert!(validator.validate_task_set(&tasks).is_err());
    }

    #[test]
    fn test_complexity_calculation() {
        let validator = TaskAtomicityValidator::new();

        let mut task = create_test_task("1", "Test Task", 2, vec!["dep1".to_string()]);
        task.description = "Refactor complex database integration".to_string();

        let score = validator.calculate_complexity_score(&task);
        assert!(score > 2); // Should be higher due to complexity indicators
    }
}
