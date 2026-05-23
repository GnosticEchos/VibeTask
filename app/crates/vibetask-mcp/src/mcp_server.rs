use crate::agent_detector::{AgentType, AgentTypeDetector};
use crate::tool_registry::ToolRegistry;
use crate::tools::VibeTaskMcpTools;
use crate::tools::{ToolContext, WorkflowContext};
use crate::vibetask_client::VibeTaskClient;
use async_trait::async_trait;
use rust_mcp_sdk::{
    mcp_server::ServerHandler,
    schema::{
        schema_utils::CallToolError, CallToolRequestParams, CallToolResult, ListPromptsResult,
        ListResourcesResult, ListToolsResult, PaginatedRequestParams, Prompt, PromptArgument,
        Resource, RpcError,
    },
    McpServer,
};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use vibetask_app::orchestrator_error::{
    call_tool_result_from_call_tool_error, call_tool_result_message,
    mcp_error_code_from_call_tool_result, OrchestratorError,
};
use vibetask_app::telemetry::{classify_error, TelemetryEvent, TelemetryRecorder};

/// MCP Server Handler with dual-agent architecture support
///
/// This handler implements the CQRS pattern:
/// - Commands: Tool execution, agent registration
/// - Queries: Tool listing, health checks, agent status
pub struct VibeTaskHandler {
    agent_type: AgentType,
    tool_registry: ToolRegistry,
    tool_context: ToolContext,
    telemetry: Arc<TelemetryRecorder>,
}

impl VibeTaskHandler {
    /// Create new handler with agent type detection
    pub async fn new(config_path: String) -> Result<Self, InitError> {
        info!("Initializing VibeTask MCP Handler");

        crate::atomic_writer::SecureKeyManager::register_env_search_roots(
            crate::atomic_writer::SecureKeyManager::env_search_roots_from_config(&config_path),
        );

        // Resolve hub URL from config first, then env, then default.
        let cfg = crate::config::AgentConfig::load(&config_path)
            .await
            .map_err(|e| InitError::Config(e.to_string()))?;
        let hub_url = cfg
            .server
            .hub_url
            .or_else(|| std::env::var("VIBETASK_HUB_URL").ok())
            .unwrap_or_else(|| "https://api.vibetask.com".to_string());
        let api_client =
            Arc::new(VibeTaskClient::new(hub_url).map_err(crate::error::ApiError::from)?);

        // Detect agent type
        let detector = AgentTypeDetector::new(config_path.clone(), api_client.clone());
        let agent_type = detector.detect_active_agent().await?;

        info!("Agent type detected: {:?}", agent_type);

        // Initialize tool registry with agent type
        let tool_registry = ToolRegistry::new(agent_type.clone());

        // Create tool context
        let workflow_context = Arc::new(RwLock::new(WorkflowContext::default()));
        let tool_context = ToolContext {
            config_path,
            api_client,
            bypass_safety: cfg.server.allow_no_fences,
            workflow_context,
        };

        Ok(Self {
            agent_type,
            tool_registry,
            tool_context,
            telemetry: Arc::new(TelemetryRecorder::from_env("mcp")),
        })
    }

    async fn current_agent_type(&self) -> Result<AgentType, InitError> {
        let detector = AgentTypeDetector::new(
            self.tool_context.config_path.clone(),
            self.tool_context.api_client.clone(),
        );
        detector
            .detect_active_agent()
            .await
            .map_err(InitError::from)
    }

    /// Update current column context (for project agents).
    pub fn set_current_column(&mut self, column: Option<String>) {
        if let Ok(mut workflow_context) = self.tool_context.workflow_context.try_write() {
            workflow_context.current_column = column;
            debug!(
                "Current column updated to: {:?}",
                workflow_context.current_column
            );
        }
    }

    /// Get agent type for introspection
    pub fn get_agent_type(&self) -> &AgentType {
        &self.agent_type
    }

