use crate::agent_detector::AgentType;
use std::collections::{HashMap, HashSet};
use thiserror::Error;
use vibetask_tool_catalog::{
    column_tools as catalog_column_tools, platform_tools as catalog_platform_tools,
    project_delegated_full_catalog, AGENT_STATUS, DELEGATE_AGENT, GET_CONTEXT, LIST_AGENTS,
    QUERY_HEALTH, QUERY_PROJECTS, QUERY_TASKS, READ_DOCUMENTS, REGISTER_AGENT, SWITCH_AGENT,
};

/// Tool Registry with explicit tool-column mapping and agent type filtering
pub struct ToolRegistry {
    /// Explicit mapping of columns to their available tools (no flat lists)
    column_tools: HashMap<String, HashSet<String>>,
    /// Tools available to Platform Agents (read-only operations)
    platform_tools: HashSet<String>,
    /// Current agent type for filtering
    agent_type: AgentType,
}

impl ToolRegistry {
    /// Create new tool registry with explicit tool-column mapping
    pub fn new(agent_type: AgentType) -> Self {
        let column_tools = catalog_column_tools();
        let platform_tools = catalog_platform_tools();

        Self {
            column_tools,
            platform_tools,
            agent_type,
        }
    }

    /// Re-evaluate available tools after agent type or context changes
    pub fn get_available_tools(&self, current_column: Option<&str>) -> Vec<String> {
        match &self.agent_type {
            AgentType::Platform {
                allowed_endpoints, ..
            } => {
                // Platform agents: filter by endpoint permissions
                let mut tools = vec![QUERY_HEALTH.to_string(), REGISTER_AGENT.to_string()];

                // Always available agent management tools
                tools.extend([
                    SWITCH_AGENT.to_string(),
                    LIST_AGENTS.to_string(),
                    AGENT_STATUS.to_string(),
                    DELEGATE_AGENT.to_string(),
                ]);

                // Endpoint-based tool availability
                if self.has_endpoint_access(allowed_endpoints, "/api/agent/projects") {
                    tools.push(QUERY_PROJECTS.to_string());
                }

                if self
                    .has_endpoint_access(allowed_endpoints, "/api/agent/projects/:projectId/docs")
                {
                    tools.push(READ_DOCUMENTS.to_string());
                }

                if self
                    .has_endpoint_access(allowed_endpoints, "/api/agent/projects/:projectId/tasks")
                {
                    tools.push(QUERY_TASKS.to_string());
                    tools.push(GET_CONTEXT.to_string());
                }

                tools
            }
            AgentType::ProjectDelegated { .. } => {
                // Full catalog at list time: same mental model as CLI; Hub enforces column rules on execution.
                let _ = current_column;
                project_delegated_full_catalog(&self.column_tools)
            }
        }
    }

    /// Validate tool is available in current context with detailed error messages
    pub fn validate_tool(
        &self,
        tool_name: &str,
        current_column: Option<&str>,
    ) -> Result<(), ToolValidationError> {
        let available_tools = self.get_available_tools(current_column);

        if !available_tools.contains(&tool_name.to_string()) {
            return Err(self.create_validation_error(tool_name, current_column, available_tools));
        }

        Ok(())
    }

    /// Update agent type and re-evaluate tool availability
    pub fn update_agent_type(&mut self, new_agent_type: AgentType) {
        self.agent_type = new_agent_type;
    }

    /// Check if agent has access to specific endpoint
    fn has_endpoint_access(&self, allowed_endpoints: &[String], target_endpoint: &str) -> bool {
        allowed_endpoints.iter().any(|endpoint| {
            // Handle parameterized endpoints like /api/agent/projects/:projectId/tasks
            if endpoint.contains(':') && target_endpoint.contains(':') {
                // Extract base path before parameters
                let endpoint_base = endpoint.split(':').next().unwrap_or(endpoint);
                let target_base = target_endpoint.split(':').next().unwrap_or(target_endpoint);
                endpoint_base == target_base
            } else {
                endpoint == target_endpoint
            }
        })
    }

    /// Create detailed validation error with context
    fn create_validation_error(
        &self,
        tool_name: &str,
        current_column: Option<&str>,
        available_tools: Vec<String>,
    ) -> ToolValidationError {
        match &self.agent_type {
            AgentType::Platform {
                name,
                allowed_endpoints,
                ..
            } => {
                if self.platform_tools.contains(tool_name) {
                    // Tool exists for platform agents but endpoint access is missing
                    let missing_endpoint = self.get_required_endpoint_for_tool(tool_name);
                    ToolValidationError::PlatformAgentInsufficientPermissions {
                        tool: tool_name.to_string(),
                        agent_name: name.clone(),
                        required_endpoint: missing_endpoint,
                        allowed_endpoints: allowed_endpoints.clone(),
                        available_tools,
                    }
                } else {
                    // Tool is not available for platform agents (write operation)
                    ToolValidationError::PlatformAgentWriteRestricted {
                        tool: tool_name.to_string(),
                        agent_name: name.clone(),
                        reason: "Platform Agents are read-only and cannot perform write operations"
                            .to_string(),
                        available_tools,
                    }
                }
            }
            AgentType::ProjectDelegated { name, .. } => {
                let _ = current_column;
                ToolValidationError::ToolNotFound {
                    tool: tool_name.to_string(),
                    agent_name: name.clone(),
                    available_tools,
                }
            }
        }
    }

