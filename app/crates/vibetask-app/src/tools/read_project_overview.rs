use super::*;
use crate::agent_detector::ensure_platform_session;
use crate::project_fleet_stats::{fleet_summary_line, fleet_task_count_for_scope};

#[mcp_tool(
    name = "read_project_overview",
    description = "Get a dashboard-style overview of projects: task counts per project and per column. Delegated agents see active delegations; platform agents with a user-scoped platform session see all membership projects (fleet overview). Supports scope, include, and includeDraft query flags.",
    title = "Read Project Overview",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadProjectOverviewTool {
    /// Optional scope: "main" (default) or "all", or workspace selector (e.g. workspace:SPEC-42).
    #[serde(default)]
    pub scope: Option<String>,
    /// Optional comma-separated include list (e.g. "documents,agentReview,workspaces,draft").
    #[serde(default)]
    pub include: Option<String>,
    /// Include DRAFT lifecycle projects in the fleet overview.
    #[serde(default)]
    pub include_draft: bool,
    /// Optional filter to a single project id.
    #[serde(default)]
    pub project_id: Option<i32>,
    /// Include workspace digest list (alias of include=workspaces).
    #[serde(default)]
    pub list_workspaces: bool,
}

impl ReadProjectOverviewTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to ensure platform session: {}", e),
                )
            })?;

        let api_key = &active.api_key;
        let scope = self.scope.clone().unwrap_or_else(|| "main".to_string());

        let raw = ctx
            .api_client
            .get_project_summary(
                api_key,
                self.project_id,
                Some(scope.as_str()),
                self.include.as_deref(),
                self.list_workspaces,
                self.include_draft,
            )
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project overview: {}", e)))?;

        let projects = raw
            .get("projects")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let project_count = projects.len();
        let scoped_total: i64 = projects
            .iter()
            .map(|p| fleet_task_count_for_scope(p, scope.as_str()))
            .sum();

        let output = serde_json::json!({
            "projectCount": project_count,
            "totalTasksAll": scoped_total,
            "projects": projects,
            "scope": scope,
            "include": self.include.clone().unwrap_or_default(),
            "includeDraft": self.include_draft,
            "listWorkspaces": self.list_workspaces,
            "summary_line": fleet_summary_line(project_count, scope.as_str(), scoped_total),
        });

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