    /// Get tool registry for introspection
    pub fn get_tool_registry(&self) -> &ToolRegistry {
        &self.tool_registry
    }

    fn lattice_state_machine_markdown() -> &'static str {
        "```mermaid\n\
stateDiagram-v2\n\
    direction LR\n\
    [*] --> Specify: discovery.query_tasks\n\
    Specify --> Plan: governance.commit_artifact\n\
    Plan --> Execute: governance.spawn_sub_board\n\
    Execute --> Verify: workflow.reflect_on_work\n\
    Verify --> [*]: workflow.approve_completion\n\
    Verify --> Execute: workflow.reject_to_execute\n\
```"
    }

    fn lattice_lock_warning() -> &'static str {
        "**Discovery vs execution**: Project agents receive the full MCP tool list at connect time (CLI parity). The Hub may still reject calls that violate delegation or column rules. Use `set_workflow_context(project_id, column)` when you want explicit lattice context; it is not required to list tools."
    }

    fn search_grammar() -> &'static str {
        "Search grammar for `query_aggregate` and task search (`query_tasks` / Hub search):\n\
• Quotes: `\"exact phrase\"` (High Precision)\n\
• Logic: `term1 | term2` (OR), `term1 term2` (AND)\n\
• Exclusion: `lattice !legacy` (NOT)\n\
• Wildcard: `arch:*` (Partial match)"
    }

    fn static_tool_inventory() -> &'static str {
        "Full Tool Inventory (static map; visibility may vary by agent + context):\n\
• Core: `register_agent`, `query_health`, `list_agents`, `switch_agent`, `agent_status`, `delegate_agent`\n\
• Discovery: `query_projects`, `query_tasks`, `query_aggregate`, `read_documents`, `read_document`, `get_context`, `query_similar_documents`\n\
• Workflow: `set_workflow_context`, `move_task`, `update_task_progress`, `link_document`, `request_help`, `reflect_on_work`, `approve_completion`, `reject_to_execute`\n\
• Governance: `commit_artifact`, `request_architecture_review`, `propose_constitution_amendment`, `confirm_constitution_amendment`, `spawn_sub_board`, `create_task`, `estimate_complexity`, `create_knowledge_document`, `annotate_document`, `pin_document_version`"
    }

    /// Generate agent-specific instructions
    pub fn generate_instructions(&self) -> String {
        let shared_appendix = format!(
            "\n\n## Rules of the Lattice\n{}\n\n{}\n\n## Search Grammar (Postgres FTS)\n{}\n\n## Tool Inventory\n{}",
            Self::lattice_state_machine_markdown(),
            Self::lattice_lock_warning(),
            Self::search_grammar(),
            Self::static_tool_inventory()
        );

        match &self.agent_type {
            AgentType::Platform {
                name,
                allowed_endpoints,
                ..
            } => {
                let base = format!(
                    "🤖 Platform Agent: {}\n\n\
                    You are operating as a Platform Agent with read-only permissions.\n\
                    Available endpoints: {}\n\n\
                    Capabilities:\n\
                    • System health monitoring\n\
                    • Project status queries (if configured)\n\
                    • Document reading (if configured)\n\
                    • Agent management and delegation\n\n\
                    Restrictions:\n\
                    • No write operations (create, update, delete)\n\
                    • No workflow state changes\n\
                    • No governance modifications\n\n\
                    Use agent delegation to perform write operations through project agents.",
                    name,
                    allowed_endpoints.join(", ")
                );
                format!("{base}{shared_appendix}")
            }
            AgentType::ProjectDelegated {
                name,
                projects,
                delegations,
                ..
            } => {
                let project_info = delegations
                    .iter()
                    .map(|d| format!("{} ({:?})", d.project_name, d.permission_level))
                    .collect::<Vec<_>>()
                    .join(", ");

                let base = format!(
                    "🚀 Project Agent: {}\n\n\
                    You are operating as a Project Agent with full workflow capabilities.\n\
                    Projects: {}\n\
                    Delegated Projects: {}\n\n\
                    Capabilities:\n\
                    • Full workflow participation (Specify → Plan → Execute → Verify)\n\
                    • Document creation and modification\n\
                    • Task management and state changes\n\
                    • Governance participation (with proper permissions)\n\n\
                    Tool discovery:\n\
                    • The MCP server advertises the full tool catalog at connect time (same surface as the CLI)\n\
                    • The Hub still enforces delegation and lattice rules on each tool call\n\n\
                    Column reference (workflow phases, not tool hiding):\n\
                    • Specify: Architecture and specification workstreams\n\
                    • Plan: Implementation planning and sub-board creation\n\
                    • Execute: Development and progress tracking\n\
                    • Verify: Quality assurance and completion validation\n\n\
                    Optional: call `set_workflow_context` when you want explicit lattice metadata; it is not required to list tools.",
                    name,
                    projects
                        .iter()
                        .map(|p| p.to_string())
                        .collect::<Vec<_>>()
                        .join(", "),
                    project_info
                );
                format!("{base}{shared_appendix}")
            }
        }
    }
}

