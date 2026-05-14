use super::*;

//*********************//
//  QueryProjectsTool  //
//*********************//
#[mcp_tool(
    name = "query_projects",
    description = "Query available projects (Platform Agent with endpoint access)",
    title = "Query Projects",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub struct QueryProjectsTool {}

impl QueryProjectsTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Executing project query");

        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";

        if is_platform_agent {
            // Platform Agent: Check endpoint permissions
            let empty_endpoints = vec![];
            let allowed_endpoints = active.entry
                .effective_endpoints
                .as_ref()
                .unwrap_or(&empty_endpoints);
            let has_projects_access = allowed_endpoints
                .iter()
                .any(|endpoint| endpoint.contains("/api/agent/projects"));

            if !has_projects_access {
                let response = format!(
                    "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
                    Required Endpoint: /api/agent/projects\n\
                    Allowed Endpoints: {}\n\n\
                    💡 To enable project access:\n\
                    1. Contact your administrator to configure project access\n\
                    2. Re-register the agent to update permissions\n\
                    3. Use agent delegation to access projects through project agents",
                    active.entry.name,
                    allowed_endpoints.join(", ")
                );

                return Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]));
            }
        }
        // Project Agents have full API access, so no permission check needed

        let api_key = &active.api_key;

        // Make API call to get projects
        let empty_endpoints = vec![];
        let allowed_endpoints = if is_platform_agent {
            active.entry
                .effective_endpoints
                .as_ref()
                .unwrap_or(&empty_endpoints)
        } else {
            &empty_endpoints // Project Agents have full access
        };

        match ctx
            .api_client
            .get_projects(api_key, allowed_endpoints)
            .await
        {
            Ok(projects_response) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let mut response = format!(
                    "📋 {} '{}' - Projects Query\n\n",
                    agent_type_label, active.entry.name
                );

                if projects_response.data.is_empty() {
                    response
                        .push_str("No projects found or accessible with current permissions.\n");
                } else {
                    response.push_str(&format!(
                        "Found {} projects:\n\n",
                        projects_response.data.len()
                    ));

                    for (i, project) in projects_response.data.iter().enumerate() {
                        response.push_str(&format!(
                            "{}. {} (ID: {})\n",
                            i + 1,
                            project.name,
                            project.id
                        ));
                        response.push_str(&format!("   Prefix: {}\n", project.prefix));
                        response.push_str(&format!("   Status: {:?}\n", project.status));
                        if let Some(description) = &project.description {
                            response.push_str(&format!("   Description: {}\n", description));
                        }
                        response.push_str(&format!(
                            "   Created: {}\n",
                            project.created_at.format("%Y-%m-%d %H:%M:%S UTC")
                        ));
                        response.push('\n');
                    }

                    // Add pagination info if available
                    response.push_str(&format!(
                        "📄 Pagination: Page {} of {} (Total: {} projects)\n\n",
                        projects_response.pagination.page,
                        projects_response.pagination.total_pages,
                        projects_response.pagination.total
                    ));
                }

                response.push_str("💡 Available actions:\n");
                response.push_str(
                    "• Use 'query_tasks <project_id>' to view project tasks (if configured)\n",
                );
                response.push_str("• Use 'read_documents <project_id>' to view project documents (if configured)\n");
                response.push_str("• Use agent delegation for write operations\n");

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]))
            }
            Err(e) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let error_response = format!(
                    "❌ {} '{}' - Project Query Failed\n\n\
                    Error: {}\n\n\
                    💡 Troubleshooting:\n\
                    • Check Hub connectivity with 'query_health'\n\
                    • Verify agent permissions are up to date\n\
                    • Ensure the /api/agent/projects endpoint is accessible",
                    agent_type_label, active.entry.name, e
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    error_response,
                )]))
            }
        }
    }
}

//*******************//
//  QueryTasksTool   //
//*******************//
#[mcp_tool(
    name = "query_tasks",
    description = "Query tasks for a specific project (Platform Agent with endpoint access)",
    title = "Query Tasks",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct QueryTasksTool {
    /// Project ID to query tasks for (required unless global=true)
    #[serde(default)]
    pub project_id: Option<i32>,
    /// Optional: Limit number of tasks returned
    #[serde(default)]
    pub limit: Option<i32>,
    /// Optional: Aggregate tasks across all delegated projects
    #[serde(default)]
    pub global: Option<bool>,
}