    /// Get required endpoint for a platform tool
    fn get_required_endpoint_for_tool(&self, tool_name: &str) -> String {
        match tool_name {
            "query_projects" => "/api/agent/projects".to_string(),
            "query_tasks" => "/api/agent/projects/:projectId/tasks".to_string(),
            "read_documents" => "/api/agent/projects/:projectId/docs".to_string(),
            "get_context" => "/api/agent/projects/:projectId/tasks/:taskId".to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// Get all tools for a specific column (for debugging/introspection)
    pub fn get_column_tools(&self, column: &str) -> Option<&HashSet<String>> {
        self.column_tools.get(column)
    }

    /// Get all platform tools (for debugging/introspection)
    pub fn get_platform_tools(&self) -> &HashSet<String> {
        &self.platform_tools
    }

    /// Get current agent type (for debugging/introspection)
    pub fn get_agent_type(&self) -> &AgentType {
        &self.agent_type
    }
}

/// Detailed tool validation errors with context
#[derive(Debug, Error)]
pub enum ToolValidationError {
    #[error(
        "Platform Agent '{agent_name}' cannot access tool '{tool}': insufficient permissions.\n\
        Required endpoint: {required_endpoint}\n\
        Allowed endpoints: {allowed_endpoints:?}\n\
        Available tools: {available_tools:?}"
    )]
    PlatformAgentInsufficientPermissions {
        tool: String,
        agent_name: String,
        required_endpoint: String,
        allowed_endpoints: Vec<String>,
        available_tools: Vec<String>,
    },

