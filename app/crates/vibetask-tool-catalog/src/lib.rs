use std::collections::{HashMap, HashSet};

pub const REGISTER_AGENT: &str = "register_agent";
pub const QUERY_HEALTH: &str = "query_health";
pub const QUERY_PROJECTS: &str = "query_projects";
pub const QUERY_TASKS: &str = "query_tasks";
pub const CREATE_TASK: &str = "create_task";
pub const READ_DOCUMENTS: &str = "read_documents";
pub const READ_DOCUMENT: &str = "read_document";
pub const GET_CONTEXT: &str = "get_context";
pub const LIST_AGENTS: &str = "list_agents";
pub const SWITCH_AGENT: &str = "switch_agent";
pub const AGENT_STATUS: &str = "agent_status";
pub const DELEGATE_AGENT: &str = "delegate_agent";
pub const FIND_TOOLS: &str = "find_tools";
pub const READ_PROJECT_STATE: &str = "read_project_state";
pub const READ_PROJECT_OVERVIEW: &str = "read_project_overview";
pub const READ_PROJECT_SUMMARY: &str = "read_project_summary";
pub const CREATE_DRAFT_PROJECT: &str = "create_draft_project";
pub const LOAD_PLANNING_SKILL: &str = "load_planning_skill";
pub const REQUEST_PROJECT_ACCEPT: &str = "request_project_accept";
pub const PREVIEW_DRAFT_PROJECT: &str = "preview_draft_project";
pub const CONFIRM_PROJECT_ACCEPT: &str = "confirm_project_accept";

pub fn platform_tools() -> HashSet<String> {
    [
        QUERY_HEALTH,
        QUERY_PROJECTS,
        QUERY_TASKS,
        READ_DOCUMENTS,
        READ_DOCUMENT,
        GET_CONTEXT,
        REGISTER_AGENT,
        SWITCH_AGENT,
        LIST_AGENTS,
        AGENT_STATUS,
        DELEGATE_AGENT,
        FIND_TOOLS,
        READ_PROJECT_STATE,
        READ_PROJECT_OVERVIEW,
        READ_PROJECT_SUMMARY,
        CREATE_DRAFT_PROJECT,
        LOAD_PLANNING_SKILL,
        REQUEST_PROJECT_ACCEPT,
        PREVIEW_DRAFT_PROJECT,
        CONFIRM_PROJECT_ACCEPT,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// Required read endpoint for a platform MCP tool, if any.
///
/// `None` means the tool is always listed for platform agents (agent mgmt, planning/draft writes
/// are hub-gated by platform session rather than read-endpoint allowance).
pub fn platform_tool_required_endpoint(tool: &str) -> Option<&'static str> {
    match tool {
        QUERY_PROJECTS | READ_PROJECT_STATE | READ_PROJECT_OVERVIEW | READ_PROJECT_SUMMARY => {
            Some("/api/agent/projects")
        }
        QUERY_TASKS | GET_CONTEXT => Some("/api/agent/projects/:projectId/tasks"),
        READ_DOCUMENTS | READ_DOCUMENT => Some("/api/agent/projects/:projectId/docs"),
        _ => None,
    }
}

/// Match platform agent read-endpoint templates (supports `:param` suffixes).
pub fn platform_agent_has_endpoint_access(allowed_endpoints: &[String], target_endpoint: &str) -> bool {
    allowed_endpoints.iter().any(|endpoint| {
        if endpoint.contains(':') && target_endpoint.contains(':') {
            let endpoint_base = endpoint.split(':').next().unwrap_or(endpoint);
            let target_base = target_endpoint.split(':').next().unwrap_or(target_endpoint);
            endpoint_base == target_base
        } else {
            endpoint == target_endpoint
        }
    })
}

/// MCP tool names mapped to a CLI command path (clap subcommand names, e.g. `["project", "list"]`).
pub fn cli_mcp_tools_for_path(path: &[&str]) -> Vec<&'static str> {
    let path = if path.first() == Some(&"vibetask-cli") {
        &path[1..]
    } else {
        path
    };
    match path {
        ["agent", "enlist"] => vec![REGISTER_AGENT],
        ["agent", "list"] => vec![LIST_AGENTS],
        ["agent", "status"] => vec![AGENT_STATUS],
        ["agent", "switch"] => vec![SWITCH_AGENT],
        ["health"] => vec![QUERY_HEALTH],
        ["project", "list"] => vec![QUERY_PROJECTS],
        ["project", "tasks"] => vec![QUERY_TASKS],
        ["project", "docs"] => vec![READ_DOCUMENTS],
        ["project", "read-doc"] => vec![READ_DOCUMENT],
        ["project", "create-doc"] => vec!["create_knowledge_document"],
        ["project", "context"] => vec![GET_CONTEXT],
        ["project", "state"] => vec![READ_PROJECT_STATE],
        ["project", "overview"] => vec![READ_PROJECT_OVERVIEW],
        ["project", "summary"] => vec![READ_PROJECT_SUMMARY],
        ["project", "draft", "create"] => vec![CREATE_DRAFT_PROJECT],
        ["project", "draft", "preview"] => vec![PREVIEW_DRAFT_PROJECT],
        ["project", "accept"] => vec![REQUEST_PROJECT_ACCEPT, CONFIRM_PROJECT_ACCEPT],
        ["task", "create"] => vec![CREATE_TASK],
        ["tools", "list"] => vec![FIND_TOOLS],
        ["tools", "describe"] => vec![FIND_TOOLS],
        ["tools", "call"] => vec![],
        ["search", "tools"] => vec![FIND_TOOLS],
        ["search", "aggregate"] => vec!["query_aggregate"],
        ["document", "create"] => vec!["create_knowledge_document"],
        ["document", "annotate"] => vec!["annotate_document"],
        ["document", "pin"] => vec!["pin_document_version"],
        ["document", "similar"] => vec!["query_similar_documents"],
        ["workflow", "commit"] => vec!["commit_artifact"],
        ["workflow", "spawn"] => vec!["spawn_sub_board"],
        ["workflow", "estimate"] => vec!["estimate_complexity"],
        ["workflow", "move"] => vec!["move_task"],
        ["workflow", "progress"] => vec!["update_task_progress"],
        ["workflow", "link"] => vec!["link_document"],
        ["workflow", "help"] => vec!["request_help"],
        ["workflow", "reflect"] => vec!["reflect_on_work"],
        ["workflow", "approve"] => vec!["approve_completion"],
        ["workflow", "reject"] => vec!["reject_to_execute"],
        ["governance", "review"] => vec!["request_architecture_review"],
        ["governance", "propose"] => vec!["propose_constitution_amendment"],
        ["governance", "confirm"] => vec!["confirm_constitution_amendment"],
        ["agent", "delegate"] => vec![DELEGATE_AGENT],
        _ => vec![],
    }
}

