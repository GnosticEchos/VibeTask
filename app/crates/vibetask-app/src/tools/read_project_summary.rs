use super::*;

#[mcp_tool(
    name = "read_project_summary",
    description = "Get lightweight summary stats for one project. Supports scope and include flags without loading full task bodies.",
    title = "Read Project Summary",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReadProjectSummaryTool {
    /// Project ID to summarize
    pub project_id: i32,
    /// Optional scope: "main" (default) or "all"
    #[serde(default)]
    pub scope: Option<String>,
    /// Optional comma-separated include list (e.g. "documents,agentReview,workspaces")
    #[serde(default)]
    pub include: Option<String>,
    /// Include workspace digest list (alias of include=workspaces)
    #[serde(default)]
    pub list_workspaces: bool,
}

impl ReadProjectSummaryTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .get_project_summary_for_project(
                api_key,
                self.project_id,
                self.scope.as_deref(),
                self.include.as_deref(),
                self.list_workspaces,
            )
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to get project summary: {}", e)))?;

        let summary_line = raw
            .get("project")
            .and_then(|v| v.get("summaryLine"))
            .or_else(|| raw.get("project").and_then(|v| v.get("summary_line")))
            .and_then(|v| v.as_str())
            .unwrap_or("Project summary retrieved");

        let output = serde_json::json!({
            "projectId": self.project_id,
            "scope": self.scope.clone().unwrap_or_else(|| "main".to_string()),
            "include": self.include.clone().unwrap_or_default(),
            "listWorkspaces": self.list_workspaces,
            "project": raw.get("project").cloned().unwrap_or(serde_json::json!({})),
            "summary_line": summary_line,
        });

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