impl QueryTasksTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let global = self.global.unwrap_or(false);
        info!(
            "Executing tasks query (project={:?}, global={})",
            self.project_id, global
        );

        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";
        let api_key = &active.api_key;

        // Check if platform agent has access to task/project endpoints.
        let empty_endpoints = vec![];
        let allowed_endpoints = active.entry
            .effective_endpoints
            .as_ref()
            .unwrap_or(&empty_endpoints);
        if is_platform_agent {
            let tasks_endpoint_pattern = "/api/agent/projects/:projectId/tasks";
            let has_tasks_access = allowed_endpoints
                .iter()
                .any(|endpoint| endpoint.contains(tasks_endpoint_pattern));
            let has_projects_access = allowed_endpoints
                .iter()
                .any(|endpoint| endpoint.contains("/api/agent/projects"));

            if !has_tasks_access {
                let response = format!(
                    "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
                    Required Endpoint: {}\n\
                    Allowed Endpoints: {}\n\n\
                    💡 To enable task access:\n\
                    1. Contact your administrator to configure task access\n\
                    2. Add '/api/agent/projects/:projectId/tasks' to allowed endpoints\n\
                    3. Use a delegated Project Agent for project workflow operations",
                    active.entry.name,
                    tasks_endpoint_pattern,
                    allowed_endpoints.join(", ")
                );

                return Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]));
            }
            if global && !has_projects_access {
                return Ok(CallToolResult::text_content(vec![TextContent::from(format!(
                    "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
                     Global task listing requires endpoint '/api/agent/projects' in addition to task access.",
                    active.entry.name
                ))]));
            }
        }

        if !global && self.project_id.is_none() {
            return Err(tool_error(
                "runtime",
                "project_id is required unless global=true".to_string(),
            ));
        }

        // Make API calls to get tasks (Project Agents pass empty endpoint filters).
        let unrestricted_endpoints = vec![];
        let api_allowed_endpoints = if is_platform_agent {
            allowed_endpoints
        } else {
            &unrestricted_endpoints
        };

        if global {
            let projects_response = ctx
                .api_client
                .get_projects(api_key, api_allowed_endpoints)
                .await
                .map_err(|e| {
                    tool_error(
                        "runtime",
                        format!("Failed to list projects for global task query: {}", e),
                    )
                })?;
            let mut merged = Vec::new();
            for project in &projects_response.data {
                if let Ok(tasks) = ctx
                    .api_client
                    .get_project_tasks(api_key, project.id, api_allowed_endpoints)
                    .await
                {
                    for task in tasks.data {
                        merged.push((project.id, project.name.clone(), task));
                    }
                }
            }
            let limit = self.limit.unwrap_or(50).max(1) as usize;
            let total = merged.len();
            let shown = std::cmp::min(limit, total);
            let mut response = format!(
                "📋 {} '{}' - Global Task Query\n\nShowing {} of {} tasks across {} projects\n\n",
                if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                },
                active.entry.name,
                shown,
                total,
                projects_response.data.len()
            );

            for (idx, (project_id, project_name, task)) in merged.iter().take(shown).enumerate() {
                response.push_str(&format!(
                    "{}. {} ({})\n   Project: {} ({})\n   Status: {:?}\n   Column: {}\n\n",
                    idx + 1,
                    task.name,
                    task.identifier,
                    project_name,
                    project_id,
                    task.status,
                    task.column.name
                ));
            }

            response.push_str("💡 Tip: set global=false to scope to one project.\n");
            return Ok(CallToolResult::text_content(vec![TextContent::from(
                response,
            )]));
        }

        let project_id = self.project_id.expect("validated above");
        match ctx
            .api_client
            .get_project_tasks(api_key, project_id, api_allowed_endpoints)
            .await
        {
            Ok(tasks_response) => Self::format_project_task_result(
                &active.entry.name, is_platform_agent, project_id, &tasks_response, self.limit,
            ),
            Err(e) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let error_response = format!(
                    "❌ {} '{}' - Task Query Failed\n\n\
                    Project ID: {}\n\
                    Error: {}\n\n\
                    💡 Troubleshooting:\n\
                    • Verify the project ID exists and is accessible\n\
                    • Check Hub connectivity with 'query_health' (platform agent)\n\
                    • Ensure the /api/agent/projects/:projectId/tasks endpoint is accessible",
                    agent_type_label, active.entry.name, project_id, e
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    error_response,
                )]))
            }
        }
    }

    fn format_project_task_result(
        agent_name: &str,
        is_platform_agent: bool,
        project_id: i32,
        tasks_response: &crate::generated_types::TaskListResponse,
        limit: Option<i32>,
    ) -> Result<CallToolResult, CallToolError> {
        let agent_type_label = if is_platform_agent {
            "Platform Agent"
        } else {
            "Project Agent"
        };
        let mut response = format!(
            "📋 {} '{}' - Tasks for Project {}\n\n",
            agent_type_label, agent_name, project_id
        );

        if tasks_response.data.is_empty() {
            response.push_str("No tasks found in this project.\n");
        } else {
            let tasks_to_show = if let Some(limit) = limit {
                std::cmp::min(limit as usize, tasks_response.data.len())
            } else {
                tasks_response.data.len()
            };

            response.push_str(&format!(
                "Showing {} of {} tasks:\n\n",
                tasks_to_show,
                tasks_response.data.len()
            ));

            for (i, task) in tasks_response.data.iter().take(tasks_to_show).enumerate() {
                response.push_str(&format!(
                    "{}. {} ({})\n",
                    i + 1,
                    task.name,
                    task.identifier
                ));
                response.push_str(&format!("   Status: {:?}\n", task.status));
                response.push_str(&format!("   Column: {}\n", task.column.name));
                if let Some(description) = &task.description {
                    let truncated_desc = truncate_preview(description, 100);
                    response.push_str(&format!("   Description: {}\n", truncated_desc));
                }
                response.push_str(&format!(
                    "   Created: {}\n",
                    task.created_at.format("%Y-%m-%d %H:%M:%S UTC")
                ));
                if let Some(assignee_id) = task.assignee_id {
                    response.push_str(&format!("   Assignee ID: {}\n", assignee_id));
                }
                response.push('\n');
            }

            if let Some(pagination) = &tasks_response.pagination {
                response.push_str(&format!(
                    "📄 Pagination: Page {} of {} (Total: {} tasks)\n\n",
                    pagination.page, pagination.total_pages, pagination.total
                ));
            }
        }

        response.push_str("💡 Available actions:\n");
        response.push_str(
            "• Use 'get_context <project_id> <task_id>' to get detailed task context\n",
        );
        if is_platform_agent {
            response.push_str("• Use a delegated Project Agent for task modifications\n");
        } else {
            response.push_str("• Use task commands to update project workflow state\n");
        }

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//*********************//
//  QueryAggregateTool  //
//*********************//
#[mcp_tool(
    name = "query_aggregate",
    description = "Aggregate query across projects, tasks, and documents for delegated project agents",
    title = "Query Aggregate",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct QueryAggregateTool {
    /// Search query string.
    pub query: String,
    /// Optional project scope; defaults to workflow context if present.
    #[serde(default)]
    pub project_id: Option<i32>,
    /// Optional maximum number of items per section.
    #[serde(default)]
    pub limit: Option<i32>,
}

impl QueryAggregateTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let query = self.query.trim();
        if query.is_empty() {
            return Err(tool_error("runtime", "query cannot be empty".to_string()));
        }

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "query_aggregate")?;
        let api_key = &active.api_key;

        let context_project = ctx.workflow_context.read().await.current_project_id;
        let scoped_project = self.project_id.or(context_project);
        let limit = self.limit.unwrap_or(10).clamp(1, 50);

        let no_endpoint_filters: Vec<String> = vec![];
        let projects = ctx
            .api_client
            .get_projects(api_key, &no_endpoint_filters)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to list projects: {}", e)))?;
        let filtered_projects: Vec<_> = projects
            .data
            .iter()
            .filter(|p| {
                let q = query.to_ascii_lowercase();
                p.name.to_ascii_lowercase().contains(&q)
                    || p.prefix.to_ascii_lowercase().contains(&q)
                    || p.description
                        .as_deref()
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .contains(&q)
            })
            .take(limit as usize)
            .collect();

        let task_search = ctx
            .api_client
            .search_tasks(
                api_key,
                query,
                scoped_project,
                Some(1),
                Some(limit),
                &no_endpoint_filters,
            )
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to query tasks: {}", e)))?;

        let mut matching_docs = Vec::new();
        let projects_to_scan: Vec<_> = if let Some(pid) = scoped_project {
            projects
                .data
                .iter()
                .filter(|p| p.id == pid)
                .cloned()
                .collect()
        } else {
            projects.data.clone()
        };
        for project in projects_to_scan {
            if matching_docs.len() >= limit as usize {
                break;
            }
            if let Ok(docs) = ctx
                .api_client
                .get_project_documents(
                    api_key,
                    project.id,
                    &no_endpoint_filters,
                    Some(1),
                    Some(limit),
                    None,
                )
                .await
            {
                for doc in docs.data {
                    if matching_docs.len() >= limit as usize {
                        break;
                    }
                    let q = query.to_ascii_lowercase();
                    if doc.title.to_ascii_lowercase().contains(&q)
                        || doc.content.to_ascii_lowercase().contains(&q)
                    {
                        matching_docs.push((project.id, project.name.clone(), doc));
                    }
                }
            }
        }

        let mut response = format!("🔎 Aggregate Query Results for '{}'\n\n", query);
        if let Some(pid) = scoped_project {
            response.push_str(&format!("Scope: Project {}\n\n", pid));
        } else {
            response.push_str("Scope: All delegated projects\n\n");
        }

        response.push_str(&format!(
            "Projects matched: {}\nTasks matched: {}\nDocuments matched: {}\n\n",
            filtered_projects.len(),
            task_search.tasks.len(),
            matching_docs.len()
        ));

        if !filtered_projects.is_empty() {
            response.push_str("📁 Projects\n");
            for (i, p) in filtered_projects.iter().enumerate() {
                response.push_str(&format!("{}. {} ({})\n", i + 1, p.name, p.id));
            }
            response.push('\n');
        }

        if !task_search.tasks.is_empty() {
            response.push_str("📋 Tasks\n");
            for (i, t) in task_search.tasks.iter().enumerate() {
                response.push_str(&format!(
                    "{}. {} ({}) - Project {}\n",
                    i + 1,
                    t.name,
                    t.identifier,
                    t.project_id
                ));
            }
            response.push('\n');
        }

        if !matching_docs.is_empty() {
            response.push_str("📚 Documents\n");
            for (i, (project_id, project_name, doc)) in matching_docs.iter().enumerate() {
                response.push_str(&format!(
                    "{}. {} (Doc ID: {}, Project: {} / {})\n",
                    i + 1,
                    doc.title,
                    doc.id,
                    project_name,
                    project_id
                ));
            }
        }

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//*********************//
//  ReadDocumentsTool  //
//*********************//
#[mcp_tool(
    name = "read_documents",
    description = "Read documents from a project's Knowledge Hub (Platform Agent with endpoint access)",
    title = "Read Documents",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadDocumentsTool {
    /// Project ID to read documents from
    pub project_id: i32,
    /// Optional: Filter by document type (CONSTITUTION, SPECIFICATION, etc.)
    #[serde(default)]
    pub doc_type: Option<String>,
    /// Optional: Limit number of documents returned
    #[serde(default)]
    pub limit: Option<i32>,
}

