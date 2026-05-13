# VibeTask MCP Orchestrator

Stateless Rust MCP sidecar for intelligent Kanban workflows with dual-agent architecture.

## Quick Start

```bash
# Build the project
cargo build --release

# Run with default config
./target/release/vibetask-mcp

# Run with custom config
./target/release/vibetask-mcp --config ../../config/demo-config.toml

# Health check
./target/release/vibetask-mcp health

# Validate configuration
./target/release/vibetask-mcp validate --config ../../config/demo-config.toml
```

## Agent Types

### Platform Agents (Read-Only)
- System integration and monitoring
- Configurable endpoint permissions
- Cannot perform write operations
- Perfect for external system integration

### Project Agents (Full Workflow)
- Complete Kanban workflow participation
- Column-specific tool availability
- Project delegation support
- Full read/write permissions

## Directory Structure

```
vibetask-mcp/
├── src/                    # Source code
├── tests/                  # Integration and unit tests
├── scripts/                # Development and testing scripts
│   ├── test_mcp_protocol.sh
│   └── test_server.sh
├── examples/               # Example environment files
│   └── .env.*             # Agent key examples
└── README.md              # This file

workspace-root/
└── config/                 # Shared MCP/CLI configurations
    ├── vibe-mcp.toml
    ├── demo-config.toml
    └── functional-live-config.toml
```

## Configuration

Create a shared config file at `config/vibe-mcp.toml`:

```toml
[server]
name = "Vibe Orchestrator"
version = "1.0.0"
active_agent = "YourAgent"

[[agents]]
name = "YourAgent"
type = "ProjectDelegated"  # or "Platform"
key_hash = "sha256:..."
projects = [10]
permissions = ["USER"]
```

## Development

```bash
# Run tests
cargo test

# Run with development config
cargo run -- --config ../../config/demo-config.toml

# Test MCP protocol
./scripts/test_mcp_protocol.sh
```

## Security

- Agent keys are SHA-256 hashed in configuration
- Actual keys stored securely (keyring in production, .env in development)
- Tool filtering enforced at MCP protocol level
- No privilege escalation possible

### Security Audit

Run security audit (ignoring known acceptable advisories):

```bash
cargo audit --ignore RUSTSEC-2025-0134 --ignore RUSTSEC-2026-0097
```

See `audit.toml` for details on ignored advisories and mitigation strategies.

## Architecture

The orchestrator implements a dual-agent architecture:

1. **Agent Type Detection**: Automatically detects agent capabilities via Hub API
2. **Dynamic Tool Registration**: Tools available based on agent type and column context
3. **Fault Isolation**: Graceful degradation when Hub unavailable
4. **Token Budget Management**: Intelligent context assembly with Constitution fidelity

For detailed architecture information, see the design documents in `.kiro/specs/`.