use crate::atomic_writer::SecureKeyManager;
use crate::config::AgentConfig;
use crate::orchestrator_error::McpCodedToolError;
use rust_mcp_sdk::{
    macros::{mcp_tool, JsonSchema},
    schema::{schema_utils::CallToolError, CallToolResult},
    tool_box,
};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use tracing::info;

/// Create a structured CallToolError with telemetry class and MCP application error code.
/// Usage: tool_error("validation", "Invalid project ID")
pub fn tool_error(class: &str, message: impl Into<String>) -> CallToolError {
    let message = message.into();
    CallToolError::new(McpCodedToolError {
        code: mcp_code_for_telemetry_class(class),
        message: format!("[{class}] {message}"),
        telemetry_class: Some(class.to_string()),
    })
}

/// Map [`OrchestratorError`] to MCP tool errors (preserves `mcp_error_code`).
pub fn tool_error_orchestrator(err: crate::OrchestratorError) -> CallToolError {
    err.to_call_tool_error()
}

fn mcp_code_for_telemetry_class(class: &str) -> i32 {
    match class {
        "auth_error" => -32001,
        "permission_denied" => -32002,
        "network_error" => -32020,
        "timeout" => -32031,
        "validation" | "validation_error" => -32602,
        "contract_error" => -32070,
        _ => -32000,
    }
}

/// Truncate after at most `max_chars` Unicode scalar values; append `...` when truncated.
fn truncate_preview(s: &str, max_chars: usize) -> Cow<'_, str> {
    let mut it = s.chars();
    let prefix: String = it.by_ref().take(max_chars).collect();
    if it.next().is_some() {
        Cow::Owned(format!("{prefix}..."))
    } else {
        Cow::Borrowed(s)
    }
}

/// Arbitrary JSON tool parameters with a JSON Schema that validates on strict hosts.
///
/// `rust_mcp_macros::JsonSchema` maps `serde_json::Value` (and most non-primitive paths) to
/// `"type": "unknown"`, which Gemini rejects. This newtype keeps runtime data as [`serde_json::Value`]
/// while exposing [`Self::json_schema()`] as a plain object with `additionalProperties: true`,
/// which the MCP macro picks up via its “nested struct” branch (`might_be_struct`).
#[derive(Debug, Clone)]
pub struct JsonObjectArgs(pub serde_json::Value);

impl JsonObjectArgs {
    /// Input schema fragment for this type; consumed by `#[derive(rust_mcp_sdk::macros::JsonSchema)]`.
    pub fn json_schema() -> serde_json::Map<String, serde_json::Value> {
        serde_json::json!({
            "type": "object",
            "additionalProperties": true,
        })
        .as_object()
        .expect("json_schema literal is an object")
        .clone()
    }
}

impl<'de> Deserialize<'de> for JsonObjectArgs {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        serde_json::Value::deserialize(deserializer).map(Self)
    }
}

impl Serialize for JsonObjectArgs {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

mod core;
mod discovery;
mod find_tools;
mod governance;
mod read_project_overview;
mod read_project_state;
mod read_project_summary;
mod runtime;
mod workflow;

pub mod commands;
pub mod queries;

pub use core::*;
pub use discovery::*;
pub use find_tools::*;
pub use governance::*;
pub use read_project_overview::*;
pub use read_project_state::*;
pub use read_project_summary::*;
pub use runtime::*;
pub use workflow::*;

//*********************//
// Generate an enum with all our tools
tool_box!(
    VibeTaskMcpTools,
    [
        RegisterAgentTool,
        QueryHealthTool,
        QueryProjectsTool,
        QueryTasksTool,
        QueryAggregateTool,
        ReadDocumentsTool,
        ReadDocumentTool,
        GetContextTool,
        ListAgentsTool,
        SwitchAgentTool,
        AgentStatusTool,
        DelegateAgentTool,
        CommitArtifactTool,
        SpawnSubBoardTool,
        CreateTaskTool,
        EstimateComplexityTool,
        RequestArchitectureReviewTool,
        ProposeConstitutionAmendmentTool,
        ConfirmConstitutionAmendmentTool,
        UpdateTaskProgressTool,
        MoveTaskTool,
        SetWorkflowContextTool,
        LinkDocumentTool,
        RequestHelpTool,
        ReflectOnWorkTool,
        ApproveCompletionTool,
        RejectToExecuteTool,
        CreateKnowledgeDocumentTool,
        AnnotateDocumentTool,
        PinDocumentVersionTool,
        QuerySimilarDocumentsTool,
        FindToolsTool,
        ReadProjectStateTool,
        ReadProjectOverviewTool,
        ReadProjectSummaryTool,
        RemoveAgentTool,
    ]
);

/// Auto-dispatches any tool variant to its call_tool method.
/// This replaces manual match arms in mcp_server.rs and CLI.
impl VibeTaskMcpTools {
    pub async fn execute(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        match self {
            VibeTaskMcpTools::RegisterAgentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::QueryHealthTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::QueryProjectsTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::QueryTasksTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::QueryAggregateTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReadDocumentsTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReadDocumentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::GetContextTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ListAgentsTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::SwitchAgentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::AgentStatusTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::DelegateAgentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::CommitArtifactTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::SpawnSubBoardTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::CreateTaskTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::EstimateComplexityTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::RequestArchitectureReviewTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ProposeConstitutionAmendmentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ConfirmConstitutionAmendmentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::UpdateTaskProgressTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::MoveTaskTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::SetWorkflowContextTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::LinkDocumentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::RequestHelpTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReflectOnWorkTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ApproveCompletionTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::RejectToExecuteTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::CreateKnowledgeDocumentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::AnnotateDocumentTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::PinDocumentVersionTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::QuerySimilarDocumentsTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::FindToolsTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReadProjectStateTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReadProjectOverviewTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::ReadProjectSummaryTool(t) => t.call_tool(ctx).await,
            VibeTaskMcpTools::RemoveAgentTool(t) => t.call_tool(ctx).await,
        }
    }
}

#[cfg(test)]
mod mcp_json_schema_regression {
    use super::{DelegateAgentTool, JsonObjectArgs, VibeTaskMcpTools};