/// Full MCP tool name list for project-delegated agents (discovery parity with CLI).
///
/// Includes core, discovery, workflow, governance, and Knowledge Hub write tools without
/// column-based listing gates. Execution-time rules are still enforced by the Hub.
pub fn project_delegated_full_catalog(
    column_tools: &HashMap<String, HashSet<String>>,
) -> Vec<String> {
    let mut names: HashSet<String> = HashSet::new();

    for t in [
        REGISTER_AGENT,
        QUERY_HEALTH,
        QUERY_PROJECTS,
        QUERY_TASKS,
        READ_DOCUMENTS,
        READ_DOCUMENT,
        GET_CONTEXT,
        LIST_AGENTS,
        SWITCH_AGENT,
        AGENT_STATUS,
        DELEGATE_AGENT,
        FIND_TOOLS,
        READ_PROJECT_STATE,
        READ_PROJECT_OVERVIEW,
        READ_PROJECT_SUMMARY,
    ] {
        names.insert(t.to_string());
    }

    for t in [
        "query_aggregate",
        "create_knowledge_document",
        "annotate_document",
        "pin_document_version",
        "query_similar_documents",
        "set_workflow_context",
        "move_task",
        "update_task_progress",
        "link_document",
        "request_help",
        "reflect_on_work",
        "approve_completion",
        "reject_to_execute",
        CREATE_TASK,
    ] {
        names.insert(t.to_string());
    }

    for set in column_tools.values() {
        names.extend(set.iter().cloned());
    }

    let mut out: Vec<String> = names.into_iter().collect();
    out.sort();
    out
}

