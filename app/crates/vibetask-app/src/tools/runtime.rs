use crate::atomic_writer::SecureKeyManager;
use crate::config::{AgentConfig, AgentEntry};
use crate::tools::tool_error;
use crate::vibetask_client::VibeTaskClient;
use rust_mcp_sdk::schema::{CallToolError, CallToolResult, TextContent};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Shared MCP workflow context (session-scoped).
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct WorkflowContext {
    /// Active project selected for this MCP session.
    #[serde(default)]
    pub current_project_id: Option<i32>,
    /// Active lattice column for this MCP session.
    #[serde(default)]
    pub current_column: Option<String>,
}

/// Context for MCP tool execution
pub struct ToolContext {
    pub config_path: String,
    pub api_client: Arc<VibeTaskClient>,
    pub bypass_safety: bool,
    pub workflow_context: Arc<RwLock<WorkflowContext>>,
}

/// Resolved active agent with config and API key
pub struct ActiveAgent {
    pub config: AgentConfig,
    pub entry: AgentEntry,
    pub api_key: String,
}

impl ToolContext {
    /// Load config, find active agent, and retrieve its API key.
    /// This eliminates 8 lines of boilerplate repeated in 20+ tools.
    pub async fn resolve_active_agent(&self) -> Result<ActiveAgent, CallToolError> {
        let config = AgentConfig::load(&self.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        let entry = config
            .get_agent(&config.server.active_agent)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    format!(
                        "Active agent '{}' not found in configuration",
                        config.server.active_agent
                    ),
                )
            })?
            .clone();

        let api_key = SecureKeyManager::retrieve_key(&entry.name)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to retrieve API key for agent '{}': {}",
                        entry.name, e
                    ),
                )
            })?;

        debug_assert!(!entry.name.is_empty(), "Active agent name must not be empty");
        debug_assert!(!api_key.is_empty(), "Retrieved API key must not be empty");

        Ok(ActiveAgent {
            config,
            entry,
            api_key,
        })
    }

    /// Gate check: reject if agent type doesn't match the required type.
    pub fn require_agent_type(
        entry: &AgentEntry,
        required: &str,
        tool_name: &str,
    ) -> Result<(), CallToolError> {
        debug_assert!(!tool_name.is_empty(), "Tool name must not be empty");
        if entry.agent_type != required {
            return Err(tool_error(
                "runtime",
                format!("{} is only available for {} Agents", tool_name, required),
            ));
        }
        Ok(())
    }
}

/// Response formatting helpers — eliminate inline format!() duplication across tools.
pub struct ResponseBuilder;

impl ResponseBuilder {
    /// Simple text response from a pre-formatted string.
    pub fn text(msg: impl Into<String>) -> CallToolResult {
        CallToolResult::text_content(vec![TextContent::from(msg.into())])
    }

    /// Success response with title, agent, and detail lines.
    pub fn success(title: &str, agent_name: &str, details: &[(&str, &str)]) -> CallToolResult {
        let mut msg = format!("✅ {}\n\n👤 Agent: {}\n", title, agent_name);
        for (k, v) in details {
            msg.push_str(&format!("   {k}: {v}\n"));
        }
        msg.push_str("\n💡 Use 'list_agents' to see all agents.");
        Self::text(msg)
    }

    /// Error response with agent context.
    pub fn error_tool(title: &str, agent_name: &str, message: &str) -> CallToolResult {
        Self::text(format!(
            "❌ {} - {}\n\n👤 Agent: {}\n",
            title, message, agent_name
        ))
    }

    /// Task list header with agent context.
    pub fn task_list_header(label: &str, agent_name: &str, total: usize, shown: usize) -> String {
        format!(
            "📋 {} '{}'\n\nShowing {} of {} tasks\n\n",
            label, agent_name, shown, total
        )
    }

    /// Platform agent permission denied — with optional tool-specific hint.
    pub fn permission_denied(
        agent_name: &str,
        required: &str,
        allowed: &[String],
        hint: &str,
    ) -> CallToolResult {
        let allowed_str = if allowed.is_empty() {
            "None".to_string()
        } else {
            allowed.join(", ")
        };
        Self::text(format!(
            "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
            Required Endpoint: {}\n\
            Allowed Endpoints: {}\n\n\
            💡 {hint}",
            agent_name, required, allowed_str
        ))
    }
}

/// Parse a compound task ID string ("projectId-taskNum") into its components.
pub fn parse_compound_task_id(task_id: &str) -> Result<(i32, i32), CallToolError> {
    debug_assert!(!task_id.is_empty(), "Task ID must not be empty");
    let parts: Vec<&str> = task_id.split('-').collect();
    if parts.len() < 2 {
        return Err(tool_error(
            "runtime",
            format!(
                "Invalid task ID format: {}. Expected format: project_id-task_id",
                task_id
            ),
        ));
    }
    let project_id: i32 = parts[0].parse().map_err(|_| {
        tool_error(
            "runtime",
            format!("Cannot parse project ID from task ID: {}", task_id),
        )
    })?;
    let task_num: i32 = parts[1].parse().map_err(|_| {
        tool_error(
            "runtime",
            format!("Cannot parse task number from task ID: {}", task_id),
        )
    })?;
    Ok((project_id, task_num))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(dead_code)]
    fn create_test_context() -> (ToolContext, tempfile::TempDir) {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let config_path = temp_dir
            .path()
            .join("test-config.toml")
            .to_string_lossy()
            .to_string();

        let ctx = ToolContext {
            config_path,
            api_client: Arc::new(VibeTaskClient::new("https://test.example.com").unwrap()),
            bypass_safety: false,
            workflow_context: Arc::new(RwLock::new(WorkflowContext::default())),
        };

        (ctx, temp_dir)
    }
}
