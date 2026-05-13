# Implementation Plan: VibeTask MCP Orchestrator with Dual-Agent Architecture

## Phase 1: Foundation & Dual-Agent Infrastructure (Week 1-2)

- [x] 1. Project scaffolding with rust-mcp-sdk and dual-agent foundation
  - [x] 1.1 Initialize Cargo workspace with rust-mcp-sdk 0.9.0 and security dependencies
    - Add core dependencies: tokio, serde, reqwest, thiserror, tracing, tiktoken-rs
    - Add security dependencies: keyring, tempfile, sha2, nanoid
    - Add business logic crates: chrono, regex, similar, toml
    - Configure features: `["server", "stdio", "hyper"]` from rust-mcp-sdk
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 13.1, 13.2, 13.3_
  - [x] 1.2 TOML configuration system with atomic writes
    - Create AgentConfig struct with server and agents array
    - Implement AtomicConfigWriter with tempfile + rename pattern
    - Add SHA-256 key hashing and secure storage integration
    - Create configuration validation and backup system
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.3 Configure pre-commit hooks and CI
    - Install pre-commit hooks: cargo fmt, clippy -D warnings, test
    - Set up GitHub Actions for test + clippy + fmt
    - Add security linting and dependency audit checks
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 2. Agent Type Detection and Secure Key Management
  - [x] 2.1 Agent type detection from Hub API
    - Create AgentTypeDetector with `/api/agent/me` parsing
    - Implement AgentType enum (Platform vs ProjectDelegated)
    - Add PermissionLevel enum (VIEWER, USER) with type safety
    - Create agent metadata parsing and validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 2.2 Secure key storage with keyring integration
    - Implement keyring-based storage for production
    - Add .env file support for development (never logged)
    - Create key rotation and validation mechanisms
    - Add key expiration detection and notification
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.3 Dynamic agent registration tool
    - Create register_agent MCP tool with identity verification
    - Implement Hub API verification before key storage
    - Add automatic TOML config updates with atomic writes
    - Create agent switching and management capabilities
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Core domain models with business logic
  - [x] 3.1 Document lifecycle models with Knowledge Hub integration
    - Create DocumentState enum (Draft, Review, Ratified, Superseded)
    - Implement Specification struct with ratification validation
    - Add ImplementationPlan with task parsing and atomicity validation
    - Create WorkLog with integrity check and TLDR generation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_
  - [x] 3.2 Task atomicity validation system
    - Create TaskAtomicityValidator with complexity limits
    - Implement duplicate name detection and reserved name checking
    - Add "Max 3 Modified Files" complexity validation
    - Create dependency graph validation with cycle detection
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2_
  - [x] 3.3 Error handling with MCP compatibility
    - Create OrchestratorError enum with proper MCP error code mapping
    - Implement From traits for CallToolError conversion
    - Add business logic specific errors with detailed messages
    - Write comprehensive unit tests for error scenarios
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 4. VibeTask API Client with OpenAPI type generation
  - [x] 4.1 OpenAPI-to-Rust type generation pipeline
    - Set up `openapitools.json` configuration for rust generation
    - Create post-generation refinement script for MCP compatibility
    - Add JsonSchema derives and validation attributes
    - Generate request/response types for all agent endpoints
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 4.2 HTTP client with fault isolation and agent type awareness
    - Create VibeTaskClient with agent type detection and endpoint validation
    - Implement retry logic (3 attempts, exponential backoff) and circuit breaker
    - Add Platform Agent endpoint restriction enforcement
    - Write integration tests with `wiremock` for both agent types
    - **Checkpoint**: Client can authenticate both Platform and Project agents
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5_

## Phase 2: Context Assembly & Token Management with Constitution Fidelity (Week 3)

- [x] 5. Advanced Context Assembly with Recursive Summarization
  - [x] 5.1 Token budget enforcement with Constitution immutability
    - Create TokenBudget struct with explicit allocations (500/1000/1500/2000/500 tokens)
    - Implement tiktoken-rs integration for accurate token counting
    - Add Constitution fidelity lock (never truncated, error if exceeds budget)
    - Create emergency modes with graceful degradation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 5.2 Recursive summarization algorithm
    - Implement RecursiveSummarizer with LLM integration for large specifications
    - Add key section preservation (API signatures, headers, requirements)
    - Create iterative summarization with max iteration limits
    - Add fallback truncation with meaningful suffixes
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 5.3 Hierarchical context assembly with Knowledge Hub integration
    - Implement context assembly with fixed priority: Metadata > Persona > Constitution > Spec
    - Add Knowledge Hub document role-based context loading
    - Create version pinning for consistency during agent work
    - Add context validation ensuring Constitution is always full text
    - **Checkpoint**: Can assemble context for any task, respects budget, Constitution never truncated
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Tool Registry with Agent Type Filtering
  - [x] 6.1 Tool Registry with compile-time safety
    - Create ToolRegistry with explicit tool-column mapping (no flat lists)
    - Implement agent type detection and tool filtering
    - Add re-evaluation after agent type or context changes
    - Create tool validation with detailed error messages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 6.2 Platform Agent tool restrictions
    - Implement Platform Agent read-only tool filtering
    - Add endpoint-based tool availability (based on effectiveReadEndpoints)
    - Create write operation blocking at MCP protocol layer
    - Add clear error messages for restricted operations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

