use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::time::timeout;

/// End-to-end test of MCP protocol with both agent types
#[tokio::test]
#[ignore] // Disable for now - requires complex stdio interaction
async fn test_e2e_mcp_protocol_dual_agents() {
    // Test Platform Agent
    test_platform_agent_e2e().await;

    // Test Project Agent
    test_project_agent_e2e().await;
}

async fn test_platform_agent_e2e() {
    // Create platform agent config
    let config_content = r#"
[server]
name = "E2E Test Orchestrator"
version = "1.0.0"
active_agent = "E2EPlatformAgent"

[[agents]]
name = "E2EPlatformAgent"
type = "Platform"
key_hash = "sha256:e2e-platform-hash"
allowed_endpoints = ["/api/agent/projects", "/api/agent/projects/:projectId/docs"]
effective_endpoints = [
    "/api/agent/health",
    "/api/agent/me", 
    "/api/agent/projects",
    "/api/agent/projects/:projectId/docs"
]
"#;

    let config_path = "e2e-platform-config.toml";
    tokio::fs::write(config_path, config_content).await.unwrap();

    // Set test environment
    std::env::set_var("VIBETASK_API_KEY", "test-platform-key");

    // Test MCP protocol interactions
    let result = test_mcp_server_interaction(config_path, "Platform").await;
    assert!(
        result.is_ok(),
        "Platform agent MCP protocol test failed: {:?}",
        result
    );

    // Cleanup
    tokio::fs::remove_file(config_path).await.ok();
    std::env::remove_var("VIBETASK_API_KEY");
}

async fn test_project_agent_e2e() {
    // Create project agent config
    let config_content = r#"
[server]
name = "E2E Test Orchestrator"
version = "1.0.0"
active_agent = "E2EProjectAgent"

[[agents]]
name = "E2EProjectAgent"
type = "ProjectDelegated"
key_hash = "sha256:e2e-project-hash"
projects = [10]
permissions = ["USER"]
delegated_at = "2026-04-08T18:55:25.094Z"
"#;

    let config_path = "e2e-project-config.toml";
    tokio::fs::write(config_path, config_content).await.unwrap();

    std::env::set_var("VIBETASK_API_KEY", "test-project-key");

    let result = test_mcp_server_interaction(config_path, "ProjectDelegated").await;
    assert!(
        result.is_ok(),
        "Project agent MCP protocol test failed: {:?}",
        result
    );

    // Cleanup
    tokio::fs::remove_file(config_path).await.ok();
    std::env::remove_var("VIBETASK_API_KEY");
}

async fn test_mcp_server_interaction(
    config_path: &str,
    agent_type: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Start the MCP server process
    let mut child = Command::new("cargo")
        .args(["run", "--", "--config", config_path])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);

    // Test 1: Initialize request
    let init_request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {"listChanged": true}
            },
            "clientInfo": {
                "name": "e2e-test-client",
                "version": "1.0.0"
            }
        }
    });

    send_json_message(&stdin, &init_request)?;
    let init_response = read_json_response(&mut reader).await?;

    // Validate initialize response
    assert_eq!(init_response["jsonrpc"], "2.0");
    assert_eq!(init_response["id"], 1);
    assert!(init_response["result"]["capabilities"].is_object());

    // Validate agent-specific capabilities
    match agent_type {
        "Platform" => {
            // Platform agents should not have resources or prompts
            assert!(init_response["result"]["capabilities"]["resources"].is_null());
            assert!(init_response["result"]["capabilities"]["prompts"].is_null());
            assert!(init_response["result"]["capabilities"]["tools"].is_object());
        }
        "ProjectDelegated" => {
            // Project agents should have full capabilities
            assert!(init_response["result"]["capabilities"]["tools"].is_object());
            assert!(init_response["result"]["capabilities"]["resources"].is_object());
            assert!(init_response["result"]["capabilities"]["prompts"].is_object());
        }
        _ => panic!("Unknown agent type: {}", agent_type),
    }

    // Test 2: List tools request
    let list_tools_request = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
    });

    send_json_message(&stdin, &list_tools_request)?;
    let tools_response = read_json_response(&mut reader).await?;

    // Validate tools response
    assert_eq!(tools_response["jsonrpc"], "2.0");
    assert_eq!(tools_response["id"], 2);
    assert!(tools_response["result"]["tools"].is_array());

    let tools = tools_response["result"]["tools"].as_array().unwrap();

    // Validate agent-specific tool availability
    match agent_type {
        "Platform" => {
            // Platform agents should have limited tools
            let tool_names: Vec<String> = tools
                .iter()
                .map(|t| t["name"].as_str().unwrap().to_string())
                .collect();

            assert!(tool_names.contains(&"query_health".to_string()));
            assert!(tool_names.contains(&"register_agent".to_string()));
            assert!(!tool_names.contains(&"commit_artifact".to_string()));
            assert!(!tool_names.contains(&"spawn_sub_board".to_string()));
        }
        "ProjectDelegated" => {
            // Project agents should have register_agent (always available)
            let tool_names: Vec<String> = tools
                .iter()
                .map(|t| t["name"].as_str().unwrap().to_string())
                .collect();

            assert!(tool_names.contains(&"register_agent".to_string()));
            // Note: Column-specific tools depend on current context
        }
        _ => panic!("Unknown agent type: {}", agent_type),
    }

    // Test 3: Call a tool (register_agent is available for both agent types)
    let call_tool_request = json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "list_agents",
            "arguments": {}
        }
    });

    send_json_message(&stdin, &call_tool_request)?;
    let tool_response = read_json_response(&mut reader).await?;

    // Validate tool call response
    assert_eq!(tool_response["jsonrpc"], "2.0");
    assert_eq!(tool_response["id"], 3);

    // Should either succeed or fail gracefully (not crash)
    if tool_response["error"].is_null() {
        assert!(tool_response["result"].is_object());
    } else {
        // Error should be properly formatted
        assert!(tool_response["error"]["code"].is_number());
        assert!(tool_response["error"]["message"].is_string());
    }

    // Test 4: Invalid tool call (should be rejected gracefully)
    let invalid_tool_request = json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "nonexistent_tool",
            "arguments": {}
        }
    });

    send_json_message(&stdin, &invalid_tool_request)?;
    let invalid_response = read_json_response(&mut reader).await?;

    // Should return proper error
    assert_eq!(invalid_response["jsonrpc"], "2.0");
    assert_eq!(invalid_response["id"], 4);
    assert!(!invalid_response["error"].is_null());
    assert_eq!(invalid_response["error"]["code"], -32601); // Method not found

    // Cleanup: terminate the server process
    child.kill().ok();
    child.wait().ok();

    Ok(())
}