#[async_trait]
impl ServerHandler for VibeTaskHandler {
    /// Handle ListToolsRequest - Query operation
    async fn handle_list_tools_request(
        &self,
        _params: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> std::result::Result<ListToolsResult, RpcError> {
        debug!("Handling list tools request");

        let current_agent_type = self
            .current_agent_type()
            .await
            .map_err(|_| RpcError::internal_error())?;
        let current_tool_registry = ToolRegistry::new(current_agent_type.clone());
        let workflow_context = self.tool_context.workflow_context.read().await;

        let available_tool_names =
            current_tool_registry.get_available_tools(workflow_context.current_column.as_deref());

        // Get all available tools from the tool_box
        let all_tools = VibeTaskMcpTools::tools();

        // Filter tools based on agent type and permissions
        let filtered_tools: Vec<_> = all_tools
            .into_iter()
            .filter(|tool| available_tool_names.contains(&tool.name))
            .collect();

        info!(
            "Returning {} tools for agent type: {:?}",
            filtered_tools.len(),
            current_agent_type
        );

        Ok(ListToolsResult {
            meta: None,
            next_cursor: None,
            tools: filtered_tools,
        })
    }

    /// Handle CallToolRequest - Command operation
    async fn handle_call_tool_request(
        &self,
        params: CallToolRequestParams,
        _runtime: Arc<dyn McpServer>,
    ) -> std::result::Result<CallToolResult, CallToolError> {
        let tool_name = params.name.clone();
        let started_at = Instant::now();
        info!("Handling call tool request: {}", tool_name);

        let current_agent_type = match self.current_agent_type().await {
            Ok(agent_type) => agent_type,
            Err(e) => {
                return Ok(OrchestratorError::internal_error(&format!(
                    "Failed to refresh active agent identity: {e}"
                ))
                .to_call_tool_result());
            }
        };
        let current_tool_registry = ToolRegistry::new(current_agent_type.clone());
        let workflow_context = self.tool_context.workflow_context.read().await;

        // Pre-flight permission check
        if let Err(validation_error) = current_tool_registry
            .validate_tool(&tool_name, workflow_context.current_column.as_deref())
        {
            warn!("Tool access denied: {}", validation_error);
            let mut event = TelemetryEvent::new("mcp", "mcp.call_tool");
            event.tool_name = Some(tool_name.clone());
            event.agent_type = Some(match &current_agent_type {
                AgentType::Platform { .. } => "Platform".to_string(),
                AgentType::ProjectDelegated { .. } => "ProjectDelegated".to_string(),
            });
            event.duration_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
            event.success = false;
            event.error_class = Some("permission_denied".to_string());
            if let Err(e) = self.telemetry.record_event(event) {
                warn!("Failed to write telemetry event: {}", e);
            }
            return Ok(
                OrchestratorError::permission_denied(&tool_name, "tool/column access")
                    .to_call_tool_result(),
            );
        }
        drop(workflow_context);

        // Convert params to our tool enum and execute
        let tool_params = match VibeTaskMcpTools::try_from(params) {
            Ok(tool_params) => tool_params,
            Err(e) => {
                return Ok(OrchestratorError::InvalidToolParameters {
                    tool_name: tool_name.clone(),
                    validation_error: e.to_string(),
                }
                .to_call_tool_result());
            }
        };

        // Execute the appropriate tool via auto-dispatch
        let call_result = match tool_params.execute(&self.tool_context).await {
            Ok(result) => result,
            Err(err) => call_tool_result_from_call_tool_error(err),
        };

        let mut event = TelemetryEvent::new("mcp", "mcp.call_tool");
        event.tool_name = Some(tool_name);
        event.agent_type = Some(match &current_agent_type {
            AgentType::Platform { .. } => "Platform".to_string(),
            AgentType::ProjectDelegated { .. } => "ProjectDelegated".to_string(),
        });
        event.duration_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
        let tool_failed = call_result.is_error == Some(true);
        event.success = !tool_failed;
        if tool_failed {
            event.error_class = call_result
                .meta
                .as_ref()
                .and_then(|meta| meta.get("error_class"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| {
                    mcp_error_code_from_call_tool_result(&call_result)
                        .map(|code| format!("mcp_code_{code}"))
                })
                .or_else(|| Some(classify_error(&call_tool_result_message(&call_result))));
        }
        if let Err(e) = self.telemetry.record_event(event) {
            warn!("Failed to write telemetry event: {}", e);
        }

        Ok(call_result)
    }

    /// Handle ListResourcesRequest - Query operation for Project Agents
    async fn handle_list_resources_request(
        &self,
        _params: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> std::result::Result<ListResourcesResult, RpcError> {
        debug!("Handling list resources request");

        // Only Project Agents get resources
        match &self.agent_type {
            AgentType::Platform { .. } => {
                // Platform agents don't get resources
                Ok(ListResourcesResult {
                    meta: None,
                    next_cursor: None,
                    resources: vec![],
                })
            }
            AgentType::ProjectDelegated { delegations, .. } => {
                let mut resources = Vec::new();

                // Create resources for each delegated project
                for delegation in delegations {
                    let resource = Resource {
                        uri: format!("vibetask://project/{}", delegation.project_id),
                        name: format!("Project: {}", delegation.project_name),
                        description: Some(format!(
                            "Access to project '{}' with {:?} permissions",
                            delegation.project_name, delegation.permission_level
                        )),
                        mime_type: Some("application/json".to_string()),
                        annotations: None,
                        icons: vec![],
                        meta: None,
                        size: None,
                        title: Some(format!("Project: {}", delegation.project_name)),
                    };
                    resources.push(resource);
                }

                info!("Returning {} resources for project agent", resources.len());
                Ok(ListResourcesResult {
                    meta: None,
                    next_cursor: None,
                    resources,
                })
            }
        }
    }

    /// Handle ListPromptsRequest - Query operation for Project Agents
    async fn handle_list_prompts_request(
        &self,
        _params: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> std::result::Result<ListPromptsResult, RpcError> {
        debug!("Handling list prompts request");

        // Only Project Agents get prompts
        match &self.agent_type {
            AgentType::Platform { .. } => {
                // Platform agents don't get prompts
                Ok(ListPromptsResult {
                    meta: None,
                    next_cursor: None,
                    prompts: vec![],
                })
            }
            AgentType::ProjectDelegated { .. } => {
                let prompts = vec![
                    Prompt {
                        name: "specify_phase".to_string(),
                        description: Some("Architect persona for Specify column".to_string()),
                        arguments: vec![PromptArgument {
                            name: "task_context".to_string(),
                            description: Some("Current task context".to_string()),
                            required: Some(true),
                            title: Some("Task Context".to_string()),
                        }],
                        icons: vec![],
                        meta: None,
                        title: Some("Specify Phase Prompt".to_string()),
                    },
                    Prompt {
                        name: "plan_phase".to_string(),
                        description: Some("Planner persona for Plan column".to_string()),
                        arguments: vec![PromptArgument {
                            name: "specification".to_string(),
                            description: Some("Ratified specification".to_string()),
                            required: Some(true),
                            title: Some("Specification".to_string()),
                        }],
                        icons: vec![],
                        meta: None,
                        title: Some("Plan Phase Prompt".to_string()),
                    },
                    Prompt {
                        name: "execute_phase".to_string(),
                        description: Some("Coder persona for Execute column".to_string()),
                        arguments: vec![PromptArgument {
                            name: "implementation_plan".to_string(),
                            description: Some("Implementation plan".to_string()),
                            required: Some(true),
                            title: Some("Implementation Plan".to_string()),
                        }],
                        icons: vec![],
                        meta: None,
                        title: Some("Execute Phase Prompt".to_string()),
                    },
                    Prompt {
                        name: "verify_phase".to_string(),
                        description: Some("Critic persona for Verify column".to_string()),
                        arguments: vec![PromptArgument {
                            name: "work_summary".to_string(),
                            description: Some("Work summary for verification".to_string()),
                            required: Some(true),
                            title: Some("Work Summary".to_string()),
                        }],
                        icons: vec![],
                        meta: None,
                        title: Some("Verify Phase Prompt".to_string()),
                    },
                ];

                info!("Returning {} prompts for project agent", prompts.len());
                Ok(ListPromptsResult {
                    meta: None,
                    next_cursor: None,
                    prompts,
                })
            }
        }
    }
}

/// Initialization errors
#[derive(Debug, thiserror::Error)]
pub enum InitError {
    #[error("Agent detection failed: {0}")]
    AgentDetection(#[from] crate::agent_detector::DetectionError),

    #[error("API error: {0}")]
    ApiError(#[from] crate::error::ApiError),

    #[error("Configuration error: {0}")]
    Config(String),
}

/// Create and run MCP server with stdio transport
pub async fn create_and_run_server(
    config_path: String,
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    use rust_mcp_sdk::{
        mcp_server::{server_runtime, McpServerOptions},
        schema::{
            Implementation, InitializeResult, ProtocolVersion, ServerCapabilities,
            ServerCapabilitiesTools,
        },
        StdioTransport, ToMcpServerHandler, TransportOptions,
    };

    info!("Creating MCP server with config: {}", config_path);

    vibetask_app::atomic_writer::SecureKeyManager::register_env_search_roots(
        vibetask_app::atomic_writer::SecureKeyManager::env_search_roots_from_config(&config_path),
    );

    // STEP 1: Create handler with agent type detection and comprehensive error handling
    let handler = match VibeTaskHandler::new(config_path.clone()).await {
        Ok(handler) => {
            info!(
                "Handler created successfully with agent type: {:?}",
                handler.agent_type
            );
            handler
        }
        Err(e) => {
            error!("Failed to create handler: {}", e);

            // Provide helpful error messages based on error type
            match &e {
                InitError::AgentDetection(detection_error) => {
                    eprintln!("❌ Agent Detection Failed: {}", detection_error);
                    eprintln!("💡 Troubleshooting steps:");
                    eprintln!("   1. Check if config file exists: {}", config_path);
                    eprintln!("   2. Verify agent keys are properly stored");
                    eprintln!("   3. Ensure Hub API is accessible");
                    eprintln!("   4. Run 'register_agent' tool to add a valid agent");
                }
                InitError::ApiError(api_error) => {
                    eprintln!("❌ API Error: {}", api_error);
                    eprintln!("💡 Check Hub connectivity and API configuration");
                }
                InitError::Config(config_error) => {
                    eprintln!("❌ Configuration Error: {}", config_error);
                    eprintln!("💡 Check your configuration file format and content");
                }
            }

            return Err(Box::new(e));
        }
    };

    let instructions = handler.generate_instructions();

    info!("Handler created successfully, starting MCP server");

    // STEP 2: Define server details and capabilities with agent-specific configuration
    let server_details = InitializeResult {
        server_info: Implementation {
            name: "VibeTask MCP Orchestrator".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            title: Some("VibeTask Agent Orchestrator".into()),
            description: Some("Stateless Rust MCP sidecar for intelligent Kanban workflows with dual-agent architecture".into()),
            icons: vec![],
            website_url: Some("https://github.com/vibetask/vibetask-mcp".into()),
        },
        capabilities: ServerCapabilities {
            tools: Some(ServerCapabilitiesTools { list_changed: Some(true) }),
            resources: match &handler.agent_type {
                AgentType::Platform { .. } => {
                    info!("Platform Agent: Resources disabled");
                    None
                }
                AgentType::ProjectDelegated { .. } => {
                    info!("Project Agent: Resources enabled");
                    Some(rust_mcp_sdk::schema::ServerCapabilitiesResources {
                        list_changed: Some(true),
                        subscribe: Some(false),
                    })
                }
            },
            prompts: match &handler.agent_type {
                AgentType::Platform { .. } => {
                    info!("Platform Agent: Prompts disabled");
                    None
                }
                AgentType::ProjectDelegated { .. } => {
                    info!("Project Agent: Prompts enabled");
                    Some(rust_mcp_sdk::schema::ServerCapabilitiesPrompts {
                        list_changed: Some(true),
                    })
                }
            },
            completions: Some(serde_json::Map::new()),
            tasks: None,
            ..Default::default()
        },
        meta: None,
        instructions: Some(instructions),
        protocol_version: ProtocolVersion::V2025_11_25.into(),
    };

    // STEP 3: Create transport with error handling
    let transport = match StdioTransport::new(TransportOptions::default()) {
        Ok(transport) => {
            info!("STDIO transport created successfully");
            transport
        }
        Err(e) => {
            error!("Failed to create STDIO transport: {}", e);
            eprintln!("❌ Transport Creation Failed: {}", e);
            eprintln!("💡 This usually indicates a problem with stdin/stdout setup");
            return Err(Box::new(e));
        }
    };

    // STEP 4: Create server with comprehensive error handling
    let server = server_runtime::create_server(McpServerOptions {
        server_details,
        transport,
        handler: handler.to_mcp_server_handler(),
        task_store: None,
        client_task_store: None,
        message_observer: None,
    });

    info!("MCP server created successfully, starting...");

    // STEP 5: Start the server with graceful error handling
    match server.start().await {
        Ok(()) => {
            info!("MCP server completed successfully");
            Ok(())
        }
        Err(start_error) => {
            error!("MCP server failed to start: {}", start_error);

            // Extract meaningful error message
            let error_string = start_error.to_string();
            let error_message = start_error.rpc_error_message().unwrap_or(&error_string);

            eprintln!("❌ MCP Server Start Failed: {}", error_message);
            eprintln!("💡 Common causes:");
            eprintln!("   - Client disconnected unexpectedly");
            eprintln!("   - Protocol version mismatch");
            eprintln!("   - Transport layer issues");
            eprintln!("   - Agent authentication problems");

            // Don't panic - return error for graceful handling
            Err(Box::new(start_error))
        }
    }
}

/// Health check function for container orchestration and monitoring
pub async fn health_check(
    config_path: String,
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    info!("Performing health check");

    // STEP 1: Try to create a handler to validate configuration and agent setup
    let handler = match VibeTaskHandler::new(config_path).await {
        Ok(handler) => {
            info!(
                "✅ Agent detection passed - Agent type: {:?}",
                handler.agent_type
            );
            handler
        }
        Err(e) => {
            error!("❌ Agent detection failed: {}", e);
            println!("❌ VibeTask MCP Orchestrator - Unhealthy: Agent Detection Failed");
            println!("Error: {}", e);
            return Err(Box::new(e));
        }
    };

    // STEP 2: Test actual Hub health endpoint (this is what was missing!)
    match &handler.agent_type {
        AgentType::Platform {
            name,
            effective_endpoints,
            ..
        } => {
            // Platform agents should test Hub health if they have access
            if effective_endpoints
                .iter()
                .any(|ep| ep.contains("/api/agent/health"))
            {
                info!("Testing Hub health endpoint for Platform Agent: {}", name);

                // Get the agent key
                let key = match crate::atomic_writer::SecureKeyManager::retrieve_key(name).await {
                    Ok(key) => key,
                    Err(e) => {
                        error!("❌ Failed to retrieve agent key: {}", e);
                        println!("❌ VibeTask MCP Orchestrator - Unhealthy: Key Retrieval Failed");
                        return Err(Box::new(e));
                    }
                };

                // Test Hub health endpoint
                match handler.tool_context.api_client.get_health(&key).await {
                    Ok(health_response) => {
                        info!("✅ Hub health check passed: {}", health_response.status);
                        println!("✅ VibeTask MCP Orchestrator - Healthy");
                        println!("Agent Type: {:?}", handler.agent_type);
                        println!("Hub Status: {}", health_response.status);
                        if let Some(scope) = &health_response.scope {
                            println!("Health Scope: {}", scope);
                        }
                        if let Some(timestamp) = &health_response.timestamp {
                            println!(
                                "Hub Timestamp: {}",
                                timestamp.format("%Y-%m-%d %H:%M:%S UTC")
                            );
                        }
                    }
                    Err(e) => {
                        error!("❌ Hub health check failed: {}", e);
                        println!(
                            "❌ VibeTask MCP Orchestrator - Unhealthy: Hub Health Check Failed"
                        );
                        println!("Agent Type: {:?}", handler.agent_type);
                        println!("Hub Error: {}", e);
                        return Err(Box::new(e));
                    }
                }
            } else {
                // Platform agent without health endpoint access
                info!("✅ Platform Agent validated (no health endpoint access)");
                println!("✅ VibeTask MCP Orchestrator - Healthy");
                println!("Agent Type: {:?}", handler.agent_type);
                println!("Note: Platform Agent lacks /api/agent/health endpoint access");
            }
        }
        AgentType::ProjectDelegated { name, .. } => {
            // Project agents don't typically have direct health endpoint access
            // but we can still validate their Hub connectivity via /api/agent/me (already done)
            info!("✅ Project Agent validated: {}", name);
            println!("✅ VibeTask MCP Orchestrator - Healthy");
            println!("Agent Type: {:?}", handler.agent_type);
            println!("Note: Project Agent - Hub connectivity validated via agent identity");
        }
    }

    Ok(())
}

/// Validate configuration without starting the server
pub async fn validate_config(
    config_path: String,
) -> std::result::Result<(), Box<dyn std::error::Error>> {
    info!("Validating configuration: {}", config_path);

    // Load and validate configuration
    let config = crate::config::AgentConfig::load(&config_path).await?;

    // Validate active agent exists
    if config.agents.is_empty() {
        return Err("No agents configured. Use 'register_agent' to add an agent.".into());
    }

    let active_agent = config
        .agents
        .iter()
        .find(|a| a.name == config.server.active_agent)
        .ok_or_else(|| {
            format!(
                "Active agent '{}' not found in agents list",
                config.server.active_agent
            )
        })?;

    // Try to detect agent type (this validates keys and Hub connectivity)
    let hub_url = config
        .server
        .hub_url
        .clone()
        .or_else(|| std::env::var("VIBETASK_HUB_URL").ok())
        .unwrap_or_else(|| "https://api.vibetask.com".to_string());
    let api_client = Arc::new(VibeTaskClient::new(hub_url)?);
    let detector = AgentTypeDetector::new(config_path, api_client);
    let _agent_type = detector.detect_active_agent().await?;

    println!("✅ Configuration valid");
    println!("Active Agent: {}", active_agent.name);
    println!("Agent Type: {}", active_agent.agent_type);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AgentConfig;
    use crate::{Delegation, DelegationMode, PermissionLevel};
    use std::collections::HashMap;
    use tempfile::TempDir;

    async fn create_test_handler() -> (VibeTaskHandler, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir
            .path()
            .join("test-config.toml")
            .to_string_lossy()
            .to_string();

        // Create a test config
        let mut config = AgentConfig::create_default("Test Server");
        let agent = crate::config::AgentEntry {
            name: "TestAgent".to_string(),
            agent_type: "Platform".to_string(),
            key_hash: "sha256:test".to_string(),
            api_key: None,
            allowed_endpoints: Some(vec![
                "/api/agent/health".to_string(),
                "/api/agent/projects".to_string(),
            ]),
            effective_endpoints: Some(vec![
                "/api/agent/health".to_string(),
                "/api/agent/projects".to_string(),
            ]),
            projects: None,
            permissions: None,
            delegated_at: None,
        };
        config.agents.push(agent);
        config.server.active_agent = "TestAgent".to_string();
        config.save(&config_path).await.unwrap();

        // Store test key
        crate::atomic_writer::SecureKeyManager::store_key("TestAgent", "test-key")
            .await
            .unwrap();

        // Create handler with mock agent type
        let agent_type = AgentType::Platform {
            name: "TestAgent".to_string(),
            allowed_endpoints: vec![
                "/api/agent/health".to_string(),
                "/api/agent/projects".to_string(),
            ],
            effective_endpoints: vec![
                "/api/agent/health".to_string(),
                "/api/agent/projects".to_string(),
            ],
        };

        let tool_registry = ToolRegistry::new(agent_type.clone());
        let tool_context = ToolContext {
            config_path,
            api_client: Arc::new(VibeTaskClient::new("https://test.example.com").unwrap()),
            bypass_safety: false,
            workflow_context: Arc::new(RwLock::new(WorkflowContext::default())),
        };

        let handler = VibeTaskHandler {
            agent_type,
            tool_registry,
            tool_context,
            telemetry: Arc::new(TelemetryRecorder::from_env("mcp-test")),
        };

        (handler, temp_dir)
    }

    #[tokio::test]
    async fn test_handler_creation() {
        let (handler, _temp_dir) = create_test_handler().await;

        match handler.get_agent_type() {
            AgentType::Platform { name, .. } => {
                assert_eq!(name, "TestAgent");
            }
            _ => panic!("Expected Platform agent type"),
        }
    }

    #[tokio::test]
    async fn test_instructions_generation() {
        let (handler, _temp_dir) = create_test_handler().await;

        let instructions = handler.generate_instructions();
        assert!(instructions.contains("Platform Agent"));
        assert!(instructions.contains("read-only permissions"));
        assert!(instructions.contains("No write operations"));
    }

    #[test]
    fn test_project_agent_instructions() {
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

        let project_agent = AgentType::ProjectDelegated {
            name: "TestProject".to_string(),
            projects: vec![10],
            permissions,
            delegations,
        };

        let tool_registry = ToolRegistry::new(project_agent.clone());
        let tool_context = ToolContext {
            config_path: "test.toml".to_string(),
            api_client: Arc::new(VibeTaskClient::new("https://test.example.com").unwrap()),
            bypass_safety: false,
            workflow_context: Arc::new(RwLock::new(WorkflowContext::default())),
        };

        let handler = VibeTaskHandler {
            agent_type: project_agent,
            tool_registry,
            tool_context,
            telemetry: Arc::new(TelemetryRecorder::from_env("mcp-test")),
        };

        let instructions = handler.generate_instructions();
        assert!(instructions.contains("Project Agent"));
        assert!(instructions.contains("full workflow capabilities"));
        assert!(instructions.contains("Tool discovery"));
    }
}
