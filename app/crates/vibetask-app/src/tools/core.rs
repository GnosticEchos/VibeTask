use super::*;
use rust_mcp_sdk::macros::JsonSchema;

//*********************//
//  RegisterAgentTool  //
//*********************//
#[mcp_tool(
    name = "register_agent",
    description = "Register a new agent by providing raw API key. Verifies identity and stores securely.",
    title = "Register Agent",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RegisterAgentTool {
    /// Raw x-agent-api-key to register
    pub api_key: String,
    /// Optional: Set as active agent after registration
    #[serde(default)]
    pub set_as_active: Option<bool>,
}

impl RegisterAgentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Starting agent registration process");

        // STEP 1: Validate key format
        SecureKeyManager::validate_key_format(&self.api_key)
            .map_err(|e| tool_error("runtime", format!("Key validation failed: {}", e)))?;

        // STEP 2: Verify identity with Hub
        let me_response = ctx
            .api_client
            .get_agent_me(&self.api_key)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Invalid key. Identity verification failed: {}", e),
                )
            })?;

        info!("Identity verified for agent: {}", me_response.agent.name);

        // STEP 3: Check key expiration
        if let Some(notification) = SecureKeyManager::check_expiration_notification(
            &me_response.agent.expires_at.to_rfc3339(),
        ) {
            if notification.is_urgent() {
                return Err(tool_error(
                    "runtime",
                    format!("Key expires soon: {}", notification.message()),
                ));
            }
        }

        // STEP 4: Hash and store the key
        let key_hash = SecureKeyManager::hash_key(&self.api_key);
        SecureKeyManager::store_key(&me_response.agent.name, &self.api_key)
            .await
            .map_err(|e| tool_error("storage", format!("Failed to store key: {}", e)))?;

        // STEP 5: Update configuration
        let mut config = AgentConfig::load(&ctx.config_path)
            .await
            .unwrap_or_else(|_| AgentConfig::create_default("VibeTask MCP"));

        // Remove existing entry with same name
        config.agents.retain(|a| a.name != me_response.agent.name);

        // Create new agent entry
        let agent_entry = if me_response.api_allowance.is_platform_agent {
            crate::config::AgentEntry {
                name: me_response.agent.name.clone(),
                agent_type: "Platform".to_string(),
                key_hash,
                api_key: None,
                allowed_endpoints: Some(
                    me_response.api_allowance.configured_read_endpoints.clone(),
                ),
                effective_endpoints: Some(
                    me_response.api_allowance.effective_read_endpoints.clone(),
                ),
                projects: None,
                permissions: None,
                delegated_at: None,
            }
        } else {
            crate::config::AgentEntry {
                name: me_response.agent.name.clone(),
                agent_type: "ProjectDelegated".to_string(),
                key_hash,
                api_key: None,
                allowed_endpoints: None,
                effective_endpoints: None,
                projects: Some(
                    me_response
                        .delegations
                        .iter()
                        .map(|d| d.project_id)
                        .collect(),
                ),
                permissions: Some(
                    me_response
                        .delegations
                        .iter()
                        .map(|d| format!("{:?}", d.permission_level))
                        .collect(),
                ),
                delegated_at: Some(chrono::Utc::now().to_rfc3339()),
            }
        };

        config.agents.push(agent_entry.clone());

        // Set as active if requested
        if self.set_as_active.unwrap_or(false) {
            config.server.active_agent = agent_entry.name.clone();
        }

        // Save configuration
        config
            .save(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to save config: {}", e)))?;

        // STEP 6: Format response
        let response = if me_response.api_allowance.is_platform_agent {
            format!(
                "✅ Identity Verified: Registered '{}'\n\
                Type: Platform Agent\n\
                Endpoints: {} configured\n\
                Effective: {}\n\n\
                Key securely stored in {}",
                agent_entry.name,
                me_response.api_allowance.configured_read_endpoints.len(),
                me_response
                    .api_allowance
                    .effective_read_endpoints
                    .join(", "),
                ctx.config_path
            )
        } else {
            let projects_info = me_response
                .delegations
                .iter()
                .map(|d| {
                    format!(
                        "{} (ID: {}) - {:?} permission",
                        d.project_name, d.project_id, d.permission_level
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");

            format!(
                "✅ Identity Verified: Registered '{}'\n\
                Type: ProjectDelegated\n\
                Projects:\n{}\n\
                Delegations: {} projects accessible\n\n\
                Key securely stored in {}",
                agent_entry.name,
                projects_info,
                me_response.delegations.len(),
                ctx.config_path
            )
        };

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//*******************//
//  QueryHealthTool  //
//*******************//
#[mcp_tool(
    name = "query_health",
    description = "Check Hub connectivity and agent health status for the active agent",
    title = "Query Health",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub struct QueryHealthTool {}

impl QueryHealthTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Executing comprehensive health check");

        let active = ctx.resolve_active_agent().await?;
        let api_key = &active.api_key;

        let mut health_report = format!(
            "🔍 Agent '{}' Health Report ({})\n\n",
            active.entry.name, active.entry.agent_type
        );

        // STEP 1: Test Hub connectivity with /api/agent/health
        health_report.push_str("📡 Hub Connectivity:\n");
        match ctx.api_client.get_health(api_key).await {
            Ok(health_response) => {
                health_report.push_str(&format!("   ✅ Hub Status: {}\n", health_response.status));
                if let Some(scope) = &health_response.scope {
                    health_report.push_str(&format!("   ✅ Health Scope: {}\n", scope));
                }
                if let Some(timestamp) = &health_response.timestamp {
                    health_report.push_str(&format!(
                        "   ✅ Response Time: {}\n",
                        timestamp.format("%Y-%m-%d %H:%M:%S UTC")
                    ));
                }
            }
            Err(e) => {
                health_report.push_str(&format!("   ❌ Hub Unreachable: {}\n", e));
            }
        }

        // STEP 2: Validate agent identity and permissions
        health_report.push_str("\n🔐 Agent Identity Validation:\n");
        match ctx.api_client.get_agent_me(api_key).await {
            Ok(me_response) => {
                health_report.push_str(&format!("   ✅ Agent ID: {}\n", me_response.agent.id));
                health_report.push_str(&format!("   ✅ Agent Name: {}\n", me_response.agent.name));
                health_report.push_str(&format!(
                    "   ✅ Platform Agent: {}\n",
                    me_response.api_allowance.is_platform_agent
                ));
                health_report.push_str(&format!(
                    "   ✅ Read Only: {}\n",
                    me_response.api_allowance.read_only
                ));

                // Check key expiration
                let expires_at = me_response.agent.expires_at;
                let now = chrono::Utc::now();
                let time_until_expiry = expires_at - now;

                if time_until_expiry.num_days() < 7 {
                    health_report.push_str(&format!(
                        "   ⚠️  Key Expires Soon: {} (in {} days)\n",
                        expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                        time_until_expiry.num_days()
                    ));
                } else {
                    health_report.push_str(&format!(
                        "   ✅ Key Valid Until: {} ({} days remaining)\n",
                        expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                        time_until_expiry.num_days()
                    ));
                }

                // STEP 3: Test endpoint accessibility
                health_report.push_str("\n🔗 Endpoint Accessibility:\n");
                health_report.push_str("   Always Allowed:\n");
                for endpoint in &me_response.api_allowance.always_allowed_read_endpoints {
                    health_report.push_str(&format!("     ✅ {}\n", endpoint));
                }

                if !me_response
                    .api_allowance
                    .configured_read_endpoints
                    .is_empty()
                {
                    health_report.push_str("   Configured Access:\n");
                    for endpoint in &me_response.api_allowance.configured_read_endpoints {
                        // Test if we can actually access this endpoint
                        let access_status = match endpoint.as_str() {
                            "/api/agent/projects" => {
                                match ctx
                                    .api_client
                                    .get_projects(
                                    api_key,
                                    &me_response.api_allowance.effective_read_endpoints,
                                    )
                                    .await
                                {
                                    Ok(_) => "✅ Accessible",
                                    Err(_) => "❌ Access Denied",
                                }
                            }
                            _ => "🔍 Not Tested",
                        };
                        health_report.push_str(&format!("     {} {}\n", access_status, endpoint));
                    }
                } else {
                    health_report.push_str("   No additional endpoints configured\n");
                }

                // STEP 4: Configuration validation
                health_report.push_str("\n⚙️  Configuration Status:\n");
                health_report.push_str(&format!("   ✅ Config File: {}\n", ctx.config_path));
                health_report.push_str(&format!(
                    "   ✅ Active Agent: {}\n",
                    active.config.server.active_agent
                ));
                health_report.push_str(&format!("   ✅ Total Agents: {}\n", active.config.agents.len()));

                // Check if stored endpoints match API response
                let empty_endpoints = vec![];
                let stored_endpoints = active.entry
                    .effective_endpoints
                    .as_ref()
                    .unwrap_or(&empty_endpoints);
                let api_endpoints = &me_response.api_allowance.effective_read_endpoints;

                if stored_endpoints == api_endpoints {
                    health_report.push_str("   ✅ Endpoint Configuration: Synchronized\n");
                } else {
                    health_report.push_str("   ⚠️  Endpoint Configuration: Out of Sync\n");
                    health_report
                        .push_str("     Consider re-registering the agent to update permissions\n");
                }
            }
            Err(e) => {
                health_report.push_str(&format!("   ❌ Identity Validation Failed: {}\n", e));
                health_report.push_str("   💡 Check API key validity and Hub connectivity\n");
            }
        }

        // STEP 5: System diagnostics
        health_report.push_str("\n🔧 System Diagnostics:\n");
        health_report.push_str(&format!(
            "   ✅ MCP Server Version: {}\n",
            env!("CARGO_PKG_VERSION")
        ));
        health_report.push_str(&format!(
            "   ✅ Rust Version: {}\n",
            std::env::var("RUSTC_VERSION").unwrap_or_else(|_| "Unknown".to_string())
        ));
        health_report.push_str(&format!(
            "   ✅ Build Profile: {}\n",
            if cfg!(debug_assertions) {
                "Debug"
            } else {
                "Release"
            }
        ));

        // Add recommendations
        health_report.push_str("\n💡 Recommendations:\n");
        health_report
            .push_str("   • Use 'query_projects' to test project access (if configured)\n");
        health_report.push_str("   • Use 'list_agents' to view all registered agents\n");
        if active.entry.agent_type == "Platform" {
            health_report.push_str(
                "   • Use agent delegation for write operations through project agents\n",
            );
        } else {
            health_report.push_str(
                "   • Use task and document tools for work scoped to your delegated projects\n",
            );
        }

        Ok(CallToolResult::text_content(vec![TextContent::from(
            health_report,
        )]))
    }
}

//******************//
//  ListAgentsTool  //
//******************//
#[mcp_tool(
    name = "list_agents",
    description = "List all registered agents with their types and permissions",
    title = "List Agents",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub struct ListAgentsTool {}

impl ListAgentsTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Listing registered agents with status monitoring");

        let config = AgentConfig::load(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        if config.agents.is_empty() {
            return Ok(CallToolResult::text_content(vec![TextContent::from(
                "No agents registered. Use 'register_agent' to add an agent.".to_string(),
            )]));
        }

        let mut response = format!(
            "📋 Registered Agents ({}) - Status Report\n\n",
            config.agents.len()
        );
        response.push_str(&format!("Active Agent: {}\n\n", config.server.active_agent));

        for (i, agent) in config.agents.iter().enumerate() {
            let status = if agent.name == config.server.active_agent {
                "🟢 ACTIVE"
            } else {
                "⚪ INACTIVE"
            };

            response.push_str(&format!("{}. {} {}\n", i + 1, status, agent.name));
            response.push_str(&format!("   Type: {}\n", agent.agent_type));

            // Check key availability and expiration
            match SecureKeyManager::retrieve_key(&agent.name).await {
                Ok(key) => {
                    response.push_str("   Key: ✅ Available\n");

                    // Check expiration by calling the API
                    match ctx.api_client.get_agent_me(&key).await {
                        Ok(me_response) => {
                            let expires_at = me_response.agent.expires_at;
                            let now = chrono::Utc::now();
                            let time_until_expiry = expires_at - now;

                            if time_until_expiry.num_days() < 7 {
                                response.push_str(&format!(
                                    "   ⚠️  Expires: {} (in {} days) - URGENT\n",
                                    expires_at.format("%Y-%m-%d"),
                                    time_until_expiry.num_days()
                                ));
                            } else if time_until_expiry.num_days() < 30 {
                                response.push_str(&format!(
                                    "   ⚠️  Expires: {} (in {} days)\n",
                                    expires_at.format("%Y-%m-%d"),
                                    time_until_expiry.num_days()
                                ));
                            } else {
                                response.push_str(&format!(
                                    "   ✅ Expires: {} ({} days)\n",
                                    expires_at.format("%Y-%m-%d"),
                                    time_until_expiry.num_days()
                                ));
                            }
                        }
                        Err(_) => {
                            response.push_str("   ❌ Key Invalid or Hub Unreachable\n");
                        }
                    }
                }
                Err(_) => {
                    response.push_str("   ❌ Key: Missing from secure storage\n");
                }
            }

            // Add type-specific details
            match agent.agent_type.as_str() {
                "Platform" => {
                    if let Some(endpoints) = &agent.allowed_endpoints {
                        response
                            .push_str(&format!("   Endpoints: {} configured\n", endpoints.len()));
                        if endpoints.len() <= 3 {
                            for endpoint in endpoints {
                                response.push_str(&format!("     • {}\n", endpoint));
                            }
                        }
                    }
                }
                "ProjectDelegated" => {
                    if let Some(projects) = &agent.projects {
                        response.push_str(&format!("   Projects: {} accessible\n", projects.len()));
                        if projects.len() <= 5 {
                            response.push_str(&format!("     IDs: {:?}\n", projects));
                        }
                    }
                    if let Some(permissions) = &agent.permissions {
                        let user_count = permissions.iter().filter(|p| *p == "USER").count();
                        let viewer_count = permissions.iter().filter(|p| *p == "VIEWER").count();
                        if user_count > 0 && viewer_count > 0 {
                            response.push_str(&format!(
                                "   Permissions: {} USER, {} VIEWER\n",
                                user_count, viewer_count
                            ));
                        } else if user_count > 0 {
                            response.push_str(&format!("   Permissions: {} USER\n", user_count));
                        } else if viewer_count > 0 {
                            response
                                .push_str(&format!("   Permissions: {} VIEWER\n", viewer_count));
                        }
                    }
                }
                _ => {}
            }

            response.push('\n');
        }

        // Add summary and recommendations
        response.push_str("💡 Management Actions:\n");
        response.push_str("• Use 'switch_agent <name>' to change active agent\n");
        response.push_str("• Use 'register_agent' to add new agents\n");
        response.push_str("• Use 'delegate_agent' for Platform Agent operations\n");

        // Check for expiring keys
        let mut expiring_soon = Vec::new();
        for agent in &config.agents {
            if let Ok(key) = SecureKeyManager::retrieve_key(&agent.name).await {
                if let Ok(me_response) = ctx.api_client.get_agent_me(&key).await {
                    let time_until_expiry = me_response.agent.expires_at - chrono::Utc::now();
                    if time_until_expiry.num_days() < 30 {
                        expiring_soon.push((agent.name.clone(), time_until_expiry.num_days()));
                    }
                }
            }
        }

        if !expiring_soon.is_empty() {
            response.push_str("\n⚠️  Expiration Alerts:\n");
            for (name, days) in expiring_soon {
                if days < 7 {
                    response.push_str(&format!(
                        "• {} expires in {} days - URGENT renewal needed\n",
                        name, days
                    ));
                } else {
                    response.push_str(&format!(
                        "• {} expires in {} days - plan renewal\n",
                        name, days
                    ));
                }
            }
        }

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//******************//
//  SwitchAgentTool  //
//******************//
#[mcp_tool(
    name = "switch_agent",
    description = "Switch to a different registered agent",
    title = "Switch Agent",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct SwitchAgentTool {
    /// Name of the agent to switch to
    pub agent_name: String,
}

//******************//
//  AgentStatusTool //
//******************//
#[mcp_tool(
    name = "agent_status",
    description = "Check detailed status and health of a specific agent",
    title = "Agent Status",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct AgentStatusTool {
    /// Name of the agent to check status for
    pub agent_name: String,
}

//*********************//
//  DelegateAgentTool  //
//*********************//
#[mcp_tool(
    name = "delegate_agent",
    description = "Delegate to a project agent for specific project operations",
    title = "Delegate Agent",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct DelegateAgentTool {
    /// Name of the project agent to delegate to
    pub agent_name: String,
    /// Project ID to access through the delegated agent
    pub project_id: i32,
    /// Operation to perform (e.g., "get_status", "read_documents", "query_tasks")
    pub operation: String,
    /// Optional parameters for the operation
    #[serde(default)]
    pub parameters: Option<JsonObjectArgs>,
}

impl SwitchAgentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Switching to agent: {}", self.agent_name);

        let mut config = AgentConfig::load(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        // Check if agent exists
        let target_agent = config
            .agents
            .iter()
            .find(|a| a.name == self.agent_name)
            .cloned();
        let Some(target_agent) = target_agent else {
            return Err(tool_error(
                "runtime",
                format!(
                    "Agent '{}' not found. Available agents: {}",
                    self.agent_name,
                    config
                        .agents
                        .iter()
                        .map(|a| a.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
        };

        // Retrieve the raw key from secure storage and verify it matches the TOML hash.
        let api_key = SecureKeyManager::retrieve_key(&self.agent_name)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Cannot switch to '{}': key not found in secure storage: {}",
                        self.agent_name, e
                    ),
                )
            })?;
        if !SecureKeyManager::verify_key_hash(&api_key, &target_agent.key_hash) {
            return Err(tool_error(
                "runtime",
                format!(
                    "Cannot switch to '{}': secure-storage key does not match TOML key_hash",
                    self.agent_name
                ),
            ));
        }

        // Re-verify with the Hub before making the switch visible to the session.
        let me_response = ctx.api_client.get_agent_me(&api_key).await.map_err(|e| {
            tool_error(
                "runtime",
                format!(
                    "Cannot switch to '{}': Hub identity verification failed: {}",
                    self.agent_name, e
                ),
            )
        })?;
        if me_response.agent.name != self.agent_name {
            return Err(tool_error(
                "runtime",
                format!(
                    "Cannot switch to '{}': key resolved to Hub identity '{}'",
                    self.agent_name, me_response.agent.name
                ),
            ));
        }

        // Set as active agent
        let old_agent = config.server.active_agent.clone();
        config.server.active_agent = self.agent_name.clone();

        // Save configuration
        config
            .save(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to save config: {}", e)))?;

        let response = format!(
            "✅ Agent switched successfully\n\
            Previous: {}\n\
            Current: {}\n\
            Hub Identity: {}\n\
            Type: {}",
            old_agent, self.agent_name, me_response.agent.id, target_agent.agent_type
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

impl AgentStatusTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Checking detailed status for agent: {}", self.agent_name);

        // Load configuration
        let config = AgentConfig::load(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        // Find the agent
        let agent = config.get_agent(&self.agent_name).ok_or_else(|| {
            tool_error(
                "runtime",
                format!(
                    "Agent '{}' not found. Available agents: {}",
                    self.agent_name,
                    config
                        .agents
                        .iter()
                        .map(|a| a.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        })?;

        let mut status_report = format!("🔍 Agent Status Report: {}\n\n", self.agent_name);

        // Basic information
        status_report.push_str(&format!("Type: {}\n", agent.agent_type));
        status_report.push_str(&format!(
            "Status: {}\n",
            if agent.name == config.server.active_agent {
                "🟢 ACTIVE"
            } else {
                "⚪ INACTIVE"
            }
        ));

        // Key status and expiration check
        status_report.push_str("\n🔐 Authentication Status:\n");
        match SecureKeyManager::retrieve_key(&self.agent_name).await {
            Ok(key) => {
                status_report.push_str("   ✅ Key: Available in secure storage\n");

                // Test Hub connectivity and get detailed info
                match ctx.api_client.get_agent_me(&key).await {
                    Ok(me_response) => {
                        status_report.push_str("   ✅ Hub Connectivity: Success\n");
                        status_report
                            .push_str(&format!("   ✅ Agent ID: {}\n", me_response.agent.id));
                        status_report
                            .push_str(&format!("   ✅ Owner ID: {}\n", me_response.agent.owner_id));

                        // Expiration analysis
                        let expires_at = me_response.agent.expires_at;
                        let now = chrono::Utc::now();
                        let time_until_expiry = expires_at - now;

                        status_report.push_str(&format!(
                            "   📅 Created: {}\n",
                            me_response.agent.created_at.format("%Y-%m-%d %H:%M:%S UTC")
                        ));

                        if time_until_expiry.num_days() < 0 {
                            status_report.push_str(&format!(
                                "   ❌ EXPIRED: {} ({} days ago)\n",
                                expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                                -time_until_expiry.num_days()
                            ));
                        } else if time_until_expiry.num_days() < 7 {
                            status_report.push_str(&format!(
                                "   🚨 URGENT: Expires {} (in {} days)\n",
                                expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                                time_until_expiry.num_days()
                            ));
                        } else if time_until_expiry.num_days() < 30 {
                            status_report.push_str(&format!(
                                "   ⚠️  WARNING: Expires {} (in {} days)\n",
                                expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                                time_until_expiry.num_days()
                            ));
                        } else {
                            status_report.push_str(&format!(
                                "   ✅ Valid Until: {} ({} days remaining)\n",
                                expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
                                time_until_expiry.num_days()
                            ));
                        }

                        // Agent type specific information
                        if me_response.api_allowance.is_platform_agent {
                            status_report.push_str("\n🏢 Platform Agent Configuration:\n");
                            status_report.push_str(&format!(
                                "   Read Only: {}\n",
                                me_response.api_allowance.read_only
                            ));
                            status_report.push_str("   Always Allowed Endpoints:\n");
                            for endpoint in &me_response.api_allowance.always_allowed_read_endpoints
                            {
                                status_report.push_str(&format!("     • {}\n", endpoint));
                            }

                            if !me_response
                                .api_allowance
                                .configured_read_endpoints
                                .is_empty()
                            {
                                status_report.push_str("   Configured Endpoints:\n");
                                for endpoint in &me_response.api_allowance.configured_read_endpoints
                                {
                                    status_report.push_str(&format!("     • {}\n", endpoint));
                                }
                            }

                            status_report.push_str(&format!(
                                "   Total Effective Endpoints: {}\n",
                                me_response.api_allowance.effective_read_endpoints.len()
                            ));
                        } else {
                            status_report.push_str("\n🚀 Project Agent Configuration:\n");
                            status_report.push_str(&format!(
                                "   Project Delegations: {}\n",
                                me_response.delegations.len()
                            ));

                            if !me_response.delegations.is_empty() {
                                status_report.push_str("   Accessible Projects:\n");
                                for delegation in &me_response.delegations {
                                    status_report.push_str(&format!(
                                        "     • {} (ID: {}) - {:?} permission\n",
                                        delegation.project_name,
                                        delegation.project_id,
                                        delegation.permission_level
                                    ));
                                    status_report.push_str(&format!(
                                        "       Delegated: {}\n",
                                        delegation.delegated_at.format("%Y-%m-%d %H:%M:%S UTC")
                                    ));
                                    status_report.push_str(&format!(
                                        "       {}\n",
                                        delegation.lattice_summary()
                                    ));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        status_report
                            .push_str(&format!("   ❌ Hub Connectivity: Failed ({})\n", e));
                        status_report.push_str("   💡 Possible issues:\n");
                        status_report.push_str("     • Key has been revoked or expired\n");
                        status_report.push_str("     • Hub is temporarily unavailable\n");
                        status_report.push_str("     • Network connectivity issues\n");
                    }
                }
            }
            Err(e) => {
                status_report
                    .push_str(&format!("   ❌ Key: Missing from secure storage ({})\n", e));
                status_report.push_str("   💡 Use 'register_agent' to re-add this agent\n");
            }
        }

        // Configuration consistency check
        status_report.push_str("\n⚙️  Configuration Status:\n");
        status_report.push_str(&format!("   Config File: {}\n", ctx.config_path));
        status_report.push_str(&format!("   Hash: {}\n", agent.key_hash));

        if let Some(delegated_at) = &agent.delegated_at {
            status_report.push_str(&format!("   Registered: {}\n", delegated_at));
        }

        // Recommendations
        status_report.push_str("\n💡 Recommendations:\n");
        if agent.name != config.server.active_agent {
            status_report.push_str(&format!(
                "• Use 'switch_agent {}' to activate this agent\n",
                self.agent_name
            ));
        }

        match agent.agent_type.as_str() {
            "Platform" => {
                status_report.push_str("• Use 'query_health' to test Hub connectivity\n");
                status_report.push_str("• Use 'delegate_agent' for project operations\n");
            }
            "ProjectDelegated" => {
                status_report.push_str("• This agent can perform full workflow operations\n");
                status_report.push_str("• Use 'query_projects' to see accessible projects\n");
            }
            _ => {}
        }

        Ok(CallToolResult::text_content(vec![TextContent::from(
            status_report,
        )]))
    }
}

impl DelegateAgentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Delegating to agent '{}' for project {} operation '{}'",
            self.agent_name, self.project_id, self.operation
        );

        // Load current configuration
        let config = AgentConfig::load(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        // Get current active agent (should be Platform Agent)
        let current_agent = config
            .get_agent(&config.server.active_agent)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    format!(
                        "Active agent '{}' not found in configuration",
                        config.server.active_agent
                    ),
                )
            })?;

        // Verify current agent is Platform Agent
        if current_agent.agent_type != "Platform" {
            return Err(tool_error(
                "runtime",
                "Agent delegation is only available for Platform Agents".to_string(),
            ));
        }

        // Find the target delegation agent
        let target_agent = config.get_agent(&self.agent_name).ok_or_else(|| {
            tool_error(
                "runtime",
                format!(
                    "Delegation target agent '{}' not found. Available agents: {}",
                    self.agent_name,
                    config
                        .agents
                        .iter()
                        .filter(|a| a.agent_type == "ProjectDelegated")
                        .map(|a| a.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        })?;

        // Verify target agent is Project Agent
        if target_agent.agent_type != "ProjectDelegated" {
            return Err(tool_error("runtime", format!(
                "Agent '{}' is not a Project Agent (type: {}). Only Project Agents can be delegation targets.",
                self.agent_name, target_agent.agent_type
            )));
        }

        // Verify target agent has access to the requested project
        let has_project_access = target_agent
            .projects
            .as_ref()
            .map(|projects| projects.contains(&self.project_id))
            .unwrap_or(false);

        if !has_project_access {
            let available_projects = target_agent
                .projects
                .as_ref()
                .map(|p| {
                    p.iter()
                        .map(|id| id.to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| "None".to_string());

            return Err(tool_error(
                "runtime",
                format!(
                    "Agent '{}' does not have access to project {}.\n\
                Available projects: {}",
                    self.agent_name, self.project_id, available_projects
                ),
            ));
        }

        // Get the delegation agent's API key
        let delegation_key = SecureKeyManager::retrieve_key(&self.agent_name)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to retrieve API key for delegation agent '{}': {}",
                        self.agent_name, e
                    ),
                )
            })?;

        // Verify delegation agent identity and permissions
        let me_response = ctx
            .api_client
            .get_agent_me(&delegation_key)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to verify delegation agent '{}' identity: {}",
                        self.agent_name, e
                    ),
                )
            })?;

        // Find the specific project delegation
        let project_delegation = me_response
            .delegations
            .iter()
            .find(|d| d.project_id == self.project_id)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    format!(
                        "Agent '{}' does not have delegation for project {}",
                        self.agent_name, self.project_id
                    ),
                )
            })?;

        // Execute the requested operation using the delegation agent's credentials
        let operation_result = match self.operation.as_str() {
            "get_status" => {
                self.execute_get_status(ctx, &delegation_key, project_delegation)
                    .await
            }
            "query_tasks" => {
                self.execute_query_tasks(ctx, &delegation_key, project_delegation)
                    .await
            }
            "read_documents" => {
                self.execute_read_documents(ctx, &delegation_key, project_delegation)
                    .await
            }
            "get_context" => {
                self.execute_get_context(ctx, &delegation_key, project_delegation)
                    .await
            }
            _ => Err(tool_error("runtime", format!(
                "Unsupported operation '{}'. Supported operations: get_status, query_tasks, read_documents, get_context",
                self.operation
            ))),
        }?;

        // Format response with agent provenance
        let response = format!(
            "🔄 Delegation Result\n\
            Platform Agent: {} → Project Agent: {}\n\
            Project: {} ({})\n\
            Permission Level: {:?}\n\
            Operation: {}\n\n\
            {}",
            current_agent.name,
            self.agent_name,
            project_delegation.project_name,
            project_delegation.project_id,
            project_delegation.permission_level,
            self.operation,
            operation_result
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    async fn execute_get_status(
        &self,
        ctx: &ToolContext,
        delegation_key: &str,
        _project_delegation: &crate::generated_types::Delegation,
    ) -> Result<String, CallToolError> {
        // Get project details
        let project_response = ctx
            .api_client
            .get_project_details(delegation_key, self.project_id)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project details: {}", e)))?;

        // Extract project from the nested response
        let project = project_response
            .get("project")
            .ok_or_else(|| tool_error("runtime", "Project not found in response".to_string()))?;

        let mut status = format!(
            "📊 Project Status: {}\n\
            ID: {}\n\
            Prefix: {}\n",
            project
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown"),
            project.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
            project
                .get("prefix")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
        );

        if let Some(description) = project.get("description").and_then(|v| v.as_str()) {
            status.push_str(&format!("Description: {}\n", description));
        }

        if let Some(owner_id) = project.get("ownerId").and_then(|v| v.as_i64()) {
            status.push_str(&format!("Owner ID: {}\n", owner_id));
        }

        // Add column information if available
        if let Some(columns) = project.get("columns").and_then(|v| v.as_array()) {
            status.push_str(&format!("\n📋 Workflow Columns ({}):\n", columns.len()));
            for (i, column) in columns.iter().enumerate() {
                if let (Some(name), Some(order)) = (
                    column.get("name").and_then(|v| v.as_str()),
                    column.get("order").and_then(|v| v.as_i64()),
                ) {
                    status.push_str(&format!("  {}. {} (Order: {})\n", i + 1, name, order));
                    if let Some(description) = column.get("description").and_then(|v| v.as_str()) {
                        let short_desc = truncate_preview(description, 80);
                        status.push_str(&format!("     {}\n", short_desc));
                    }
                }
            }
        }

        Ok(status)
    }

    async fn execute_query_tasks(
        &self,
        ctx: &ToolContext,
        delegation_key: &str,
        project_delegation: &crate::generated_types::Delegation,
    ) -> Result<String, CallToolError> {
        // Extract limit from parameters if provided (currently unused as API doesn't support it)
        let _limit = self
            .parameters
            .as_ref()
            .map(|p| &p.0)
            .and_then(|v| v.as_object())
            .and_then(|p| p.get("limit"))
            .and_then(|l| l.as_i64())
            .map(|l| l as i32);

        let tasks_response = ctx
            .api_client
            .get_project_tasks(delegation_key, self.project_id, &[])
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project tasks: {}", e)))?;

        let mut result = format!(
            "📋 Tasks for Project '{}' (ID: {})\n\n",
            project_delegation.project_name, self.project_id
        );

        if tasks_response.data.is_empty() {
            result.push_str("No tasks found in this project.\n");
        } else {
            result.push_str(&format!("Found {} tasks:\n\n", tasks_response.data.len()));

            for (i, task) in tasks_response.data.iter().enumerate() {
                result.push_str(&format!("{}. {} (ID: {})\n", i + 1, task.name, task.id));
                result.push_str(&format!("   Status: {:?}\n", task.status));
                result.push_str(&format!("   Column: {}\n", task.column.name));
                if let Some(assignee_id) = task.assignee_id {
                    result.push_str(&format!("   Assignee ID: {}\n", assignee_id));
                }
                result.push_str(&format!(
                    "   Created: {}\n",
                    task.created_at.format("%Y-%m-%d %H:%M:%S UTC")
                ));
                result.push('\n');
            }

            result.push_str(&format!(
                "📄 Page {} of {} (Total: {} tasks)\n",
                tasks_response
                    .pagination
                    .as_ref()
                    .map(|p| p.page)
                    .unwrap_or(1),
                tasks_response
                    .pagination
                    .as_ref()
                    .map(|p| p.total_pages)
                    .unwrap_or(1),
                tasks_response
                    .pagination
                    .as_ref()
                    .map(|p| p.total)
                    .unwrap_or(tasks_response.data.len() as i32)
            ));
        }

        Ok(result)
    }

    async fn execute_read_documents(
        &self,
        ctx: &ToolContext,
        delegation_key: &str,
        project_delegation: &crate::generated_types::Delegation,
    ) -> Result<String, CallToolError> {
        let documents_response = ctx
            .api_client
            .get_project_documents(delegation_key, self.project_id, &[], None, None, None)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to get project documents: {}", e))
            })?;

        let mut result = format!(
            "📚 Documents for Project '{}' (ID: {})\n\n",
            project_delegation.project_name, self.project_id
        );

        if documents_response.data.is_empty() {
            result.push_str("No documents found in this project.\n");
        } else {
            result.push_str(&format!(
                "Found {} documents:\n\n",
                documents_response.data.len()
            ));

            for (i, doc) in documents_response.data.iter().enumerate() {
                result.push_str(&format!("{}. {} (ID: {})\n", i + 1, doc.title, doc.id));
                result.push_str(&format!("   Role: {:?}\n", doc.role));
                // Note: ProjectDocument doesn't have a status field in the current schema
                let content_preview = &doc.content;
                let preview = truncate_preview(content_preview, 100);
                result.push_str(&format!("   Preview: {}\n", preview));
                result.push_str(&format!(
                    "   Updated: {}\n",
                    doc.updated_at
                        .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                        .unwrap_or_else(|| "n/a".to_string())
                ));
                result.push('\n');
            }
        }

        Ok(result)
    }

    async fn execute_get_context(
        &self,
        ctx: &ToolContext,
        delegation_key: &str,
        project_delegation: &crate::generated_types::Delegation,
    ) -> Result<String, CallToolError> {
        // Extract task_id from parameters
        let task_id = self
            .parameters
            .as_ref()
            .map(|p| &p.0)
            .and_then(|v| v.as_object())
            .and_then(|p| p.get("task_id"))
            .and_then(|t| t.as_i64())
            .map(|t| t as i32)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    "task_id parameter is required for get_context operation".to_string(),
                )
            })?;

        let context_response = ctx
            .api_client
            .get_task_context(delegation_key, self.project_id, task_id)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get task context: {}", e)))?;

        let mut result = format!(
            "🎯 Task Context for '{}' (ID: {})\n\
            Project: {} (ID: {})\n\n",
            context_response.name, task_id, project_delegation.project_name, self.project_id
        );

        result.push_str(&format!("Status: {:?}\n", context_response.status));
        result.push_str(&format!("Column: {}\n", context_response.column.name));
        if let Some(assignee_id) = context_response.assignee_id {
            result.push_str(&format!("Assignee ID: {}\n", assignee_id));
        }

        if let Some(description) = &context_response.description {
            result.push_str(&format!("\nDescription:\n{}\n", description));
        }

        if let Some(linked_documents) = &context_response.linked_documents {
            if !linked_documents.is_empty() {
                result.push_str(&format!(
                    "\n📎 Linked Documents ({}):\n",
                    linked_documents.len()
                ));
                for doc in linked_documents {
                    result.push_str(&format!("• {} ({:?})\n", doc.title, doc.role));
                }
            }
        }

        Ok(result)
    }
}

