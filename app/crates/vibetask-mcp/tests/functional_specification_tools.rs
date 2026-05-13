use chrono::Utc;
use std::sync::Arc;
use tempfile::TempDir;
use vibetask_mcp::atomic_writer::SecureKeyManager;
use vibetask_mcp::config::AgentConfig;
use vibetask_mcp::generated_types::*;
use vibetask_mcp::tools::ToolContext;
use vibetask_mcp::tools::{
    CommitArtifactTool, ProposeConstitutionAmendmentTool, RequestArchitectureReviewTool,
};
use vibetask_mcp::vibetask_client::VibeTaskClient;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// Test helper to create a mock VibeTask Hub server
async fn setup_mock_hub() -> MockServer {
    MockServer::start().await
}

/// Test helper to create tool context with mock server
async fn create_test_context(mock_server: &MockServer) -> (ToolContext, TempDir) {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir
        .path()
        .join("test-config.toml")
        .to_string_lossy()
        .to_string();

    // Create test configuration with project agent
    let mut config = AgentConfig::create_default("Test Server");
    config.agents.push(vibetask_mcp::config::AgentEntry {
        name: "TestProjectAgent".to_string(),
        agent_type: "ProjectDelegated".to_string(),
        key_hash: "sha256:test".to_string(),
        api_key: None,
        allowed_endpoints: None,
        effective_endpoints: None,
        projects: Some(vec![1]),
        permissions: Some(vec!["USER".to_string()]),
        delegated_at: Some(Utc::now().to_rfc3339()),
    });
    config.server.active_agent = "TestProjectAgent".to_string();
    config.save(&config_path).await.unwrap();

    // Store test key
    SecureKeyManager::store_key("TestProjectAgent", "test-api-key")
        .await
        .unwrap();

    let api_client = Arc::new(VibeTaskClient::new(mock_server.uri()).unwrap());
    let context = ToolContext {
        config_path,
        api_client,
        bypass_safety: false,
        workflow_context: Arc::new(tokio::sync::RwLock::new(
            vibetask_mcp::tools::WorkflowContext::default(),
        )),
    };

    (context, temp_dir)
}

/// Create mock task context response for Specify column
fn create_specify_task_response() -> TaskWithDetails {
    TaskWithDetails {
        id: 123,
        name: "Test Specification Task".to_string(),
        identifier: "TST-123".to_string(),
        description: Some("Create specification for new feature".to_string()),
        status: TaskStatus::InProgress,
        column_id: 1,
        column: Column {
            id: 1,
            name: "Specify".to_string(),
            description: Some("Specification phase".to_string()),
            order: 1,
            color: Some("#blue".to_string()),
            column_type: Some("SPECIFY".to_string()),
        },
        project_id: 1,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        assignee_id: None,
        assignee_api_key_id: None,
        relation_mode: None,
        relation_id: None,
        parent_id: None,
        plan_accepted: None,
        sub_board_outline_color: None,
        linked_documents: Some(vec![]),
    }
}

/// Create mock documents response
fn create_documents_response() -> PaginatedDocumentsResponse {
    PaginatedDocumentsResponse {
        data: vec![],
        pagination: PaginationMeta {
            page: 1,
            limit: 10,
            total: 0,
            total_pages: 1,
        },
    }
}

/// Create mock document creation response
fn create_document_response() -> ProjectDocument {
    ProjectDocument {
        id: 456,
        title: "Test Specification [RATIFIED]".to_string(),
        content: "# Test Specification\n\n## Overview\nTest content".to_string(),
        role: DocumentRole::Specification,
        project_id: 1,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
        created_by: Some(1),
        version: None,
    }
}

#[tokio::test]
async fn test_commit_artifact_create_new_specification() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Mock documents list endpoint (empty - no existing spec)
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_documents_response()))
        .mount(&mock_server)
        .await;

    // Mock document creation endpoint
    Mock::given(method("POST"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(create_document_response()))
        .mount(&mock_server)
        .await;

    // Test the tool
    let tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Test Specification".to_string(),
        content: "# Test Specification\n\n## Overview\nThis is a test specification.\n\n## Requirements\nReq 1\n\n## Acceptance Criteria\nCriteria 1".to_string(),
        ratify: Some(true),
    };

    let result = tool.call_tool(&context).await;
    assert!(result.is_ok(), "Tool should succeed: {:?}", result);

    let response = result.unwrap();
    if response.is_error.unwrap_or(false) {
        panic!("Response is an error: {:?}", response);
    }

    // Check response content
    let response_text = format!("{:?}", &response.content[0]);

    assert!(response_text.contains("Specification created successfully"));
    assert!(response_text.contains("RATIFIED"));
    assert!(response_text.contains("456"));
}

