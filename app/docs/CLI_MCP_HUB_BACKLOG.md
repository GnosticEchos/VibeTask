# CLI / MCP / hub-client backlog

This file is the **tracked** copy of the “still worth doing” workstream for the VibeTasks Rust workspace (`vibetask-cli`, `vibetask-mcp`, `vibetask-hub-client`, `vibetask-app`). A sibling copy may also exist under `docs/project/` for local-only notes (that directory is gitignored by default; see `docs/README.md`).

## Done in-tree (recent)

- **OpenAPI parity for agent delegations:** `Delegation` in `crates/vibetask-hub-client/src/generated_types.rs` now includes `delegationMode`, `restrictedColumnId`, `allowedMoveRange`, and nested `columnAllowance`, matching Kanban-rewrite `GET /api/agent/me` and OpenAPI `AgentDelegationWithProject` / `ColumnAllowance`.
- **Status / register UX:** `agent_status` and `register_agent` output include `Delegation::lattice_summary()` so column-bound agents surface allowance data in MCP and CLI.
- **Hub client column PATCH:** `VibeTaskClient::update_agent_task_column` implements `PATCH /api/agent/projects/{projectId}/tasks/{taskId}` with `{ "columnId": … }`, with a wiremock regression aligned to `Kanban-frontend/docs/GATEKEEPER_PROTOCOL_TESTS.md`.
- **Docs:** `DEVELOPMENT.md` documents OpenAPI sync from a sibling `Kanban-rewrite` checkout, CLI `tools describe` / `tools call` patterns (including `integrity_check` for `reflect_on_work` and `confirm_integrity_passed` for approve), and points to the GateKeeper curl contract.
- **Spider:** `scripts/vibe_spider.py` uses repo-relative paths and tighter verdict / ID harvesting heuristics.

## Still optional / follow-ups

- **Rich client-side lattice validation before PATCH:** would need column order from `GET /api/agent/projects/:id` (or task context) to mirror Hub lattice rules; not attempted here because anchor + `allowedMoveRange` alone are insufficient for full forward/back transitions.
- **First-class CLI subcommand for task column moves:** wrap `update_agent_task_column` when product wants human-facing `vibetask-cli project task move` (today the contract is documented + callable from Rust).
- **Deeper GateKeeper automation:** optional live HTTP integration tests behind `VIBETASK_GATEKEEPER_TEST=1` with fixture keys (never commit secrets).

## References

- Human curl contract: `Kanban-frontend/docs/GATEKEEPER_PROTOCOL_TESTS.md` (use placeholders such as `[GATEKEEPER_KEY]`, never real keys in docs).
- OpenAPI snapshot in this repo: `KanbanAPI/openapi.json`.
