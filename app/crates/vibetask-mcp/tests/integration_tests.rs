use vibetask_mcp::{AgentConfig, AgentEntry, AgentType, ServerConfig, ToolRegistry};

/// Test tool filtering enforcement for both agent types
#[tokio::test]
async fn test_dual_agent_tool_filtering() {
    // Test Platform Agent tool filtering
    let platform_agent = AgentType::Platform {
        name: "TestPlatform".to_string(),
        allowed_endpoints: vec![
            "/api/agent/health".to_string(),
            "/api/agent/projects".to_string(),
        ],
        effective_endpoints: vec![
            "/api/agent/health".to_string(),
            "/api/agent/me".to_string(),
            "/api/agent/projects".to_string(),
        ],
    };

    let platform_registry = ToolRegistry::new(platform_agent);
    let platform_tools = platform_registry.get_available_tools(None);

    // Platform agents should have limited tools
    assert!(platform_tools.contains(&"query_health".to_string()));
    assert!(platform_tools.contains(&"register_agent".to_string()));
    // Should not have write tools
    assert!(!platform_tools.contains(&"commit_artifact".to_string()));
    assert!(!platform_tools.contains(&"spawn_sub_board".to_string()));

    // Test Project Agent tool filtering
    let project_agent = AgentType::ProjectDelegated {
        name: "TestProject".to_string(),
        projects: vec![10],
        permissions: std::collections::HashMap::new(),
        delegations: vec![],
    };

    let project_registry = ToolRegistry::new(project_agent);

    // Project agents: full catalog is visible regardless of column context (CLI parity).
    let specify_tools = project_registry.get_available_tools(Some("Specify"));
    let plan_tools = project_registry.get_available_tools(Some("Plan"));
    assert_eq!(specify_tools, plan_tools);

    assert!(specify_tools.contains(&"register_agent".to_string()));
    assert!(specify_tools.contains(&"query_health".to_string()));
    assert!(specify_tools.contains(&"commit_artifact".to_string()));
    assert!(specify_tools.contains(&"spawn_sub_board".to_string()));
    assert!(specify_tools.contains(&"create_knowledge_document".to_string()));
    assert!(specify_tools.contains(&"delegate_agent".to_string()));
    assert!(specify_tools.len() >= 22);
}

/// Test agent type validation and permission enforcement
#[tokio::test]
async fn test_agent_permission_validation() {
    // Test Platform Agent permissions
    let platform_agent = AgentType::Platform {
        name: "PlatformTest".to_string(),
        allowed_endpoints: vec!["/api/agent/health".to_string()],
        effective_endpoints: vec!["/api/agent/health".to_string(), "/api/agent/me".to_string()],
    };

    let platform_registry = ToolRegistry::new(platform_agent);

    // Should validate tool availability correctly
    let validation_result = platform_registry.validate_tool("query_health", None);
    assert!(validation_result.is_ok());

    let invalid_validation = platform_registry.validate_tool("commit_artifact", None);
    assert!(invalid_validation.is_err());

    // Test Project Agent permissions
    let project_agent = AgentType::ProjectDelegated {
        name: "ProjectTest".to_string(),
        projects: vec![10],
        permissions: std::collections::HashMap::new(),
        delegations: vec![],
    };

    let project_registry = ToolRegistry::new(project_agent);

    assert!(project_registry
        .validate_tool("commit_artifact", Some("Specify"))
        .is_ok());
    assert!(project_registry
        .validate_tool("commit_artifact", Some("Plan"))
        .is_ok());

    let unknown_tool = project_registry.validate_tool("not_a_real_vibetask_tool", Some("Plan"));
    assert!(unknown_tool.is_err());
}

/// Test configuration validation scenarios
#[tokio::test]
async fn test_configuration_scenarios() {
    // Test valid Platform Agent config
    let platform_config = AgentConfig {
        server: ServerConfig {
            name: "Test Orchestrator".to_string(),
            version: "1.0.0".to_string(),
            active_agent: "PlatformAgent".to_string(),
            hub_url: None,
            allow_no_fences: false,
        },
        platform: None,
        agents: vec![AgentEntry {
            name: "PlatformAgent".to_string(),
            agent_type: "Platform".to_string(),
            key_hash: "sha256:test-hash".to_string(),
            api_key: None,
            allowed_endpoints: Some(vec!["/api/agent/projects".to_string()]),
            effective_endpoints: Some(vec![
                "/api/agent/health".to_string(),
                "/api/agent/me".to_string(),
                "/api/agent/projects".to_string(),
            ]),
            projects: None,
            permissions: None,
            delegated_at: None,
        }],
        cli: None,
    };

    // Should serialize and deserialize correctly
    let serialized = toml::to_string(&platform_config).unwrap();
    let deserialized: AgentConfig = toml::from_str(&serialized).unwrap();

    assert_eq!(deserialized.server.active_agent, "PlatformAgent");
    assert_eq!(deserialized.agents.len(), 1);
    assert_eq!(deserialized.agents[0].agent_type, "Platform");

    // Test valid Project Agent config
    let project_config = AgentConfig {
        server: ServerConfig {
            name: "Test Orchestrator".to_string(),
            version: "1.0.0".to_string(),
            active_agent: "ProjectAgent".to_string(),
            hub_url: None,
            allow_no_fences: false,
        },
        platform: None,
        agents: vec![AgentEntry {
            name: "ProjectAgent".to_string(),
            agent_type: "ProjectDelegated".to_string(),
            key_hash: "sha256:test-hash-2".to_string(),
            api_key: None,
            allowed_endpoints: None,
            effective_endpoints: None,
            projects: Some(vec![10, 20]),
            permissions: Some(vec!["USER".to_string(), "VIEWER".to_string()]),
            delegated_at: Some("2026-04-08T18:55:25.094Z".to_string()),
        }],
        cli: None,
    };

    let serialized = toml::to_string(&project_config).unwrap();
    let deserialized: AgentConfig = toml::from_str(&serialized).unwrap();

    assert_eq!(deserialized.server.active_agent, "ProjectAgent");
    assert_eq!(deserialized.agents[0].agent_type, "ProjectDelegated");
    assert_eq!(deserialized.agents[0].projects.as_ref().unwrap().len(), 2);
}