//*******************//
//  RemoveAgentTool  //
//*******************//
#[mcp_tool(
    name = "remove_agent",
    description = "Remove an agent from configuration and secure storage",
    title = "Remove Agent",
    idempotent_hint = false,
    destructive_hint = true,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RemoveAgentTool {
    /// Name of the agent to remove
    pub agent_name: String,
    /// Confirm removal (must be true)
    pub confirm: bool,
}

impl RemoveAgentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        if !self.confirm {
            return Err(tool_error(
                "validation",
                "Must set 'confirm: true' to remove agent".to_string(),
            ));
        }

        info!("Removing agent: {}", self.agent_name);

        let mut config = AgentConfig::load(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to load config: {}", e)))?;

        if !config.agents.iter().any(|a| a.name == self.agent_name) {
            return Err(tool_error(
                "runtime",
                format!("Agent '{}' not found", self.agent_name),
            ));
        }

        SecureKeyManager::remove_key(&self.agent_name)
            .await
            .map_err(|e| {
                tool_error(
                    "storage",
                    format!("Failed to remove key from storage: {}", e),
                )
            })?;

        config.remove_agent(&self.agent_name).map_err(|e| {
            tool_error(
                "config",
                format!("Failed to remove agent from config: {}", e),
            )
        })?;

        config
            .save_with_backup(&ctx.config_path)
            .await
            .map_err(|e| tool_error("config", format!("Failed to save config: {}", e)))?;

        let response = format!(
            "✅ Agent '{}' removed successfully\n\
            - Removed from configuration\n\
            - Removed from secure storage\n\
            - Config backed up",
            self.agent_name
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}