    #[error(
        "Platform Agent '{agent_name}' cannot access tool '{tool}': {reason}\n\
        Available tools: {available_tools:?}"
    )]
    PlatformAgentWriteRestricted {
        tool: String,
        agent_name: String,
        reason: String,
        available_tools: Vec<String>,
    },

    #[error(
        "Tool '{tool}' not available for agent '{agent_name}' in column '{current_column}'.\n\
        Required column: '{required_column}'\n\
        Available tools: {available_tools:?}"
    )]
    WrongColumn {
        tool: String,
        agent_name: String,
        required_column: String,
        current_column: String,
        available_tools: Vec<String>,
    },

    #[error(
        "Tool '{tool}' requires column context for agent '{agent_name}'.\n\
        Required column: '{required_column}'\n\
        Available tools: {available_tools:?}"
    )]
    NoColumnContext {
        tool: String,
        agent_name: String,
        required_column: String,
        available_tools: Vec<String>,
    },

    #[error(
        "Tool '{tool}' not found for agent '{agent_name}'.\n\
        Available tools: {available_tools:?}"
    )]
    ToolNotFound {
        tool: String,
        agent_name: String,
        available_tools: Vec<String>,
    },

    #[error("Unknown error for tool '{tool}' and agent '{agent_name}': {context}")]
    UnknownError {
        tool: String,
        agent_name: String,
        context: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Delegation, DelegationMode, PermissionLevel};
    use std::collections::HashMap;

    fn create_platform_agent() -> AgentType {
        AgentType::Platform {
            name: "TestPlatformAgent".to_string(),
            allowed_endpoints: vec![
                "/api/agent/health".to_string(),
                "/api/agent/me".to_string(),
                "/api/agent/projects".to_string(),
            ],
            effective_endpoints: vec![
                "/api/agent/health".to_string(),
                "/api/agent/me".to_string(),
                "/api/agent/projects".to_string(),
            ],
        }
    }

    fn create_project_agent() -> AgentType {
        let delegations = vec![Delegation {
            project_id: 10,
            project_name: "Test Project".to_string(),
            project_prefix: "TP".to_string(),
            permission_level: PermissionLevel::User,
            delegated_at: chrono::DateTime::parse_from_rfc3339("2024-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&chrono::Utc),
            delegation_mode: DelegationMode::Full,
            restricted_column_id: None,
            allowed_move_range: None,
            column_allowance: None,
        }];

        let mut permissions = HashMap::new();
        permissions.insert(10, PermissionLevel::User);

        AgentType::ProjectDelegated {
            name: "TestProjectAgent".to_string(),
            projects: vec![10],
            permissions,
            delegations,
        }
    }

    #[test]
    fn test_platform_agent_tool_filtering() {
        let agent_type = create_platform_agent();
        let registry = ToolRegistry::new(agent_type);

        let available_tools = registry.get_available_tools(None);

        // Should have basic platform tools
        assert!(available_tools.contains(&"query_health".to_string()));
        assert!(available_tools.contains(&"register_agent".to_string()));
        assert!(available_tools.contains(&"query_projects".to_string())); // Has endpoint access

        // Should NOT have write tools
        assert!(!available_tools.contains(&"commit_artifact".to_string()));
        assert!(!available_tools.contains(&"spawn_sub_board".to_string()));
        assert!(!available_tools.contains(&"reflect_on_work".to_string()));
    }

    #[test]
    fn test_project_agent_full_catalog_without_column_gate() {
        let agent_type = create_project_agent();
        let registry = ToolRegistry::new(agent_type);

        let without_column = registry.get_available_tools(None);
        let specify_tools = registry.get_available_tools(Some("Specify"));
        let plan_tools = registry.get_available_tools(Some("Plan"));

        assert_eq!(without_column, specify_tools);
        assert_eq!(without_column, plan_tools);
        assert!(without_column.contains(&"commit_artifact".to_string()));
        assert!(without_column.contains(&"spawn_sub_board".to_string()));
        assert!(without_column.contains(&"create_task".to_string()));
        assert!(without_column.contains(&"create_knowledge_document".to_string()));
        assert!(without_column.contains(&"delegate_agent".to_string()));
        assert!(without_column.len() >= 23);
    }

    #[test]
    fn test_tool_validation_platform_agent() {
        let agent_type = create_platform_agent();
        let registry = ToolRegistry::new(agent_type);

        // Valid platform tool
        assert!(registry.validate_tool("query_health", None).is_ok());

        // Invalid write tool
        let result = registry.validate_tool("commit_artifact", Some("Specify"));
        assert!(result.is_err());
        match result.unwrap_err() {
            ToolValidationError::PlatformAgentWriteRestricted { tool, .. } => {
                assert_eq!(tool, "commit_artifact");
            }
            _ => panic!("Expected PlatformAgentWriteRestricted error"),
        }
    }

    #[test]
    fn test_tool_validation_project_agent() {
        let agent_type = create_project_agent();
        let registry = ToolRegistry::new(agent_type);

        assert!(registry
            .validate_tool("commit_artifact", Some("Specify"))
            .is_ok());
        assert!(registry
            .validate_tool("commit_artifact", Some("Execute"))
            .is_ok());
        assert!(registry.validate_tool("commit_artifact", None).is_ok());

        let result = registry.validate_tool("not_a_real_vibetask_tool", None);
        assert!(result.is_err());
        match result.unwrap_err() {
            ToolValidationError::ToolNotFound { tool, .. } => {
                assert_eq!(tool, "not_a_real_vibetask_tool");
            }
            _ => panic!("Expected ToolNotFound error"),
        }
    }

    #[test]
    fn test_endpoint_access_checking() {
        let agent_type = AgentType::Platform {
            name: "LimitedAgent".to_string(),
            allowed_endpoints: vec!["/api/agent/health".to_string()],
            effective_endpoints: vec!["/api/agent/health".to_string()],
        };

        let registry = ToolRegistry::new(agent_type);
        let available_tools = registry.get_available_tools(None);

        // Should have health tool
        assert!(available_tools.contains(&"query_health".to_string()));

        // Should NOT have projects tool (no endpoint access)
        assert!(!available_tools.contains(&"query_projects".to_string()));
    }

    #[test]
    fn test_parameterized_endpoint_matching() {
        let agent_type = AgentType::Platform {
            name: "TestAgent".to_string(),
            allowed_endpoints: vec!["/api/agent/projects/:projectId/docs".to_string()],
            effective_endpoints: vec!["/api/agent/projects/:projectId/docs".to_string()],
        };

        let registry = ToolRegistry::new(agent_type);

        // Should match parameterized endpoints
        assert!(registry.has_endpoint_access(
            &["/api/agent/projects/:projectId/docs".to_string()],
            "/api/agent/projects/:projectId/docs"
        ));
    }

    #[test]
    fn test_agent_type_update() {
        let platform_agent = create_platform_agent();
        let mut registry = ToolRegistry::new(platform_agent);

        // Initially platform agent
        let tools = registry.get_available_tools(None);
        assert!(tools.contains(&"query_health".to_string()));
        assert!(!tools.contains(&"commit_artifact".to_string()));

        // Update to project agent
        let project_agent = create_project_agent();
        registry.update_agent_type(project_agent);

        // Now should have project agent tools
        let tools = registry.get_available_tools(Some("Specify"));
        assert!(tools.contains(&"commit_artifact".to_string()));
        assert!(tools.contains(&"query_health".to_string()));
    }

    #[test]
    fn test_tool_introspection() {
        let agent_type = create_project_agent();
        let registry = ToolRegistry::new(agent_type);

        // Test column tools introspection
        let specify_tools = registry.get_column_tools("Specify").unwrap();
        assert!(specify_tools.contains("commit_artifact"));

        // Test platform tools introspection
        let platform_tools = registry.get_platform_tools();
        assert!(platform_tools.contains("query_health"));

        // Test agent type introspection
        match registry.get_agent_type() {
            AgentType::ProjectDelegated { name, .. } => {
                assert_eq!(name, "TestProjectAgent");
            }
            _ => panic!("Expected ProjectDelegated agent type"),
        }
    }
}
