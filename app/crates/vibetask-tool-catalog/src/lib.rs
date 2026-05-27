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
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
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
                "commit_artifact".to_string(),
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
