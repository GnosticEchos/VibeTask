# Requirements Document: VibeTask Agent Orchestrator

## Introduction

The VibeTask Agent Orchestrator is a stateless Rust MCP sidecar that transforms Kanban boards into intelligent "Lattice" state machines. Agents adopt personas based on column position and collaborate through structured workflows with governance controls.

## Requirements

### Requirement 1 - Platform Agent Identity System

**User Story:** As a system administrator, I want to create Platform Agents with configurable read-only permissions, so that MCP servers can have their own identity for system integration without project-specific access.

#### Acceptance Criteria

1. WHEN an administrator creates a Platform Agent THEN the system SHALL set `isPlatformAgent: true` and `readOnly: true` in the agent metadata
2. WHEN a Platform Agent is created THEN it SHALL have default access to `alwaysAllowedReadEndpoints: ["/api/agent/health", "/api/agent/me"]`
3. WHEN configuring a Platform Agent THEN administrators SHALL be able to add `configuredReadEndpoints` from approved list: `["/api/agent/projects", "/api/agent/projects/:projectId/tasks", "/api/agent/projects/:projectId/tasks/:taskId", "/api/agent/projects/:projectId/docs"]`
4. WHEN a Platform Agent makes API calls THEN the system SHALL enforce `effectiveReadEndpoints` (combination of always allowed + configured)
5. WHEN the MCP server starts THEN it SHALL authenticate using its Platform Agent key and validate `isPlatformAgent: true` in the response

### Requirement 2 - Agent Key Management and Secure Storage

**User Story:** As an MCP server, I want to securely store and manage multiple agent keys with TOML configuration and dynamic registration, so that I can handle both Platform Agent identity and delegated project agents with proper verification.

#### Acceptance Criteria

1. WHEN starting the MCP server THEN it SHALL support `--config vibe-mcp.toml` flag for configuration file location with default fallback to `./vibe-mcp.toml`
2. WHEN storing agent keys THEN the system SHALL use SHA-256 hashing with secure storage in TOML format: `key_hash = "sha256:..."`
3. WHEN managing multiple agents THEN the TOML SHALL support `[[agents]]` array with `name`, `type`, `key_hash`, and detected permissions/projects
4. WHEN an `active_agent` is specified THEN the system SHALL use that agent's credentials for API calls and tool registration
5. WHEN providing `register_agent` tool THEN it SHALL verify new keys via `GET /api/agent/me`, extract permissions, hash the key, and update TOML config

**TOML Structure:**
```toml
[server]
name = "Vibe Orchestrator"
active_agent = "AgentSmith"

[[agents]]
name = "AgentSmith"
type = "ProjectDelegated"
key_hash = "sha256:..."
projects = [10]
permissions = ["USER"]

[[agents]]
name = "MCPTesting"
type = "Platform"
key_hash = "sha256:..."
allowed_endpoints = ["/api/agent/projects", "/api/agent/projects/:projectId/docs"]
```

### Requirement 3 - User Agent Delegation with Project Context

**User Story:** As a user, I want to prompt "Use AgentSmith to provide status of X project", so that I can get project information through specific project-assigned agents with full permissions.

#### Acceptance Criteria

1. WHEN a user requests agent delegation THEN the system SHALL parse agent name, lookup project agent key, and validate `delegations` array contains target project
2. WHEN using delegated agent identity THEN the system SHALL switch from Platform Agent key to project agent key for API calls
3. WHEN delegated agent has `permissionLevel: "USER"` THEN it SHALL have full read/write access to assigned projects
4. WHEN delegation target lacks project access THEN the system SHALL return error with available projects from `delegations` array
5. WHEN delegation is successful THEN responses SHALL include agent provenance: `"Using {agent.name} (delegated to {project.projectName})"`

### Requirement 4 - Platform Agent Status and Health Tools

**User Story:** As a Platform Agent, I want read-only tools that respect my configured endpoint permissions, so that I can provide system status without exceeding my access scope.

#### Acceptance Criteria

1. WHEN Platform Agent queries health THEN it SHALL use `GET /api/agent/health` (always allowed) and return system connectivity status
2. WHEN checking agent identity THEN it SHALL use `GET /api/agent/me` and validate `isPlatformAgent: true` and `effectiveReadEndpoints` list
3. WHEN querying projects THEN it SHALL only succeed if `/api/agent/projects` is in `configuredReadEndpoints`, otherwise return "Platform Agent - Insufficient Permissions"
4. WHEN accessing project details THEN it SHALL respect endpoint permissions and return available data based on `effectiveReadEndpoints`
5. WHEN providing status reports THEN it SHALL format responses showing which endpoints are accessible and which require delegation

### Requirement 5 - Dynamic Agent Registration Tool

**User Story:** As a user, I want to register new agent keys through chat by providing the raw key, so that the MCP server can verify identity and securely store the credentials without manual TOML editing.