fn canonical_document_type(input: &str) -> Option<&'static str> {
    let normalized = input.trim().to_ascii_uppercase().replace(['-', ' '], "_");
    match normalized.as_str() {
        "CONSTITUTION" => Some("CONSTITUTION"),
        "SPECIFICATION" | "SPEC" => Some("SPECIFICATION"),
        "BRAINSTORM" => Some("BRAINSTORM"),
        "POST_MORTEM" | "POSTMORTEM" => Some("POST_MORTEM"),
        "IMPLEMENTATION_PLAN" | "IMPLEMENTATIONPLAN" | "PLAN" => Some("IMPLEMENTATION_PLAN"),
        "OTHER" => Some("OTHER"),
        _ => None,
    }
}

fn available_document_types_help() -> &'static str {
    "💡 Available document types:\n\
• CONSTITUTION - Project governance and rules\n\
• SPECIFICATION - Feature specifications\n\
• BRAINSTORM - Ideation and exploration documents\n\
• POST_MORTEM - Incident and retrospective notes\n\
• IMPLEMENTATION_PLAN - Development plans\n\
• OTHER - Miscellaneous documentation\n\n\
Use 'read_documents <project_id> --doc_type <type>' to filter by type\n"
}

impl ReadDocumentsTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Executing documents query for project {}", self.project_id);

        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";
        let api_key = &active.api_key;

        // Check if agent has access to project documents endpoint
        let empty_endpoints = vec![];
        let allowed_endpoints = active.entry
            .effective_endpoints
            .as_ref()
            .unwrap_or(&empty_endpoints);

        if is_platform_agent {
            // Platform Agent: Check endpoint permissions
            let docs_endpoint_pattern = "/api/agent/projects/:projectId/docs";
            let has_docs_access = allowed_endpoints.iter().any(|endpoint| {
                ctx.api_client.endpoint_matches_pattern(
                    &format!("/api/agent/projects/{}/docs", self.project_id),
                    endpoint,
                )
            });

            if !has_docs_access {
                let response = format!(
                    "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
                    Required Endpoint: {}\n\
                    Allowed Endpoints: {}\n\n\
                    💡 To enable document access:\n\
                    1. Contact your administrator to configure document access\n\
                    2. Add '/api/agent/projects/:projectId/docs' to allowed endpoints\n\
                    3. Use agent delegation to access documents through project agents",
                    active.entry.name,
                    docs_endpoint_pattern,
                    allowed_endpoints.join(", ")
                );

                return Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]));
            }
        }
        // Project Agents have full API access

        // Make API call to get project documents
        let empty_endpoints_for_api = vec![];
        let api_call_allowed_endpoints = if is_platform_agent {
            allowed_endpoints
        } else {
            &empty_endpoints_for_api // Project Agents have full access
        };

        let normalized_doc_type = match self.doc_type.as_deref() {
            Some(raw) => {
                let Some(normalized) = canonical_document_type(raw) else {
                    let mut response = format!("❌ Invalid document type '{}'.\n\n", raw.trim());
                    response.push_str(available_document_types_help());
                    return Ok(CallToolResult::text_content(vec![TextContent::from(
                        response,
                    )]));
                };
                Some(normalized.to_string())
            }
            None => None,
        };

        match ctx
            .api_client
            .get_project_documents(
                api_key,
                self.project_id,
                api_call_allowed_endpoints,
                None, // page
                self.limit,
                normalized_doc_type.as_deref(),
            )
            .await
        {
            Ok(docs_response) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let mut response = format!(
                    "📚 {} '{}' - Documents for Project {}\n\n",
                    agent_type_label, active.entry.name, self.project_id
                );

                if let Some(doc_type) = &normalized_doc_type {
                    response.push_str(&format!("Filter: {} documents only\n\n", doc_type));
                }

                if docs_response.data.is_empty() {
                    response.push_str("No documents found in this project");
                    if let Some(doc_type) = &normalized_doc_type {
                        response.push_str(&format!(" with type '{}'", doc_type));
                    }
                    response.push_str(".\n");
                } else {
                    response.push_str(&format!(
                        "Found {} documents:\n\n",
                        docs_response.data.len()
                    ));

                    for (i, doc) in docs_response.data.iter().enumerate() {
                        response.push_str(&format!("{}. {} (ID: {})\n", i + 1, doc.title, doc.id));
                        response.push_str(&format!("   Role: {:?}\n", doc.role));
                        response.push_str(&format!(
                            "   Created: {}\n",
                            doc.created_at
                                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                                .unwrap_or_else(|| "n/a".to_string())
                        ));
                        response.push_str(&format!(
                            "   Updated: {}\n",
                            doc.updated_at
                                .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                                .unwrap_or_else(|| "n/a".to_string())
                        ));

                        // Show content preview (first 200 characters)
                        let content_preview = truncate_preview(&doc.content, 200);
                        response.push_str(&format!("   Content Preview: {}\n", content_preview));
                        response.push('\n');
                    }

                    response.push_str(&format!(
                        "📄 Pagination: Page {} of {} (Total: {} documents)\n\n",
                        docs_response.pagination.page,
                        docs_response.pagination.total_pages,
                        docs_response.pagination.total
                    ));
                }

                response.push_str(available_document_types_help());

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]))
            }
            Err(e) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let error_response = format!(
                    "❌ {} '{}' - Document Query Failed\n\n\
                    Project ID: {}\n\
                    Error: {}\n\n\
                    💡 Troubleshooting:\n\
                    • Verify the project ID exists and is accessible\n\
                    • Check Hub connectivity with 'query_health'\n\
                    • Ensure the /api/agent/projects/:projectId/docs endpoint is configured",
                    agent_type_label, active.entry.name, self.project_id, e
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    error_response,
                )]))
            }
        }
    }
}