#[tokio::test]
async fn test_commit_artifact_wrong_column_rejection() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Create task in Execute column (not Specify)
    let mut execute_task = create_specify_task_response();
    execute_task.column.name = "Execute".to_string();

    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(execute_task))
        .mount(&mock_server)
        .await;

    let tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Test Specification".to_string(),
        content: "Test content".to_string(),
        ratify: Some(false),
    };

    let result = tool.call_tool(&context).await;
    assert!(result.is_err(), "Tool should fail in wrong column");

    let error = result.unwrap_err();
    assert!(error
        .to_string()
        .contains("only available in 'Specify' column"));
}

#[tokio::test]
async fn test_request_architecture_review() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Mock document creation endpoint
    Mock::given(method("POST"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(ProjectDocument {
            id: 789,
            title: "Test Architecture Review - Architecture Review Request".to_string(),
            content: "Review document content".to_string(),
            role: DocumentRole::General,
            project_id: 1,
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
            created_by: Some(1),
            version: None,
        }))
        .mount(&mock_server)
        .await;

    let tool = RequestArchitectureReviewTool {
        project_id: 1,
        task_id: 123,
        title: "Test Architecture Review".to_string(),
        review_areas: vec!["Security".to_string(), "Performance".to_string()],
        questions: vec![
            "How will this scale to 1M users?".to_string(),
            "What are the security implications?".to_string(),
        ],
        priority: "High".to_string(),
    };

    let result = tool.call_tool(&context).await;
    assert!(
        result.is_ok(),
        "Architecture review tool should succeed: {:?}",
        result
    );

    let response = result.unwrap();
    if response.is_error.unwrap_or(false) {
        panic!("Response is an error: {:?}", response);
    }

    let response_text = format!("{:?}", &response.content[0]);
    assert!(response_text.contains("Architecture Review Request Created"));
    assert!(response_text.contains("High"));
    assert!(response_text.contains("Security"));
    assert!(response_text.contains("789"));
}

#[tokio::test]
async fn test_propose_constitution_amendment() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Mock documents list with existing Constitution
    let constitution_doc = ProjectDocument {
        id: 100,
        title: "Project Constitution".to_string(),
        content: "# Constitution\n\n## Rule 1\nOriginal rule".to_string(),
        role: DocumentRole::Constitution,
        project_id: 1,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
        created_by: Some(1),
        version: None,
    };

    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(PaginatedDocumentsResponse {
                data: vec![constitution_doc],
                pagination: PaginationMeta {
                    page: 1,
                    limit: 10,
                    total: 1,
                    total_pages: 1,
                },
            }),
        )
        .mount(&mock_server)
        .await;

    // Mock proposal document creation
    Mock::given(method("POST"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(ProjectDocument {
            id: 200,
            title: "Constitution Amendment Proposal: Add Security Rules".to_string(),
            content: "Proposal content with diff".to_string(),
            role: DocumentRole::General,
            project_id: 1,
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
            created_by: Some(1),
            version: None,
        }))
        .mount(&mock_server)
        .await;

    let tool = ProposeConstitutionAmendmentTool {
        project_id: 1,
        task_id: 123,
        amendment_title: "Add Security Rules".to_string(),
        rationale: "We need stronger security policies".to_string(),
        proposed_content:
            "# Constitution\n\n## Rule 1\nOriginal rule\n\n## Rule 2\nNew security rule".to_string(),
    };

    let result = tool.call_tool(&context).await;
    assert!(
        result.is_ok(),
        "Constitution amendment proposal should succeed: {:?}",
        result
    );

    let response = result.unwrap();
    if response.is_error.unwrap_or(false) {
        panic!("Response is an error: {:?}", response);
    }

    let response_text = format!("{:?}", &response.content[0]);
    assert!(response_text.contains("Constitution Amendment Proposed"));
    assert!(response_text.contains("Add Security Rules"));
    assert!(response_text.contains("Confirmation Code"));
    assert!(response_text.contains("GOVERNANCE SAFETY CONTROLS"));
}

#[tokio::test]
async fn test_specification_validation_requirements() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Test with insufficient content (should fail ratification)
    let tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Invalid Spec".to_string(),
        content: "Too short".to_string(), // Less than 100 characters
        ratify: Some(true),
    };

    let result = tool.call_tool(&context).await;
    assert!(
        result.is_err(),
        "Should fail validation for insufficient content"
    );

    let error = result.unwrap_err();
    assert!(error
        .to_string()
        .contains("Specification validation failed"));
}

