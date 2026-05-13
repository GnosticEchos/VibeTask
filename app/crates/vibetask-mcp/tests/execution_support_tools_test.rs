use std::sync::Arc;
use tempfile::TempDir;
use vibetask_mcp::tools::ToolContext;
use vibetask_mcp::tools::{LinkDocumentTool, RequestHelpTool, UpdateTaskProgressTool};
use vibetask_mcp::vibetask_client::VibeTaskClient;

fn create_test_context() -> (ToolContext, TempDir) {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir
        .path()
        .join("test-config.toml")
        .to_string_lossy()
        .to_string();

    let context = ToolContext {
        config_path,
        api_client: Arc::new(VibeTaskClient::new("https://test.example.com").unwrap()),
        bypass_safety: false,
        workflow_context: Arc::new(tokio::sync::RwLock::new(
            vibetask_mcp::tools::WorkflowContext::default(),
        )),
    };

    (context, temp_dir)
}

#[test]
fn test_update_task_progress_tool_creation() {
    let tool = UpdateTaskProgressTool {
        project_id: 10,
        task_id: 123,
        progress_description: "Implemented core functionality".to_string(),
        completion_percentage: Some(75),
        files_in_progress: Some(vec!["src/main.rs".to_string(), "src/lib.rs".to_string()]),
        blockers: Some(vec!["Waiting for API documentation".to_string()]),
    };

    assert_eq!(tool.project_id, 10);
    assert_eq!(tool.task_id, 123);
    assert_eq!(tool.progress_description, "Implemented core functionality");
    assert_eq!(tool.completion_percentage, Some(75));
    assert_eq!(tool.files_in_progress.as_ref().unwrap().len(), 2);
    assert_eq!(tool.blockers.as_ref().unwrap().len(), 1);
}

#[test]
fn test_link_document_tool_creation() {
    let tool = LinkDocumentTool {
        project_id: 10,
        task_id: 123,
        document_title: "Implementation Notes".to_string(),
        document_content: "# Implementation Notes\n\nThis document contains...".to_string(),
        document_role: "NOTES".to_string(),
        link_description: Some("Technical notes for task implementation".to_string()),
    };

    assert_eq!(tool.project_id, 10);
    assert_eq!(tool.task_id, 123);
    assert_eq!(tool.document_title, "Implementation Notes");
    assert_eq!(tool.document_role, "NOTES");
    assert!(tool.link_description.is_some());
}

#[test]
fn test_request_help_tool_creation() {
    let tool = RequestHelpTool {
        project_id: 10,
        task_id: 123,
        help_type: "TECHNICAL".to_string(),
        help_description: "Need help with database schema design".to_string(),
        requested_from: Some("database-expert".to_string()),
        priority: Some("HIGH".to_string()),
        context: Some("Working on user authentication system".to_string()),
    };

    assert_eq!(tool.project_id, 10);
    assert_eq!(tool.task_id, 123);
    assert_eq!(tool.help_type, "TECHNICAL");
    assert_eq!(
        tool.help_description,
        "Need help with database schema design"
    );
    assert_eq!(tool.requested_from.as_ref().unwrap(), "database-expert");
    assert_eq!(tool.priority.as_ref().unwrap(), "HIGH");
    assert!(tool.context.is_some());
}

#[test]
fn test_update_task_progress_validation() {
    let (_ctx, _temp_dir) = create_test_context();

    // Test valid completion percentage
    let valid_tool = UpdateTaskProgressTool {
        project_id: 10,
        task_id: 123,
        progress_description: "Progress update".to_string(),
        completion_percentage: Some(50),
        files_in_progress: None,
        blockers: None,
    };
    assert!(valid_tool.completion_percentage.unwrap() <= 100);

    // Test edge case completion percentage
    let edge_tool = UpdateTaskProgressTool {
        project_id: 10,
        task_id: 123,
        progress_description: "Progress update".to_string(),
        completion_percentage: Some(100),
        files_in_progress: None,
        blockers: None,
    };
    assert_eq!(edge_tool.completion_percentage.unwrap(), 100);
}

#[test]
fn test_link_document_role_validation() {
    let valid_roles = ["SPEC", "PLAN", "WORK_LOG", "REFERENCE", "NOTES", "RESEARCH"];

    for role in valid_roles {
        let tool = LinkDocumentTool {
            project_id: 10,
            task_id: 123,
            document_title: "Test Document".to_string(),
            document_content: "Test content".to_string(),
            document_role: role.to_string(),
            link_description: None,
        };
        assert!(valid_roles.contains(&tool.document_role.as_str()));
    }
}

#[test]
fn test_request_help_type_validation() {
    let valid_help_types = [
        "TECHNICAL",
        "CLARIFICATION",
        "REVIEW",
        "BLOCKED",
        "COLLABORATION",
    ];

    for help_type in valid_help_types {
        let tool = RequestHelpTool {
            project_id: 10,
            task_id: 123,
            help_type: help_type.to_string(),
            help_description: "Need help".to_string(),
            requested_from: None,
            priority: None,
            context: None,
        };
        assert!(valid_help_types.contains(&tool.help_type.as_str()));
    }
}

#[test]
fn test_request_help_priority_validation() {
    let valid_priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

    for priority in valid_priorities {
        let tool = RequestHelpTool {
            project_id: 10,
            task_id: 123,
            help_type: "TECHNICAL".to_string(),
            help_description: "Need help".to_string(),
            requested_from: None,
            priority: Some(priority.to_string()),
            context: None,
        };
        assert!(valid_priorities.contains(&tool.priority.as_ref().unwrap().as_str()));
    }
}
