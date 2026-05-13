//! Integration tests for VibeTask client with dual-agent scenarios
//!
//! Tests both Platform Agent (read-only) and Project Agent (full access) scenarios
//! with proper tool filtering and permission validation.

#[cfg(test)]
mod tests {
    use crate::generated_types::*;
    use crate::vibetask_client::VibeTaskClient;
    use chrono::Utc;
    use vibetask_hub_client::ApiError;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Test Platform Agent authentication and endpoint restrictions
    #[tokio::test]
    async fn test_platform_agent_authentication_and_restrictions() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        // Mock Platform Agent identity response
        let platform_agent_response = AgentMeResponse {
            agent: AgentInfo {
                id: "ag_platform_123".to_string(),
                name: "PlatformAgent".to_string(),
                owner_id: 1,
                created_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::days(30),
                metadata: AgentMetadata {
                    is_agent: true,
                    created_by: Some(1),
                    description: "Platform integration agent".to_string(),
                    is_platform_agent: Some(true),
                    allowed_read_endpoints: Some(vec![
                        "/api/agent/projects".to_string(),
                        "/api/agent/projects/:projectId/docs".to_string(),
                    ]),
                },
            },
            delegations: vec![],
            api_allowance: ApiAllowance {
                is_platform_agent: true,
                read_only: true,
                always_allowed_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                ],
                configured_read_endpoints: vec![
                    "/api/agent/projects".to_string(),
                    "/api/agent/projects/:projectId/docs".to_string(),
                ],
                effective_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                    "/api/agent/projects".to_string(),
                    "/api/agent/projects/:projectId/docs".to_string(),
                ],
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "ag_platform_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&platform_agent_response))
            .mount(&mock_server)
            .await;

        // Test 1: Platform Agent can authenticate
        let me_response = client.get_agent_me("ag_platform_key").await.unwrap();
        assert_eq!(me_response.agent.name, "PlatformAgent");
        assert!(me_response.api_allowance.is_platform_agent);
        assert!(me_response.api_allowance.read_only);

