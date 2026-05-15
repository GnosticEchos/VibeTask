use super::*;
use vibetask_tool_catalog::{
    column_tools, platform_tools as catalog_platform_tools, project_delegated_full_catalog,
    tool_keywords,
};

#[mcp_tool(
    name = "find_tools",
    description = "Search available MCP tools by keyword or intent. Returns matching tool names and their availability per agent type and board column.",
    title = "Find Tools",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct FindToolsTool {
    /// Keyword to search in tool names or intent (e.g. 'search', 'doc', 'delegate')
    pub query: String,
    /// Include keyword synonyms in search (default: true)
    #[serde(default = "default_use_keywords")]
    pub use_keywords: bool,
}

fn default_use_keywords() -> bool {
    true
}

impl FindToolsTool {
    pub async fn call_tool(&self, _ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let q = self.query.to_lowercase();

        let columns = column_tools();
        let platform_set = catalog_platform_tools();
        let all_project_tools: Vec<String> = project_delegated_full_catalog(&columns)
            .into_iter()
            .filter(|t| !platform_set.contains(t))
            .collect();

        // Name-based matching
        let mut name_matches: Vec<String> = Vec::new();
        for t in platform_set.iter().chain(all_project_tools.iter()) {
            if t.contains(&q) {
                name_matches.push(t.clone());
            }
        }

        // Keyword synonym matching
        let mut keyword_matches: Vec<String> = Vec::new();
        if self.use_keywords {
            for (keyword, tools) in tool_keywords() {
                if keyword.contains(&q) || q.contains(&keyword) {
                    for t in tools {
                        if !name_matches.contains(&t) {
                            keyword_matches.push(t.clone());
                        }
                    }
                }
            }
        }

        // Separate platform vs project matches
        let platform_matches: Vec<&str> = platform_set
            .iter()
            .filter(|t| name_matches.contains(t) || keyword_matches.contains(t))
            .map(|s| s.as_str())
            .collect();

        let all_matched_names: std::collections::HashSet<String> = name_matches
            .iter()
            .chain(keyword_matches.iter())
            .cloned()
            .collect();
        let project_only_matches: Vec<&str> = all_project_tools
            .iter()
            .filter(|t| all_matched_names.contains(*t))
            .map(|s| s.as_str())
            .collect();

        // Column-gated matches
        let mut column_matches: Vec<serde_json::Value> = Vec::new();
        let mut col_names: Vec<&str> = columns.keys().map(|s| s.as_str()).collect();
        col_names.sort();
        for col in col_names {
            let tools = &columns[col];
            let matched: Vec<&str> = tools
                .iter()
                .filter(|t| all_matched_names.contains(*t))
                .map(|s| s.as_str())
                .collect();
            if !matched.is_empty() {
                column_matches.push(serde_json::json!({
                    "column": col,
                    "tools": matched,
                }));
            }
        }

        let result = serde_json::json!({
            "query": self.query,
            "name_matches": name_matches,
            "keyword_matches": keyword_matches,
            "available_to_platform_agents": platform_matches,
            "project_agents_only": project_only_matches,
            "column_gated": column_matches,
            "all_tools_count": platform_set.len() + all_project_tools.len(),
            "matching_tools": all_matched_names.iter().collect::<Vec<_>>(),
            "matching_count": all_matched_names.len(),
            "keyword_hint": "Tip: use find_tools(query: \"task\") or try intent keywords like \"doc\", \"search\", \"create\""
        });

        Ok(ResponseBuilder::text(
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()),
        ))
    }
}
