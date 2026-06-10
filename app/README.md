# VibeTask App

Rust workspace for VibeTask agent orchestration: MCP and CLI adapters over shared application and domain crates. Part of the [VibeTask monorepo](../README.md).

## Features

- **Dual-Agent Architecture**: Platform Agents (read-only) and Project Agents (full workflow)
- **Secure Key Management**: SHA-256 hashing with keyring integration
- **Atomic Configuration**: TOML configuration with atomic writes and backup
- **Pre-commit Hooks**: Automated code quality checks
- **Comprehensive Testing**: Unit tests with 100% coverage goals

## Quick Start

1. **Install Rust** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Clone and build** (from monorepo root):
   ```bash
   git clone https://github.com/GnosticEchos/VibeTask.git
   cd VibeTask/app
   cargo build --release
   ```

3. **Set up configuration**:
   ```bash
   cp config/vibe-mcp.toml config/local-vibe-mcp.toml
   # Edit config/local-vibe-mcp.toml with your agent keys
   ```

4. **Run the orchestrator**:
   ```bash
   ./target/release/vibetask-mcp --config config/local-vibe-mcp.toml
   ```

## Workspace Layout

- `crates/vibetask-core`: domain models and invariants
- `crates/vibetask-app`: application commands/queries and orchestration
- `crates/vibetask-hub-client`: HTTP client, retries, circuit breaker
- `crates/vibetask-tool-catalog`: shared tool ids and column mappings
- `crates/vibetask-mcp`: MCP adapter
- `crates/vibetask-cli`: CLI adapter
- `config/`: shared MCP/CLI configuration files

## Configuration

The orchestrator uses TOML configuration with dual-agent support:

```toml
[server]
name = "Vibe Orchestrator"
active_agent = "MyAgent"
hub_url = "http://localhost:3000" # Optional: falls back to VIBETASK_HUB_URL/default

[[agents]]
name = "MyAgent"
type = "Platform"  # or "ProjectDelegated"
key_hash = "sha256:..."
```

### Agent Types

- **Platform Agents**: Read-only system integration with configurable endpoint access
- **Project Agents**: Full workflow participation with project delegations

### Key Management

- **Development**: Keys stored in `.env.{agent_name}` files
- **Production**: Keys stored securely in system keyring

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development setup and workflow.

### CLI smoke scripts

See [scripts/README.md](scripts/README.md) for `cli-agentsmith-functional-cycle.sh` and `cli-multi-agent-live-cycle.sh` (hub must be running).

### Quick Development Setup

```bash
make dev-setup  # Install hooks and tools
make check      # Run all quality checks
make test       # Run tests
```

## Architecture

The project follows a balanced six-crate architecture where MCP and CLI are thin adapters that share business logic through `vibetask-app` and `vibetask-core`.

## Security

- **Key Hashing**: SHA-256 hashing for secure key storage
- **Atomic Writes**: Configuration changes are atomic and safe
- **Dependency Auditing**: Regular security audits via `cargo audit`
- **License Compliance**: Automated license checking

## CI/CD

GitHub Actions provides:
- Multi-platform testing (Linux, Windows, macOS)
- Security auditing and dependency checks
- Code coverage reporting
- Documentation generation

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `make check` to ensure quality
5. Submit a pull request

## Support

- Check the [Issues](../../issues) for known problems
- Review [DEVELOPMENT.md](DEVELOPMENT.md) for troubleshooting
- Run `make help` for available commands