//*********************//
//  ReadDocumentTool   //
//*********************//
#[mcp_tool(
    name = "read_document",
    description = "Read one Knowledge Hub document with full markdown content by ID",
    title = "Read Document",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadDocumentTool {
    /// Project ID containing the document
    pub project_id: i32,
    /// Document ID to read
    pub doc_id: i32,
}

impl ReadDocumentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Reading full document {} from project {}",
            self.doc_id, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";
        let api_key = &active.api_key;

        let empty_endpoints = vec![];
        let allowed_endpoints = if is_platform_agent {
            active.entry
                .effective_endpoints
                .as_ref()
                .unwrap_or(&empty_endpoints)
        } else {
            &empty_endpoints
        };

        match ctx
            .api_client
            .get_document(api_key, self.project_id, self.doc_id, allowed_endpoints)
            .await
        {
            Ok(doc) => {
                let mut response = format!("📖 {} (ID: {})\n\n", doc.title, doc.id);
                response.push_str(&format!("Role: {:?}\n", doc.role));
                response.push_str(&format!("Project: {}\n", doc.project_id));
                response.push_str(&format!(
                    "Updated: {}\n\n",
                    doc.updated_at
                        .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                        .unwrap_or_else(|| "n/a".to_string())
                ));
                response.push_str("---\n\n");
                response.push_str(&doc.content);

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]))
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!(
                    "Failed to read document {} from project {}: {}",
                    self.doc_id, self.project_id, e
                ),
            )),
        }
    }
}

