# Development Guide

This guide covers development setup and workflow for the VibeTasks multi-crate workspace.

## Prerequisites

- **Rust**: Install via [rustup](https://rustup.rs/)
- **Pre-commit**: Install via `pip install pre-commit` or your package manager
- **Make**: For running development commands (optional but recommended)

### Cargo and `ARGV0` (Cursor / integrated terminals)

Some shells export **`ARGV0`** as the name of the program that launched the shell (for example a Cursor shim). Rustup’s Cargo front-end can then treat that name as a **rustup proxy** and fail with:

`error: unknown proxy name: 'cursor'`

**What to do:** before running Cargo yourself in that terminal, run `unset ARGV0` once (or prefix the command: `unset ARGV0 && cargo …`). This repo’s **`Makefile`** and **pre-commit** hooks already clear `ARGV0` for you via `unset ARGV0 && cargo` / `env -u ARGV0 cargo`, so `make check` and commits from the same environment should work without remembering the workaround.

## Quick Setup

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd VibeTasks
   make dev-setup
   ```

2. **Run checks**:
   ```bash
   make check
   ```

## Development Workflow

### Code Quality

The project enforces strict code quality standards:

- **Formatting**: `cargo fmt --all --check` (use `unset ARGV0 && …` if you hit the proxy error above; `make fmt` handles it)
- **Linting**: `cargo clippy --all-targets --all-features -- -D warnings`
- **Testing**: `cargo test --all-features`
- **Security**: `cargo audit`

### Pre-commit Hooks

Pre-commit hooks automatically run quality checks before each commit:

```bash
# Install hooks (done automatically by make dev-setup)
pre-commit install

# Run hooks manually
pre-commit run --all-files
```

### Available Commands

Use `make help` to see all available commands:

```bash
# Development
make fmt          # Format code
make clippy       # Run lints
make test         # Run tests
make audit        # Security audit
make check        # Run all checks

# Build
make build        # Debug build
make release      # Release build
make doc          # Generate docs

# Setup
make install-hooks    # Install pre-commit hooks
make dev-setup       # Full development setup
```

### Testing

The project uses comprehensive testing:

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_name

# Run tests in specific module
cargo test config::tests
```

### Security

Security is a top priority:

1. **Dependency Auditing**: `cargo audit` checks for known vulnerabilities
2. **License Compliance**: `cargo deny` ensures license compatibility
3. **Secure Key Storage**: Uses keyring in production, .env files in development

### Workspace Crates

- `crates/vibetask-core`
- `crates/vibetask-app`
- `crates/vibetask-hub-client`
- `crates/vibetask-tool-catalog`
- `crates/vibetask-mcp`
- `crates/vibetask-cli`

### Hub API contract (OpenAPI snapshot)

The workspace keeps a **checked-in copy** of the Kanban backend OpenAPI document at:

- `KanbanAPI/openapi.json`

When the backend team publishes an updated contract, replace that file and treat the diff as the source of truth for client behavior.

**Review the diff locally**

```bash
# Recent commits touching the spec
git log --oneline -5 -- KanbanAPI/openapi.json

# Diff against the previous revision (pick a base commit or use HEAD~1 after committing the update)
git diff HEAD~1 -- KanbanAPI/openapi.json

# Sanity: valid JSON
python3 -m json.tool KanbanAPI/openapi.json > /dev/null && echo OK
```

**Sync from Kanban-rewrite (sibling checkout)**

When the backend contract changes, copy the published spec into this workspace and re-check any hand-maintained Rust mirrors (for example `crates/vibetask-hub-client/src/generated_types.rs` when `GET /api/agent/me` delegations gain fields such as `delegationMode` or `columnAllowance`):

```bash
cp ../Kanban-rewrite/src/openapi.json KanbanAPI/openapi.json
python3 -m json.tool KanbanAPI/openapi.json > /dev/null && echo OK
```

**Local-only notes:** draft contract reviews or internal bug reports can live under `docs/project/` (see `docs/README.md`; that directory is gitignored and is not part of the published tree).

**Inline JIT documents on agent task GET (`TaskDocumentLink.document`)**

The OpenAPI spec now documents the nested `document` object on `TaskDocumentLink` when `?inline=true` (fields such as `title`, `docType`, `content`, `version`). The hub client maps those into `ProjectDocument` for tool output; treat `KanbanAPI/openapi.json` as the contract for this behavior.

**Progenitor (`progenitor = "0.8"`, workspace-pinned)**

The workspace already depends on Progenitor for potential OpenAPI-driven client generation, but the MCP crate’s `build.rs` still emits a hand-maintained types path. Once `KanbanAPI/openapi.json` stays stable, consider switching generation on and deleting redundant hand-rolled types where they overlap.

### CLI lattice helpers (`vibetask-cli`)

Board-column affinity is enforced in the tool registry. For ad-hoc runs, prefer the catalog helpers over guessing JSON:

```bash
# See where a tool is allowed (platform vs columns)
vibetask-cli --config config/vibe-mcp.toml tools describe reflect_on_work

# Invoke any tool with JSON args (column context is optional but recommended)
vibetask-cli --config config/vibe-mcp.toml tools call reflect_on_work \
  --args-json '{"task_id":"10-101","work_summary":"…","files_touched":[],"integrity_check":{"requirements_met":true,"tests_passing":true,"code_quality_ok":true,"documentation_complete":true,"no_breaking_changes":true,"security_validated":true}}'

# Dedicated move command: runs delegation/lattice precheck, then PATCH column move
vibetask-cli --config config/vibe-mcp.toml task move 10 101 55
```

`task approve` maps to `approve_completion`; it requires `--confirm-integrity-passed true|false` so Verify-column approvals cannot skip the integrity gate by omission.

**Hub column moves (GateKeeper / auditor flows):** the HTTP contract for `PATCH /api/agent/projects/{projectId}/tasks/{taskId}` with body `{"columnId":…}` is documented for humans in `Kanban-frontend/docs/GATEKEEPER_PROTOCOL_TESTS.md`. The Rust hub client exposes the same call as `VibeTaskClient::update_agent_task_column` (used by future CLI/MCP task-move helpers).

### CLI search + output formats

`vibetask-cli` now supports a unified search subtree and multi-format rendering:

```bash
# New global output formatter
vibetask-cli -f json search tasks "status:OPEN assignee:alice"
vibetask-cli -f comfy search all "authentication bug" --global
vibetask-cli -f md search docs "oauth callback" --project-id 10
```

- `search tasks` uses **`GET /api/agent/search`** (`q`, `page`, `limit`) with `x-agent-api-key`. The Hub searches across delegated projects; when `--project-id` is set (non-`--global`), the CLI filters results client-side by `projectId`.
- Human/JWT search lives at **`GET /api/search`** (not used by `vibetask-cli` today).
- `search docs` uses semantic lookup over delegated project docs (`query_similar_documents` behavior).
- `search projects` filters delegated boards by prefix/name.
- `search all` aggregates projects/tasks/documents into a single payload (`{ projects, tasks, documents }` in JSON mode).
- Scoping defaults to a single delegated project when unambiguous; otherwise pass `--project-id` or `--global`.

### CLI help tree (`--help-tree`)

`vibetask-cli` can dump its command hierarchy using clap reflection (no duplicated string maps):

```bash
vibetask-cli --help-tree
vibetask-cli --help-tree --tree-depth 2
vibetask-cli --help-tree --tree-ignore tools --tree-output json
```

Note: `--tree-output text|json` is separate from `-f/--format` (which controls normal command output: `json|comfy|md`).

When `tools list` runs in a TTY, promoted commands that now have first-class CLI entrypoints (`query_tasks`, `query_projects`) are hidden from the default catalog output to reduce noise.

### Phase-1 telemetry (CLI + MCP, DB-ready shape)

Both `vibetask-cli` and `vibetask-mcp` now emit event-level telemetry (no payload bodies, no secrets) to a local JSONL file plus a small rolling metrics snapshot.

- `VIBETASK_TELEMETRY_PATH` (default `./vibetask_logs/telemetry-events.jsonl`)
- `VIBETASK_TELEMETRY_METRICS_PATH` (default `./vibetask_logs/telemetry-metrics.json`)

Event schema intentionally matches a future batch-ingest API shape (`POST /api/telemetry/events`): `command`, `toolName`, `agentType`, `projectId`, `taskId`, `durationMs`, `success`, `errorClass`, `timestamp`.

### Configuration

The project uses TOML configuration with atomic writes:

```toml
[server]
name = "Vibe Orchestrator"
active_agent = "AgentName"
hub_url = "http://localhost:3000" # Optional: falls back to VIBETASK_HUB_URL/default

[[agents]]
name = "AgentName"
type = "Platform"  # or "ProjectDelegated"
key_hash = "sha256:..."
```

### Key Management

**Development**: Keys stored in `.env.{agent_name}` files:
```bash
# .env.agentsmith
VIBETASK_API_KEY=your-api-key-here
```

**Production**: Keys stored securely in system keyring.

## Architecture

The project follows a modular architecture:

- `config.rs`: Configuration management with validation
- `atomic_writer.rs`: Atomic file operations and key management
- `error.rs`: Comprehensive error handling
- `main.rs`: CLI entry point

## CI/CD

GitHub Actions runs:

1. **Test Suite**: Tests on stable, beta, and nightly Rust
2. **Security Audit**: Dependency and license checks
3. **Code Coverage**: Coverage reporting via Codecov
4. **Multi-platform Build**: Linux, Windows, macOS
5. **Documentation**: Doc generation and link checking

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Run** `make check` to ensure quality
5. **Commit** with descriptive messages
6. **Push** and create a pull request

### Commit Messages

Use conventional commits:

```
feat: add agent type detection
fix: resolve configuration validation bug
docs: update development guide
test: add atomic writer tests
```

### Code Style

- Follow Rust standard formatting (`cargo fmt`)
- Use descriptive variable names
- Add comprehensive tests for new functionality
- Document public APIs with doc comments
- Handle errors explicitly (no `unwrap()` in production code)

## Troubleshooting

### Common Issues

1. **Pre-commit hooks failing**:
   ```bash
   # Fix formatting
   cargo fmt --all
   
   # Fix clippy warnings
   cargo clippy --fix --all-targets --all-features
   ```

2. **Tests failing**:
   ```bash
   # Run with backtrace
   RUST_BACKTRACE=1 cargo test
   ```

3. **Dependency issues**:
   ```bash
   # Update dependencies
   cargo update
   
   # Check for security issues
   cargo audit
   ```

### Getting Help

- Check existing issues in the repository
- Run `make help` for available commands
- Review the test suite for usage examples
- Check the CI logs for detailed error information