        // Test 2: Platform Agent can access health endpoint (always allowed)
        Mock::given(method("GET"))
            .and(path("/api/agent/health"))
            .and(header("x-agent-api-key", "ag_platform_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&HealthResponse {
                status: "healthy".to_string(),
                scope: Some("agent".to_string()),
                timestamp: Some(Utc::now()),
                services: None,
            }))
            .mount(&mock_server)
            .await;

        let health = client.get_health("ag_platform_key").await.unwrap();
        assert_eq!(health.status, "healthy");

        // Test 3: Platform Agent can access configured endpoints
        let projects_response = PaginatedProjectsResponse {
            data: vec![Project {
                id: 1,
                name: "Test Project".to_string(),
                prefix: "TEST".to_string(),
                description: Some("A test project".to_string()),
                created_at: Utc::now(),
                updated_at: Utc::now(),
                status: ProjectStatus::Active,
            }],
            pagination: PaginationMeta {
                page: 1,
                limit: 20,
                total: 1,
                total_pages: 1,
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/projects"))
            .and(header("x-agent-api-key", "ag_platform_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&projects_response))
            .mount(&mock_server)
            .await;

        let projects = client
            .get_projects(
                "ag_platform_key",
                &platform_agent_response
                    .api_allowance
                    .configured_read_endpoints,
            )
            .await
            .unwrap();
        assert_eq!(projects.data.len(), 1);
        assert_eq!(projects.data[0].name, "Test Project");

        // Test 4: Platform Agent cannot access restricted endpoints
        let restricted_result = client
            .get_project_tasks(
                "ag_platform_key",
                1,
                &platform_agent_response
                    .api_allowance
                    .configured_read_endpoints,
            )
            .await;

        assert!(restricted_result.is_err());
        if let Err(ApiError::Agent(agent_error)) = restricted_result {
            assert!(agent_error.to_string().contains("not allowed"));
        } else {
            panic!("Expected AgentError for restricted endpoint");
        }
    }

    /// Test Project Agent with full workflow participation
    #[tokio::test]
    async fn test_project_agent_full_access() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        // Mock Project Agent identity response
        let project_agent_response = AgentMeResponse {
            agent: AgentInfo {
                id: "ag_project_456".to_string(),
                name: "ProjectAgent".to_string(),
                owner_id: 2,
                created_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::days(30),
                metadata: AgentMetadata {
                    is_agent: true,
                    created_by: Some(2),
                    description: "Project workflow agent".to_string(),
                    is_platform_agent: Some(false),
                    allowed_read_endpoints: None,
                },
            },
            delegations: vec![Delegation {
                project_id: 10,
                project_name: "Spec Task Board".to_string(),
                project_prefix: "SPEC".to_string(),
                permission_level: PermissionLevel::User,
                delegated_at: Utc::now(),
                delegation_mode: DelegationMode::Full,
                restricted_column_id: None,
                allowed_move_range: None,
                column_allowance: None,
            }],
            api_allowance: ApiAllowance {
                is_platform_agent: false,
                read_only: false,
                always_allowed_read_endpoints: vec![],
                configured_read_endpoints: vec![],
                effective_read_endpoints: vec![], // Project agents have full API access
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "ag_project_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&project_agent_response))
            .mount(&mock_server)
            .await;

        // Test 1: Project Agent can authenticate
        let me_response = client.get_agent_me("ag_project_key").await.unwrap();
        assert_eq!(me_response.agent.name, "ProjectAgent");
        assert!(!me_response.api_allowance.is_platform_agent);
        assert!(!me_response.api_allowance.read_only);
        assert_eq!(me_response.delegations.len(), 1);
        assert_eq!(me_response.delegations[0].project_id, 10);
        assert_eq!(
            me_response.delegations[0].permission_level,
            PermissionLevel::User
        );

        // Test 2: Project Agent can access task details with context
        let task_details = TaskWithDetails {
            id: 1,
            name: "Implement feature X".to_string(),
            identifier: "SPEC-1".to_string(),
            description: Some("Detailed task description".to_string()),
            status: TaskStatus::Open,
            column_id: 1,
            column: Column {
                id: 1,
                name: "Execute".to_string(),
                description: Some("Implementation phase".to_string()),
                order: 2,
                color: Some("#4CAF50".to_string()),
                column_type: Some("EXECUTE".to_string()),
            },
            project_id: 10,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            assignee_id: Some(2),
            assignee_api_key_id: None,
            relation_mode: None,
            relation_id: None,
            parent_id: None,
            plan_accepted: None,
            sub_board_outline_color: None,
            linked_documents: Some(vec![ProjectDocument {
                id: 1,
                title: "SPECIFICATION.md".to_string(),
                content: "# Feature Specification\n\n[RATIFIED]".to_string(),
                project_id: 10,
                created_at: Some(Utc::now()),
                updated_at: Some(Utc::now()),
                role: DocumentRole::Specification,
                created_by: Some(2),
                version: None,
            }]),
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/projects/10/tasks/1"))
            .and(query_param("inline", "true"))
            .and(query_param("compact", "true"))
            .and(header("x-agent-api-key", "ag_project_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&task_details))
            .mount(&mock_server)
            .await;

        let task = client
            .get_task_details("ag_project_key", 10, 1, &[], true, true)
            .await
            .unwrap();

        assert_eq!(task.name, "Implement feature X");
        assert_eq!(task.column.name, "Execute");
        assert_eq!(task.linked_documents.as_ref().unwrap().len(), 1);

        // Test 3: Project Agent can create documents (write operation)
        let new_document = serde_json::json!({
            "title": "WORK_LOG.md",
            "content": "# Work Log\n\n## Files Touched\n- src/main.rs",
            "role": "WORK_LOG"
        });

        let created_document = serde_json::json!({
            "id": 2,
            "title": "WORK_LOG.md",
            "content": "# Work Log\n\n## Files Touched\n- src/main.rs",
            "project_id": 10,
            "created_at": Utc::now().to_rfc3339(),
            "updated_at": Utc::now().to_rfc3339(),
            "role": "WORK_LOG",
            "created_by": 2
        });

        Mock::given(method("POST"))
            .and(path("/api/agent/projects/10/docs"))
            .and(header("x-agent-api-key", "ag_project_key"))
            .respond_with(ResponseTemplate::new(201).set_body_json(&created_document))
            .mount(&mock_server)
            .await;

        let result = client
            .create_document("ag_project_key", 10, &new_document)
            .await
            .unwrap();

        assert_eq!(
            result.get("title").and_then(|v| v.as_str()).unwrap_or(""),
            "WORK_LOG.md"
        );
        assert_eq!(
            result.get("role").and_then(|v| v.as_str()).unwrap_or(""),
            "WORK_LOG"
        );
    }

    /// Test fault isolation with circuit breaker
    #[tokio::test]
    async fn test_fault_isolation_circuit_breaker() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        // Mock server errors to trigger circuit breaker
        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "failing_key"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
            .mount(&mock_server)
            .await;

        // The circuit breaker opens after 5 failures total.
        // Since each request retries 3 times, we expect:
        // - 1st request: 3 failures (total: 3)
        // - 2nd request: 3 failures (total: 6) -> circuit opens during this request

        // First request should fail with server error after retries
        let result1 = client.get_agent_me("failing_key").await;
        assert!(matches!(
            result1,
            Err(ApiError::ServerError { status: 500, .. })
        ));

        // Second request should either fail with server error or circuit breaker open
        let result2 = client.get_agent_me("failing_key").await;
        assert!(matches!(
            result2,
            Err(ApiError::ServerError { status: 500, .. }) | Err(ApiError::CircuitBreakerOpen)
        ));

        // Third request should definitely be circuit breaker open
        let result3 = client.get_agent_me("failing_key").await;
        assert!(matches!(result3, Err(ApiError::CircuitBreakerOpen)));
    }

    /// Test retry logic with exponential backoff
    #[tokio::test]
    async fn test_retry_logic_exponential_backoff() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        // Mock temporary server error followed by success
        Mock::given(method("GET"))
            .and(path("/api/agent/health"))
            .and(header("x-agent-api-key", "retry_key"))
            .respond_with(ResponseTemplate::new(500).set_body_string("Temporary error"))
            .up_to_n_times(2) // Fail first 2 attempts
            .mount(&mock_server)
            .await;

        Mock::given(method("GET"))
            .and(path("/api/agent/health"))
            .and(header("x-agent-api-key", "retry_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&HealthResponse {
                status: "healthy".to_string(),
                scope: Some("agent".to_string()),
                timestamp: Some(Utc::now()),
                services: None,
            }))
            .mount(&mock_server)
            .await;

        let start_time = std::time::Instant::now();
        let result = client.get_health("retry_key").await.unwrap();
        let elapsed = start_time.elapsed();

        assert_eq!(result.status, "healthy");
        // Should have taken at least 3 seconds due to retries (1s + 2s delays)
        assert!(elapsed >= std::time::Duration::from_secs(3));
    }

    /// Test agent type detection and endpoint validation
    #[tokio::test]
    async fn test_agent_type_detection_and_validation() {
        let client = VibeTaskClient::new("http://localhost:3000").unwrap();

        // Test Platform Agent endpoint validation
        let platform_endpoints = vec![
            "/api/agent/projects".to_string(),
            "/api/agent/projects/:projectId/docs".to_string(),
        ];

        // Should allow configured endpoints
        assert!(client
            .validate_platform_agent_access("/api/agent/projects", &platform_endpoints)
            .is_ok());
        assert!(client
            .validate_platform_agent_access("/api/agent/projects/123/docs", &platform_endpoints)
            .is_ok());

        // Should allow always-allowed endpoints
        assert!(client
            .validate_platform_agent_access("/api/agent/health", &platform_endpoints)
            .is_ok());
        assert!(client
            .validate_platform_agent_access("/api/agent/me", &platform_endpoints)
            .is_ok());

        // Should reject non-configured endpoints
        assert!(client
            .validate_platform_agent_access("/api/agent/projects/123/tasks", &platform_endpoints)
            .is_err());
        assert!(client
            .validate_platform_agent_access("/api/projects", &platform_endpoints)
            .is_err());

        // Test parameter pattern matching
        assert!(client.endpoint_matches_pattern(
            "/api/agent/projects/456/tasks/789",
            "/api/agent/projects/:projectId/tasks/:taskId"
        ));

        assert!(!client.endpoint_matches_pattern(
            "/api/agent/projects/456",
            "/api/agent/projects/:projectId/tasks"
        ));
    }

    /// Test comprehensive dual-agent scenario
    #[tokio::test]
    async fn test_comprehensive_dual_agent_scenario() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        // Test both agent types in the same test to verify they work together

        // 1. Platform Agent for system monitoring
        let platform_response = AgentMeResponse {
            agent: AgentInfo {
                id: "ag_monitor".to_string(),
                name: "MonitorAgent".to_string(),
                owner_id: 1,
                created_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::days(30),
                metadata: AgentMetadata {
                    is_agent: true,
                    created_by: Some(1),
                    description: "System monitoring agent".to_string(),
                    is_platform_agent: Some(true),
                    allowed_read_endpoints: Some(vec!["/api/agent/projects".to_string()]),
                },
            },
            delegations: vec![],
            api_allowance: ApiAllowance {
                is_platform_agent: true,
                read_only: true,
                always_allowed_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                ],
                configured_read_endpoints: vec!["/api/agent/projects".to_string()],
                effective_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                    "/api/agent/projects".to_string(),
                ],
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "monitor_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&platform_response))
            .mount(&mock_server)
            .await;

        // 2. Project Agent for workflow execution
        let project_response = AgentMeResponse {
            agent: AgentInfo {
                id: "ag_worker".to_string(),
                name: "WorkerAgent".to_string(),
                owner_id: 2,
                created_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::days(30),
                metadata: AgentMetadata {
                    is_agent: true,
                    created_by: Some(2),
                    description: "Workflow execution agent".to_string(),
                    is_platform_agent: Some(false),
                    allowed_read_endpoints: None,
                },
            },
            delegations: vec![Delegation {
                project_id: 5,
                project_name: "Active Project".to_string(),
                project_prefix: "ACT".to_string(),
                permission_level: PermissionLevel::User,
                delegated_at: Utc::now(),
                delegation_mode: DelegationMode::Full,
                restricted_column_id: None,
                allowed_move_range: None,
                column_allowance: None,
            }],
            api_allowance: ApiAllowance {
                is_platform_agent: false,
                read_only: false,
                always_allowed_read_endpoints: vec![],
                configured_read_endpoints: vec![],
                effective_read_endpoints: vec![],
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "worker_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&project_response))
            .mount(&mock_server)
            .await;

        // Verify both agents can authenticate with different capabilities
        let monitor = client.get_agent_me("monitor_key").await.unwrap();
        let worker = client.get_agent_me("worker_key").await.unwrap();

        assert!(monitor.api_allowance.is_platform_agent);
        assert!(monitor.api_allowance.read_only);
        assert_eq!(monitor.delegations.len(), 0);

        assert!(!worker.api_allowance.is_platform_agent);
        assert!(!worker.api_allowance.read_only);
        assert_eq!(worker.delegations.len(), 1);
        assert_eq!(
            worker.delegations[0].permission_level,
            PermissionLevel::User
        );

        // Verify endpoint restrictions work correctly
        assert!(client
            .validate_platform_agent_access(
                "/api/agent/projects",
                &monitor.api_allowance.configured_read_endpoints
            )
            .is_ok());

        assert!(client
            .validate_platform_agent_access(
                "/api/agent/projects/5/tasks",
                &monitor.api_allowance.configured_read_endpoints
            )
            .is_err());
    }
}