//******************//
//  GetContextTool  //
//******************//
#[mcp_tool(
    name = "get_context",
    description = "Get detailed task context with inline documents (Platform Agent with endpoint access)",
    title = "Get Context",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct GetContextTool {
    /// Project ID
    pub project_id: i32,
    /// Task ID to get context for
    pub task_id: i32,
    /// Include inline documents and context
    #[serde(default = "default_true")]
    pub inline: bool,
    /// Use compact format
    #[serde(default = "default_true")]
    pub compact: bool,
}

fn default_true() -> bool {
    true
}

impl GetContextTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Executing context query for project {} task {}",
            self.project_id, self.task_id
        );

        // Load current configuration to get active agent
        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";
        let api_key = &active.api_key;

        // Check if platform agent has access to task details endpoint
        let empty_endpoints = vec![];
        let allowed_endpoints = active.entry
            .effective_endpoints
            .as_ref()
            .unwrap_or(&empty_endpoints);
        if is_platform_agent {
            let task_endpoint_pattern = "/api/agent/projects/:projectId/tasks/:taskId";
            let has_task_access = allowed_endpoints.iter().any(|endpoint| {
                ctx.api_client.endpoint_matches_pattern(
                    &format!(
                        "/api/agent/projects/{}/tasks/{}",
                        self.project_id, self.task_id
                    ),
                    endpoint,
                )
            });

            if !has_task_access {
                let response = format!(
                    "❌ Platform Agent '{}' - Insufficient Permissions\n\n\
                    Required Endpoint: {}\n\
                    Allowed Endpoints: {}\n\n\
                    💡 To enable task context access:\n\
                    1. Contact your administrator to configure task access\n\
                    2. Add '/api/agent/projects/:projectId/tasks/:taskId' to allowed endpoints\n\
                    3. Use a delegated Project Agent for project workflow operations",
                    active.entry.name,
                    task_endpoint_pattern,
                    allowed_endpoints.join(", ")
                );

                return Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]));
            }
        }

        // Make API call to get task details with context.
        let unrestricted_endpoints = vec![];
        let api_allowed_endpoints = if is_platform_agent {
            allowed_endpoints
        } else {
            &unrestricted_endpoints
        };
        match ctx
            .api_client
            .get_task_details(
                api_key,
                self.project_id,
                self.task_id,
                api_allowed_endpoints,
                self.inline,
                self.compact,
            )
            .await
        {
            Ok(task_details) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let mut response = format!(
                    "🎯 {} '{}' - Task Context\n\n",
                    agent_type_label, active.entry.name
                );

                // Task basic information
                response.push_str(&format!(
                    "Task: {} ({})\n",
                    task_details.name, task_details.identifier
                ));
                response.push_str(&format!("Project ID: {}\n", task_details.project_id));
                response.push_str(&format!("Status: {:?}\n", task_details.status));
                response.push_str(&format!(
                    "Column: {} (ID: {})\n",
                    task_details.column.name, task_details.column.id
                ));

                if let Some(description) = &task_details.description {
                    response.push_str(&format!("Description: {}\n", description));
                }

                if let Some(assignee_id) = task_details.assignee_id {
                    response.push_str(&format!("Assignee ID: {}\n", assignee_id));
                }

                response.push_str(&format!(
                    "Created: {}\n",
                    task_details.created_at.format("%Y-%m-%d %H:%M:%S UTC")
                ));
                response.push_str(&format!(
                    "Updated: {}\n",
                    task_details.updated_at.format("%Y-%m-%d %H:%M:%S UTC")
                ));

                // Column context (persona information)
                if let Some(column_description) = &task_details.column.description {
                    response.push_str(&format!(
                        "\n🎭 Column Context ({}): {}\n",
                        task_details.column.name, column_description
                    ));
                }

                // Linked documents
                if let Some(linked_docs) = &task_details.linked_documents {
                    if !linked_docs.is_empty() {
                        response
                            .push_str(&format!("\n📚 Linked Documents ({}):\n", linked_docs.len()));
                        for (i, doc) in linked_docs.iter().enumerate() {
                            response.push_str(&format!(
                                "{}. {} ({:?})\n",
                                i + 1,
                                doc.title,
                                doc.role
                            ));

                            if self.inline {
                                // Show document content if inline is requested
                                let content_preview = if ctx.bypass_safety {
                                    doc.content.clone()
                                } else {
                                    let content_preview = truncate_preview(&doc.content, 500);
                                    if content_preview.as_ref() == doc.content.as_str() {
                                        doc.content.clone()
                                    } else {
                                        format!(
                                            "{}\n[Content truncated - {} total characters]",
                                            content_preview,
                                            doc.content.chars().count()
                                        )
                                    }
                                };
                                response.push_str(&format!("   Content: {}\n", content_preview));
                            }
                            response.push('\n');
                        }
                    }
                }

                // Sub-board information
                if let Some(parent_id) = task_details.parent_id {
                    response.push_str(&format!("\n🔗 Parent Task ID: {}\n", parent_id));
                }

                if let Some(plan_accepted) = task_details.plan_accepted {
                    response.push_str(&format!(
                        "\n📋 Plan Status: {}\n",
                        if plan_accepted { "Accepted" } else { "Pending" }
                    ));
                }

                response.push_str("\n💡 Available actions:\n");
                if is_platform_agent {
                    response.push_str("• Use a delegated Project Agent for task modifications\n");
                } else {
                    response.push_str("• Use task commands to progress delegated project work\n");
                }
                response.push_str("• Use 'read_documents' to access full document content\n");
                response.push_str("• Use 'query_tasks' to see related tasks in the project\n");

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]))
            }
            Err(e) => {
                let agent_type_label = if is_platform_agent {
                    "Platform Agent"
                } else {
                    "Project Agent"
                };
                let error_response = format!(
                    "❌ {} '{}' - Context Query Failed\n\n\
                    Project ID: {}\n\
                    Task ID: {}\n\
                    Error: {}\n\n\
                    💡 Troubleshooting:\n\
                    • Verify the project and task IDs exist and are accessible\n\
                    • Check Hub connectivity with 'query_health' (platform agent)\n\
                    • Ensure the /api/agent/projects/:projectId/tasks/:taskId endpoint is configured",
                    agent_type_label, active.entry.name, self.project_id, self.task_id, e
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    error_response,
                )]))
            }
        }
    }
}