## Phase 3: MCP Server with Dual-Agent Architecture (Week 4)

- [x] 7. MCP Server with Agent Type Detection and Dynamic Tool Registration
  - [x] 7.1 VibeTaskHandler with agent type awareness
    - Implement agent type detection on startup via `/api/agent/me`
    - Create dynamic tool registration based on agent type and column
    - Add Platform Agent capability restrictions (no resources/prompts)
    - Implement Project Agent full capability support
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 7.2 MCP protocol handlers with dual-agent support
    - Create handle_initialize_request with agent-specific capabilities
    - Implement handle_list_tools_request with dynamic tool filtering
    - Add handle_call_tool_request with pre-flight permission checks
    - Create agent-specific instruction generation
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 7.3 Server initialization with error recovery
    - Create server using `server_runtime::create_server` with StdioTransport
    - Add comprehensive error handling that never crashes the binary
    - Implement graceful shutdown and agent type validation
    - Create health check and connectivity validation
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 8. Integration testing with dual-agent scenarios
  - [x] 8.1 Mock Hub scenarios for both agent types
    - Create test scenarios: Platform Agent (read-only), Project Agent (full access)
    - Test tool filtering enforcement and permission validation
    - Test agent type detection and configuration loading
    - Add fault isolation scenarios (Hub down, invalid responses)
    - _Requirements: All requirements validation_
  - [x] 8.2 End-to-end MCP protocol testing
    - Test server boots with both agent types and connects to mock Hub
    - Test dynamic tool listing based on agent type and column
    - Test write operation blocking for Platform Agents
    - **Checkpoint**: Server supports both agent types with proper tool filtering
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5_

## Phase 4: Platform Agent Tools - Read-Only Operations (Week 5)

- [x] 9. Platform Agent health and status tools
  - [x] 9.1 Health check and connectivity tools
    - Create query_health tool for Hub connectivity validation
    - Implement system status reporting with endpoint accessibility
    - Add agent identity validation and expiration checking
    - Create diagnostic information formatting
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 9.2 Project and task query tools (endpoint-restricted)
    - Create query_projects tool (requires /api/agent/projects endpoint)
    - Implement query_tasks tool (requires /api/agent/projects/:projectId/tasks)
    - Add read_documents tool (requires /api/agent/projects/:projectId/docs)
    - Create get_context tool for task context retrieval
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 10. Agent delegation and switching tools
  - [x] 10.1 Agent delegation with project context
    - Implement agent delegation parsing ("Use AgentSmith to get status of X project")
    - Add project agent key lookup and validation
    - Create delegation permission checking and error handling
    - Add agent provenance tracking in responses
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 10.2 Agent management tools
    - Create switch_agent tool for changing active agent
    - Implement list_agents tool for available agent display
    - Add agent status and expiration monitoring
    - **Checkpoint**: Platform Agents can query system status and delegate to project agents
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

## Phase 5: Project Agent Tools - Specify Column (Week 6)

- [x] 11. Specification creation and ratification tools
  - [x] 11.1 commit_artifact tool with ratification support
    - Create CommitArtifactTool with column verification (Specify only)
    - Implement SPECIFICATION.md creation/update with Hub API integration
    - Add [RATIFIED] marker validation for exit gate compliance
    - Create specification quality checks and validation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 11.2 Architecture review and governance tools
    - Create request_architecture_review tool for technical review documents
    - Implement propose_constitution_amendment with diff generation
    - Add confirm_constitution_amendment with TTL validation
    - Create governance audit trail and safety controls
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

## Phase 6: Project Agent Tools - Plan Column (Week 7)

- [x] 12. Implementation planning and sub-board creation
  - [x] 12.1 spawn_sub_board tool with task atomicity validation
    - Create SpawnSubBoardTool with column verification (Plan only)
    - Implement IMPLEMENTATION_PLAN.md parsing with TaskAtomicityValidator
    - Add bulk task creation with parent-child relationships
    - Create dependency graph validation and cycle detection
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 12.2 Planning validation and complexity estimation
    - Add task complexity estimation based on file modification counts
    - Implement duplicate name detection and reserved name checking
    - Create atomic scope validation (single responsibility principle)
    - **Checkpoint**: Can create sub-boards with validated atomic tasks
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