#### Acceptance Criteria

1. WHEN user provides `register_agent` tool with raw `x-agent-api-key` THEN the system SHALL immediately call `GET /api/agent/me` to verify identity
2. WHEN identity verification succeeds THEN the system SHALL extract agent metadata: `name`, `isPlatformAgent`, `delegations`, and `apiAllowance`
3. WHEN agent is verified THEN the system SHALL hash the key with SHA-256, update TOML config, and respond with: "Identity Verified: Registered '{name}' with {type} permissions"
4. WHEN identity verification fails THEN the system SHALL return "Invalid key. Identity verification failed." without storing anything
5. WHEN updating TOML config THEN the system SHALL preserve existing agents and add new entry with detected permissions and project access

**Tool Response Format:**
```
✅ Identity Verified: Registered 'AgentSmith' 
Type: ProjectDelegated
Projects: Spec Task Board (ID: 10) - USER permission
Delegations: 1 project accessible

Key securely stored in vibe-mcp.toml
```

### Requirement 6: Lattice State-Driven Persona System

**User Story:** As a project manager, I want agents to automatically adopt appropriate personas based on their task location, so that they can provide contextually relevant assistance throughout the development lifecycle.

#### Acceptance Criteria

1. WHEN an agent focuses on a task THEN the system SHALL fetch column description via `GET /api/agent/projects/:id/tasks/:id`
2. WHEN a column description is retrieved THEN the system SHALL inject it as the primary system prompt
3. WHEN an agent is in the "Specify" column THEN the system SHALL configure the agent as an Architect persona
4. WHEN an agent is in the "Execute" column THEN the system SHALL configure the agent as a Coder persona  
5. WHEN an agent is in the "Verify" column THEN the system SHALL configure the agent as a Critic persona

**Error Handling:**
- IF Hub returns 5xx THEN persona defaults to "General Assistant" with warning
- IF column has no description THEN use column name as persona

### Requirement 7: Named Resource Orchestration

**User Story:** As a team lead, I want to assign specific agents to specific tasks by name, so that I can leverage different agent capabilities and maintain accountability.

#### Acceptance Criteria

1. WHEN multiple delegate keys are registered THEN the system SHALL support multiple agents per project via `x-agent-api-key` header
2. WHEN a user assigns an agent to a task THEN the system SHALL treat that agent as a first-class assignee with "Agent {Name}" format
3. WHEN agent assignment occurs THEN the system SHALL support assignment via both Vibe UI and `summon_agent` tool
4. WHEN accessing agent resources THEN the system SHALL enforce permissions (VIEWER/USER) at the API level per delegate key
5. WHEN an agent is summoned THEN the system SHALL maintain agent identity and assignment state via Hub storage

### Requirement 8: JIT Context Injection System

**User Story:** As a developer, I want agents to receive complete context in a single API call, so that they can work efficiently without multiple round trips.

#### Acceptance Criteria

1. WHEN an agent requests task context THEN the system SHALL provide it via `GET /api/agent/projects/:id/tasks/:id?inline=true&compact=true` endpoint
2. WHEN context is assembled THEN the system SHALL include task metadata, persona, and full linked docs in a single response
3. WHEN context is provided THEN the system SHALL maintain **HARD LIMIT** of ≤5500 tokens total context
4. WHEN Constitution is included THEN the system SHALL always include full-text (never summarized)

**Token Budget:**
| Component | Budget | Behavior on Overflow |
|-----------|--------|---------------------|
| Metadata | 500 | Truncate fields |
| Persona | 1000 | Truncate description |
| Constitution | 1500 | Error if exceeds |
| Specification | 2000 | Summarize to fit |
| **Buffer** | **500** | Reserved for response |
| **Total** | **5500** | Hard limit |

### Requirement 9: Product Design Phase (Specify Column)

**User Story:** As a product owner, I want agents to generate and refine specifications before moving to planning, so that implementation is based on clear requirements.

#### Acceptance Criteria

1. WHEN in the design phase THEN the system SHALL provide a `commit_artifact` tool available only in Specify column
2. WHEN `commit_artifact` is used THEN the system SHALL create/update SPECIFICATION.md in Hub
3. WHEN a task attempts to transition to "Plan" THEN the system SHALL verify specification contains `[RATIFIED]` in title
4. IF no ratified specification exists THEN the system SHALL prevent transition to planning phase

### Requirement 10: Sprint Planning Phase (Plan Column)

**User Story:** As a scrum master, I want agents to automatically break down implementation plans into atomic tasks, so that complex features can be managed as structured sub-boards.

#### Acceptance Criteria

1. WHEN in the planning phase THEN the system SHALL provide a `spawn_sub_board` tool available only in Plan column
2. WHEN `spawn_sub_board` is triggered THEN the system SHALL parse the `IMPLEMENTATION_PLAN.md` content
3. WHEN implementation plan is parsed THEN the system SHALL bulk-create atomic sub-tasks via Hub API
4. WHEN sub-board is created THEN the system SHALL maintain parent-child relationships in Hub database

