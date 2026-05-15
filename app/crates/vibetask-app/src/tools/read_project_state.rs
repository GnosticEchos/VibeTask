use super::*;

#[mcp_tool(
    name = "read_project_state",
    description = "Get a consolidated view of a project: columns, task counts per column, and recent tasks. Replaces 3+ separate calls to query_projects + query_tasks + get_context.",
    title = "Read Project State",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadProjectStateTool {
    /// Project ID to read
    pub project_id: i32,
    /// Max tasks to return per column (default 5, 0 for all)
    #[serde(default = "default_limit")]
    pub per_column_limit: i32,
    /// Include full task details (descriptions, assignees). Default false.
    #[serde(default)]
    pub include_details: bool,
}

fn default_limit() -> i32 {
    5
}

impl ReadProjectStateTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        let api_key = &active.api_key;

        let project = ctx
            .api_client
            .get_project_details(api_key, self.project_id)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project: {}", e)))?;

        let project_info = project
            .get("project")
            .ok_or_else(|| tool_error("runtime", "Project response missing 'project' key"))?;

        let name = project_info
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let prefix = project_info
            .get("prefix")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let columns = project_info
            .get("columns")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let allowed_endpoints: Vec<String> = Vec::new();
        let tasks_raw = ctx
            .api_client
            .get_project_tasks(api_key, self.project_id, &allowed_endpoints)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get tasks: {}", e)))?;

        let all_tasks = tasks_raw.data;

        // Group tasks by column_id
        let mut column_summaries: Vec<serde_json::Value> = Vec::new();
        for col in &columns {
            let col_id = col.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let col_name = col
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let col_role = col
                .get("roleType")
                .and_then(|v| v.as_str())
                .unwrap_or("STANDARD")
                .to_string();
            let col_order = col.get("order").and_then(|v| v.as_i64()).unwrap_or(0);

            let col_tasks: Vec<&crate::generated_types::TaskWithDetails> = all_tasks
                .iter()
                .filter(|t| t.column_id == col_id as i32)
                .collect();

            let count = col_tasks.len();
            let limit = self.per_column_limit.max(1) as usize;
            let recent: Vec<serde_json::Value> = col_tasks
                .iter()
                .rev()
                .take(if self.per_column_limit == 0 {
                    count
                } else {
                    limit
                })
                .map(|t| {
                    if self.include_details {
                        serde_json::json!(t)
                    } else {
                        serde_json::json!({
                            "id": t.id,
                            "name": t.name,
                            "identifier": t.identifier,
                        })
                    }
                })
                .collect();

            column_summaries.push(serde_json::json!({
                "id": col_id,
                "name": col_name,
                "roleType": col_role,
                "order": col_order,
                "task_count": count,
                "recent_tasks": recent,
            }));
        }

        let total_task_count = all_tasks.len();
        let col_count = columns.len();

        let result = serde_json::json!({
            "project": {
                "id": self.project_id,
                "name": name,
                "prefix": prefix,
            },
            "total_tasks": total_task_count,
            "columns": column_summaries,
            "summary_line": format!("Project \"{name}\" ({prefix}): {total_task_count} tasks across {col_count} columns"),
        });

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
