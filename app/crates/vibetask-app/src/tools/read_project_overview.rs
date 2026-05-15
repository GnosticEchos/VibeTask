use super::*;

#[mcp_tool(
    name = "read_project_overview",
    description = "Get a dashboard-style overview of all delegated projects: task counts per project and per column. One call replaces iterating over each project with read_project_state.",
    title = "Read Project Overview",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadProjectOverviewTool {}

impl ReadProjectOverviewTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .get_project_summary(api_key)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project overview: {}", e)))?;

        let projects = raw
            .get("projects")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut result_projects: Vec<serde_json::Value> = Vec::new();
        for p in &projects {
            let pid = p.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let name = p
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let prefix = p
                .get("prefix")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let total = p.get("totalTasks").and_then(|v| v.as_i64()).unwrap_or(0);
            let formality = p
                .get("formalityLevel")
                .and_then(|v| v.as_str())
                .unwrap_or("LIGHTWEIGHT");

            let columns = p
                .get("columns")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let col_summary: Vec<serde_json::Value> = columns
                .iter()
                .map(|c| {
                    serde_json::json!({
                        "name": c.get("name").and_then(|v| v.as_str()),
                        "roleType": c.get("roleType").and_then(|v| v.as_str()),
                        "taskCount": c.get("taskCount").and_then(|v| v.as_i64()).unwrap_or(0),
                    })
                })
                .collect();

            result_projects.push(serde_json::json!({
                "id": pid,
                "name": name,
                "prefix": prefix,
                "totalTasks": total,
                "formality": formality,
                "columns": col_summary,
            }));
        }

        let project_count = result_projects.len();
        let total_all: i64 = result_projects
            .iter()
            .map(|p| p["totalTasks"].as_i64().unwrap_or(0))
            .sum();

        let output = serde_json::json!({
            "projectCount": project_count,
            "totalTasksAll": total_all,
            "projects": result_projects,
            "summary_line": format!("{} projects, {} total tasks", project_count, total_all),
        });

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
