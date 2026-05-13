use crate::{
    atomicity_validator::ValidationSetError,
    domain::{SpecificationError, TaskAtomicityError, WorkLogError},
    error::{AgentError, ApiError, ConfigError, InitError},
};
use thiserror::Error;

/// Comprehensive orchestrator error with MCP compatibility
#[derive(Debug, Error)]
pub enum OrchestratorError {
    // Configuration and initialization errors
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),

    #[error("Initialization failed: {0}")]
    Initialization(#[from] InitError),

    // Agent and authentication errors
    #[error("Agent error: {0}")]
    Agent(#[from] AgentError),

    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("Permission denied: {operation} requires {required_permission}")]
    PermissionDenied {
        operation: String,
        required_permission: String,
    },

    // API and network errors
    #[error("API error: {0}")]
    Api(#[from] ApiError),

    #[error("Hub connectivity error: {message}")]
    HubConnectivity { message: String },

    #[error("Network timeout after {seconds}s")]
    NetworkTimeout { seconds: u64 },

    // Business logic errors
    #[error("Specification error: {0}")]
    Specification(#[from] SpecificationError),

    #[error("Task atomicity error: {0}")]
    TaskAtomicity(#[from] TaskAtomicityError),

    #[error("Task validation error: {0}")]
    TaskValidation(#[from] ValidationSetError),

    #[error("Work log error: {0}")]
    WorkLog(#[from] WorkLogError),

    // Workflow and state errors
    #[error("Invalid workflow transition: cannot move from {from_column} to {to_column}")]
    InvalidWorkflowTransition {
        from_column: String,
        to_column: String,
    },

    #[error("Specification not ratified: task cannot proceed to planning phase")]
    SpecificationNotRatified,

    #[error("Integrity checks failed: {failed_checks:?}")]
    IntegrityChecksFailed { failed_checks: Vec<String> },

    #[error("Document state error: {document_type} is in {current_state} state, expected {expected_state}")]
    InvalidDocumentState {
        document_type: String,
        current_state: String,
        expected_state: String,
    },

    // Tool and MCP errors
    #[error(
        "Tool not available: {tool_name} is not available for {agent_type} in column {column:?}"
    )]
    ToolNotAvailable {
        tool_name: String,
        agent_type: String,
        column: Option<String>,
    },

    #[error("Tool execution failed: {tool_name}: {reason}")]
    ToolExecutionFailed { tool_name: String, reason: String },

    #[error("Invalid tool parameters: {tool_name}: {validation_error}")]
    InvalidToolParameters {
        tool_name: String,
        validation_error: String,
    },

    // Context and token management errors
    #[error("Context assembly failed: {reason}")]
    ContextAssemblyFailed { reason: String },

    #[error("Token budget exceeded: {current_tokens} > {max_tokens} tokens")]
    TokenBudgetExceeded {
        current_tokens: usize,
        max_tokens: usize,
    },

    #[error("Constitution too large: {size} tokens exceeds budget of {budget} tokens")]
    ConstitutionTooLarge { size: usize, budget: usize },

    // Governance and safety errors
    #[error("Constitution amendment rejected: {reason}")]
    ConstitutionAmendmentRejected { reason: String },

    #[error("Amendment confirmation expired: code expired after 5 minutes")]
    AmendmentConfirmationExpired,

    #[error("Invalid confirmation code: {provided_code}")]
    InvalidConfirmationCode { provided_code: String },

    // Data validation and parsing errors
    #[error("Invalid data format: {field_name}: {reason}")]
    InvalidDataFormat { field_name: String, reason: String },

    #[error("Parsing error: {content_type}: {error_message}")]
    ParsingError {
        content_type: String,
        error_message: String,
    },

    #[error("Validation failed: {entity_type}: {validation_errors:?}")]
    ValidationFailed {
        entity_type: String,
        validation_errors: Vec<String>,
    },

    // Resource and system errors
    #[error("Resource not found: {resource_type} with ID {resource_id}")]
    ResourceNotFound {
        resource_type: String,
        resource_id: String,
    },

    #[error("Resource conflict: {resource_type} {resource_id} is locked by {locked_by}")]
    ResourceConflict {
        resource_type: String,
        resource_id: String,
        locked_by: String,
    },

    #[error("System overload: {component} is at {current_load}% capacity")]
    SystemOverload { component: String, current_load: u8 },

    // Generic errors
    #[error("Internal error: {message}")]
    Internal { message: String },

    #[error("Operation timeout: {operation} timed out after {seconds}s")]
    OperationTimeout { operation: String, seconds: u64 },

    #[error("Feature not implemented: {feature}")]
    NotImplemented { feature: String },
}

impl OrchestratorError {
    /// Get MCP error code for this error
    pub fn mcp_error_code(&self) -> i32 {
        match self {
            // Standard JSON-RPC error codes
            Self::InvalidToolParameters { .. } => -32602, // Invalid params
            Self::ToolNotAvailable { .. } => -32601,      // Method not found
            Self::ParsingError { .. } => -32700,          // Parse error

            // MCP-specific error codes (using -32000 to -32099 range)
            Self::Authentication { .. } => -32001, // Authentication failed
            Self::PermissionDenied { .. } => -32002, // Permission denied
            Self::ToolExecutionFailed { .. } => -32003, // Tool execution failed
            Self::ContextAssemblyFailed { .. } => -32004, // Context assembly failed
            Self::TokenBudgetExceeded { .. } => -32005, // Token budget exceeded
            Self::ConstitutionTooLarge { .. } => -32005, // Token budget exceeded (Constitution specific)
            Self::ResourceNotFound { .. } => -32006,     // Resource not found
            Self::ResourceConflict { .. } => -32007,     // Resource conflict
            Self::InvalidWorkflowTransition { .. } => -32008, // Invalid workflow state
            Self::SpecificationNotRatified => -32009,    // Business rule violation
            Self::IntegrityChecksFailed { .. } => -32010, // Integrity validation failed

            // Hub connectivity errors
            Self::HubConnectivity { .. } => -32020, // Hub offline/unreachable
            Self::NetworkTimeout { .. } => -32021,  // Network timeout
            Self::Api(ApiError::HubOffline) => -32020, // Hub offline
            Self::Api(ApiError::RateLimitExceeded) => -32022, // Rate limited

            // System errors
            Self::SystemOverload { .. } => -32030, // System overload
            Self::OperationTimeout { .. } => -32031, // Operation timeout

            // Configuration and initialization errors
            Self::Config(_) => -32040,         // Configuration error
            Self::Initialization(_) => -32041, // Initialization error

            // Governance errors
            Self::ConstitutionAmendmentRejected { .. } => -32050, // Governance violation
            Self::AmendmentConfirmationExpired => -32051,         // Amendment expired
            Self::InvalidConfirmationCode { .. } => -32052,       // Invalid confirmation

            // Business logic errors
            Self::Specification(_) => -32060, // Specification error
            Self::TaskAtomicity(_) => -32061, // Task atomicity error
            Self::TaskValidation(_) => -32062, // Task validation error
            Self::WorkLog(_) => -32063,       // Work log error
            Self::InvalidDocumentState { .. } => -32064, // Document state error

            // Validation errors
            Self::InvalidDataFormat { .. } => -32070, // Data format error
            Self::ValidationFailed { .. } => -32071,  // Validation failed

            // Generic errors
            Self::Internal { .. } => -32000,       // Internal error
            Self::NotImplemented { .. } => -32099, // Not implemented

            // Wrapped errors - delegate to inner error
            Self::Agent(agent_err) => match agent_err {
                AgentError::AuthenticationFailed(_) => -32001,
                AgentError::PermissionDenied(_) => -32002,
                AgentError::NotFound(_) => -32006,
                _ => -32000,
            },
            Self::Api(api_err) => match api_err {
                ApiError::HubOffline => -32020,
                ApiError::RateLimitExceeded => -32022,
                ApiError::HttpError { status, .. } => {
                    match *status {
                        401 => -32001,       // Unauthorized
                        403 => -32002,       // Forbidden
                        404 => -32006,       // Not found
                        409 => -32007,       // Conflict
                        429 => -32022,       // Rate limited
                        500..=599 => -32020, // Server error (treat as hub offline)
                        _ => -32000,         // Generic error
                    }
                }
                _ => -32000,
            },
        }
    }

    /// Get user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            Self::Authentication { .. } => {
                "Authentication failed. Please check your agent key.".to_string()
            },
            Self::PermissionDenied { operation, required_permission } => {
                format!("Permission denied: '{}' requires {} permission", operation, required_permission)
            },
            Self::HubConnectivity { .. } | Self::Api(ApiError::HubOffline) => {
                "VibeTask Hub is currently offline. Please try again later.".to_string()
            },
            Self::ToolNotAvailable { tool_name, agent_type, column } => {
                match column {
                    Some(col) => format!("Tool '{}' is not available for {} agents in '{}' column", tool_name, agent_type, col),
                    None => format!("Tool '{}' is not available for {} agents", tool_name, agent_type),
                }
            },
            Self::SpecificationNotRatified => {
                "Cannot proceed to planning: specification must be ratified first (add [RATIFIED] to title)".to_string()
            },
            Self::IntegrityChecksFailed { failed_checks } => {
                format!("Work cannot be completed: {} integrity checks failed", failed_checks.len())
            },
            Self::TokenBudgetExceeded { current_tokens, max_tokens } => {
                format!("Context too large: {} tokens exceeds limit of {} tokens", current_tokens, max_tokens)
            },
            Self::ConstitutionTooLarge { size, budget } => {
                format!("Constitution is too large ({} tokens) and cannot fit in budget ({} tokens)", size, budget)
            },
            _ => self.to_string(), // Use the Display implementation for other errors
        }
    }

    /// Check if error is retryable
    pub fn is_retryable(&self) -> bool {
        match self {
            // Network and connectivity errors are retryable
            Self::HubConnectivity { .. } => true,
            Self::NetworkTimeout { .. } => true,
            Self::Api(ApiError::HubOffline) => true,
            Self::Api(ApiError::RequestFailed(_)) => true,
            Self::SystemOverload { .. } => true,
            Self::OperationTimeout { .. } => true,

            // HTTP 5xx errors are retryable
            Self::Api(ApiError::HttpError { status, .. }) => *status >= 500,

            // Authentication and permission errors are not retryable
            Self::Authentication { .. } => false,
            Self::PermissionDenied { .. } => false,
            Self::ToolNotAvailable { .. } => false,

            // Business logic errors are not retryable
            Self::Specification(_) => false,
            Self::TaskAtomicity(_) => false,
            Self::WorkLog(_) => false,
            Self::SpecificationNotRatified => false,
            Self::IntegrityChecksFailed { .. } => false,

            // Validation errors are not retryable
            Self::InvalidToolParameters { .. } => false,
            Self::ValidationFailed { .. } => false,
            Self::InvalidDataFormat { .. } => false,

            // Configuration errors are not retryable
            Self::Config(_) => false,
            Self::Initialization(_) => false,

            // Resource conflicts might be retryable after a delay
            Self::ResourceConflict { .. } => true,

            // Rate limiting is retryable after backoff
            Self::Api(ApiError::RateLimitExceeded) => true,

            // Generic errors - assume not retryable for safety
            Self::Internal { .. } => false,
            Self::NotImplemented { .. } => false,

            // Delegate to wrapped errors
            Self::Agent(AgentError::KeyManagement(_)) => true, // Might be temporary
            Self::Agent(_) => false,
            Self::Api(api_err) => matches!(
                api_err,
                ApiError::RequestFailed(_) | ApiError::HubOffline | ApiError::RateLimitExceeded
            ),

            // Workflow and governance errors are not retryable
            _ => false,
        }
    }

    /// Get suggested retry delay in seconds
    pub fn retry_delay_seconds(&self) -> Option<u64> {
        if !self.is_retryable() {
            return None;
        }

        match self {
            Self::Api(ApiError::RateLimitExceeded) => Some(60), // 1 minute for rate limiting
            Self::SystemOverload { .. } => Some(30),            // 30 seconds for overload
            Self::ResourceConflict { .. } => Some(5),           // 5 seconds for conflicts
            Self::NetworkTimeout { .. } => Some(10),            // 10 seconds for timeouts
            Self::HubConnectivity { .. } => Some(15),           // 15 seconds for connectivity
            Self::Api(ApiError::HubOffline) => Some(30),        // 30 seconds for hub offline
            _ => Some(5),                                       // Default 5 second delay
        }
    }
}