//*********************//
//  VibeTaskMcpTools   //
//*********************//

//  CreateKnowledgeDocumentTool  //
//*********************//
#[mcp_tool(
    name = "create_knowledge_document",
    description = "Create document with Knowledge Hub integration and role-based linking",
    title = "Create Knowledge Document",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct CreateKnowledgeDocumentTool {
    /// Project ID where the document will be created
    pub project_id: i32,
    /// Document title
    pub title: String,
    /// Document content (markdown)
    pub content: String,
    /// Document role/type (Constitution, Specification, Plan, WorkLog, Reference, Research, Notes)
    pub role: String,
    /// Optional: Version for the document (defaults to 1.0.0)
    #[serde(default)]
    pub version: Option<String>,
    /// Optional: Tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional: Link to specific task
    #[serde(default)]
    pub linked_task_id: Option<String>,
}

impl CreateKnowledgeDocumentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Creating Knowledge Hub document: {}", self.title);

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "create_knowledge_document")?;
        let api_key = &active.api_key;

        // Validate document role
        let document_role = match self.role.as_str() {
            "Constitution" => crate::domain::DocumentRole::Constitution,
            "Specification" => crate::domain::DocumentRole::Specification,
            "Plan" => crate::domain::DocumentRole::Plan,
            "WorkLog" => crate::domain::DocumentRole::WorkLog,
            "Reference" => crate::domain::DocumentRole::Reference,
            "Research" => crate::domain::DocumentRole::Research,
            "Notes" => crate::domain::DocumentRole::Notes,
            _ => {
                return Err(tool_error("runtime", format!(
                    "Invalid document role '{}'. Valid roles: Constitution, Specification, Plan, WorkLog, Reference, Research, Notes",
                    self.role
                )));
            }
        };

        // Create Knowledge Hub document
        let mut knowledge_doc = crate::domain::KnowledgeDocument::new(
            self.title.clone(),
            self.content.clone(),
            document_role,
            self.project_id,
            active.entry.name.clone(),
        );

        // Set version if provided
        if let Some(version) = &self.version {
            knowledge_doc.version = version.clone();
        }

        // Add tags
        knowledge_doc.metadata.tags = self.tags.clone();

        // Link to task if provided
        if let Some(task_id) = &self.linked_task_id {
            knowledge_doc.link_to_task(task_id.clone());
        }

        // Create document via API
        match ctx
            .api_client
            .create_knowledge_document(api_key, self.project_id, &knowledge_doc)
            .await
        {
            Ok(response) => {
                let doc_id = response.get("id").and_then(|id| id.as_i64()).unwrap_or(0);

                let response_text = format!(
                    "✅ Knowledge Hub Document Created Successfully\n\n\
                    📄 Document Details:\n\
                    • ID: {}\n\
                    • Title: {}\n\
                    • Role: {}\n\
                    • Version: {}\n\
                    • Project: {}\n\
                    • Word Count: {}\n\
                    • Created by: {}\n\
                    • Tags: {}\n\n\
                    🔗 Document Features:\n\
                    • Role-based linking for cross-agent collaboration\n\
                    • Version management for consistency during agent work\n\
                    • Annotation system for collaborative memory\n\
                    • Semantic similarity matching for knowledge sharing\n\n\
                    💡 Next Steps:\n\
                    • Use 'annotate_document' to add collaborative insights\n\
                    • Use 'pin_document_version' to lock version during work\n\
                    • Use 'query_similar_documents' to find related content",
                    doc_id,
                    knowledge_doc.title,
                    self.role,
                    knowledge_doc.version,
                    self.project_id,
                    knowledge_doc.metadata.word_count,
                    knowledge_doc.created_by,
                    if self.tags.is_empty() {
                        "None".to_string()
                    } else {
                        self.tags.join(", ")
                    }
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response_text,
                )]))
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!("Failed to create Knowledge Hub document: {}", e),
            )),
        }
    }
}

//*********************//
//  AnnotateDocumentTool  //
//*********************//
#[mcp_tool(
    name = "annotate_document",
    description = "Add collaborative annotation to document for cross-agent knowledge sharing",
    title = "Annotate Document",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct AnnotateDocumentTool {
    /// Project ID containing the document
    pub project_id: i32,
    /// Document ID to annotate
    pub document_id: i32,
    /// Type of annotation (Insight, Warning, BestPractice, CrossReference, Question, Solution)
    pub annotation_type: String,
    /// Annotation content
    pub content: String,
    /// Optional: Tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional: Task similarity score (0.0-1.0)
    #[serde(default)]
    pub task_similarity_score: Option<f64>,
    /// Optional: Related task IDs
    #[serde(default)]
    pub related_tasks: Vec<String>,
    /// Optional: Technology stack tags
    #[serde(default)]
    pub technology_stack: Vec<String>,
    /// Optional: Complexity level (1-10)
    #[serde(default)]
    pub complexity_level: Option<u8>,
}

