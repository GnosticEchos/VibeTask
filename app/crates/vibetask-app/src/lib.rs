pub mod agent_detector;
pub mod atomic_writer;
pub mod config;
pub mod context_assembler;
pub mod error;
pub mod orchestrator_error;
pub mod project_fleet_stats;
pub mod task_ref;
pub mod telemetry;
pub mod tool_registry;
pub mod tools;

pub mod domain {
    pub use vibetask_core::domain::*;
}

pub mod atomicity_validator {
    pub use vibetask_core::atomicity_validator::*;
}

pub mod generated_types {
    pub use vibetask_hub_client::generated_types::*;
}

pub mod vibetask_client {
    pub use vibetask_hub_client::vibetask_client::*;
}

pub use agent_detector::{
    ensure_platform_session, ensure_platform_session_for_delegated_agent, refresh_platform_session,
    AgentType, AgentTypeDetector, DetectionError, PlatformSessionInfo,
};
pub use atomic_writer::{AtomicConfigWriter, ExpirationNotification, SecureKeyManager};
pub use config::{AgentConfig, AgentEntry, ServerConfig};
pub use context_assembler::{
    AgentPersona, AssemblyResult, ComponentPriority, ConstitutionDocument, ContextAssembler,
    ContextAssemblyRequest, ContextComponent, DocumentRole, EmergencyMode, RecursiveSummarizer,
    SpecificationDocument, SummarizationResult, TaskMetadata, TokenBudget, TokenCounter,
};
pub use error::{AgentError, ApiError, ConfigError, InitError, McpError};
pub use generated_types::{Delegation, DelegationMode, PermissionLevel};
pub use orchestrator_error::{
    call_tool_result_from_call_tool_error, call_tool_result_message,
    mcp_error_code_from_call_tool_error, mcp_error_code_from_call_tool_result, McpCodedToolError,
    OrchestratorError,
};
pub use task_ref::{format_task_label, resolve_numeric_task_id, task_ref_json};
pub use telemetry::{classify_error, TelemetryEvent, TelemetryMetricsSnapshot, TelemetryRecorder};
pub use tool_registry::{ToolRegistry, ToolValidationError};
pub use tools::ToolContext;
pub use tools::VibeTaskMcpTools;
