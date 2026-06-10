use super::*;
use crate::agent_detector::ensure_platform_session;

#[mcp_tool(
    name = "create_draft_project",
    description = "Create a DRAFT project for agent-guided planning. Requires platform session. Default template ADHOC_OPS.",
    title = "Create Draft Project",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct CreateDraftProjectTool {
    pub name: String,
    pub prefix: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub documents: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub backlog_tasks: Option<Vec<serde_json::Value>>,
}

impl CreateDraftProjectTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| tool_error("auth_error", format!("Platform session required: {}", e)))?;
        let api_key = &active.api_key;

        let mut body = serde_json::json!({
            "name": self.name,
            "prefix": self.prefix.to_uppercase(),
            "template": self.template.clone().unwrap_or_else(|| "ADHOC_OPS".to_string()),
        });
        if let Some(desc) = &self.description {
            body["description"] = serde_json::json!(desc);
        }
        if let Some(docs) = &self.documents {
            body["documents"] = serde_json::json!(docs);
        }
        if let Some(tasks) = &self.backlog_tasks {
            body["backlogTasks"] = serde_json::json!(tasks);
        }

        let raw = ctx
            .api_client
            .post_agent_draft_project(api_key, &body)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to create draft project: {}", e)))?;

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}

#[mcp_tool(
    name = "load_planning_skill",
    description = "Load a planning skill markdown body (global default, DB override, or project override).",
    title = "Load Planning Skill",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct LoadPlanningSkillTool {
    pub slug: String,
    #[serde(default)]
    pub project_id: Option<i32>,
}

impl LoadPlanningSkillTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| tool_error("auth_error", format!("Platform session required: {}", e)))?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .get_agent_planning_skill(api_key, &self.slug, self.project_id)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to load planning skill: {}", e)))?;

        Ok(ResponseBuilder::text(
            raw.get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("{}")
                .to_string(),
        ))
    }
}

#[mcp_tool(
    name = "request_project_accept",
    description = "Start device-code project accept flow for a DRAFT project. Returns verification URL and user code.",
    title = "Request Project Accept",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RequestProjectAcceptTool {
    pub project_id: i32,
}

impl RequestProjectAcceptTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| tool_error("auth_error", format!("Platform session required: {}", e)))?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .post_agent_accept_init(api_key, self.project_id)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to init project accept: {}", e)))?;

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}

#[mcp_tool(
    name = "preview_draft_project",
    description = "Preview a DRAFT project before human accept: documents, backlog, and planning meta.",
    title = "Preview Draft Project",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct PreviewDraftProjectTool {
    pub project_id: i32,
}

impl PreviewDraftProjectTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| tool_error("auth_error", format!("Platform session required: {}", e)))?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .get_agent_planning_preview(api_key, self.project_id)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to preview draft project: {}", e))
            })?;

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}

#[mcp_tool(
    name = "confirm_project_accept",
    description = "Confirm device-code project accept for a DRAFT project using the user code from Settings.",
    title = "Confirm Project Accept",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ConfirmProjectAcceptTool {
    pub project_id: i32,
    pub user_code: String,
}

impl ConfirmProjectAcceptTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ensure_platform_session(&ctx.config_path, &active.config, &ctx.api_client)
            .await
            .map_err(|e| tool_error("auth_error", format!("Platform session required: {}", e)))?;
        let api_key = &active.api_key;

        let raw = ctx
            .api_client
            .post_agent_accept_confirm(api_key, self.project_id, self.user_code.as_str())
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to confirm project accept: {}", e),
                )
            })?;

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&raw).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
