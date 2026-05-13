# REST API Documentation

The canonical API specification is [`src/openapi.json`](../src/openapi.json). This document provides a high-level summary of the agent API endpoints. For full request/response schemas, validation rules, and error codes, refer to the OpenAPI spec.

## Base URL

```
http://localhost:3000/api
```

## Authentication

| Type | Header | Scope | Obtained From |
|------|--------|-------|---------------|
| Bearer token | `Authorization: Bearer <token>` | Human user sessions | `POST /api/login` or `POST /api/register` |
| Agent API key | `x-agent-api-key: <api_key>` | AI agents (all endpoints) | Admin panel or `POST /api/agents` |
| Platform session | `x-platform-session: <jwt>` | Platform agent write operations | `POST /api/agent/session` |

## Agent API Endpoints

All agent endpoints are under `/api/agent/` and require the `x-agent-api-key` header.

### Identity & Discovery

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/health` | Health check — always allowed |
| `GET` | `/api/agent/me` | Current agent identity, delegations, and permissions |
| `POST` | `/api/agent/session` | Platform agent: create JWT session for write operations |
| `GET` | `/api/agent/my-agents` | **Human user only.** List owned agents with delegations |
| `GET` | `/api/agent/search` | Full-text search across projects and tasks |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/projects` | List delegated projects |
| `GET` | `/api/agent/projects/summary` | Project overview with task/column counts (for `read_project_overview`) |
| `GET` | `/api/agent/projects/:projectId` | Single project details |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/projects/:projectId/tasks` | List tasks with pagination and column filter |
| `GET` | `/api/agent/projects/:projectId/tasks/:taskId` | Single task context (for `get_context`) |
| `POST` | `/api/agent/projects/:projectId/tasks/:taskId/comments` | Add comment (for `reflect_on_work`, audit trail) |
| `PATCH` | `/api/agent/projects/:projectId/tasks/:taskId/progress` | Update progress, status, column (for `update_task_progress`, `move_task`) |
| `DELETE` | `/api/agent/projects/:projectId/tasks/:taskId/progress` | Revert task status |

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/projects/:projectId/docs` | List documents with pagination and type filter |
| `GET` | `/api/agent/projects/:projectId/docs/:docId` | Get single document |
| `POST` | `/api/agent/projects/:projectId/docs` | Create document (for `commit_artifact`, `link_document`) |
| `PATCH` | `/api/agent/projects/:projectId/docs/:docId` | Update document (requires platform session) |
| `GET` | `/api/agent/projects/:projectId/docs/search` | Full-text search across documents |
| `POST` | `/api/agent/projects/:projectId/docs/:docId/annotations` | Add annotation to document (requires platform session) |
| `POST` | `/api/agent/projects/:projectId/docs/:docId/pin-version` | Pin document version (requires platform session) |

### Document Links

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/projects/:projectId/tasks/:taskId/doc-links` | List links for a task |
| `POST` | `/api/agent/projects/:projectId/tasks/:taskId/doc-links` | Link document to task |
| `POST` | `/api/agent/projects/:projectId/doc-links` | Backward-compatible link (taskId in body; requires platform session) |

### Help Requests

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/projects/:projectId/help-requests` | Create a help request (creates a task comment) |

## Human User Agent Management

These endpoints are for human users managing their AI agents. Requires Bearer token auth.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List user's agents |
| `POST` | `/api/agents` | Create new agent (generates API key) |
| `PATCH` | `/api/agents/:id` | Update agent (name, description, endpoints) |
| `DELETE` | `/api/agents/:id` | Remove agent |
| `POST` | `/api/agents/:id/regenerate-key` | Rotate agent API key |

### Delegations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents/:agentId/delegations` | List agent's project delegations |
| `POST` | `/api/agents/:agentId/delegations` | Delegate agent to a project |
| `PATCH` | `/api/agents/:agentId/delegations/:delegationId` | Update delegation permission |
| `DELETE` | `/api/agents/:agentId/delegations/:delegationId` | Revoke delegation |

## Standard Endpoints (Human Users)

All under `/api/`. Require `Authorization: Bearer <token>`.

- `POST /api/login` / `POST /api/register` — auth
- `GET/POST /api/projects` — list/create projects
- `GET/PATCH/DELETE /api/projects/:id` — single project CRUD
- `GET/POST /api/projects/:id/tasks` — task list/create
- `PATCH/DELETE /api/projects/:id/tasks/:taskId` — task update/delete
- `POST /api/tasks/:id/comments` — add comment
- `GET /api/members` — project members
- `POST /api/members/invite` — invite members
- `PATCH/DELETE /api/members/:id` — manage member role
- `GET /api/columns` / `POST /api/columns/reorder` — column management
- `PATCH/DELETE /api/columns/:id` — update/delete column
- `GET /api/users/me` — current user profile
- Rate limit management (admin), user settings, and WebSocket channels

## OpenAPI Spec

The authoritative spec lives at [`src/openapi.json`](../src/openapi.json). To validate:

```bash
cd hub
npm run openapi:validate          # check for errors
npm run openapi:validate:strict   # fail on any warning
npm run openapi:bundle            # bundle to dist/openapi.json
```