#[tokio::test]
async fn test_platform_agent_tool_restriction() {
    let mock_server = setup_mock_hub().await;
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir
        .path()
        .join("test-config.toml")
        .to_string_lossy()
        .to_string();

    // Create configuration with Platform Agent (should be rejected)
    let mut config = AgentConfig::create_default("Test Server");
    config.agents.push(vibetask_mcp::config::AgentEntry {
        name: "TestPlatformAgent".to_string(),
        agent_type: "Platform".to_string(), // Platform agent, not ProjectDelegated
        key_hash: "sha256:test".to_string(),
        api_key: None,
        allowed_endpoints: Some(vec!["/api/agent/health".to_string()]),
        effective_endpoints: Some(vec!["/api/agent/health".to_string()]),
        projects: None,
        permissions: None,
        delegated_at: None,
    });
    config.server.active_agent = "TestPlatformAgent".to_string();
    config.save(&config_path).await.unwrap();

    SecureKeyManager::store_key("TestPlatformAgent", "test-api-key")
        .await
        .unwrap();

    let api_client = Arc::new(VibeTaskClient::new(mock_server.uri()).unwrap());
    let context = ToolContext {
        config_path,
        api_client,
        bypass_safety: false,
        workflow_context: Arc::new(tokio::sync::RwLock::new(
            vibetask_mcp::tools::WorkflowContext::default(),
        )),
    };

    let tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Test Spec".to_string(),
        content: "Test content".to_string(),
        ratify: Some(false),
    };

    let result = tool.call_tool(&context).await;
    assert!(result.is_err(), "Platform agents should be rejected");

    let error = result.unwrap_err();
    assert!(error
        .to_string()
        .contains("only available for Project Agents"));
}

#[tokio::test]
async fn test_architecture_review_validation() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Test with empty review areas (should fail)
    let tool = RequestArchitectureReviewTool {
        project_id: 1,
        task_id: 123,
        title: "Invalid Review".to_string(),
        review_areas: vec![], // Empty - should fail
        questions: vec!["Some question".to_string()],
        priority: "Medium".to_string(),
    };

    let result = tool.call_tool(&context).await;
    assert!(result.is_err(), "Should fail with empty review areas");

    let error = result.unwrap_err();
    assert!(error
        .to_string()
        .contains("At least one review area must be specified"));

    // Test with invalid priority
    let tool = RequestArchitectureReviewTool {
        project_id: 1,
        task_id: 123,
        title: "Invalid Priority Review".to_string(),
        review_areas: vec!["Security".to_string()],
        questions: vec!["Some question".to_string()],
        priority: "Invalid".to_string(), // Invalid priority
    };

    let result = tool.call_tool(&context).await;
    assert!(result.is_err(), "Should fail with invalid priority");

    let error = result.unwrap_err();
    assert!(error.to_string().contains("Invalid priority"));
}

#[tokio::test]
async fn test_end_to_end_specification_workflow() {
    let mock_server = setup_mock_hub().await;
    let (context, _temp_dir) = create_test_context(&mock_server).await;

    // Mock task context endpoint
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/tasks/123"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_specify_task_response()))
        .mount(&mock_server)
        .await;

    // Mock documents list endpoint (empty initially)
    Mock::given(method("GET"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(create_documents_response()))
        .mount(&mock_server)
        .await;

    // Mock document creation endpoints
    Mock::given(method("POST"))
        .and(path("/api/agent/projects/1/docs"))
        .and(header("x-agent-api-key", "test-api-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(create_document_response()))
        .mount(&mock_server)
        .await;

    // Step 1: Create draft specification
    let draft_tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Feature X Specification".to_string(),
        content: "# Feature X Specification\n\n## Overview\nThis feature will provide X functionality.\n\n## Requirements\nReq 1: System shall do X\n\n## Acceptance Criteria\nCriteria 1: When user does Y, system shall respond with Z".to_string(),
        ratify: Some(false), // Draft first
    };

    let result = draft_tool.call_tool(&context).await;
    assert!(result.is_ok(), "Draft creation should succeed");

    if let Ok(response) = result {
        let response_text = format!("{:?}", &response.content[0]);
        assert!(response_text.contains("DRAFT"));
        assert!(response_text.contains("ratify: true")); // Should suggest ratification
    }

    // Step 2: Request architecture review
    let review_tool = RequestArchitectureReviewTool {
        project_id: 1,
        task_id: 123,
        title: "Feature X Architecture Review".to_string(),
        review_areas: vec![
            "Security".to_string(),
            "Performance".to_string(),
            "Scalability".to_string(),
        ],
        questions: vec![
            "How will this handle 10M concurrent users?".to_string(),
            "What are the security implications of this approach?".to_string(),
            "How does this integrate with existing systems?".to_string(),
        ],
        priority: "High".to_string(),
    };

    let result = review_tool.call_tool(&context).await;
    assert!(result.is_ok(), "Architecture review should succeed");

    // Step 3: Ratify specification after review
    let ratify_tool = CommitArtifactTool {
        project_id: 1,
        task_id: 123,
        title: "Feature X Specification".to_string(),
        content: "# Feature X Specification\n\n## Overview\nThis feature will provide X functionality with enhanced security.\n\n## Requirements\nReq 1: System shall do X securely\nReq 2: System shall handle 10M users\n\n## Acceptance Criteria\nCriteria 1: When user does Y, system shall respond with Z\nCriteria 2: System shall maintain <100ms response time".to_string(),
        ratify: Some(true), // Now ratify
    };

    let result = ratify_tool.call_tool(&context).await;
    assert!(result.is_ok(), "Ratification should succeed");

    if let Ok(response) = result {
        let response_text = format!("{:?}", &response.content[0]);
        assert!(response_text.contains("RATIFIED"));
        assert!(response_text.contains("Plan column"));
    }
}
