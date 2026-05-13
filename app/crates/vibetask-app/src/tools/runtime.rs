use crate::atomic_writer::SecureKeyManager;
use crate::config::{AgentConfig, AgentEntry};
use crate::tools::tool_error;
use crate::vibetask_client::VibeTaskClient;
use rust_mcp_sdk::schema::CallToolError;
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
        if entry.agent_type != required {
            return Err(tool_error(
                "runtime",
                format!("{} is only available for {} Agents", tool_name, required),
            ));
        }
        Ok(())
    }
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