impl AnnotateDocumentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Adding annotation to document {} in project {}",
            self.document_id, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "annotate_document")?;
        let api_key = &active.api_key;

        // Validate annotation type
        let annotation_type = match self.annotation_type.as_str() {
            "Insight" => crate::domain::AnnotationType::Insight,
            "Warning" => crate::domain::AnnotationType::Warning,
            "BestPractice" => crate::domain::AnnotationType::BestPractice,
            "CrossReference" => crate::domain::AnnotationType::CrossReference,
            "Question" => crate::domain::AnnotationType::Question,
            "Solution" => crate::domain::AnnotationType::Solution,
            _ => {
                return Err(tool_error("runtime", format!(
                    "Invalid annotation type '{}'. Valid types: Insight, Warning, BestPractice, CrossReference, Question, Solution",
                    self.annotation_type
                )));
            }
        };

        // Validate complexity level if provided
        if let Some(complexity) = self.complexity_level {
            if !(1..=10).contains(&complexity) {
                return Err(tool_error(
                    "runtime",
                    "Complexity level must be between 1 and 10".to_string(),
                ));
            }
        }

        // Validate task similarity score if provided
        if let Some(score) = self.task_similarity_score {
            if !(0.0..=1.0).contains(&score) {
                return Err(tool_error(
                    "runtime",
                    "Task similarity score must be between 0.0 and 1.0".to_string(),
                ));
            }
        }

        // Create annotation context
        let context = crate::domain::AnnotationContext {
            task_similarity_score: self.task_similarity_score,
            related_tasks: self.related_tasks.clone(),
            technology_stack: self.technology_stack.clone(),
            complexity_level: self.complexity_level.unwrap_or(5),
        };

        // Create annotation
        let annotation = crate::domain::DocumentAnnotation {
            id: format!("ann_{}", nanoid::nanoid!(8)),
            annotation_type,
            content: self.content.clone(),
            agent_name: active.entry.name.clone(),
            created_at: chrono::Utc::now(),
            tags: self.tags.clone(),
            context,
        };

        // Add annotation via API
        match ctx
            .api_client
            .add_document_annotation(api_key, self.project_id, self.document_id, &annotation)
            .await
        {
            Ok(_response) => {
                let response_text = format!(
                    "✅ Document Annotation Added Successfully\n\n\
                    📝 Annotation Details:\n\
                    • ID: {}\n\
                    • Type: {}\n\
                    • Document: {} (Project {})\n\
                    • Agent: {}\n\
                    • Content: {}\n\
                    • Tags: {}\n\n\
                    🔗 Collaborative Context:\n\
                    • Task Similarity: {}\n\
                    • Related Tasks: {}\n\
                    • Technology Stack: {}\n\
                    • Complexity Level: {}/10\n\n\
                    💡 Knowledge Sharing:\n\
                    • This annotation is now available to other agents in the swarm\n\
                    • Use 'query_similar_documents' to find related insights\n\
                    • Annotations help build collaborative memory across tasks",
                    annotation.id,
                    self.annotation_type,
                    self.document_id,
                    self.project_id,
                    annotation.agent_name,
                    truncate_preview(&self.content, 100),
                    if self.tags.is_empty() {
                        "None".to_string()
                    } else {
                        self.tags.join(", ")
                    },
                    self.task_similarity_score
                        .map(|s| format!("{:.2}", s))
                        .unwrap_or_else(|| "Not specified".to_string()),
                    if self.related_tasks.is_empty() {
                        "None".to_string()
                    } else {
                        self.related_tasks.join(", ")
                    },
                    if self.technology_stack.is_empty() {
                        "None".to_string()
                    } else {
                        self.technology_stack.join(", ")
                    },
                    annotation.context.complexity_level
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response_text,
                )]))
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!("Failed to add document annotation: {}", e),
            )),
        }
    }
}

//*********************//
//  PinDocumentVersionTool  //
//*********************//
#[mcp_tool(
    name = "pin_document_version",
    description = "Pin document version for consistency during agent work",
    title = "Pin Document Version",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct PinDocumentVersionTool {
    /// Project ID containing the document
    pub project_id: i32,
    /// Document ID to pin
    pub document_id: i32,
    /// Version to pin (e.g., "1.2.3")
    pub version: String,
}

impl PinDocumentVersionTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Pinning version {} for document {} in project {}",
            self.version, self.document_id, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "pin_document_version")?;
        let api_key = &active.api_key;

        // Validate version format (basic semantic versioning)
        let version_regex = regex::Regex::new(r"^\d+\.\d+\.\d+$").map_err(|e| {
            tool_error("runtime", format!("Failed to compile version regex: {}", e))
        })?;

        if !version_regex.is_match(&self.version) {
            return Err(tool_error(
                "runtime",
                "Version must be in semantic versioning format (e.g., '1.2.3')".to_string(),
            ));
        }

        // Pin document version via API
        match ctx
            .api_client
            .pin_document_version(api_key, self.project_id, self.document_id, &self.version)
            .await
        {
            Ok(_response) => {
                let response_text = format!(
                    "✅ Document Version Pinned Successfully\n\n\
                    📌 Version Pin Details:\n\
                    • Document ID: {}\n\
                    • Project ID: {}\n\
                    • Pinned Version: {}\n\
                    • Pinned by: {}\n\
                    • Timestamp: {}\n\n\
                    🔒 Consistency Guarantee:\n\
                    • This document version is now locked for agent work\n\
                    • All agents working on related tasks will use this exact version\n\
                    • Prevents version drift during collaborative work\n\
                    • Ensures reproducible results across agent interactions\n\n\
                    💡 Version Management:\n\
                    • Use this for critical documents during active development\n\
                    • Unpin when ready to allow updates\n\
                    • Other agents will see version pin warnings if they try to modify",
                    self.document_id,
                    self.project_id,
                    self.version,
                    active.entry.name,
                    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
                );

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response_text,
                )]))
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!("Failed to pin document version: {}", e),
            )),
        }
    }
}