pub fn column_tools() -> HashMap<String, HashSet<String>> {
    HashMap::from([
        (
            "Specify".to_string(),
            [
                "commit_artifact",
                "request_architecture_review",
                "propose_constitution_amendment",
                "confirm_constitution_amendment",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect(),
        ),
        (
            "Plan".to_string(),
            ["spawn_sub_board", "estimate_complexity", CREATE_TASK]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        ),
        (
            "Execute".to_string(),
            ["update_task_progress", "link_document", "request_help"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        ),
        (
            "Verify".to_string(),
            ["reflect_on_work", "approve_completion", "reject_to_execute"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        ),
    ])
}

/// Map common search terms to tool names — lets find_tools match by intent, not just name.
pub fn tool_keywords() -> Vec<(String, Vec<String>)> {
    vec![
        ("search".to_string(), vec!["query_aggregate".to_string()]),
        ("find".to_string(), vec!["find_tools".to_string()]),
        (
            "create".to_string(),
            vec![
                "create_task".to_string(),
                "create_knowledge_document".to_string(),
                "create_draft_project".to_string(),
                "commit_artifact".to_string(),
            ],
        ),
        (
            "draft".to_string(),
            vec![
                "create_draft_project".to_string(),
                "preview_draft_project".to_string(),
                "load_planning_skill".to_string(),
                "request_project_accept".to_string(),
                "confirm_project_accept".to_string(),
            ],
        ),
        (
            "document".to_string(),
            vec![
                "create_knowledge_document".to_string(),
                "read_documents".to_string(),
                "read_document".to_string(),
                "annotate_document".to_string(),
                "pin_document_version".to_string(),
                "query_similar_documents".to_string(),
                "link_document".to_string(),
            ],
        ),
        (
            "list".to_string(),
            vec![
                "list_agents".to_string(),
                "query_projects".to_string(),
                "query_tasks".to_string(),
            ],
        ),
        (
            "status".to_string(),
            vec!["agent_status".to_string(), "query_health".to_string()],
        ),
        ("switch".to_string(), vec!["switch_agent".to_string()]),
        (
            "review".to_string(),
            vec!["request_architecture_review".to_string()],
        ),
        (
            "constitution".to_string(),
            vec![
                "propose_constitution_amendment".to_string(),
                "confirm_constitution_amendment".to_string(),
            ],
        ),
        ("delegate".to_string(), vec!["delegate_agent".to_string()]),
        ("move".to_string(), vec!["move_task".to_string()]),
        (
            "approve".to_string(),
            vec!["approve_completion".to_string()],
        ),
        ("reject".to_string(), vec!["reject_to_execute".to_string()]),
        ("help".to_string(), vec!["request_help".to_string()]),
        ("reflect".to_string(), vec!["reflect_on_work".to_string()]),
        (
            "progress".to_string(),
            vec!["update_task_progress".to_string()],
        ),
        (
            "plan".to_string(),
            vec![
                "spawn_sub_board".to_string(),
                "estimate_complexity".to_string(),
            ],
        ),
        ("health".to_string(), vec!["query_health".to_string()]),
        (
            "version".to_string(),
            vec!["pin_document_version".to_string()],
        ),
        (
            "similar".to_string(),
            vec!["query_similar_documents".to_string()],
        ),
        (
            "annotate".to_string(),
            vec!["annotate_document".to_string()],
        ),
        (
            "overview".to_string(),
            vec![
                "read_project_overview".to_string(),
                "read_project_summary".to_string(),
                "read_project_state".to_string(),
            ],
        ),
        ("state".to_string(), vec!["read_project_state".to_string()]),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_tools_include_draft_planning_pair() {
        let tools = platform_tools();
        assert!(tools.contains(CREATE_DRAFT_PROJECT));
        assert!(tools.contains(PREVIEW_DRAFT_PROJECT));
        assert!(tools.contains(CONFIRM_PROJECT_ACCEPT));
    }

    #[test]
    fn draft_planning_tools_are_not_endpoint_gated() {
        for tool in [
            CREATE_DRAFT_PROJECT,
            PREVIEW_DRAFT_PROJECT,
            REQUEST_PROJECT_ACCEPT,
            CONFIRM_PROJECT_ACCEPT,
            LOAD_PLANNING_SKILL,
        ] {
            assert_eq!(
                platform_tool_required_endpoint(tool),
                None,
                "{tool} should list without read-endpoint allowance"
            );
        }
    }

    #[test]
    fn cli_path_maps_draft_preview_and_accept() {
        assert_eq!(
            cli_mcp_tools_for_path(&["project", "draft", "preview"]),
            vec![PREVIEW_DRAFT_PROJECT]
        );
        assert_eq!(
            cli_mcp_tools_for_path(&["project", "accept"]),
            vec![REQUEST_PROJECT_ACCEPT, CONFIRM_PROJECT_ACCEPT]
        );
    }
}