    fn assert_type_field_has_no_unknown(t: &serde_json::Value, path: &str) {
        match t {
            serde_json::Value::String(s) if s == "unknown" => {
                panic!("illegal JSON Schema type 'unknown' at {path}")
            }
            serde_json::Value::Array(parts) => {
                for (i, part) in parts.iter().enumerate() {
                    if let serde_json::Value::String(s) = part {
                        assert_ne!(
                            s, "unknown",
                            "illegal JSON Schema type 'unknown' inside type array at {path}[{i}]"
                        );
                    }
                }
            }
            _ => {}
        }
    }

    /// Walk a JSON value and fail if any schema `type` is the non-standard string `unknown`
    /// (emitted by `rust_mcp_macros::JsonSchema` for unsupported Rust types such as `serde_json::Value`).
    fn assert_no_unknown_schema_types(value: &serde_json::Value, path: &str) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(t) = map.get("type") {
                    assert_type_field_has_no_unknown(t, &format!("{path}/type"));
                }
                for (k, v) in map {
                    assert_no_unknown_schema_types(v, &format!("{path}/{k}"));
                }
            }
            serde_json::Value::Array(items) => {
                for (i, v) in items.iter().enumerate() {
                    assert_no_unknown_schema_types(v, &format!("{path}[{i}]"));
                }
            }
            _ => {}
        }
    }

    #[test]
    fn json_object_args_fragment_is_object_and_not_unknown() {
        let m = JsonObjectArgs::json_schema();
        assert_eq!(
            m.get("type").and_then(|v| v.as_str()),
            Some("object"),
            "JsonObjectArgs::json_schema(): {m:?}"
        );
        let v = serde_json::Value::Object(m);
        assert_no_unknown_schema_types(&v, "/JsonObjectArgs::json_schema");
    }

    #[test]
    fn delegate_agent_tool_input_schema_has_object_parameters_not_unknown() {
        let tool = DelegateAgentTool::tool();
        let v = serde_json::to_value(&tool).expect("serialize DelegateAgentTool::tool()");

        assert_no_unknown_schema_types(&v, "");

        let parameters = v
            .pointer("/inputSchema/properties/parameters")
            .expect("inputSchema.properties.parameters");
        let obj = parameters
            .as_object()
            .expect("parameters schema must be an object");
        assert_eq!(
            obj.get("type").and_then(|t| t.as_str()),
            Some("object"),
            "delegate_agent.parameters must be a JSON object in the published inputSchema (Gemini rejects type 'unknown'): {parameters:?}"
        );
        assert!(
            obj.get("nullable").and_then(|v| v.as_bool()) == Some(true),
            "Option<JsonObjectArgs> should be nullable in the derived schema: {parameters:?}"
        );
    }

    #[test]
    fn all_registered_mcp_tools_reject_unknown_schema_types() {
        for tool in VibeTaskMcpTools::tools() {
            let v = serde_json::to_value(&tool)
                .unwrap_or_else(|e| panic!("serialize tool {}: {e}", tool.name));
            let prefix = format!("/tools/{}", tool.name);
            assert_no_unknown_schema_types(&v, &prefix);
        }
    }
}
