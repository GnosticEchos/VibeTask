# Working with AI agents

## Concepts

- **Agent** — An API identity tied to your user account (not a human login). In Settings you create **delegate agents**—one per tool or workload you want to control separately.
- **API key** — Secret the agent uses to call VibeTask; shown only at create or regenerate time.
- **Delegation** — Links a delegate agent to a project with `VIEWER` or `USER` permission.
- **Platform agent** — A deployment-level identity (usually on the machine running your MCP or CLI). Only a platform agent can obtain a **platform session** JWT. Delegate agents must use that session for write operations, so your Kanban administrator can see which remote deployment authorized the work.
- **Platform session** — Short-lived token from `POST /api/agent/session`, sent as `x-platform-session` on mutating agent API calls. Project delegate agents cannot change tasks without a valid session from an enabled platform agent.

## Why two layers?

VibeTask separates **who may run automation** (platform agent, controlled by admin) from **which projects an automation may touch** (delegate agents and delegations, controlled by you in the UI).

That gives you:

- **Admin gate** — System administrators provision platform agents and which hub endpoints they may read. A remote MCP host must authenticate as a platform agent before it can mint sessions for delegate agents.
- **Traceability** — Write traffic from a delegate agent is tied to the platform session that authorized it, so activity can be traced back to a specific deployment.
- **Blast-radius control** — Create **multiple delegate agents** (for example one per Cursor workspace, one per CI job, one per experiment). If one agent misbehaves, disable or revoke that agent’s key and delegations without stopping your other delegates.

## Typical setup

### For you (project owner)

1. In **Settings → Agents**, create a **delegate agent** for each separate automation you want to isolate. Give each a clear name (for example `cursor-main`, `nightly-review`).
2. **Delegate** each agent only to the projects it should see, with `VIEWER` or `USER` permission.
3. Store each API key in the tool that will use it. Do not reuse one key across unrelated automations if you want clean shutdown of a single runaway agent.

The first delegation to a project may create an **Agent Review** column for human review of agent work.

### For your deployment (MCP / CLI)

1. A **platform agent** is created by a VibeTask **administrator** (Settings → Administration → platform agents). That key lives on the host where **VibeTask MCP** or the CLI runs—not in every end-user’s browser session.
2. On startup, the platform agent calls the hub to create a **platform session** JWT.
3. The **delegate agent** key (from Settings) is configured in the same MCP or CLI config. Mutating requests send both the delegate API key and the current `x-platform-session` header.
4. Prefer the **VibeTask MCP** server (`vibetask-mcp` in the monorepo `app/` package) so tooling matches the hub contract. Point it at your hub URL and the correct TOML config for platform + delegate agents.

Read-only agent traffic (GET) does not require a platform session; creating or updating tasks, comments, documents, and similar actions does.

## Permissions

| Level | Can |
|-------|-----|
| **VIEWER** | View project, tasks, columns, members |
| **USER** | Create/update/delete tasks, add comments |

Owners and maintainers manage delegations in the UI. Agents cannot grant themselves access. Administrators manage platform agents separately from your delegate agents.

## If something goes wrong

| Symptom | What to check |
|---------|----------------|
| **403 Platform session required** | MCP/CLI must refresh the session via the platform agent; delegate key alone is not enough for writes. |
| **403 Platform agent …** | Platform agent disabled, expired, or revoked by admin. |
| Agent works on one project but not another | Delegation missing or wrong permission level for that project. |
| One automation is off-task | Disable that **delegate agent** or remove its delegations; leave other delegate agents running. |

## Security tips

- Treat API keys like passwords; rotate if leaked (**Regenerate key** in agent settings).
- Use **one delegate agent per automation** when you need independent kill switches.
- Revoke delegations when an agent should no longer access a project.
- Do not commit keys to git or paste them into chat.

Developer reference: [`app/README.md`](../../app/README.md) (MCP/CLI), [`hub/docs/REST_API_DOCUMENTATION.md`](../../hub/docs/REST_API_DOCUMENTATION.md) (agent API).
