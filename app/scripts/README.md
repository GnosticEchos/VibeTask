# CLI integration test scripts

Bash scripts that exercise **vibetask-cli** against a running hub (local or CI). They are intended for developers and power users validating agent workflows—not for production automation without review.

## Prerequisites

1. **Hub** running (default `http://localhost:3000`).
2. **Release CLI** built:
   ```bash
   cd app
   unset ARGV0
   cargo build -p vibetask-cli --release
   ```
3. **Config** at `app/config/vibe-cli.toml` with your agents roster.
4. **API keys** in `app/.env.<agentname>` (lowercase), e.g. `.env.agentsmith`, `.env.mcptesting`, `.env.gatekeeper3`:
   ```bash
   VIBETASK_API_KEY=your-key-here
   ```
   See [DEVELOPMENT.md — Known issues](../DEVELOPMENT.md#known-issues) if the OS keyring fails on Linux/Cursor.
5. **Platform session** for delegated writes: scripts call `vibetask-cli agent session --name McpTesting --force`, which stores a short-lived JWT under `[platform]` in your config file. Do not commit that section.

Optional: `jq` and `curl` (used by the multi-agent script to post review comments).

## Scripts

| Script | Purpose |
|--------|---------|
| [`cli-agentsmith-functional-cycle.sh`](cli-agentsmith-functional-cycle.sh) | Single-agent smoke: most CLI subcommands as **AgentSmith** on project **10** (Spec Task Board). |
| [`cli-multi-agent-live-cycle.sh`](cli-multi-agent-live-cycle.sh) | Three personas: **McpTesting** (platform reads), **AgentSmith** (full workflow), **GateKeeper3** (Verify column). Posts agent comments on touched tasks for UI review. |

### AgentSmith functional cycle

```bash
cd app
unset ARGV0
bash scripts/cli-agentsmith-functional-cycle.sh
```

- Log: `app/cli-agentsmith-functional-cycle.log`
- Uses column/task constants at the top of the script (project `10`, Plan `52`, Execute `53`, etc.). Adjust if your board differs.
- Skips `agent enlist` (needs a live key interactively).

Exit code `0` when all non-skipped steps pass.

### Multi-agent live cycle

```bash
cd app
unset ARGV0
bash scripts/cli-multi-agent-live-cycle.sh
```

- Log: `app/cli-multi-agent-live-cycle.log`
- Enlists **GateKeeper3** from `.env.gatekeeper3` if not already in `vibe-cli.toml`.
- **McpTesting**: platform tools only; `project state` / `overview` are skipped (403 without project delegation—expected).
- **AgentSmith** / **GateKeeper3**: create task, move columns, workflow commands, HTTP comments on tasks.
- After the run, open **project 10** in the UI and check comments on tasks touched (see script summary line).

Environment overrides:

| Variable | Default |
|----------|---------|
| `VIBETASK_HUB_URL` | `http://localhost:3000` |

## Task IDs used by the scripts

Scripts use **numeric database IDs** in CLI flags (`task move 10 193 53`). The web UI shows **identifiers** such as `SPEC-71`.

| Concept | Example | Used by |
|---------|---------|---------|
| Project id | `10` | `project tasks 10`, API paths |
| Task id (PK) | `193` | `task move`, `task update-progress`, agent API |
| Identifier (display) | `SPEC-71` | Board cards, task dialog badge |
| Compound id | `10-152` | Verify-only CLI/MCP tools (`reflect`, `approve`, `reject`) — means project `10`, task id `152` |

See [Agent IDs, task IDs, and the UI](../../docs/user/agent-ids-and-cli.md) for how to map between them.

## Related docs

- [DEVELOPMENT.md](../DEVELOPMENT.md) — build, keyring, `vibetask-cli` usage
- [docs/user/agents.md](../../docs/user/agents.md) — platform vs delegate agents
- [docs/user/agent-ids-and-cli.md](../../docs/user/agent-ids-and-cli.md) — identifier vs API id