// Implement From traits for CallToolError conversion (MCP compatibility)
impl From<OrchestratorError> for rust_mcp_sdk::schema::CallToolError {
    fn from(err: OrchestratorError) -> Self {
        // CallToolError is a tuple struct wrapping Box<dyn std::error::Error>
        rust_mcp_sdk::schema::CallToolError(Box::new(err))
    }
}

// Helper functions for creating common errors
impl OrchestratorError {
    pub fn invalid_params(message: &str) -> Self {
        Self::InvalidToolParameters {
            tool_name: "unknown".to_string(),
            validation_error: message.to_string(),
        }
    }

    pub fn tool_not_found(tool_name: &str) -> Self {
        Self::ToolNotAvailable {
            tool_name: tool_name.to_string(),
            agent_type: "unknown".to_string(),
            column: None,
        }
    }

    pub fn internal_error(message: &str) -> Self {
        Self::Internal {
            message: message.to_string(),
        }
    }

    pub fn permission_denied(operation: &str, required_permission: &str) -> Self {
        Self::PermissionDenied {
            operation: operation.to_string(),
            required_permission: required_permission.to_string(),
        }
    }

    pub fn hub_offline() -> Self {
        Self::HubConnectivity {
            message: "VibeTask Hub is offline or unreachable".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_error_codes() {
        let auth_error = OrchestratorError::Authentication {
            message: "Invalid key".to_string(),
        };
        assert_eq!(auth_error.mcp_error_code(), -32001);

        let permission_error = OrchestratorError::PermissionDenied {
            operation: "write".to_string(),
            required_permission: "USER".to_string(),
        };
        assert_eq!(permission_error.mcp_error_code(), -32002);

        let hub_offline = OrchestratorError::hub_offline();
        assert_eq!(hub_offline.mcp_error_code(), -32020);
    }

    #[test]
    fn test_user_messages() {
        let auth_error = OrchestratorError::Authentication {
            message: "Invalid key".to_string(),
        };
        assert!(auth_error.user_message().contains("Authentication failed"));

        let hub_error = OrchestratorError::hub_offline();
        assert!(hub_error
            .user_message()
            .contains("Hub is currently offline"));
    }

    #[test]
    fn test_retryable_errors() {
        let hub_offline = OrchestratorError::hub_offline();
        assert!(hub_offline.is_retryable());
        assert!(hub_offline.retry_delay_seconds().is_some());

        let auth_error = OrchestratorError::Authentication {
            message: "Invalid key".to_string(),
        };
        assert!(!auth_error.is_retryable());
        assert!(auth_error.retry_delay_seconds().is_none());
    }

    #[test]
    fn test_helper_functions() {
        let invalid_params = OrchestratorError::invalid_params("Missing field");
        assert_eq!(invalid_params.mcp_error_code(), -32602);

        let tool_not_found = OrchestratorError::tool_not_found("missing_tool");
        assert_eq!(tool_not_found.mcp_error_code(), -32601);

        let internal = OrchestratorError::internal_error("Something went wrong");
        assert_eq!(internal.mcp_error_code(), -32000);
    }

    #[test]
    fn test_call_tool_error_conversion() {
        let orch_error = OrchestratorError::permission_denied("write_file", "USER");
        let call_tool_error: rust_mcp_sdk::schema::CallToolError = orch_error.into();

        // CallToolError is a tuple struct, so we check the wrapped error
        let wrapped_error = &call_tool_error.0;
        assert!(wrapped_error.to_string().contains("Permission denied"));
    }
}