## Phase 7: Project Agent Tools - Execute & Verify Columns (Week 8)

- [-] 13. Execution support tools
  - [x] 13.1 Task progress and document management
    - Create update_task_progress tool for status tracking
    - Implement link_document tool with Knowledge Hub integration
    - Add request_help tool for escalation and collaboration
    - Create work logging and progress tracking
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 14. Verification and integrity tools
  - [x] 14.1 reflect_on_work tool with strict integrity validation
    - Create ReflectOnWorkTool with mandatory 6-step integrity check
    - Implement IntegrityCheck struct with strict boolean validation (all must pass)
    - Add TLDR generation with FILES TOUCHED header formatting
    - Create work log document creation and task linking
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 14.2 Task completion and rejection tools
    - Create approve_completion tool for final verification gate
    - Implement reject_to_execute tool for returning tasks to Execute column
    - Add completion audit trail and provenance tracking
    - **Checkpoint**: Full workflow: Specify → Plan → Execute → Verify with integrity validation
    - _Requirements: 10.5, 11.1, 11.2, 11.3, 11.4, 11.5_

## Phase 8: Knowledge Hub Integration & Collaborative Memory (Week 9)

- [x] 15. Knowledge Hub document management
  - [x] 15.1 Document lifecycle and version management
    - Implement document creation with role-based linking (SPEC, PLAN, WORK_LOG, etc.)
    - Add version pinning for consistency during agent work
    - Create document annotation system for collaborative memory
    - Add cross-agent knowledge sharing capabilities
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 15.2 Context Hub integration with annotations
    - Parse YAML frontmatter for status warnings (DRAFT, etc.)
    - Implement #annotate tag parsing for collaborative insights
    - Create RECENT LEARNINGS block generation
    - Add semantic document retrieval based on task similarity
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

## Phase 9: Performance Optimization & Hardening (Week 10)

- [ ] 16. Performance optimization and monitoring
  - [ ] 16.1 Context assembly optimization
    - Target <200ms context assembly time with caching
    - Implement connection pooling for Hub API using reqwest Client reuse
    - Add memory usage monitoring with <50MB target
    - Create performance benchmarks for token budget compliance
    - _Requirements: 8.3, 8.4_
  - [ ] 16.2 Observability and monitoring
    - Add structured logging using tracing crate with agent type context
    - Implement metrics: tool usage, latency, errors, agent type distribution
    - Create health check endpoint for container orchestration
    - Add agent key expiration monitoring and alerts
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 17. Comprehensive testing and validation
  - [ ] 17.1 Unit tests for all business logic components
    - Write tests for agent type detection, tool filtering, and integrity validation
    - Add error handling and edge case coverage using assert_matches! macro
    - Create mock implementations using mockall crate for external dependencies
    - Test atomic configuration writes and key management security
    - _Requirements: All requirements validation_
  - [ ] 17.2 Integration and performance tests
    - Implement end-to-end workflow testing for both agent types
    - Add multi-agent coordination test scenarios with delegation
    - Create performance benchmarks for context assembly and tool execution
    - Test fault isolation and graceful degradation scenarios
    - _Requirements: All requirements final validation_

## Phase 10: Documentation & Production Readiness (Week 11)

- [ ] 18. Documentation and deployment preparation
  - [ ] 18.1 Documentation creation
    - Create comprehensive README with dual-agent setup instructions
    - Write CLAUDE.md template for both Platform and Project agents
    - Document architecture decision records (ADRs) for dual-agent design
    - Create troubleshooting guide for common agent configuration issues
    - _Requirements: All requirements documentation_
  - [ ] 18.2 Production deployment validation
    - Create Docker configuration with secure key management
    - Add Kubernetes manifests with proper RBAC and secrets
    - Test production deployment with real Hub (staging environment)
    - Validate security: key storage, agent isolation, audit trails
    - _Requirements: All requirements final validation_

- [ ] 19. Final integration and validation
  - [ ] 19.1 Complete system integration with dual-agent support
    - Wire together all modules using dependency injection with Arc<T>
    - Add configuration management using config crate and environment variables
    - Create main.rs with --config flag support and agent type detection
    - Implement graceful shutdown with proper cleanup for both agent types
    - _Requirements: All requirements integration_
  - [ ] 19.2 Production validation and acceptance testing
    - Run complete test suite and verify all acceptance criteria
    - Test dual-agent scenarios: Platform Agent monitoring + Project Agent workflow
    - Validate governance controls and security boundaries
    - Create CLI documentation and usage examples for both agent types
    - **Final Checkpoint**: Production ready dual-agent MCP orchestrator
    - _Requirements: All requirements final validation_