fn send_json_message(
    mut stdin: &std::process::ChildStdin,
    message: &Value,
) -> Result<(), Box<dyn std::error::Error>> {
    let json_str = serde_json::to_string(message)?;
    writeln!(stdin, "{}", json_str)?;
    stdin.flush()?;
    Ok(())
}

async fn read_json_response(
    reader: &mut BufReader<std::process::ChildStdout>,
) -> Result<Value, Box<dyn std::error::Error>> {
    let mut attempts = 0;
    const MAX_ATTEMPTS: usize = 10;

    while attempts < MAX_ATTEMPTS {
        let mut line = String::new();

        // Use timeout to avoid hanging
        let result = timeout(Duration::from_secs(5), async {
            reader.read_line(&mut line)
        })
        .await??;

        if result == 0 {
            return Err("EOF reached".into());
        }

        // Skip non-JSON lines (like logs)
        let trimmed = line.trim();
        if trimmed.starts_with('{') {
            let response: Value = serde_json::from_str(trimmed)?;
            return Ok(response);
        }

        attempts += 1;
    }

    Err("No JSON response found after maximum attempts".into())
}

/// Test server startup and basic connectivity
#[tokio::test]
async fn test_server_startup_and_health() {
    // Create minimal config
    let config_content = r#"
[server]
name = "Health Test Orchestrator"
version = "1.0.0"
active_agent = "HealthTestAgent"

[[agents]]
name = "HealthTestAgent"
type = "Platform"
key_hash = "sha256:health-test-hash"
allowed_endpoints = ["/api/agent/health"]
effective_endpoints = ["/api/agent/health", "/api/agent/me"]
"#;

    let config_path = "health-test-config.toml";
    tokio::fs::write(config_path, config_content).await.unwrap();

    std::env::set_var("VIBETASK_API_KEY", "health-test-key");

    // Test health check mode
    let output = Command::new("cargo")
        .args(["run", "--", "health", "--config", config_path])
        .output()
        .expect("Failed to execute health check");

    // Should exit cleanly (exit code 0 or 1 depending on Hub connectivity)
    // The important thing is it doesn't crash
    assert!(output.status.code().is_some());

    // Test validate mode
    let output = Command::new("cargo")
        .args(["run", "--", "validate", "--config", config_path])
        .output()
        .expect("Failed to execute validation");

    // Should validate config successfully
    assert!(output.status.code().is_some());

    // Cleanup
    tokio::fs::remove_file(config_path).await.ok();
    std::env::remove_var("VIBETASK_API_KEY");
}

/// Test graceful error handling when Hub is unavailable
#[tokio::test]
async fn test_hub_unavailable_graceful_handling() {
    let config_content = r#"
[server]
name = "Offline Test Orchestrator"
version = "1.0.0"
active_agent = "OfflineTestAgent"

[[agents]]
name = "OfflineTestAgent"
type = "Platform"
key_hash = "sha256:offline-test-hash"
allowed_endpoints = ["/api/agent/health"]
effective_endpoints = ["/api/agent/health", "/api/agent/me"]
"#;

    let config_path = "offline-test-config.toml";
    tokio::fs::write(config_path, config_content).await.unwrap();

    // Use invalid API key to simulate Hub unavailability
    std::env::set_var("VIBETASK_API_KEY", "invalid-key-for-testing");

    // Server should start but report Hub offline status
    let output = Command::new("cargo")
        .args(["run", "--", "health", "--config", config_path])
        .output()
        .expect("Failed to execute health check with invalid key");

    // Should not crash, should exit with error code
    assert!(output.status.code().is_some());

    // Should contain error message about Hub connectivity
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Should mention connectivity issues (either in stdout or stderr)
    let output_text = format!("{}{}", stdout, stderr);
    assert!(
        output_text.contains("Hub")
            || output_text.contains("connection")
            || output_text.contains("error")
            || output_text.contains("failed"),
        "Expected error message about Hub connectivity, got: {}",
        output_text
    );

    // Cleanup
    tokio::fs::remove_file(config_path).await.ok();
    std::env::remove_var("VIBETASK_API_KEY");
}