### Requirement 11: Execution and Audit Phase (Verify Column)

**User Story:** As a quality assurance lead, I want agents to perform mandatory integrity checks and maintain work logs, so that all development work is traceable and auditable.

#### Acceptance Criteria

1. WHEN work is completed THEN the system SHALL provide a `reflect_on_work` tool available only in Verify column
2. WHEN `reflect_on_work` is used THEN the system SHALL perform a mandatory 6-step integrity check (all must be true)
3. WHEN integrity check is complete THEN the system SHALL create Work Log document + TLDR comment with `📁 [FILES TOUCHED]`
4. WHEN tasks are modified THEN the system SHALL maintain chronological history in TaskLog table
5. WHEN checks fail THEN the system SHALL use `reject_to_execute` to return to Execute column

### Requirement 12: Platform Integration

**User Story:** As a system administrator, I want the orchestrator to integrate seamlessly with VibeTask Hub, so that agents can operate within the existing platform architecture.

#### Acceptance Criteria

1. WHEN agent identity is needed THEN the system SHALL use `GET /api/agent/me` to find assigned name and role
2. WHEN task context is needed THEN the system SHALL use `GET /api/agent/projects/:id/tasks/:id?inline=true&compact=true`
3. WHEN knowledge management is required THEN the system SHALL use `POST /api/agent/projects/:id/docs`
4. WHEN document binding is needed THEN the system SHALL use `POST /api/agent/projects/:id/doc-links`
5. WHEN API calls are made THEN the system SHALL maintain stateless operation (zero local storage between requests)

**Retry Policy:**
- 3 retries with exponential backoff (1s, 2s, 4s)
- Circuit breaker after 5 consecutive Hub failures (60s cooldown)

### Requirement 13: Collaborative Memory System

**User Story:** As a development team member, I want agents to share technical knowledge across the swarm, so that insights and solutions can be reused across similar tasks.

#### Acceptance Criteria

1. WHEN technical insights are generated THEN the system SHALL use Document Annotations for knowledge sharing
2. WHEN annotations are created THEN the system SHALL make them accessible to other agents in the swarm
3. WHEN agents access shared knowledge THEN the system SHALL provide contextual retrieval based on task similarity
4. WHEN collaborative memory is used THEN the system SHALL maintain knowledge consistency across agent interactions

### Requirement 14: Code Quality and Pre-commit Validation

**User Story:** As a developer, I want automated code quality checks to run before commits and task completion, so that code standards are consistently maintained throughout the project.

#### Acceptance Criteria

1. WHEN the project is initialized THEN the system SHALL install pre-commit hooks: `cargo fmt`, `clippy -D warnings`, `cargo test`
2. WHEN a commit is attempted THEN the pre-commit hooks SHALL block commit on any failure
3. WHEN pre-commit formatting fails THEN the system SHALL display message "cargo fmt check failed. Please run 'cargo fmt --all' to format your code."
4. WHEN pre-commit clippy fails THEN the system SHALL display message "clippy check failed. Please fix the warnings/errors."
5. WHEN pre-commit tests fail THEN the system SHALL display message "Tests failed. Please fix failing tests."

### Requirement 15: Governance and Safety Controls

**User Story:** As a compliance officer, I want to ensure that governance artifacts remain protected from unauthorized modifications, so that project integrity is maintained.

#### Acceptance Criteria

1. WHEN governance artifacts (Constitution) are accessed THEN the system SHALL enforce read-only permissions by default
2. WHEN unauthorized modification attempts occur THEN the system SHALL prevent changes and log the attempt
3. WHEN safety controls are triggered THEN the system SHALL maintain audit trail of all Constitution access
4. WHEN governance documents are referenced THEN the system SHALL ensure version consistency across agent interactions

**NEW: Constitution Amendment Flow**
5. WHEN Constitution changes are needed THEN the system SHALL provide `propose_constitution_amendment` tool that generates diff and confirmation code
6. WHEN confirmation code is generated THEN the system SHALL expire it after 5 minutes
7. WHEN confirming amendments THEN the system SHALL require `confirm_constitution_amendment` with matching code
8. WHEN confirmations fail or expire THEN the system SHALL require re-proposal

### Requirement 16: Fault Isolation

**User Story:** As a system operator, I want the MCP server to handle all errors gracefully without crashing, so that agents can continue working even when the Hub is temporarily unavailable.

#### Acceptance Criteria

1. WHEN any error occurs THEN the system SHALL never use `unwrap()` or `panic!()` in production code
2. WHEN errors are encountered THEN the system SHALL return valid MCP error responses
3. WHEN Hub is down THEN the system SHALL return "Hub Offline" status, not crash
4. WHEN Hub becomes available THEN agents SHALL be able to wait and retry without restart