//*********************//
//  QuerySimilarDocumentsTool  //
//*********************//
#[mcp_tool(
    name = "query_similar_documents",
    description = "Find documents with semantic similarity for cross-agent knowledge sharing",
    title = "Query Similar Documents",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct QuerySimilarDocumentsTool {
    /// Project ID to search within
    pub project_id: i32,
    /// Reference content to find similar documents for
    pub reference_content: String,
    /// Optional: Minimum similarity threshold (0.0-1.0, default: 0.3)
    #[serde(default)]
    pub similarity_threshold: Option<f64>,
    /// Optional: Maximum number of results (default: 10)
    #[serde(default)]
    pub max_results: Option<i32>,
    /// Optional: Filter by document role
    #[serde(default)]
    pub role_filter: Option<String>,
}

impl QuerySimilarDocumentsTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Querying similar documents in project {} with threshold {:?}",
            self.project_id, self.similarity_threshold
        );

        let active = ctx.resolve_active_agent().await?;
        let is_platform_agent = active.entry.agent_type == "Platform";

        if is_platform_agent {
            // Platform Agent: Check endpoint permissions
            let empty_endpoints = vec![];
            let allowed_endpoints = active.entry
                .effective_endpoints
                .as_ref()
                .unwrap_or(&empty_endpoints);
            let has_docs_access = allowed_endpoints
                .iter()
                .any(|endpoint| endpoint.contains("/api/agent/projects/:projectId/docs"));

            if !has_docs_access {
                return Err(tool_error("runtime", format!(
                    "Platform Agent '{}' lacks document access permissions. Required endpoint: /api/agent/projects/:projectId/docs",
                    active.entry.name
                )));
            }
        }

        // Validate similarity threshold
        let threshold = self.similarity_threshold.unwrap_or(0.3);
        if !(0.0..=1.0).contains(&threshold) {
            return Err(tool_error(
                "runtime",
                "Similarity threshold must be between 0.0 and 1.0".to_string(),
            ));
        }

        // Validate max results
        let max_results = self.max_results.unwrap_or(10) as usize;
        if max_results == 0 || max_results > 50 {
            return Err(tool_error(
                "runtime",
                "Max results must be between 1 and 50".to_string(),
            ));
        }

        let api_key = &active.api_key;

        // Get allowed endpoints for Platform Agents
        let empty_endpoints = vec![];
        let allowed_endpoints = if is_platform_agent {
            active.entry
                .effective_endpoints
                .as_ref()
                .unwrap_or(&empty_endpoints)
        } else {
            &empty_endpoints // Project Agents have full access
        };

        // Query similar documents via API
        match ctx
            .api_client
            .get_similar_documents(
                api_key,
                self.project_id,
                &self.reference_content,
                threshold,
                allowed_endpoints,
            )
            .await
        {
            Ok(similar_docs) => {
                let mut response = format!(
                    "🔍 Similar Documents Query Results\n\n\
                    📊 Search Parameters:\n\
                    • Project: {}\n\
                    • Similarity Threshold: {:.2}\n\
                    • Max Results: {}\n\
                    • Reference Content: {}...\n\n",
                    self.project_id,
                    threshold,
                    max_results,
                    truncate_preview(&self.reference_content, 100)
                );

                if similar_docs.is_empty() {
                    response
                        .push_str("No similar documents found above the similarity threshold.\n\n");
                    response.push_str("💡 Suggestions:\n");
                    response.push_str("• Lower the similarity threshold\n");
                    response.push_str("• Try different reference content\n");
                    response.push_str("• Check if documents exist in this project\n");
                } else {
                    let limited_docs: Vec<_> = similar_docs.into_iter().take(max_results).collect();
                    response.push_str(&format!(
                        "Found {} similar documents:\n\n",
                        limited_docs.len()
                    ));

                    for (i, doc) in limited_docs.iter().enumerate() {
                        let similarity = doc.rank;
                        response.push_str(&format!("{}. {} (ID: {})\n", i + 1, doc.title, doc.id));
                        response.push_str(&format!("   Role: {}\n", doc.doc_type));
                        response.push_str(&format!("   Similarity: {:.2}%\n", similarity * 100.0));

                        let preview = truncate_preview(&doc.snippet, 220);
                        response.push_str(&format!("   Snippet: {}\n", preview));

                        response.push('\n');
                    }

                    response.push_str("🤝 Cross-Agent Knowledge Sharing:\n");
                    response
                        .push_str("• These documents contain related insights from other agents\n");
                    response.push_str(
                        "• Use 'read_document <project_id> <doc_id>' to get full content\n",
                    );
                    response.push_str("• Use 'annotate_document' to add your own insights\n");
                    response.push_str("• Similar patterns may apply to your current task\n");
                }

                Ok(CallToolResult::text_content(vec![TextContent::from(
                    response,
                )]))
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!("Failed to query similar documents: {}", e),
            )),
        }
    }
}
