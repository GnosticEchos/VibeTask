# Design Document: VibeTask Agent Orchestrator

## Overview

Stateless Rust MCP sidecar for VibeTask platform. Transforms Kanban into "Lattice" state machines with contextual agent personas. **Supports dual-agent architecture**: Platform Agents (read-only system integration) and Project Agents (full workflow participation).

**Core Principle**: The MCP server is a protocol translator, not a state holder. All state lives in VibeTask Hub.

**Agent Types**:
- **Platform Agents** (`isPlatformAgent: true`) - Read-only system integration with configurable endpoint access
- **Project Agents** (`isPlatformAgent: false`) - Full workflow participation with project delegations

## Architecture

### Component Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                     AGENT CLIENTS                            │
│         (Claude Code, Cursor, Codex, etc.)                   │
│                      │                                      │
│                      ▼ MCP (stdio)                          │
├─────────────────────────────────────────────────────────────┤
│              VibeTask MCP Orchestrator                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ MCP Server  │  │Agent Type   │  │ Context Assembler   │  │
│  │  (stdio)    │◄─┤ Detector    │◄─┤   (Token Budget)    │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘  │
│         │                │                                  │
│         │                ▼ TOML Config                      │
│         │         ┌─────────────┐                          │
│         │         │Agent Key    │                          │
│         │         │Manager      │                          │
│         │         └─────────────┘                          │
│         │ HTTP/1.1 + x-agent-api-key                       │
│         ▼                                                   │
├─────────────────────────────────────────────────────────────┤
│              VibeTask Hub (Node/Express/Prisma)            │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│         │   API   │  │   DB    │  │  Auth   │               │
│         └─────────┘  └─────────┘  └─────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### Dual-Agent Architecture Flow
```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT TYPE DETECTION                      │
├─────────────────────────────────────────────────────────────┤
│ 1. MCP Server starts with --config vibe-mcp.toml           │
│ 2. Load active_agent from config                           │
│ 3. Call GET /api/agent/me with agent's key                 │
│ 4. Detect isPlatformAgent flag                             │
│ 5. Register appropriate tools based on agent type          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │         AGENT TYPE ROUTING          │
        └─────────────────────────────────────┘
                    │                 │
                    ▼                 ▼
    ┌─────────────────────┐    ┌─────────────────────┐
    │   PLATFORM AGENT    │    │   PROJECT AGENT     │
    │   (Read-Only)       │    │   (Full Workflow)   │
    ├─────────────────────┤    ├─────────────────────┤
    │ Tools:              │    │ Tools:              │
    │ - query_health      │    │ - commit_artifact   │
    │ - query_projects    │    │ - spawn_sub_board   │
    │ - read_documents    │    │ - reflect_on_work   │
    │ - get_context       │    │ - All read tools    │
    │                     │    │                     │
    │ Endpoints:          │    │ Delegations:        │
    │ - /api/agent/health │    │ - Project specific  │
    │ - /api/agent/me     │    │ - USER/VIEWER perms │
    │ - Configured list   │    │ - Full API access   │
    └─────────────────────┘    └─────────────────────┘
```

## Components and Interfaces

### 0. Agent Type Detection and Configuration

**Responsibility**: Detect agent type from Hub API and manage secure key storage via TOML configuration

#### TOML Configuration Structure

```toml
[server]
name = "Vibe Orchestrator"
version = "1.0.0"
active_agent = "AgentSmith"  # Which agent to use for this session

[[agents]]
name = "AgentSmith"
type = "ProjectDelegated"
key_hash = "sha256:a1b2c3d4..."  # SHA-256 hash of actual key
projects = [10]
permissions = ["USER"]
delegated_at = "2026-04-08T18:55:25.094Z"

[[agents]]
name = "MCPTesting"
type = "Platform"
key_hash = "sha256:e5f6g7h8..."
allowed_endpoints = [
    "/api/agent/projects",
    "/api/agent/projects/:projectId/docs"
]
effective_endpoints = [
    "/api/agent/health",
    "/api/agent/me",
    "/api/agent/projects",
    "/api/agent/projects/:projectId/docs"
]
```

#### Agent Type Detection Implementation

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub server: ServerConfig,
    pub agents: Vec<AgentEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub name: String,
    pub version: String,
    pub active_agent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub agent_type: String,  // "Platform" or "ProjectDelegated"
    pub key_hash: String,    // SHA-256 hash
    
    // Platform Agent fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_endpoints: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_endpoints: Option<Vec<String>>,
    
    // Project Agent fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projects: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delegated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub enum AgentType {
    Platform {
        name: String,
        allowed_endpoints: Vec<String>,
        effective_endpoints: Vec<String>,
    },
    ProjectDelegated {
        name: String,
        projects: Vec<i32>,
        permissions: HashMap<i32, PermissionLevel>,  // project_id -> permission_level (Enum)
        delegations: Vec<Delegation>,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentMeResponse {
    pub agent: AgentInfo,
    pub delegations: Vec<Delegation>,
    #[serde(rename = "apiAllowance")]
    pub api_allowance: ApiAllowance,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    #[serde(rename = "ownerId")]
    pub owner_id: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
    pub metadata: AgentMetadata,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentMetadata {
    #[serde(rename = "isAgent")]
    pub is_agent: bool,
    #[serde(rename = "createdBy")]
    pub created_by: i32,
    pub description: String,
    #[serde(rename = "isPlatformAgent")]
    pub is_platform_agent: Option<bool>,
    #[serde(rename = "allowedReadEndpoints")]
    pub allowed_read_endpoints: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiAllowance {
    #[serde(rename = "isPlatformAgent")]
    pub is_platform_agent: bool,
    #[serde(rename = "readOnly")]
    pub read_only: bool,
    #[serde(rename = "alwaysAllowedReadEndpoints")]
    pub always_allowed_read_endpoints: Vec<String>,
    #[serde(rename = "configuredReadEndpoints")]
    pub configured_read_endpoints: Vec<String>,
    #[serde(rename = "effectiveReadEndpoints")]
    pub effective_read_endpoints: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Delegation {
    #[serde(rename = "projectId")]
    pub project_id: i32,
    #[serde(rename = "projectName")]
    pub project_name: String,
    #[serde(rename = "projectPrefix")]
    pub project_prefix: String,
    #[serde(rename = "permissionLevel")]
    pub permission_level: PermissionLevel,  // Enum, not String
    #[serde(rename = "delegatedAt")]
    pub delegated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PermissionLevel {
    #[serde(rename = "VIEWER")]
    Viewer,
    #[serde(rename = "USER")]
    User,
}

impl PermissionLevel {
    pub fn can_write(&self) -> bool {
        matches!(self, PermissionLevel::User)
    }
    
    pub fn can_read(&self) -> bool {
        true // Both VIEWER and USER can read
    }
}

pub struct AgentTypeDetector {
    config_path: String,
    api_client: Arc<VibeTaskClient>,
}

impl AgentTypeDetector {
    pub fn new(config_path: String, api_client: Arc<VibeTaskClient>) -> Self {
        Self { config_path, api_client }
    }
    
    /// Load configuration and detect active agent type
    pub async fn detect_active_agent(&self) -> Result<AgentType, DetectionError> {
        // Load TOML config
        let config = self.load_config().await?;
        
        // Find active agent
        let active_agent = config.agents.iter()
            .find(|a| a.name == config.server.active_agent)
            .ok_or_else(|| DetectionError::AgentNotFound(config.server.active_agent.clone()))?;
        
        // Get actual key from secure storage (environment variable for now)
        let key = self.get_agent_key(&active_agent.name).await?;
        
        // Call Hub API to verify and get current permissions
        let me_response = self.api_client.get_agent_me(&key).await?;
        
        // Convert to AgentType
        let agent_type = self.convert_to_agent_type(me_response, active_agent)?;
        
        Ok(agent_type)
    }
    
    async fn load_config(&self) -> Result<AgentConfig, DetectionError> {
        let content = fs::read_to_string(&self.config_path).await
            .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;
        
        toml::from_str(&content)
            .map_err(|e| DetectionError::ConfigParse(e.to_string()))
    }
    
    async fn get_agent_key(&self, agent_name: &str) -> Result<String, DetectionError> {
        // SECURITY: Use keyring for production, .env for development
        // NEVER use std::env::var in multi-user environments
        #[cfg(debug_assertions)]
        {
            // Development: Use .env file (never logged)
            let env_file = format!(".env.{}", agent_name.to_lowercase());
            if let Ok(content) = tokio::fs::read_to_string(&env_file).await {
                for line in content.lines() {
                    if let Some(key) = line.strip_prefix("VIBETASK_API_KEY=") {
                        return Ok(key.to_string());
                    }
                }
            }
        }
        
        #[cfg(not(debug_assertions))]
        {
            // Production: Use keyring crate for secure storage
            use keyring::Entry;
            let entry = Entry::new("vibetask-mcp", agent_name)
                .map_err(|e| DetectionError::KeyringError(e.to_string()))?;
            
            entry.get_password()
                .map_err(|e| DetectionError::KeyNotFound(format!("{}: {}", agent_name, e)))
        }
        
        #[cfg(debug_assertions)]
        Err(DetectionError::KeyNotFound(format!(
            "Key not found for agent '{}'. Create .env.{} with VIBETASK_API_KEY=<key>",
            agent_name, agent_name.to_lowercase()
        )))
    }
    
    fn convert_to_agent_type(
        &self,
        response: AgentMeResponse,
        config_entry: &AgentEntry,
    ) -> Result<AgentType, DetectionError> {
        if response.api_allowance.is_platform_agent {
            Ok(AgentType::Platform {
                name: response.agent.name,
                allowed_endpoints: response.api_allowance.configured_read_endpoints,
                effective_endpoints: response.api_allowance.effective_read_endpoints,
            })
        } else {
            let permissions = response.delegations.iter()
                .map(|d| (d.project_id, d.permission_level.clone()))
                .collect();
            
            Ok(AgentType::ProjectDelegated {
                name: response.agent.name,
                projects: response.delegations.iter().map(|d| d.project_id).collect(),
                permissions,
                delegations: response.delegations,
            })
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DetectionError {
    #[error("Config file error: {0}")]
    ConfigLoad(String),
    
    #[error("Config parse error: {0}")]
    ConfigParse(String),
    
    #[error("Agent '{0}' not found in config")]
    AgentNotFound(String),
    
    #[error("Key not found for agent '{0}'")]
    KeyNotFound(String),
    
    #[error("Hub API error: {0}")]
    ApiError(#[from] reqwest::Error),
}
```

#### Dynamic Agent Registration Tool

```rust
use sha2::{Sha256, Digest};
use chrono::Utc;

#[macros::mcp_tool(
    name = "register_agent",
    description = "Register a new agent by providing raw API key. Verifies identity and stores securely."
)]
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct RegisterAgent {
    /// Raw x-agent-api-key to register
    pub api_key: String,
    /// Optional: Set as active agent after registration
    pub set_as_active: Option<bool>,
}

pub struct RegisterAgentContext {
    pub config_path: String,
    pub api_client: Arc<VibeTaskClient>,
}

impl RegisterAgent {
    pub async fn execute_with_context(
        &self,
        ctx: &RegisterAgentContext,
    ) -> Result<CallToolResult, CallToolError> {
        // STEP 1: Verify identity with Hub
        let me_response = ctx.api_client.get_agent_me(&self.api_key).await
            .map_err(|e| CallToolError::invalid_params(&format!(
                "Invalid key. Identity verification failed: {}", e
            )))?;
        
        // STEP 2: Hash the key for secure storage
        let mut hasher = Sha256::new();
        hasher.update(self.api_key.as_bytes());
        let key_hash = format!("sha256:{:x}", hasher.finalize());
        
        // STEP 3: Create agent entry based on type
        let agent_entry = if me_response.api_allowance.is_platform_agent {
            AgentEntry {
                name: me_response.agent.name.clone(),
                agent_type: "Platform".to_string(),
                key_hash,
                allowed_endpoints: Some(me_response.api_allowance.configured_read_endpoints.clone()),
                effective_endpoints: Some(me_response.api_allowance.effective_read_endpoints.clone()),
                projects: None,
                permissions: None,
                delegated_at: None,
            }
        } else {
            AgentEntry {
                name: me_response.agent.name.clone(),
                agent_type: "ProjectDelegated".to_string(),
                key_hash,
                allowed_endpoints: None,
                effective_endpoints: None,
                projects: Some(me_response.delegations.iter().map(|d| d.project_id).collect()),
                permissions: Some(me_response.delegations.iter().map(|d| d.permission_level.clone()).collect()),
                delegated_at: Some(Utc::now().to_rfc3339()),
            }
        };
        
        // STEP 4: Update TOML config
        let mut config = self.load_config(&ctx.config_path).await?;
        
        // Remove existing entry with same name (if any)
        config.agents.retain(|a| a.name != agent_entry.name);
        
        // Add new entry
        config.agents.push(agent_entry.clone());
        
        // Set as active if requested
        if self.set_as_active.unwrap_or(false) {
            config.server.active_agent = agent_entry.name.clone();
        }
        
        // Save config
        self.save_config(&ctx.config_path, &config).await?;
        
        // STEP 5: Store actual key in environment (production: use secure vault)
        let env_var = format!("VIBETASK_AGENT_KEY_{}", agent_entry.name.to_uppercase());
        std::env::set_var(&env_var, &self.api_key);
        
        // STEP 6: Format response
        let response = if me_response.api_allowance.is_platform_agent {
            format!(
                "✅ Identity Verified: Registered '{}'\n\
                Type: Platform Agent\n\
                Endpoints: {} configured\n\
                Effective: {}\n\n\
                Key securely stored in {}\n\
                Environment: {}=<hidden>",
                agent_entry.name,
                me_response.api_allowance.configured_read_endpoints.len(),
                me_response.api_allowance.effective_read_endpoints.join(", "),
                ctx.config_path,
                env_var
            )
        } else {
            let projects_info = me_response.delegations.iter()
                .map(|d| format!("{} (ID: {}) - {} permission", d.project_name, d.project_id, d.permission_level))
                .collect::<Vec<_>>()
                .join("\n");
            
            format!(
                "✅ Identity Verified: Registered '{}'\n\
                Type: ProjectDelegated\n\
                Projects:\n{}\n\
                Delegations: {} projects accessible\n\n\
                Key securely stored in {}\n\
                Environment: {}=<hidden>",
                agent_entry.name,
                projects_info,
                me_response.delegations.len(),
                ctx.config_path,
                env_var
            )
        };
        
        Ok(CallToolResult::success(response))
    }
    
    async fn load_config(&self, path: &str) -> Result<AgentConfig, CallToolError> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| CallToolError::internal_error(&format!("Config load failed: {}", e)))?;
        
        toml::from_str(&content)
            .map_err(|e| CallToolError::internal_error(&format!("Config parse failed: {}", e)))
    }
    
    async fn save_config(&self, path: &str, config: &AgentConfig) -> Result<(), CallToolError> {
        let content = toml::to_string_pretty(config)
            .map_err(|e| CallToolError::internal_error(&format!("Config serialize failed: {}", e)))?;
        
        tokio::fs::write(path, content).await
            .map_err(|e| CallToolError::internal_error(&format!("Config save failed: {}", e)))
    }
}
```

### Critical: Tool Registry with Re-evaluation

**Responsibility**: Enforce tool-column affinity with compile-time safety and runtime validation

```rust
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub struct ToolRegistry {
    column_tools: HashMap<String, HashSet<String>>,
    platform_tools: HashSet<String>,
    agent_type: AgentType,
}

impl ToolRegistry {
    pub fn new(agent_type: AgentType) -> Self {
        let mut column_tools = HashMap::new();
        
        // MANDATE: Explicit tool-column mapping (no flat lists)
        column_tools.insert("Specify".to_string(), hashset! {
            "commit_artifact".to_string(),
            "request_architecture_review".to_string(),
            "propose_constitution_amendment".to_string(),
        });
        
        column_tools.insert("Plan".to_string(), hashset! {
            "spawn_sub_board".to_string(),
            "estimate_complexity".to_string(),
        });
        
        column_tools.insert("Execute".to_string(), hashset! {
            "update_task_progress".to_string(),
            "link_document".to_string(),
            "request_help".to_string(),
        });
        
        column_tools.insert("Verify".to_string(), hashset! {
            "reflect_on_work".to_string(),
            "approve_completion".to_string(),
            "reject_to_execute".to_string(),
        });
        
        let platform_tools = hashset! {
            "query_health".to_string(),
            "query_projects".to_string(),
            "read_documents".to_string(),
            "get_context".to_string(),
            "register_agent".to_string(),
        };
        
        Self {
            column_tools,
            platform_tools,
            agent_type,
        }
    }
    
    /// Re-evaluate available tools after agent type or context changes
    pub fn get_available_tools(&self, current_column: Option<&str>) -> Vec<String> {
        match &self.agent_type {
            AgentType::Platform { allowed_endpoints, .. } => {
                // Platform agents: filter by endpoint permissions
                let mut tools = vec!["query_health".to_string(), "register_agent".to_string()];
                
                if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects")) {
                    tools.push("query_projects".to_string());
                }
                
                if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects/:projectId/docs")) {
                    tools.push("read_documents".to_string());
                }
                
                if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects/:projectId/tasks")) {
                    tools.push("get_context".to_string());
                }
                
                tools
            }
            AgentType::ProjectDelegated { .. } => {
                // Project agents: filter by column + always-available tools
                let mut tools = vec!["register_agent".to_string()]; // Always available
                
                if let Some(column) = current_column {
                    if let Some(column_tools) = self.column_tools.get(column) {
                        tools.extend(column_tools.iter().cloned());
                    }
                }
                
                tools
            }
        }
    }
    
    /// Validate tool is available in current context
    pub fn validate_tool(&self, tool_name: &str, current_column: Option<&str>) -> Result<(), ToolValidationError> {
        let available_tools = self.get_available_tools(current_column);
        
        if !available_tools.contains(&tool_name.to_string()) {
            return Err(ToolValidationError::ToolNotAvailable {
                tool: tool_name.to_string(),
                agent_type: format!("{:?}", self.agent_type),
                column: current_column.map(|s| s.to_string()),
                available_tools,
            });
        }
        
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ToolValidationError {
    #[error("Tool '{tool}' not available for {agent_type} in column {column:?}. Available: {available_tools:?}")]
    ToolNotAvailable {
        tool: String,
        agent_type: String,
        column: Option<String>,
        available_tools: Vec<String>,
    },
}
```

### Atomic Write Pattern for Configuration

```rust
use tempfile::NamedTempFile;
use std::path::Path;

pub struct AtomicConfigWriter;

impl AtomicConfigWriter {
    /// Atomic write: create temp file, write content, then rename
    /// If process crashes during write, original config remains intact
    pub async fn write_config<P: AsRef<Path>>(
        path: P,
        config: &AgentConfig,
    ) -> Result<(), ConfigWriteError> {
        let path = path.as_ref();
        
        // STEP 1: Serialize to string first (fail fast if serialization fails)
        let content = toml::to_string_pretty(config)
            .map_err(|e| ConfigWriteError::SerializationFailed(e.to_string()))?;
        
        // STEP 2: Create temporary file in same directory (ensures same filesystem)
        let temp_dir = path.parent().unwrap_or_else(|| Path::new("."));
        let mut temp_file = NamedTempFile::new_in(temp_dir)
            .map_err(|e| ConfigWriteError::TempFileCreation(e.to_string()))?;
        
        // STEP 3: Write to temp file
        tokio::fs::write(temp_file.path(), &content).await
            .map_err(|e| ConfigWriteError::WriteError(e.to_string()))?;
        
        // STEP 4: Atomic rename (this is the critical atomic operation)
        temp_file.persist(path)
            .map_err(|e| ConfigWriteError::AtomicRenameFailed(e.to_string()))?;
        
        tracing::info!("Config atomically written to {}", path.display());
        Ok(())
    }
    
    /// Backup existing config before writing new one
    pub async fn write_config_with_backup<P: AsRef<Path>>(
        path: P,
        config: &AgentConfig,
    ) -> Result<(), ConfigWriteError> {
        let path = path.as_ref();
        
        // Create backup if original exists
        if path.exists() {
            let backup_path = format!("{}.backup.{}", 
                path.display(), 
                chrono::Utc::now().format("%Y%m%d_%H%M%S")
            );
            
            tokio::fs::copy(path, &backup_path).await
                .map_err(|e| ConfigWriteError::BackupFailed(e.to_string()))?;
            
            tracing::info!("Config backed up to {}", backup_path);
        }
        
        // Atomic write
        Self::write_config(path, config).await
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigWriteError {
    #[error("Serialization failed: {0}")]
    SerializationFailed(String),
    
    #[error("Temp file creation failed: {0}")]
    TempFileCreation(String),
    
    #[error("Write error: {0}")]
    WriteError(String),
    
    #[error("Atomic rename failed: {0}")]
    AtomicRenameFailed(String),
    
    #[error("Backup failed: {0}")]
    BackupFailed(String),
}
```

| Column | Project Agent Tools | Platform Agent Tools | Persona |
|--------|-------------------|---------------------|---------|
| **Specify** | `commit_artifact`, `request_architecture_review`, `propose_constitution_amendment` | `query_context`, `read_documents` | Architect |
| **Plan** | `spawn_sub_board`, `estimate_complexity` | `query_context`, `read_documents` | Planner |
| **Execute** | `update_task_progress`, `link_document`, `request_help` | `query_context`, `read_documents` | Coder |
| **Verify** | `reflect_on_work`, `approve_completion`, `reject_to_execute` | `query_context`, `read_documents` | Critic |
| **Any** | `register_agent`, `switch_agent` | `query_health`, `query_projects`, `register_agent` | Context-dependent |

**Platform Agent Restrictions:**
- ❌ **No Write Operations**: Cannot create, update, or delete tasks/documents
- ❌ **No State Changes**: Cannot move tasks between columns or change workflow state
- ❌ **No Governance**: Cannot propose constitution amendments or ratify specifications
- ✅ **Read-Only Access**: Can query context, read documents, check health
- ✅ **System Integration**: Perfect for monitoring, reporting, and external system integration

### 1. MCP Server Interface (with Agent Type Detection and Tool Filtering)

**Responsibility**: Protocol-level communication with agent clients using rust-mcp-sdk, with dynamic tool registration based on agent type

```rust
use rust_mcp_sdk::{
    mcp_server::{server_runtime, ServerHandler},
    schema::*,
    macros,
};
use std::sync::Arc;

pub struct VibeTaskHandler {
    agent_type: AgentType,
    lattice: Arc<LatticeEngine>,
    context_asm: Arc<ContextAssembler>,
    api: Arc<VibeTaskClient>,
    config_path: String,
}

impl VibeTaskHandler {
    pub async fn new(config_path: String) -> Result<Self, InitError> {
        // Load configuration and detect agent type
        let api = Arc::new(VibeTaskClient::new());
        let detector = AgentTypeDetector::new(config_path.clone(), api.clone());
        let agent_type = detector.detect_active_agent().await?;
        
        // Initialize components
        let lattice = Arc::new(LatticeEngine::new());
        let context_asm = Arc::new(ContextAssembler::new());
        
        Ok(Self {
            agent_type,
            lattice,
            context_asm,
            api,
            config_path,
        })
    }
}

#[async_trait]
impl ServerHandler for VibeTaskHandler {
    async fn handle_initialize_request(
        &self,
        params: InitializeParams,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<InitializeResult, RpcError> {
        // Return capabilities based on agent type
        let capabilities = match &self.agent_type {
            AgentType::Platform { .. } => {
                ServerCapabilities {
                    tools: Some(ToolsCapability {
                        list_changed: Some(false), // Static tool list for platform agents
                    }),
                    resources: None,  // Platform agents don't get resources
                    prompts: None,    // Platform agents don't get prompts
                }
            }
            AgentType::ProjectDelegated { .. } => {
                ServerCapabilities {
                    tools: Some(ToolsCapability {
                        list_changed: Some(true), // Dynamic based on column
                    }),
                    resources: Some(ResourcesCapability {
                        subscribe: Some(true),
                        list_changed: Some(true),
                    }),
                    prompts: Some(PromptsCapability {
                        list_changed: Some(true),
                    }),
                }
            }
        };
        
        let instructions = self.generate_instructions();
        
        Ok(InitializeResult {
            protocol_version: "2024-11-05".to_string(),
            capabilities,
            server_info: Implementation {
                name: "vibetask-mcp".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
            instructions: Some(instructions),
        })
    }
    
    async fn handle_list_tools_request(
        &self,
        _request: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<ListToolsResult, RpcError> {
        let tools = match &self.agent_type {
            AgentType::Platform { allowed_endpoints, .. } => {
                // Platform agents get read-only tools based on endpoint permissions
                self.get_platform_tools(allowed_endpoints)
            }
            AgentType::ProjectDelegated { .. } => {
                // Project agents get tools based on current task column
                let task_id = self.get_current_task_id()
                    .ok_or_else(|| RpcError::invalid_request("No active task context"))?;
                
                let column = self.api.get_task_column(&task_id).await
                    .map_err(|e| RpcError::internal_error(format!("Hub error: {}", e), None))?;
                
                self.lattice.get_tools_for_column(&column.name)
            }
        };
        
        Ok(ListToolsResult {
            tools,
            next_cursor: None,
        })
    }
    
    async fn handle_call_tool_request(
        &self,
        params: CallToolRequestParams,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<CallToolResult, CallToolError> {
        // Pre-flight check: Validate agent can use this tool
        match &self.agent_type {
            AgentType::Platform { .. } => {
                if self.is_write_tool(&params.name) {
                    return Err(CallToolError::invalid_params(&format!(
                        "Platform Agent attempted write operation: {}. Platform agents are read-only.",
                        params.name
                    )));
                }
            }
            AgentType::ProjectDelegated { .. } => {
                // Column gating for project agents
                if let Some(task_id) = params.arguments.get("task_id").and_then(|v| v.as_str()) {
                    let column = self.api.get_task_column(task_id).await
                        .map_err(|e| CallToolError::internal_error(&format!("Hub unavailable: {}", e)))?;
                    
                    if !self.lattice.is_tool_valid_for_column(&params.name, &column.name) {
                        return Err(CallToolError::invalid_params(&format!(
                            "Tool '{}' not available in '{}' column", params.name, column.name
                        )));
                    }
                }
            }
        }
        
        // Execute with total fault isolation
        match self.execute_tool(&params).await {
            Ok(result) => Ok(result),
            Err(e) => {
                tracing::error!("Tool execution failed: {}", e);
                Err(CallToolError::internal_error(&format!(
                    "Tool failed (Hub status: {}). Retry or contact support.",
                    self.api.health_check().await.unwrap_or("unknown")
                )))
            }
        }
    }
}

impl VibeTaskHandler {
    fn generate_instructions(&self) -> String {
        match &self.agent_type {
            AgentType::Platform { name, effective_endpoints } => {
                format!(
                    "You are connected to VibeTask as **Platform Agent '{}'** (read-only).\n\n\
                    You can query projects, tasks, and documents for integration purposes, \
                    but cannot modify state, create tasks, or move workflow items.\n\n\
                    **Available endpoints:** {}\n\n\
                    **Available tools:** query_health, query_projects, read_documents, get_context\n\n\
                    Use this connection for monitoring, reporting, and system integration.",
                    name,
                    effective_endpoints.join(", ")
                )
            }
            AgentType::ProjectDelegated { name, delegations, .. } => {
                let projects_info = delegations.iter()
                    .map(|d| format!("{} ({})", d.project_name, d.permission_level))
                    .collect::<Vec<_>>()
                    .join(", ");
                
                format!(
                    "You are connected to VibeTask as **Project Agent '{}'**.\n\n\
                    **Delegated Projects:** {}\n\n\
                    Follow the Lattice workflow: **Specify → Plan → Execute → Verify**\n\n\
                    Tools change dynamically based on your current task's column position. \
                    Focus on one task at a time and follow the structured development process.",
                    name,
                    projects_info
                )
            }
        }
    }
    
    fn get_platform_tools(&self, allowed_endpoints: &[String]) -> Vec<Tool> {
        let mut tools = vec![
            self.create_tool_schema("query_health", "Check Hub connectivity and system status"),
            self.create_tool_schema("register_agent", "Register new agent credentials"),
        ];
        
        // Add tools based on endpoint permissions
        if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects")) {
            tools.push(self.create_tool_schema("query_projects", "List accessible projects"));
        }
        
        if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects/:projectId/tasks")) {
            tools.push(self.create_tool_schema("query_tasks", "List tasks in project"));
        }
        
        if allowed_endpoints.iter().any(|e| e.contains("/api/agent/projects/:projectId/docs")) {
            tools.push(self.create_tool_schema("read_documents", "Read project documents"));
        }
        
        tools
    }
    
    fn is_write_tool(&self, tool_name: &str) -> bool {
        matches!(tool_name, 
            "commit_artifact" | "spawn_sub_board" | "reflect_on_work" | 
            "update_task_progress" | "link_document" | "approve_completion" |
            "reject_to_execute" | "propose_constitution_amendment" |
            "confirm_constitution_amendment"
        )
    }
}
```

**Architectural Mandates:**
- **Agent Type Detection**: Must call `/api/agent/me` on startup to determine capabilities
- **Dynamic Tool Registration**: Tools appear/disappear based on agent type and column position
- **Total Fault Isolation**: No unwrap(), all errors return proper MCP responses
- **Stateless Operation**: Zero local state, Hub is single source of truth
- **Permission Enforcement**: Platform agents blocked from write operations at MCP layer

### 2. Lattice Engine

```rust
pub struct LatticeEngine {
    column_map: HashMap<String, ColumnConfig>,
}

pub struct ColumnConfig {
    pub persona_system_prompt: String,
    pub valid_tools: HashSet<String>,
    pub exit_gates: Vec<ExitGate>,  // What must be true to leave column
}

impl LatticeEngine {
    pub fn new() -> Self {
        let mut column_map = HashMap::new();
        
        column_map.insert("Specify".to_string(), ColumnConfig {
            persona_system_prompt: include_str!("../prompts/architect.md"),
            valid_tools: hashset! {
                "commit_artifact",
                "request_architecture_review",
                "propose_constitution_amendment",  // Governance
            },
            exit_gates: vec![
                ExitGate::DocumentExists(DocumentType::Specification),
                ExitGate::Custom(Box::new(|task| {
                    // Specification must have "RATIFIED" in title or metadata
                    task.linked_docs.iter().any(|d|
                        d.doc_type == DocumentType::Specification &&
                        d.title.contains("[RATIFIED]")
                    )
                })),
            ],
        });
        
        // ... Plan, Execute, Verify columns ...
        
        Self { column_map }
    }
    
    pub fn get_tools_for_column(&self, column: &str) -> Vec<Tool> {
        self.column_map.get(column)
            .map(|c| c.valid_tools.iter().map(tool_name_to_schema).collect())
            .unwrap_or_default()
    }
}
```

### 3. Context Assembler (with Token Budgeting Algorithm)

**Responsibility**: JIT context optimization with explicit token budget enforcement

#### Token Budgeting Algorithm Implementation

**Core Requirements:**
| Constraint | Value | Rationale |
|------------|-------|-----------|
| Hard token limit | 5500 | LLM context window efficiency (4000 + 1500 buffer) |
| Constitution | Never summarized | Governance integrity |
| Specification | Summarized if > 2000 tokens | Flexibility for large specs |
| Metadata | 500 tokens max | Task identification |
| Persona | 1000 tokens max | Role context |
| Buffer | 500 tokens | Reserved for LLM response |

```rust
use tiktoken_rs::cl100k_base; // OpenAI's cl100k tokenizer
use async_trait::async_trait;

pub struct TokenBudget {
    pub metadata: usize,      // 500
    pub persona: usize,       // 1000
    pub constitution: usize,  // 1500 (NEVER summarized)
    pub specification: usize, // 2000 (summarizable)
    pub buffer: usize,        // 500 (reserved)
    pub hard_limit: usize,    // 5500 total
}

impl Default for TokenBudget {
    fn default() -> Self {
        Self {
            metadata: 500,
            persona: 1000,
            constitution: 1500,
            specification: 2000,
            buffer: 500,
            hard_limit: 5500,
        }
    }
}

// Budget enforcement modes
pub enum BudgetMode {
    Strict,      // Fail if any component exceeds budget
    Adaptive,    // Summarize specification, truncate others
    Emergency,   // Aggressive truncation to fit
}

#[derive(Debug, Clone)]
pub struct AssembledContext {
    pub metadata: TaskMetadata,
    pub persona: PersonaContext,
    pub constitution: Option<DocumentContent>,
    pub specification: Option<DocumentContent>,
    pub annotations: Vec<Annotation>,
    
    // Token accounting
    pub token_count: usize,
    pub budget_breakdown: BudgetBreakdown,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BudgetBreakdown {
    pub metadata_tokens: usize,
    pub persona_tokens: usize,
    pub constitution_tokens: usize,
    pub specification_tokens: usize,
    pub total_tokens: usize,
    pub remaining_budget: usize,
}
```

**Tokenizer Abstraction:**
```rust
pub trait Tokenizer: Send + Sync {
    fn count_tokens(&self, text: &str) -> usize;
    fn truncate(&self, text: &str, max_tokens: usize) -> String;
    fn truncate_with_suffix(&self, text: &str, max_tokens: usize, suffix: &str) -> String;
}

pub struct Cl100kTokenizer;

impl Tokenizer for Cl100kTokenizer {
    fn count_tokens(&self, text: &str) -> usize {
        // tiktoken_rs uses cl100k_base (GPT-4, GPT-3.5-turbo)
        cl100k_base()
            .encode_with_special_tokens(text)
            .len()
    }
    
    fn truncate(&self, text: &str, max_tokens: usize) -> String {
        let bpe = cl100k_base();
        let tokens = bpe.encode_with_special_tokens(text);
        
        if tokens.len() <= max_tokens {
            return text.to_string();
        }
        
        let truncated = &tokens[..max_tokens];
        bpe.decode(truncated.to_vec())
            .unwrap_or_else(|_| text.chars().take(max_tokens * 4).collect())
    }
    
    fn truncate_with_suffix(&self, text: &str, max_tokens: usize, suffix: &str) -> String {
        let suffix_tokens = self.count_tokens(suffix);
        let content_budget = max_tokens.saturating_sub(suffix_tokens);
        let truncated = self.truncate(text, content_budget);
        format!("{}{}", truncated, suffix)
    }
}
```

#### Recursive Summarization Algorithm

**MANDATE**: Constitution is immutable_context - if truncated, return error rather than broken law

```rust
pub struct RecursiveSummarizer<T: Tokenizer> {
    tokenizer: T,
    max_iterations: usize,
}

impl<T: Tokenizer> RecursiveSummarizer<T> {
    pub async fn summarize_to_fit(
        &self,
        text: &str,
        target_tokens: usize,
        preserve_sections: &[&str], // API signatures, headers to keep
    ) -> Result<String, SummarizationError> {
        let mut current_text = text.to_string();
        let mut iteration = 0;
        
        while self.tokenizer.count_tokens(&current_text) > target_tokens {
            if iteration >= self.max_iterations {
                return Err(SummarizationError::MaxIterationsExceeded {
                    iterations: self.max_iterations,
                    final_tokens: self.tokenizer.count_tokens(&current_text),
                    target: target_tokens,
                });
            }
            
            // STEP 1: Identify largest SPECIFICATION block
            let largest_block = self.find_largest_block(&current_text, preserve_sections)?;
            
            if largest_block.is_empty() {
                // No more blocks to summarize, must truncate
                return Ok(self.tokenizer.truncate_with_suffix(
                    &current_text,
                    target_tokens,
                    "\n\n[Content truncated - exceeded summarization limit]"
                ));
            }
            
            // STEP 2: Ask LLM to summarize this block
            let summarized_block = self.llm_summarize_block(
                &largest_block,
                target_tokens / 2, // Conservative target
                preserve_sections,
            ).await?;
            
            // STEP 3: Replace in text
            current_text = current_text.replace(&largest_block, &summarized_block);
            iteration += 1;
        }
        
        Ok(current_text)
    }
    
    fn find_largest_block(&self, text: &str, preserve_sections: &[&str]) -> Result<String, SummarizationError> {
        let sections = self.extract_sections(text);
        
        // Find largest section that's not in preserve list
        let mut largest = String::new();
        let mut largest_tokens = 0;
        
        for section in sections {
            let should_preserve = preserve_sections.iter()
                .any(|preserve| section.contains(preserve));
            
            if !should_preserve {
                let tokens = self.tokenizer.count_tokens(&section);
                if tokens > largest_tokens {
                    largest = section;
                    largest_tokens = tokens;
                }
            }
        }
        
        Ok(largest)
    }
    
    async fn llm_summarize_block(
        &self,
        block: &str,
        target_tokens: usize,
        preserve_sections: &[&str],
    ) -> Result<String, SummarizationError> {
        // Use external LLM API for summarization
        let prompt = format!(
            "Summarize this specification block to exactly {} tokens while preserving:\n\
            - All API signatures and function names\n\
            - Section headers: {}\n\
            - Key requirements and constraints\n\n\
            Block to summarize:\n{}",
            target_tokens,
            preserve_sections.join(", "),
            block
        );
        
        // Call external summarization service
        // For MVP: use simple truncation with key section extraction
        let key_parts = self.extract_key_parts(block, preserve_sections);
        let combined = key_parts.join("\n\n");
        
        if self.tokenizer.count_tokens(&combined) <= target_tokens {
            Ok(combined)
        } else {
            Ok(self.tokenizer.truncate_with_suffix(
                &combined,
                target_tokens,
                "\n\n[Summarized for length]"
            ))
        }
    }
}

/// FIDELITY LOCK: Constitution immutability check
pub fn validate_constitution_fidelity(
    constitution: &DocumentContent,
    budget: &TokenBudget,
    tokenizer: &impl Tokenizer,
) -> Result<(), AssemblyError> {
    let tokens = tokenizer.count_tokens(&constitution.content);
    
    if tokens > budget.constitution {
        return Err(AssemblyError::ConstitutionImmutable {
            actual_tokens: tokens,
            max_allowed: budget.constitution,
            message: format!(
                "Constitution ({} tokens) exceeds budget ({} tokens). \
                Constitution is immutable_context and cannot be truncated. \
                Increase token budget or reduce Constitution size.",
                tokens, budget.constitution
            ),
        });
    }
    
    Ok(())
}
```
```

#### Task Atomicity Algorithm for SpawnSubBoard

**MANDATE**: Prevent duplicate task names and enforce "Max 3 Modified Files" complexity limit

```rust
use std::collections::HashSet;
use regex::Regex;

pub struct TaskAtomicityValidator {
    max_files_per_task: usize,
    reserved_names: HashSet<String>,
}

impl TaskAtomicityValidator {
    pub fn new() -> Self {
        Self {
            max_files_per_task: 3,
            reserved_names: hashset! {
                "setup".to_string(),
                "cleanup".to_string(),
                "test".to_string(),
                "build".to_string(),
            },
        }
    }
    
    /// Parse implementation plan with atomicity validation
    pub fn parse_implementation_plan(&self, content: &str) -> Result<Vec<AtomicTask>, ParseError> {
        let raw_tasks = self.extract_tasks_from_markdown(content)?;
        let mut validated_tasks = Vec::new();
        let mut seen_names = HashSet::new();
        
        for raw_task in raw_tasks {
            // VALIDATION 1: Unique names (case-insensitive)
            let normalized_name = raw_task.name.to_lowercase().replace(" ", "_");
            if seen_names.contains(&normalized_name) {
                return Err(ParseError::DuplicateTaskName {
                    name: raw_task.name.clone(),
                    normalized: normalized_name,
                });
            }
            
            if self.reserved_names.contains(&normalized_name) {
                return Err(ParseError::ReservedTaskName {
                    name: raw_task.name.clone(),
                    reserved: normalized_name,
                });
            }
            
            seen_names.insert(normalized_name);
            
            // VALIDATION 2: Complexity limit (max 3 modified files)
            let file_count = self.count_modified_files(&raw_task.description)?;
            if file_count > self.max_files_per_task {
                return Err(ParseError::TaskTooComplex {
                    name: raw_task.name.clone(),
                    file_count,
                    max_allowed: self.max_files_per_task,
                    suggestion: format!(
                        "Split into {} smaller tasks, each modifying ≤{} files",
                        (file_count + self.max_files_per_task - 1) / self.max_files_per_task,
                        self.max_files_per_task
                    ),
                });
            }
            
            // VALIDATION 3: Atomic scope (single responsibility)
            self.validate_atomic_scope(&raw_task)?;
            
            validated_tasks.push(AtomicTask {
                name: raw_task.name,
                description: raw_task.description,
                estimated_files: file_count,
                dependencies: raw_task.dependencies,
                acceptance_criteria: raw_task.acceptance_criteria,
            });
        }
        
        // VALIDATION 4: Dependency graph (no cycles)
        self.validate_dependency_graph(&validated_tasks)?;
        
        Ok(validated_tasks)
    }
    
    fn extract_tasks_from_markdown(&self, content: &str) -> Result<Vec<RawTask>, ParseError> {
        let mut tasks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        let mut current_task: Option<RawTask> = None;
        
        // Regex patterns for task detection
        let task_header = Regex::new(r"^#+\s+(.+)$").unwrap();
        let checkbox_item = Regex::new(r"^-\s*\[\s*\]\s+(.+)$").unwrap();
        let dependency = Regex::new(r"depends on:?\s*(.+)$").unwrap();
        
        for (line_num, line) in lines.iter().enumerate() {
            let line = line.trim();
            
            // Task header (## Task Name or ### Task Name)
            if let Some(captures) = task_header.captures(line) {
                // Save previous task
                if let Some(task) = current_task.take() {
                    tasks.push(task);
                }
                
                // Start new task
                current_task = Some(RawTask {
                    name: captures[1].trim().to_string(),
                    description: String::new(),
                    dependencies: Vec::new(),
                    acceptance_criteria: Vec::new(),
                    line_number: line_num + 1,
                });
            }
            // Checkbox item (task step)
            else if let Some(captures) = checkbox_item.captures(line) {
                if let Some(ref mut task) = current_task {
                    let item = captures[1].trim().to_string();
                    
                    // Check for dependencies
                    if let Some(dep_captures) = dependency.captures(&item) {
                        let deps: Vec<String> = dep_captures[1]
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .collect();
                        task.dependencies.extend(deps);
                    } else {
                        task.acceptance_criteria.push(item);
                    }
                }
            }
            // Regular description line
            else if !line.is_empty() && current_task.is_some() {
                if let Some(ref mut task) = current_task {
                    if !task.description.is_empty() {
                        task.description.push('\n');
                    }
                    task.description.push_str(line);
                }
            }
        }
        
        // Save final task
        if let Some(task) = current_task {
            tasks.push(task);
        }
        
        if tasks.is_empty() {
            return Err(ParseError::NoTasksFound);
        }
        
        Ok(tasks)
    }
    
    fn count_modified_files(&self, description: &str) -> Result<usize, ParseError> {
        // Look for file patterns in description
        let file_patterns = vec![
            Regex::new(r"(?i)create\s+([a-zA-Z0-9_./]+\.[a-zA-Z]+)").unwrap(),
            Regex::new(r"(?i)modify\s+([a-zA-Z0-9_./]+\.[a-zA-Z]+)").unwrap(),
            Regex::new(r"(?i)update\s+([a-zA-Z0-9_./]+\.[a-zA-Z]+)").unwrap(),
            Regex::new(r"(?i)edit\s+([a-zA-Z0-9_./]+\.[a-zA-Z]+)").unwrap(),
            Regex::new(r"`([a-zA-Z0-9_./]+\.[a-zA-Z]+)`").unwrap(), // Backtick files
        ];
        
        let mut files = HashSet::new();
        
        for pattern in &file_patterns {
            for captures in pattern.captures_iter(description) {
                if let Some(file) = captures.get(1) {
                    files.insert(file.as_str().to_string());
                }
            }
        }
        
        // If no explicit files mentioned, estimate from complexity indicators
        if files.is_empty() {
            let complexity_indicators = vec![
                "implement", "create", "add", "build", "write",
                "refactor", "restructure", "redesign",
            ];
            
            let indicator_count = complexity_indicators.iter()
                .filter(|&indicator| description.to_lowercase().contains(indicator))
                .count();
            
            // Heuristic: 1 file per complexity indicator, minimum 1
            return Ok(std::cmp::max(1, indicator_count));
        }
        
        Ok(files.len())
    }
    
    fn validate_atomic_scope(&self, task: &RawTask) -> Result<(), ParseError> {
        let description_lower = task.description.to_lowercase();
        
        // Check for scope violations
        let scope_violations = vec![
            ("and", "Task should focus on single responsibility"),
            ("also", "Task should not have multiple unrelated actions"),
            ("then", "Task should not chain multiple operations"),
            ("plus", "Task should not combine unrelated features"),
        ];
        
        for (keyword, message) in scope_violations {
            if description_lower.contains(keyword) {
                return Err(ParseError::NonAtomicScope {
                    name: task.name.clone(),
                    violation: keyword.to_string(),
                    message: message.to_string(),
                    suggestion: "Split into separate tasks for each responsibility".to_string(),
                });
            }
        }
        
        Ok(())
    }
    
    fn validate_dependency_graph(&self, tasks: &[AtomicTask]) -> Result<(), ParseError> {
        let task_names: HashSet<String> = tasks.iter().map(|t| t.name.clone()).collect();
        
        // Check all dependencies exist
        for task in tasks {
            for dep in &task.dependencies {
                if !task_names.contains(dep) {
                    return Err(ParseError::UnknownDependency {
                        task: task.name.clone(),
                        dependency: dep.clone(),
                        available: task_names.iter().cloned().collect(),
                    });
                }
            }
        }
        
        // Check for cycles using DFS
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();
        
        for task in tasks {
            if !visited.contains(&task.name) {
                if self.has_cycle(task, tasks, &mut visited, &mut rec_stack)? {
                    return Err(ParseError::CircularDependency {
                        cycle: rec_stack.iter().cloned().collect(),
                    });
                }
            }
        }
        
        Ok(())
    }
    
    fn has_cycle(
        &self,
        task: &AtomicTask,
        all_tasks: &[AtomicTask],
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
    ) -> Result<bool, ParseError> {
        visited.insert(task.name.clone());
        rec_stack.insert(task.name.clone());
        
        for dep_name in &task.dependencies {
            if let Some(dep_task) = all_tasks.iter().find(|t| &t.name == dep_name) {
                if !visited.contains(dep_name) {
                    if self.has_cycle(dep_task, all_tasks, visited, rec_stack)? {
                        return Ok(true);
                    }
                } else if rec_stack.contains(dep_name) {
                    return Ok(true); // Cycle found
                }
            }
        }
        
        rec_stack.remove(&task.name);
        Ok(false)
    }
}

#[derive(Debug, Clone)]
pub struct RawTask {
    pub name: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub acceptance_criteria: Vec<String>,
    pub line_number: usize,
}

#[derive(Debug, Clone)]
pub struct AtomicTask {
    pub name: String,
    pub description: String,
    pub estimated_files: usize,
    pub dependencies: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("Duplicate task name: '{name}' (normalized: '{normalized}')")]
    DuplicateTaskName { name: String, normalized: String },
    
    #[error("Reserved task name: '{name}' (conflicts with: '{reserved}')")]
    ReservedTaskName { name: String, reserved: String },
    
    #[error("Task too complex: '{name}' modifies {file_count} files (max: {max_allowed}). {suggestion}")]
    TaskTooComplex {
        name: String,
        file_count: usize,
        max_allowed: usize,
        suggestion: String,
    },
    
    #[error("Non-atomic scope: '{name}' contains '{violation}' - {message}. {suggestion}")]
    NonAtomicScope {
        name: String,
        violation: String,
        message: String,
        suggestion: String,
    },
    
    #[error("Unknown dependency: '{task}' depends on '{dependency}'. Available: {available:?}")]
    UnknownDependency {
        task: String,
        dependency: String,
        available: Vec<String>,
    },
    
    #[error("Circular dependency detected: {cycle:?}")]
    CircularDependency { cycle: Vec<String> },
    
    #[error("No tasks found in implementation plan")]
    NoTasksFound,
}
```
```rust
pub struct ContextAssembler<T: Tokenizer, S: SummarizationService> {
    budget: TokenBudget,
    tokenizer: T,
    summarizer: S,
    mode: BudgetMode,
}

impl<T: Tokenizer, S: SummarizationService> ContextAssembler<T, S> {
    pub async fn assemble(
        &self,
        task: &Task,
        column: &Column,
        linked_docs: Vec<Document>,
        api: &VibeTaskClient,
    ) -> Result<AssembledContext, AssemblyError> {
        let mut warnings = Vec::new();
        
        // STEP 1: Load Constitution (NEVER summarized)
        let constitution = self.load_constitution(&linked_docs).await?;
        
        if let Some(ref doc) = constitution {
            let tokens = self.tokenizer.count_tokens(&doc.content);
            if tokens > self.budget.constitution {
                match self.mode {
                    BudgetMode::Strict => {
                        return Err(AssemblyError::ConstitutionTooLarge {
                            actual: tokens,
                            max: self.budget.constitution,
                        });
                    }
                    BudgetMode::Emergency => {
                        warnings.push(format!(
                            "WARNING: Constitution truncated from {} to {} tokens",
                            tokens, self.budget.constitution
                        ));
                    }
                    _ => {}
                }
            }
        }
        
        // STEP 2: Load and potentially summarize Specification
        let specification = self.load_and_summarize_specification(&linked_docs).await?;
        
        // STEP 3: Build metadata (always included, truncated if needed)
        let metadata = self.build_metadata(task, column);
        let metadata_text = self.format_metadata(&metadata);
        let metadata_tokens = self.tokenizer.count_tokens(&metadata_text);
        
        if metadata_tokens > self.budget.metadata {
            warnings.push(format!(
                "Metadata truncated: {} > {} tokens",
                metadata_tokens, self.budget.metadata
            ));
        }
        
        // STEP 4: Build persona context
        let persona = self.build_persona(column);
        let persona_text = self.format_persona(&persona);
        let persona_tokens = self.tokenizer.count_tokens(&persona_text);
        
        if persona_tokens > self.budget.persona {
            warnings.push(format!(
                "Persona truncated: {} > {} tokens",
                persona_tokens, self.budget.persona
            ));
        }
        
        // STEP 5: Calculate total and enforce hard limit
        let constitution_tokens = constitution
            .as_ref()
            .map(|d| self.tokenizer.count_tokens(&d.content))
            .unwrap_or(0);
        
        let specification_tokens = specification
            .as_ref()
            .map(|d| self.tokenizer.count_tokens(&d.content))
            .unwrap_or(0);
        
        let total = metadata_tokens + persona_tokens + constitution_tokens + specification_tokens;
        
        if total > self.budget.hard_limit {
            match self.mode {
                BudgetMode::Strict => {
                    return Err(AssemblyError::BudgetExceeded {
                        actual: total,
                        limit: self.budget.hard_limit,
                        breakdown: BudgetBreakdown {
                            metadata_tokens,
                            persona_tokens,
                            constitution_tokens,
                            specification_tokens,
                            total_tokens: total,
                            remaining_budget: 0,
                        },
                    });
                }
                BudgetMode::Emergency => {
                    // Aggressive truncation
                    return self.assemble_emergency(
                        task, column, linked_docs, api,
                        metadata_tokens, persona_tokens, constitution_tokens, specification_tokens,
                    ).await;
                }
                BudgetMode::Adaptive => {
                    // Try to summarize more aggressively
                    return self.assemble_adaptive_retry(
                        task, column, linked_docs, api, total,
                    ).await;
                }
            }
        }
        
        // STEP 6: Build final context
        Ok(AssembledContext {
            metadata,
            persona,
            constitution,
            specification,
            annotations: Vec::new(),
            
            token_count: total,
            budget_breakdown: BudgetBreakdown {
                metadata_tokens,
                persona_tokens,
                constitution_tokens,
                specification_tokens,
                total_tokens: total,
                remaining_budget: self.budget.hard_limit - total,
            },
            warnings,
        })
    }
}
```

**Error Types:**
```rust
#[derive(Debug, thiserror::Error)]
pub enum AssemblyError {
    #[error("Constitution too large: {actual} tokens (max {max})")]
    ConstitutionTooLarge { actual: usize, max: usize },
    
    #[error("Token budget exceeded: {actual} > {limit}\n{breakdown:#?}")]
    BudgetExceeded {
        actual: usize,
        limit: usize,
        breakdown: BudgetBreakdown,
    },
    
    #[error("Summarization failed: {0}")]
    SummarizationFailed(String),
    
    #[error("Hub API error: {0}")]
    ApiError(#[from] reqwest::Error),
}
```

### 4. Agent Tools (using rust-mcp-sdk macros)

**Responsibility**: Workflow-specific tool implementations using procedural macros

#### MCP Tool Macro Deep Dive

The `#[mcp_tool]` macro from rust-mcp-sdk eliminates ~80% of MCP boilerplate by performing three key transformations:

| Transformation | Input | Output |
|---------------|-------|--------|
| Schema Generation | Doc comments + fields | JSON Schema for MCP tools/list |
| Trait Implementation | Struct definition | Tool trait with metadata |
| Handler Registration | execute method | Boilerplate for ServerHandler integration |

**Complete Implementation Pattern:**

```rust
use rust_mcp_sdk::macros;
use rust_mcp_sdk::schema::{CallToolResult, CallToolError};
use serde::{Serialize, Deserialize};
use schemars::JsonSchema;
use std::sync::Arc;

// 1. TOOL DEFINITION (macro generates schema + metadata)
#[macros::mcp_tool(
    name = "commit_artifact",
    description = "Generate or refine SPECIFICATION.md in the Hub. Use [RATIFIED] in title to mark as complete."
)]
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct CommitArtifact {
    /// Task ID to attach specification to
    pub task_id: String,
    /// Full markdown content of specification
    pub content: String,
    /// Set to true when ready for Plan column
    pub is_ratification: bool,
}

// 2. EXECUTION CONTEXT (dependency injection)
pub struct CommitArtifactContext {
    pub api: Arc<VibeTaskClient>,
}

// 3. YOUR IMPLEMENTATION (business logic)
impl CommitArtifact {
    pub async fn execute_with_context(
        &self,
        ctx: &CommitArtifactContext,
    ) -> Result<CallToolResult, CallToolError> {
        // COLUMN GATING: Verify task is in Specify column
        let task = ctx.api.get_task(&self.task_id).await
            .map_err(|e| CallToolError::internal_error(&format!(
                "Failed to fetch task: {}", e
            )))?;
        
        let column = ctx.api.get_column(&task.column_id).await
            .map_err(|e| CallToolError::internal_error(&format!(
                "Failed to fetch column: {}", e
            )))?;
        
        if column.name != "Specify" {
            return Err(CallToolError::invalid_params(&format!(
                "commit_artifact only available in Specify column. Current: {}",
                column.name
            )));
        }
        
        // VALIDATE: Content must have title
        if !self.content.starts_with("# ") {
            return Err(CallToolError::invalid_params(
                "Specification must start with # Title"
            ));
        }
        
        // ENFORCE: [RATIFIED] marker for ratification
        if self.is_ratification && !self.content.contains("[RATIFIED]") {
            return Err(CallToolError::invalid_params(
                "is_ratification=true requires [RATIFIED] in specification title"
            ));
        }
        
        // EXECUTE: Create or update document
        let doc = ctx.api.create_or_update_document(
            &self.task_id,
            CreateDocumentRequest {
                title: if self.is_ratification {
                    format!("SPECIFICATION.md [RATIFIED]")
                } else {
                    "SPECIFICATION.md [DRAFT]".to_string()
                },
                content: self.content.clone(),
                doc_type: DocumentType::Specification,
            }
        ).await.map_err(|e| CallToolError::internal_error(&format!(
            "Failed to save specification: {}", e
        )))?;
        
        // RESPOND: Success with context
        let message = if self.is_ratification {
            format!(
                "✅ Specification ratified and saved.\n\nDocument: {}\nTask {} is now eligible for Plan column.",
                doc.url, self.task_id
            )
        } else {
            format!(
                "📝 Specification draft saved.\n\nDocument: {}\nAdd [RATIFIED] to title when ready for Plan column.",
                doc.url
            )
        };
        
        Ok(CallToolResult::success(message))
    }
}
```

**ServerHandler Integration Pattern:**

```rust
#[async_trait]
impl ServerHandler for VibeTaskHandler {
    async fn handle_list_tools_request(
        &self,
        _request: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<ListToolsResult, RpcError> {
        let task_id = self.get_current_task_id()
            .ok_or_else(|| RpcError::invalid_request("No active task context"))?;
        
        let column = self.api.get_task_column(&task_id).await
            .map_err(|e| RpcError::internal_error(format!("Hub error: {}", e), None))?;
        
        // Return only tools valid for this column
        let tools = match column.name.as_str() {
            "Specify" => vec![
                CommitArtifact::tool_schema(),
                ProposeConstitutionAmendment::tool_schema(),
                ConfirmConstitutionAmendment::tool_schema(),
            ],
            "Plan" => vec![
                SpawnSubBoard::tool_schema(),
            ],
            "Verify" => vec![
                ReflectOnWork::tool_schema(),
            ],
            _ => vec![], // Unknown column = no tools
        };
        
        Ok(ListToolsResult { tools, next_cursor: None })
    }
    
    async fn handle_call_tool_request(
        &self,
        params: CallToolRequestParams,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<CallToolResult, CallToolError> {
        // Dispatch to appropriate tool with context
        match params.name.as_str() {
            "commit_artifact" => {
                let tool: CommitArtifact = self.parse_args(&params)?;
                tool.execute_with_context(&self.contexts.commit_artifact).await
            }
            "spawn_sub_board" => {
                let tool: SpawnSubBoard = self.parse_args(&params)?;
                tool.execute_with_context(&self.contexts.spawn_sub_board).await
            }
            "reflect_on_work" => {
                let tool: ReflectOnWork = self.parse_args(&params)?;
                tool.execute_with_context(&self.contexts.reflect_on_work).await
            }
            _ => Err(CallToolError::invalid_params(&format!(
                "Unknown tool: {}", params.name
            ))),
        }
    }
}
```

**Constitution Amendment with State Management:**

```rust
use chrono::{DateTime, Utc, Duration};
use std::collections::HashMap;
use std::sync::Mutex;

// In-memory store (production: Redis or database)
lazy_static::lazy_static! {
    static ref PENDING_AMENDMENTS: Mutex<HashMap<String, PendingAmendment>> = 
        Mutex::new(HashMap::new());
}

#[derive(Clone)]
pub struct PendingAmendment {
    pub proposed_content: String,
    pub rationale: String,
    pub expires_at: DateTime<Utc>,
}

#[macros::mcp_tool(
    name = "propose_constitution_amendment",
    description = "Propose a Constitution change. Returns confirmation code valid for 5 minutes."
)]
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ProposeConstitutionAmendment {
    pub proposed_content: String,
    pub rationale: String,
}

impl ProposeConstitutionAmendment {
    pub async fn execute_with_context(
        &self,
        ctx: &ConstitutionContext,
    ) -> Result<CallToolResult, CallToolError> {
        // COLUMN GATING: Only in Specify
        verify_column(ctx, "Specify").await?;
        
        // FETCH: Current Constitution for diff
        let current = ctx.api.get_constitution().await
            .map_err(|e| CallToolError::internal_error(&format!(
                "Failed to fetch Constitution: {}", e
            )))?;
        
        // GENERATE: Diff
        let diff = similar::TextDiff::from_lines(
            &current.content,
            &self.proposed_content
        );
        
        let diff_output = diff.unified_diff()
            .header("current", "proposed")
            .to_string();
        
        // GENERATE: Confirmation code (16 chars, alphanumeric)
        let code = nanoid::nanoid!(16);
        
        // STORE: With TTL
        let pending = PendingAmendment {
            proposed_content: self.proposed_content.clone(),
            rationale: self.rationale.clone(),
            expires_at: Utc::now() + Duration::minutes(5),
        };
        
        PENDING_AMENDMENTS.lock()
            .map_err(|_| CallToolError::internal_error("Lock poisoned"))?
            .insert(code.clone(), pending);
        
        // CLEANUP: Expired entries (best effort)
        cleanup_expired();
        
        // RESPOND: With clear instructions
        let response = format!(
            "⚠️  CONSTITUTION AMENDMENT PROPOSED\n\n\
            **This is a governance action requiring explicit confirmation.**\n\n\
            **Diff:**\n```diff\n{}\n```\n\n\
            **Rationale:** {}\n\n\
            **Confirmation Code:** `{}`\n\n\
            **Expires:** {} (5 minutes)\n\n\
            To confirm, run:\n\
            `confirm_constitution_amendment` with code `{}`",
            diff_output,
            self.rationale,
            code,
            pending.expires_at.format("%H:%M:%S"),
            code
        );
        
        Ok(CallToolResult::success(response))
    }
}
```

**Testing Macro-Generated Tools:**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::MockVibeTaskClient;
    
    #[tokio::test]
    async fn test_commit_artifact_column_gating() {
        let mut mock = MockVibeTaskClient::new();
        mock.expect_get_task()
            .returning(|_| Ok(Task {
                id: "1".to_string(),
                column_id: "2".to_string(),
                ..Default::default()
            }));
        mock.expect_get_column()
            .returning(|_| Ok(Column {
                name: "Execute".to_string(), // Wrong column!
                ..Default::default()
            }));
        
        let tool = CommitArtifact {
            task_id: "1".to_string(),
            content: "# Test".to_string(),
            is_ratification: false,
        };
        
        let ctx = CommitArtifactContext {
            api: Arc::new(mock),
        };
        
        let result = tool.execute_with_context(&ctx).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("only available in Specify"));
    }
    
    #[tokio::test]
    async fn test_constitution_confirmation_expires() {
        // Test TTL expiration logic
        let propose = ProposeConstitutionAmendment {
            proposed_content: "# New Constitution".to_string(),
            rationale: "Test amendment".to_string(),
        };
        
        let ctx = ConstitutionContext { api: Arc::new(mock) };
        let result = propose.execute_with_context(&ctx).await.unwrap();
        
        // Extract code from response
        let code = extract_confirmation_code(&result.content);
        
        // Fast-forward time (use mock clock in real implementation)
        tokio::time::sleep(Duration::from_secs(301)).await; // > 5 minutes
        
        // Confirm should fail
        let confirm = ConfirmConstitutionAmendment {
            confirmation_code: code,
        };
        
        let result = confirm.execute_with_context(&ctx).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("expired"));
    }
}
```

**Key Benefits of the Macro Pattern:**
- **80% Less Boilerplate**: Eliminates manual Tool trait implementation
- **Type Safety**: Automatic JSON Schema generation from Rust types
- **Error Prevention**: Compile-time validation of tool definitions
- **Consistent API**: Standardized parameter parsing and validation
- **Testing Support**: Easy to mock and test individual tools

**Macro Limitations & Workarounds:**

| Limitation | Workaround | Example |
|------------|------------|---------|
| No async in const | Use lazy_static or once_cell | Pending amendments store |
| No custom validation in schema | Validate in execute | Column gating, [RATIFIED] check |
| No generic tools | Macro generates concrete impl | One struct per tool |
| No tool inheritance | Composition + helper traits | ColumnGatedTool trait |

#### Phase 1: Product Design Tools (with Column Verification)
```rust
#[macros::mcp_tool(
    name = "commit_artifact",
    description = "Create or update SPECIFICATION.md. Must include [RATIFIED] in title to enable Plan transition."
)]
#[derive(Debug, Serialize, Deserialize, macros::JsonSchema)]
pub struct CommitArtifactTool {
    pub task_id: String,
    pub content: String,
    pub is_ratification: bool,  // true = ready for Plan column
}

#[macros::mcp_tool(
    name = "propose_constitution_amendment",
    description = "Propose Constitution change. Returns confirmation code for confirm_constitution_amendment."
)]
#[derive(Debug, Serialize, Deserialize, macros::JsonSchema)]
pub struct ProposeConstitutionAmendment {
    pub proposed_content: String,
    pub rationale: String,
}

impl ProposeConstitutionAmendment {
    pub async fn execute(&self, api: &VibeTaskClient) -> Result<CallToolResult> {
        // 1. Generate diff
        let current = api.get_constitution().await?;
        let diff = create_diff(&current.content, &self.proposed_content);
        
        // 2. Store pending with TTL
        let confirmation_code = generate_code();
        api.store_pending_amendment(PendingAmendment {
            code: confirmation_code.clone(),
            proposed_content: self.proposed_content.clone(),
            expires_at: Utc::now() + Duration::minutes(5),
        }).await?;
        
        Ok(CallToolResult::success(format!(
            "⚠️  CONSTITUTION AMENDMENT PROPOSED\n\n\
            Diff:\n{}\n\n\
            Rationale: {}\n\n\
            To confirm, run: confirm_constitution_amendment with code: {}",
            diff, self.rationale, confirmation_code
        )))
    }
}

#[macros::mcp_tool(
    name = "confirm_constitution_amendment",
    description = "Confirm pending Constitution amendment with code from propose_constitution_amendment"
)]
#[derive(Debug, Serialize, Deserialize, macros::JsonSchema)]
pub struct ConfirmConstitutionAmendment {
    pub confirmation_code: String,
}

impl ConfirmConstitutionAmendment {
    pub async fn execute(&self, api: &VibeTaskClient) -> Result<CallToolResult> {
        let pending = api.get_pending_amendment(&self.confirmation_code).await?
            .ok_or_else(|| CallToolError::invalid_params("Invalid or expired code"))?;
        
        if pending.expires_at < Utc::now() {
            return Err(CallToolError::invalid_params("Confirmation code expired (5 minute limit)"));
        }
        
        api.update_constitution(&pending.proposed_content).await?;
        api.clear_pending_amendment(&self.confirmation_code).await?;
        
        Ok(CallToolResult::success("Constitution amended successfully".to_string()))
    }
}
```

#### Phase 2: Sprint Planning Tools (with Column Verification)
```rust
#[macros::mcp_tool(
    name = "spawn_sub_board",
    description = "Parse IMPLEMENTATION_PLAN.md and create atomic sub-tasks. Requires parent task to have ratified specification."
)]
#[derive(Debug, Serialize, Deserialize, macros::JsonSchema)]
pub struct SpawnSubBoardTool {
    pub parent_task_id: String,
    pub implementation_plan: String,  // Parsed to extract tasks
}

impl SpawnSubBoardTool {
    pub async fn execute(&self, api: &VibeTaskClient) -> Result<CallToolResult> {
        // Verify specification ratified
        let parent = api.get_task(&self.parent_task_id).await?;
        let has_ratified = parent.linked_docs.iter().any(|d| 
            d.doc_type == DocumentType::Specification &&
            d.title.contains("[RATIFIED]")
        );
        
        if !has_ratified {
            return Err(CallToolError::invalid_params(
                "Parent task must have ratified specification. Complete Specify column first."
            ));
        }
        
        // Parse plan (simple markdown list or structured JSON)
        let tasks = parse_implementation_plan(&self.implementation_plan)?;
        
        // Bulk create via Hub API
        let created = api.bulk_create_tasks(&self.parent_task_id, tasks).await?;
        
        Ok(CallToolResult::success(format!(
            "Created {} sub-tasks: {}",
            created.len(),
            created.iter().map(|t| &t.identifier).join(", ")
        )))
    }
}
```

#### Phase 3: Execution & Audit Tools (with Column Verification)
```rust
#[macros::mcp_tool(
    name = "reflect_on_work",
    description = "6-step integrity check: 1) Requirements met 2) Tests pass 3) Docs updated 4) No regressions 5) Performance OK 6) Security reviewed"
)]
#[derive(Debug, Serialize, Deserialize, macros::JsonSchema)]
pub struct ReflectOnWorkTool {
    pub task_id: String,
    pub checks: [bool; 6],  // Each step confirmed
    pub work_log: String,
    pub files_touched: Vec<String>,
}

impl ReflectOnWorkTool {
    pub async fn execute(&self, api: &VibeTaskClient) -> Result<CallToolResult> {
        if !self.checks.iter().all(|&c| c) {
            return Err(CallToolError::invalid_params(
                "All 6 integrity checks must pass. Use reject_to_execute if work incomplete."
            ));
        }
        
        // Create work log document
        let log_content = format!(
            "# Work Log: {}\n\n## Files Touched\n{}\n\n## Integrity Check\n{}\n\n## Notes\n{}",
            Utc::now().format("%Y-%m-%d"),
            self.files_touched.iter().map(|f| format!("- `{}`", f)).join("\n"),
            self.checks.iter().enumerate()
                .map(|(i, c)| format!("{}. {}", i+1, if *c { "✅" } else { "❌" }))
                .join("\n"),
            self.work_log
        );
        
        let doc = api.create_document(&self.task_id, CreateDocumentRequest {
            title: format!("Work Log {}", Utc::now().format("%Y-%m-%d")),
            content: log_content,
            doc_type: DocumentType::PostMortem,
        }).await?;
        
        // Add TLDR comment to task
        api.add_comment(&self.task_id, format!(
            "📁 [{}]\n\nWork completed. Log: {}",
            self.files_touched.join(", "),
            doc.url
        )).await?;
        
        Ok(CallToolResult::success("Work reflected and logged".to_string()))
    }
}
```

### 5. API Client (with OpenAPI-to-Rust Type Generation)

**Responsibility**: VibeTask Hub integration via sovereign `/api/agent` endpoints

#### OpenAPI-to-Rust Type Generation

**Approach**: `openapi-generator` + Custom Refinements for MCP compatibility

**Configuration** (`openapitools.json`):
```json
{
  "$schema": "https://raw.githubusercontent.com/OpenAPITools/openapi-generator-cli/master/apps/generator-cli/src/config.schema.json",
  "spaces": 2,
  "generator-cli": {
    "version": "7.3.0",
    "generators": {
      "rust-mcp": {
        "generatorName": "rust",
        "output": "src/generated",
        "inputSpec": "../openapi.json",
        "additionalProperties": {
          "packageName": "vibetask-api",
          "supportAsync": "true",
          "supportMultipleResponses": "true",
          "enumNameSuffix": "",
          "modelDerive": "Serialize,Deserialize,JsonSchema,Clone",
          "structDerive": "Serialize,Deserialize,JsonSchema,Clone",
          "useSingleRequestParameter": "true"
        },
        "typeMappings": {
          "DateTime": "chrono::DateTime<chrono::Utc>",
          "date-time": "chrono::DateTime<chrono::Utc>"
        },
        "importMappings": {
          "DateTime": "chrono"
        }
      }
    }
  }
}
```

**Post-Generation Refinement** (`build.rs`):
```rust
//! Refines OpenAPI-generated types for MCP compatibility

use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub struct TypeRefiner;

impl TypeRefiner {
    /// Add JsonSchema derives and MCP-specific attributes
    pub fn refine_model_file(path: &Path) -> Result<String, std::io::Error> {
        let content = fs::read_to_string(path)?;
        
        // Add imports
        let with_imports = content.replace(
            "use serde::{Deserialize, Serialize};",
            "use serde::{Deserialize, Serialize};\nuse schemars::JsonSchema;\nuse rust_mcp_sdk::macros;"
        );
        
        // Replace derives
        let with_derives = with_imports.replace(
            "#[derive(Serialize, Deserialize, Clone)]",
            "#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]"
        );
        
        // Add validation attributes for critical fields
        let with_validation = Self::add_validation_attributes(&with_derives);
        
        // Convert optional IDs to non-optional where API guarantees presence
        let with_fixed_optionals = Self::fix_optional_ids(&with_validation);
        
        Ok(with_fixed_optionals)
    }
    
    fn add_validation_attributes(content: &str) -> String {
        let mut result = content.to_string();
        
        // Add regex validation for identifiers
        result = result.replace(
            "pub identifier: String,",
            r#"#[schemars(regex(pattern = r"^[A-Z]+-\d+$"))] pub identifier: String,"#
        );
        
        // Add length limits for content
        result = result.replace(
            "pub content: String,",
            r#"#[schemars(length(max = 50000))] pub content: String,"#
        );
        
        // Add enum validation for doc types
        result = result.replace(
            "pub doc_type: String,",
            r#"#[schemars(regex(pattern = r"^(CONSTITUTION|SPECIFICATION|BRAINSTORM|POST_MORTEM|IMPLEMENTATION_PLAN|OTHER)$"))] pub doc_type: String,"#
        );
        
        result
    }
    
    fn fix_optional_ids(content: &str) -> String {
        // The API always returns id, but generator makes it Option due to create payloads
        // We split into separate types for API responses vs requests
        
        content.replace(
            "pub struct Task {\n    #[serde(rename = \"id\")]\n    pub id: Option<i32>,",
            "pub struct Task {\n    #[serde(rename = \"id\")]\n    pub id: i32,  // Always present in API responses"
        )
    }
}
```

**Generated Type Examples:**
```rust
//! Generated types for VibeTask API

pub mod generated {
    use chrono::{DateTime, Utc};
    use rust_mcp_sdk::macros;
    use schemars::JsonSchema;
    use serde::{Deserialize, Serialize};
    
    // Core Domain Types (from OpenAPI schemas)
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct Task {
        pub id: i32,
        pub name: String,
        pub description: Option<String>,
        pub identifier: String,
        pub order: i32,
        pub project_id: i32,
        pub column_id: i32,
        pub assignee_id: Option<i32>,
        pub parent_id: Option<i32>,
        pub is_container: bool,
        pub plan_accepted: bool,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }
    
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct Column {
        pub id: i32,
        pub name: String,
        pub order: i32,
        pub color: String,
        pub r#type: String,
        pub description: String,
        pub project_id: i32,
    }
    
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
    pub enum DocumentType {
        Constitution,
        Specification,
        Brainstorm,
        PostMortem,
        ImplementationPlan,
        Other,
    }
    
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct ProjectDocument {
        pub id: i32,
        pub project_id: i32,
        pub title: String,
        
        #[schemars(length(max = 50000))]
        pub content: String,
        
        pub doc_type: DocumentType,
        pub version: i32,
        pub created_by_id: i32,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }
    
    // API Request/Response Types (generated from endpoints)
    
    /// GET /api/agent/projects/{projectId}/tasks/{taskId}
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct GetAgentTaskRequest {
        pub project_id: i32,
        pub task_id: i32,
        
        #[serde(default)]
        pub inline: bool,
        
        #[serde(default)]
        pub compact: bool,
    }
    
    /// Response for get_agent_task
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct AgentTaskDetail {
        pub id: i32,
        pub name: String,
        pub description: Option<String>,
        pub identifier: String,
        pub project_id: i32,
        pub project_column_id: Option<i32>,
        pub assignee_id: Option<i32>,
        pub parent_id: Option<i32>,
        pub is_container: bool,
        pub plan_accepted: bool,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
        
        // Nested includes (when inline=true)
        pub comments: Option<Vec<Comment>>,
        pub history: Option<Vec<TaskHistory>>,
        pub doc_links: Option<Vec<TaskDocumentLink>>,
        pub children: Option<Vec<ChildTask>>,
    }
    
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct Comment {
        pub id: i32,
        pub content: Option<String>,
        pub user_id: i32,
        pub created_at: DateTime<Utc>,
        pub user: Option<CommentUser>,
    }
    
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct TaskDocumentLink {
        pub id: i32,
        pub task_id: i32,
        pub document_id: i32,
        pub role: Option<String>,
        pub pinned_version: Option<i32>,
        pub created_at: DateTime<Utc>,
        
        // Inline document when requested
        pub document: Option<LinkedDocumentSummary>,
    }
    
    /// POST /api/agent/projects/{projectId}/docs
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    #[serde(rename_all = "camelCase")]
    pub struct CreateDocumentRequest {
        #[schemars(length(max = 200))]
        pub title: String,
        
        #[schemars(length(max = 50000))]
        pub content: String,
        
        pub doc_type: DocumentType,
    }
    
    // MCP Tool Input Types (derived from API types)
    
    /// MCP tool input for commit_artifact
    /// Maps to: POST /api/agent/projects/{projectId}/docs + doc-link
    #[macros::mcp_tool(
        name = "commit_artifact",
        description = "Generate or refine SPECIFICATION.md in the Hub. Use [RATIFIED] in title to mark as complete."
    )]
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    pub struct CommitArtifactInput {
        /// Task ID to attach specification to
        pub task_id: String,
        
        /// Full markdown content of specification
        #[schemars(length(max = 50000))]
        pub content: String,
        
        /// Set to true when ready for Plan column
        pub is_ratification: bool,
    }
    
    impl CommitArtifactInput {
        /// Convert MCP tool input to Hub API calls
        pub fn to_api_requests(&self, project_id: i32) -> (CreateDocumentRequest, CreateDocLinkRequest) {
            let doc_request = CreateDocumentRequest {
                title: if self.is_ratification {
                    "SPECIFICATION.md [RATIFIED]".to_string()
                } else {
                    "SPECIFICATION.md [DRAFT]".to_string()
                },
                content: self.content.clone(),
                doc_type: DocumentType::Specification,
            };
            
            let link_request = CreateDocLinkRequest {
                task_id: self.task_id.parse().unwrap(),
                document_id: 0, // Filled after doc creation
                role: Some("SPECIFICATION".to_string()),
            };
            
            (doc_request, link_request)
        }
    }
    
    /// MCP tool input for spawn_sub_board
    /// Maps to: POST /api/projects/{projectId}/accept-plan/{taskId} + bulk task creation
    #[macros::mcp_tool(
        name = "spawn_sub_board",
        description = "Parse IMPLEMENTATION_PLAN.md and create atomic sub-tasks. Requires ratified specification."
    )]
    #[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
    pub struct SpawnSubBoardInput {
        pub parent_task_id: String,
        
        /// Implementation plan content (parsed for sub-tasks)
        pub implementation_plan: String,
    }
    
    impl SpawnSubBoardInput {
        /// Parse implementation plan into atomic tasks
        pub fn parse_tasks(&self) -> Result<Vec<CreateTaskRequest>, ParseError> {
            // Simple markdown parser: extract - [ ] or numbered items
            let mut tasks = Vec::new();
            
            for line in self.implementation_plan.lines() {
                let trimmed = line.trim();
                
                // Match: "- [ ] Task name" or "1. Task name"
                if let Some(task_name) = trimmed
                    .strip_prefix("- [ ] ")
                    .or_else(|| trimmed.strip_prefix("1. "))
                    .or_else(|| trimmed.strip_prefix("2. "))
                    .or_else(|| trimmed.strip_prefix("- "))
                {
                    tasks.push(CreateTaskRequest {
                        name: task_name.to_string(),
                        description: None,
                        parent_id: Some(self.parent_task_id.parse()?),
                    });
                }
            }
            
            if tasks.is_empty() {
                return Err(ParseError::NoTasksFound);
            }
            
            Ok(tasks)
        }
    }
}
```

**Build Pipeline Integration:**
```bash
#!/bin/bash
# generate-api-types.sh

set -e

# 1. Ensure OpenAPI spec is valid
echo "Validating OpenAPI spec..."
npx @openapitools/openapi-generator-cli validate \
    -i ../vibetask-hub/openapi.json

# 2. Generate base Rust types
echo "Generating Rust types..."
npx @openapitools/openapi-generator-cli generate \
    -i ../vibetask-hub/openapi.json \
    -g rust \
    -o src/generated \
    --additional-properties=packageName=vibetask-api,supportAsync=true

# 3. Apply MCP-specific refinements
echo "Refining for MCP compatibility..."
cargo run --bin refine-generated-types -- \
    --input src/generated \
    --output src/generated/refined

# 4. Verify compilation
echo "Verifying generated code..."
cargo check --lib

echo "API type generation complete!"
```

**VibeTaskClient Implementation:**
```rust
use generated::*;
use reqwest::Client;

pub struct VibeTaskClient {
    client: Client,
    base_url: String,
    api_key: String,
}

impl VibeTaskClient {
    pub async fn get_task(
        &self,
        project_id: i32,
        task_id: i32,
        inline: bool,
        compact: bool,
    ) -> Result<AgentTaskDetail, ApiError> {
        let url = format!(
            "{}/api/agent/projects/{}/tasks/{}?inline={}&compact={}",
            self.base_url, project_id, task_id, inline, compact
        );
        
        let response = self.client
            .get(&url)
            .header("x-agent-api-key", &self.api_key)
            .send()
            .await?;
        
        match response.status() {
            reqwest::StatusCode::OK => {
                Ok(response.json::<AgentTaskDetail>().await?)
            }
            reqwest::StatusCode::UNAUTHORIZED => {
                Err(ApiError::Unauthorized)
            }
            reqwest::StatusCode::FORBIDDEN => {
                Err(ApiError::Forbidden)
            }
            status => {
                Err(ApiError::UnexpectedStatus(status.as_u16()))
            }
        }
    }
    
    pub async fn create_document(
        &self,
        project_id: i32,
        request: CreateDocumentRequest,
    ) -> Result<ProjectDocument, ApiError> {
        // Governance protection: Prevent Constitution modification
        if request.doc_type == DocumentType::Constitution {
            return Err(ApiError::GovernanceError(
                "Constitution documents cannot be created or modified by agents".to_string()
            ));
        }
        
        // Validate before sending
        request.validate()?;
        
        let url = format!(
            "{}/api/agent/projects/{}/docs",
            self.base_url, project_id
        );
        
        let response = self.client
            .post(&url)
            .header("x-agent-api-key", &self.api_key)
            .json(&request)
            .send()
            .await?;
        
        Ok(response.json::<ProjectDocument>().await?)
    }
}
```

**Integration with ContextAssembler:**
```rust
impl ContextAssembler {
    pub async fn assemble_from_api_response(
        &self,
        task_detail: AgentTaskDetail,
        column: Column,
        api: &VibeTaskClient,
    ) -> Result<AssembledContext, AssemblyError> {
        // Convert API response to ContextAssembler input format
        let task = Task {
            id: task_detail.id,
            name: task_detail.name,
            description: task_detail.description,
            identifier: task_detail.identifier,
            order: 0, // Not in detailed response
            project_id: task_detail.project_id,
            column_id: task_detail.project_column_id.unwrap_or(0),
            assignee_id: task_detail.assignee_id,
            parent_id: task_detail.parent_id,
            is_container: task_detail.is_container,
            plan_accepted: task_detail.plan_accepted,
            created_at: task_detail.created_at,
            updated_at: task_detail.updated_at,
        };
        
        // Extract linked documents from response
        let linked_docs: Vec<ProjectDocument> = task_detail
            .doc_links
            .unwrap_or_default()
            .into_iter()
            .filter_map(|link| {
                // If inline=true, fetch full content from API or use embedded
                link.document.map(|doc_summary| ProjectDocument {
                    id: doc_summary.id,
                    project_id: task_detail.project_id,
                    title: doc_summary.title,
                    content: String::new(), // Fetch separately if needed
                    doc_type: doc_summary.doc_type,
                    version: doc_summary.version,
                    created_by_id: 0,
                    created_at: task_detail.created_at, // Approximate
                    updated_at: task_detail.updated_at,
                })
            })
            .collect();
        
        // Use main assembly logic
        self.assemble(&task, &column, linked_docs, api).await
    }
}
```

**Key Benefits:**
- **Accurate Token Counting**: Uses `tiktoken` (OpenAI-compatible)
- **Strict Budget Enforcement**: Constitution protection with hard limits
- **Automatic Type Generation**: From OpenAPI spec with MCP compatibility
- **Validation at Boundaries**: API input and MCP tool arguments
- **Type Safety**: Compile-time validation of API contracts

## Business Logic & Workflow Integration

### VibeTask Lifecycle: Synthesis of Best Practices

VibeTask combines proven concepts from multiple sources into a unified workflow:

| Source | Concept Adopted | VibeTask Implementation |
|--------|----------------|------------------------|
| Shrimp Task Manager | Audit trails, work logging, integrity checks, task decomposition | 6-step integrity checks, TLDR comments, work logs |
| OpenSpec/SpecKitty | Specification-driven development, doc-to-log strategy, ratification gates | [RATIFIED] markers, gate conditions, traceability |
| ContextHub | JIT context assembly, hierarchical knowledge organization | Priority-based context with token budgeting |
| Your Kanban | Lattice state machine, column-based personas, sub-board workflows | Column gating, persona injection, container tasks |

### Core State Machine with Gates

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SPECIFY   │────▶│    PLAN     │────▶│   EXECUTE   │────▶│   VERIFY    │
│  (Architect)│     │  (Planner)  │     │   (Coder)   │     │  (Critic)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ SPEC.md     │     │ PLAN.md     │     │ Code +      │     │ Audit Log   │
│ [DRAFT]     │     │ [PENDING]   │     │ Tests       │     │ [APPROVED]  │
│ [RATIFIED]──┼────▶│ [ACCEPTED]──┼────▶│ [DONE]──────┼────▶│ or          │
│             │     │             │     │             │     │ [REJECTED]──┘
└─────────────┘     └─────────────┘     └─────────────┘           │
                                                                  ▼
                                                           ┌─────────────┐
                                                           │ Back to     │
                                                           │ EXECUTE     │
                                                           └─────────────┘
```

**Gate Conditions (Enforced by MCP Tools):**

| Transition | Required Condition | Enforced By |
|------------|-------------------|-------------|
| Specify → Plan | SPECIFICATION.md contains [RATIFIED] | `ratify_specification` tool |
| Plan → Execute | IMPLEMENTATION_PLAN.md accepted via human gate | `accept_plan` tool (human only) |
| Execute → Verify | All sub-tasks complete OR container task done | `mark_complete` tool |
| Verify → Done | 6-step integrity check passes | `reflect_on_work` tool |
| Verify → Execute | Critic rejects with specific reasons | `reject_to_execute` tool |

### Document Lifecycle Management

```rust
/// Document states in the VibeTask lifecycle
#[derive(Debug, Clone, PartialEq)]
pub enum DocumentState {
    Draft,      // Initial creation, editable
    Review,     // Under review, comments allowed
    Ratified,   // Locked, becomes source of truth
    Superseded, // Replaced by newer version
}

/// Specification document with lifecycle management
pub struct Specification {
    pub base: Document,
    pub state: DocumentState,
    pub ratified_at: Option<DateTime<Utc>>,
    pub ratified_by: Option<String>, // Agent or human identifier
}

impl Specification {
    /// Check if specification can be ratified (gate condition)
    pub fn can_ratify(&self) -> Result<(), RatificationError> {
        // Must have required sections (from OpenSpec/SpecKitty)
        let required_sections = [
            "Overview",
            "Goals", 
            "Non-Goals",
            "Requirements",
            "Acceptance Criteria",
        ];
        
        for section in &required_sections {
            if !self.base.content.contains(&format!("## {}", section)) {
                return Err(RatificationError::MissingSection(section.to_string()));
            }
        }
        
        // Must not have TODO markers
        if self.base.content.contains("TODO") || self.base.content.contains("FIXME") {
            return Err(RatificationError::UnresolvedTodos);
        }
        
        // Must have at least one acceptance criterion
        let ac_regex = Regex::new(r"- \[.\].*|\d+\.\s*.*").unwrap();
        if !ac_regex.is_match(&self.base.content) {
            return Err(RatificationError::NoAcceptanceCriteria);
        }
        
        Ok(())
    }
    
    /// Promote to ratified state (irreversible)
    pub fn ratify(&mut self, by: &str) -> Result<(), RatificationError> {
        self.can_ratify()?;
        
        self.state = DocumentState::Ratified;
        self.ratified_at = Some(Utc::now());
        self.ratified_by = Some(by.to_string());
        
        // Append ratification marker
        self.base.content.push_str(&format!(
            "\n\n---\n**RATIFIED** by {} at {}\n",
            by,
            Utc::now().format("%Y-%m-%d %H:%M:%S")
        ));
        
        Ok(())
    }
}
```

### Work Logging & Audit Trail (Shrimp-Inspired)

```rust
/// 6-step integrity check from Shrimp Task Manager
#[derive(Debug, Clone)]
pub struct IntegrityCheck {
    pub requirements_met: bool,
    pub tests_pass: bool,
    pub docs_updated: bool,
    pub no_regressions: bool,
    pub performance_ok: bool,
    pub security_reviewed: bool,
}

impl IntegrityCheck {
    pub fn all_pass(&self) -> bool {
        self.requirements_met 
            && self.tests_pass 
            && self.docs_updated 
            && self.no_regressions 
            && self.performance_ok 
            && self.security_reviewed
    }
    
    pub fn passed_count(&self) -> usize {
        [self.requirements_met, self.tests_pass, self.docs_updated,
         self.no_regressions, self.performance_ok, self.security_reviewed]
            .iter().filter(|&&x| x).count()
    }
    
    pub fn to_markdown(&self) -> String {
        format!(
            "## Integrity Check Results\n\n\
            - [{}] Requirements met: {}\n\
            - [{}] Tests pass: {}\n\
            - [{}] Documentation updated: {}\n\
            - [{}] No regressions: {}\n\
            - [{}] Performance acceptable: {}\n\
            - [{}] Security reviewed: {}\n",
            if self.requirements_met { "x" } else { " " }, self.format_bool(self.requirements_met),
            if self.tests_pass { "x" } else { " " }, self.format_bool(self.tests_pass),
            if self.docs_updated { "x" } else { " " }, self.format_bool(self.docs_updated),
            if self.no_regressions { "x" } else { " " }, self.format_bool(self.no_regressions),
            if self.performance_ok { "x" } else { " " }, self.format_bool(self.performance_ok),
            if self.security_reviewed { "x" } else { " " }, self.format_bool(self.security_reviewed),
        )
    }
    
    fn format_bool(&self, b: bool) -> &'static str {
        if b { "✅ PASS" } else { "❌ FAIL" }
    }
}

/// Work log entry (doc-to-log strategy)
pub struct WorkLog {
    pub task_id: String,
    pub agent_id: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub files_touched: Vec<FileChange>,
    pub integrity_check: IntegrityCheck,
    pub notes: String,
    pub linked_spec_version: String, // Traceability
}

impl WorkLog {
    /// Generate TLDR for task comment (Shrimp style)
    pub fn generate_tldr(&self) -> String {
        let file_summary = if self.files_touched.len() <= 3 {
            self.files_touched.iter()
                .map(|f| format!("`{}`", f.path))
                .collect::<Vec<_>>()
                .join(", ")
        } else {
            format!("{} files", self.files_touched.len())
        };
        
        format!(
            "📁 [{}]\n\n{}\n\n**Integrity:** {}/6 checks passed\n**Duration:** {} minutes",
            file_summary,
            self.notes.lines().next().unwrap_or("Work completed"),
            self.integrity_check.passed_count(),
            (self.completed_at - self.started_at).num_minutes()
        )
    }
    
    /// Generate full audit document
    pub fn generate_audit_doc(&self) -> String {
        format!(
            "# Work Log: {}\n\n\
            **Agent:** {}\n**Started:** {}\n**Completed:** {}\n\
            **Specification Version:** {}\n\n\
            ## Files Changed\n{}\n\n\
            {}\n\n\
            ## Notes\n{}\n",
            self.task_id,
            self.agent_id,
            self.started_at.format("%Y-%m-%d %H:%M"),
            self.completed_at.format("%Y-%m-%d %H:%M"),
            self.linked_spec_version,
            self.format_files(),
            self.integrity_check.to_markdown(),
            self.notes
        )
    }
}
```

### Knowledge Hub Integration

**Role in Architecture**: Source-of-truth docs linked to tasks (docLinks) with roles like SPEC/IMPLEMENTATION_PLAN/REFERENCE; agents consume these via agent task APIs (inline=true) to act with context.

```rust
/// Knowledge Hub document with role-based linking
pub struct KnowledgeDocument {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub content: String,
    pub doc_type: DocumentType,
    pub version: i32,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Task-Document link with semantic roles
pub struct TaskDocumentLink {
    pub task_id: String,
    pub document_id: String,
    pub role: DocumentRole,
    pub pinned_version: Option<i32>, // Lock to specific version
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DocumentRole {
    Specification,      // Primary spec for this task
    ImplementationPlan, // How to execute this task
    Reference,          // Supporting documentation
    WorkLog,           // Audit trail
    Constitution,      // Governance rules
}

impl KnowledgeDocument {
    /// Get document with role context for agent consumption
    pub async fn get_for_agent_context(
        task_id: &str,
        role: DocumentRole,
        api: &VibeTaskClient,
    ) -> Result<Option<Self>, ApiError> {
        let links = api.get_task_document_links(task_id).await?;
        
        if let Some(link) = links.iter().find(|l| l.role == role) {
            let doc = if let Some(version) = link.pinned_version {
                api.get_document_version(&link.document_id, version).await?
            } else {
                api.get_document(&link.document_id).await?
            };
            Ok(Some(doc))
        } else {
            Ok(None)
        }
    }
}
```

### Hierarchical Context Assembly (ContextHub-Inspired)

```rust
/// Hierarchical context from ContextHub pattern
pub struct HierarchicalContext {
    pub global_constitution: Option<KnowledgeDocument>,   // Project-wide rules
    pub domain_specifications: Vec<KnowledgeDocument>,    // Related specs
    pub task_specification: Option<KnowledgeDocument>,    // Current task spec
    pub implementation_plan: Option<KnowledgeDocument>,   // If in Plan/Execute
    pub work_history: Vec<WorkLog>,                       // Previous attempts
    pub sibling_tasks: Vec<TaskSummary>,                  // Context awareness
}

impl HierarchicalContext {
    /// Assemble context with smart prioritization
    pub fn assemble(&self, budget: TokenBudget) -> AssembledContext {
        let mut components: Vec<ContextComponent> = vec![];
        
        // Priority 1: Constitution (always full)
        if let Some(constitution) = &self.global_constitution {
            components.push(ContextComponent {
                content: constitution.content.clone(),
                priority: Priority::Critical,
                source: "Constitution".to_string(),
            });
        }
        
        // Priority 2: Current task specification
        if let Some(spec) = &self.task_specification {
            components.push(ContextComponent {
                content: spec.content.clone(),
                priority: Priority::High,
                source: format!("Spec: {}", spec.title),
            });
        }
        
        // Priority 3: Implementation plan (if applicable)
        if let Some(plan) = &self.implementation_plan {
            components.push(ContextComponent {
                content: plan.content.clone(),
                priority: Priority::High,
                source: "Implementation Plan".to_string(),
            });
        }
        
        // Priority 4: Relevant domain specs (summarized)
        for spec in &self.domain_specifications {
            components.push(ContextComponent {
                content: spec.content.clone(),
                priority: Priority::Medium,
                source: format!("Related: {}", spec.title),
            });
        }
        
        // Priority 5: Work history (most recent, condensed)
        for log in self.work_history.iter().take(3) {
            components.push(ContextComponent {
                content: log.generate_tldr(),
                priority: Priority::Low,
                source: format!("Previous: {}", log.agent_id),
            });
        }
        
        // Apply budget constraints
        Self::fit_to_budget(components, budget)
    }
}
```

### Business Logic Tool Implementations

#### Specify Column Tools

```rust
#[macros::mcp_tool(
    name = "commit_specification",
    description = "Create or update SPECIFICATION.md. Validates required sections before allowing ratification."
)]
pub struct CommitSpecification {
    pub task_id: String,
    pub content: String,
    pub action: SpecAction,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub enum SpecAction {
    SaveDraft,       // Just save
    SubmitForReview, // Mark as ready for review
    Ratify,          // Promote to locked state
}

impl CommitSpecification {
    pub async fn execute(&self, ctx: &ToolContext) -> Result<CallToolResult, ToolError> {
        // COLUMN GATE: Must be in Specify column
        let task = ctx.api.get_task(&self.task_id).await?;
        ensure_column(&task, "Specify")?;
        
        let mut spec = Specification::from_content(&self.content);
        
        match self.action {
            SpecAction::SaveDraft => {
                let doc = ctx.api.create_document(
                    &self.task_id,
                    "SPECIFICATION.md [DRAFT]",
                    &self.content,
                    DocumentType::Specification,
                ).await?;
                
                Ok(CallToolResult::success(format!(
                    "Draft saved. Missing sections: {:?}\n\nNext: Add required sections then ratify.",
                    spec.missing_sections()
                )))
            }
            
            SpecAction::Ratify => {
                // Validate completeness
                spec.can_ratify().map_err(|e| ToolError::Validation(e.to_string()))?;
                
                // Promote
                spec.ratify(&ctx.agent_id)?;
                
                // Save as ratified
                let doc = ctx.api.create_document(
                    &self.task_id,
                    "SPECIFICATION.md [RATIFIED]",
                    &spec.base.content,
                    DocumentType::Specification,
                ).await?;
                
                // Update task state to allow Plan transition
                ctx.api.update_task_metadata(&self.task_id, json!({
                    "specificationRatified": true,
                    "ratifiedAt": Utc::now(),
                    "ratifiedBy": ctx.agent_id,
                })).await?;
                
                Ok(CallToolResult::success(format!(
                    "✅ Specification ratified. Task {} is now eligible for Plan column.\n\n\
                    Required next: Create IMPLEMENTATION_PLAN.md",
                    self.task_id
                )))
            }
            
            _ => Err(ToolError::InvalidAction),
        }
    }
}
```

#### Plan Column Tools

```rust
#[macros::mcp_tool(
    name = "spawn_sub_board",
    description = "Parse IMPLEMENTATION_PLAN.md and create atomic sub-tasks. Requires ratified specification."
)]
pub struct SpawnSubBoard {
    pub parent_task_id: String,
    pub implementation_plan: String,
}

impl SpawnSubBoard {
    pub async fn execute(&self, ctx: &ToolContext) -> Result<CallToolResult, ToolError> {
        // COLUMN GATE: Must be in Plan column
        let parent = ctx.api.get_task(&self.parent_task_id).await?;
        ensure_column(&parent, "Plan")?;
        
        // PRECONDITION: Must have ratified specification
        let has_ratified = ctx.api.get_linked_documents(&self.parent_task_id).await?
            .iter()
            .any(|d| d.title.contains("[RATIFIED]") && d.doc_type == DocumentType::Specification);
        
        if !has_ratified {
            return Err(ToolError::PreconditionFailed(
                "Cannot spawn sub-board without ratified specification. Complete Specify column first.".to_string()
            ));
        }
        
        // Parse plan into tasks (Shrimp-style decomposition)
        let plan = ImplementationPlan::from_content(&self.implementation_plan);
        let templates = plan.parse_tasks()
            .map_err(|e| ToolError::Validation(format!("Invalid plan: {}", e)))?;
        
        // Create sub-tasks
        let mut created = Vec::new();
        for (i, template) in templates.iter().enumerate() {
            let task = ctx.api.create_task(CreateTaskRequest {
                project_id: parent.project_id,
                parent_id: Some(self.parent_task_id.parse()?),
                name: template.name.clone(),
                description: Some(template.description.clone()),
                order: i as i32,
                assignee_id: None, // Or parse from plan
            }).await?;
            
            created.push(task);
        }
        
        // Mark parent as container with plan accepted
        ctx.api.update_task(&self.parent_task_id, json!({
            "isContainer": true,
            "planAccepted": true,
        })).await?;
        
        // Save plan document
        ctx.api.create_document(
            &self.parent_task_id,
            "IMPLEMENTATION_PLAN.md [ACCEPTED]",
            &self.implementation_plan,
            DocumentType::ImplementationPlan,
        ).await?;
        
        Ok(CallToolResult::success(format!(
            "✅ Sub-board created with {} atomic tasks\n\n\
            Parent {} is now in Execute column. Child tasks:\n{}",
            created.len(),
            self.parent_task_id,
            created.iter().map(|t| format!("- {}: {}", t.identifier, t.name))
                .collect::<Vec<_>>()
                .join("\n")
        )))
    }
}
```

#### Verify Column Tools

```rust
#[macros::mcp_tool(
    name = "reflect_on_work",
    description = "Perform 6-step integrity check and generate work log. Required before task completion."
)]
pub struct ReflectOnWork {
    pub task_id: String,
    pub integrity: IntegrityCheck,
    pub notes: String,
    pub files_touched: Vec<String>,
}

impl ReflectOnWork {
    pub async fn execute(&self, ctx: &ToolContext) -> Result<CallToolResult, ToolError> {
        // COLUMN GATE: Must be in Verify column
        let task = ctx.api.get_task(&self.task_id).await?;
        ensure_column(&task, "Verify")?;
        
        // All checks must pass
        if !self.integrity.all_pass() {
            return Err(ToolError::Validation(format!(
                "Cannot complete: {} checks failed. Fix issues or reject to Execute.",
                6 - self.integrity.passed_count()
            )));
        }
        
        // Create work log
        let log = WorkLog {
            task_id: self.task_id.clone(),
            agent_id: ctx.agent_id.clone(),
            started_at: ctx.session_start, // Track from tool context
            completed_at: Utc::now(),
            files_touched: self.parse_files(&self.files_touched),
            integrity_check: self.integrity.clone(),
            notes: self.notes.clone(),
            linked_spec_version: ctx.get_linked_spec_version(&self.task_id).await?,
        };
        
        // Save audit document
        let audit_doc = ctx.api.create_document(
            &self.task_id,
            &format!("WORK_LOG_{}.md", Utc::now().format("%Y%m%d_%H%M")),
            &log.generate_audit_doc(),
            DocumentType::WorkLog,
        ).await?;
        
        // Post TLDR comment
        ctx.api.add_comment(&self.task_id, log.generate_tldr()).await?;
        
        // If all good, mark complete
        ctx.api.update_task(&self.task_id, json!({
            "status": "completed",
            "completedAt": Utc::now(),
            "completedBy": ctx.agent_id,
        })).await?;
        
        Ok(CallToolResult::success(format!(
            "✅ Work verified and logged\n\nAudit: {}\n\nTask complete!",
            audit_doc.url
        )))
    }
}
```

### Best-Practice Contract

**Each active container/sub-board should have:**
- At least one implementation-plan doc link
- Tasks should carry explicit doc roles
- Agent flows should always report assignee + linked-doc provenance back to end user

**WebSocket Real-time Updates:**
- DB changes trigger pg-notify channels (`db:task:change`, etc.)
- Broadcaster emits to Socket.IO channels (e.g., `TasksIndexChannel`)
- Frontend store dispatcher updates local column/task state
- Websocket upserts respect parent scope so child tasks don't leak onto main board

**Human Gate Mechanism:**
- Plan acceptance requires human approval via UI
- Agents can create implementation plans but cannot auto-accept them
- Human reviews plan and clicks "Accept Plan" to enable Execute transition
- This prevents agents from creating unbounded work without oversight

### Core Domain Models

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub column_id: String,
    pub assignee_id: Option<String>,
    pub linked_docs: Vec<DocumentLink>,
    pub metadata: TaskMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Column {
    pub id: String,
    pub name: String,
    pub description: String, // Used for persona injection
    pub position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String, // e.g., "Agent Smith"
    pub delegate_key: String,
    pub permissions: AgentPermissions,
    pub current_assignments: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub doc_type: DocumentType,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum DocumentType {
    Specification,
    ImplementationPlan,
    Constitution,
    WorkLog,
    Annotation,
}
```

### Context Models

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct LeanPacket {
    pub task: Task,
    pub persona: PersonaConfig,
    pub linked_content: Vec<Document>,
    pub board_snapshot: BoardSnapshot,
    pub token_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BoardSnapshot {
    pub columns: Vec<Column>,
    pub related_tasks: Vec<Task>,
    pub project_metadata: ProjectMetadata,
}
```

## Error Handling & Resilience

### Error Categories

```rust
#[derive(Debug, thiserror::Error)]
pub enum OrchestratorError {
    #[error("Hub API error: {0}")]
    ApiError(#[from] reqwest::Error),
    
    #[error("Context assembly failed: {0}")]
    ContextError(#[from] ContextError),
    
    #[error("Governance violation: {0}")]
    GovernanceError(String),
    
    #[error("Token budget exceeded: {actual} > {limit}")]
    BudgetExceeded { actual: usize, limit: usize },
}

// Mapping to MCP errors
impl From<OrchestratorError> for RpcError {
    fn from(e: OrchestratorError) -> Self {
        match &e {
            OrchestratorError::ApiError(err) if err.is_timeout() || err.is_connect() => {
                RpcError::internal_error(
                    "VibeTask Hub unavailable. Please retry in 10 seconds.".to_string(),
                    Some(json!({ "retry_after": 10 }))
                )
            }
            OrchestratorError::GovernanceError(msg) => {
                RpcError::invalid_request(format!("Governance: {}", msg))
            }
            OrchestratorError::BudgetExceeded { actual, limit } => {
                RpcError::internal_error(
                    format!("Context too large ({} tokens, max {}). Request compact=true", actual, limit),
                    Some(json!({ "actual": actual, "limit": limit }))
                )
            }
            _ => RpcError::internal_error(e.to_string(), None),
        }
    }
}
```

### Configuration

```rust
#[derive(Debug, Deserialize)]
pub struct Config {
    pub hub_url: String,
    pub delegate_key: String,  // x-agent-api-key
    pub max_retries: u32,
    pub request_timeout_secs: u64,
    pub token_budget: TokenBudget,
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::from_env()
    }
}
```

## Testing Strategy

### Unit Testing

**Coverage Areas:**
- Persona injection logic
- Context assembly and optimization
- Tool execution workflows
- API client interactions
- Error handling scenarios

**Test Structure:**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_persona_injection_for_specify_column() {
        // Test Architect persona injection
    }
    
    #[tokio::test]
    async fn test_context_token_optimization() {
        // Test sub-4k token constraint
    }
    
    #[tokio::test]
    async fn test_governance_protection() {
        // Test Constitution read-only enforcement
    }
}
```

### Integration Testing

**Test Scenarios:**
- End-to-end agent workflow execution
- Multi-agent coordination scenarios
- API endpoint integration
- Error recovery and resilience

**Mock Strategy:**
- Mock VibeTask Hub API responses
- Simulate various board states and configurations
- Test permission boundary enforcement

### Performance Testing

**Benchmarks:**
- Context assembly time under various document sizes
- Token optimization effectiveness
- Concurrent agent request handling
- Memory usage under load

**Success Criteria:**
- Sub-4k token contexts maintained
- <200ms context assembly time
- Support for 10+ concurrent agents
- <50MB memory footprint

### Quality Assurance Integration

**Pre-commit Validation:**
```bash
# Formatting check
cargo fmt --all -- --check

# Linting with zero warnings
cargo clippy --all-targets --all-features -- -D warnings

# Full test suite
cargo test --workspace
```

**Continuous Integration:**
- Automated testing on PR creation
- Performance regression detection
- Security vulnerability scanning
- Documentation generation and validation
## Inte
grity Check: Strict Boolean Validation

**DECISION**: Using strict checklist approach for MVP (all 6 checks must be true)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityCheck {
    pub checks: [bool; 6],
    pub check_descriptions: [&'static str; 6],
    pub evidence: [Option<String>; 6],
}

impl IntegrityCheck {
    pub fn new() -> Self {
        Self {
            checks: [false; 6],
            check_descriptions: [
                "Code compiles without errors",
                "All tests pass",
                "Code follows style guidelines (clippy clean)",
                "Documentation is complete and accurate",
                "No TODO/FIXME markers in production code",
                "Changes are backwards compatible",
            ],
            evidence: [None; 6],
        }
    }
    
    /// Strict validation: ALL checks must pass
    pub fn all_pass(&self) -> bool {
        self.checks.iter().all(|&check| check)
    }
    
    /// Get failing checks for error reporting
    pub fn get_failures(&self) -> Vec<(usize, &str)> {
        self.checks.iter()
            .enumerate()
            .filter(|(_, &passed)| !passed)
            .map(|(i, _)| (i, self.check_descriptions[i]))
            .collect()
    }
    
    /// Set check with evidence
    pub fn set_check(&mut self, index: usize, passed: bool, evidence: Option<String>) -> Result<(), IntegrityError> {
        if index >= 6 {
            return Err(IntegrityError::InvalidCheckIndex(index));
        }
        
        self.checks[index] = passed;
        self.evidence[index] = evidence;
        Ok(())
    }
    
    /// Generate TLDR with FILES TOUCHED header
    pub fn generate_tldr(&self, modified_files: &[String]) -> String {
        let files_header = if modified_files.len() <= 3 {
            format!("📁 [FILES TOUCHED] {}", modified_files.join(", "))
        } else {
            format!("📁 [FILES TOUCHED] {} files: {} + {} more", 
                modified_files.len(),
                modified_files[..2].join(", "),
                modified_files.len() - 2
            )
        };
        
        let status = if self.all_pass() {
            "✅ ALL INTEGRITY CHECKS PASSED"
        } else {
            "❌ INTEGRITY CHECKS FAILED"
        };
        
        let check_summary = self.checks.iter()
            .zip(self.check_descriptions.iter())
            .map(|(&passed, &desc)| {
                let icon = if passed { "✅" } else { "❌" };
                format!("{} {}", icon, desc)
            })
            .collect::<Vec<_>>()
            .join("\n");
        
        format!(
            "{}\n\n{}\n\n**Integrity Checks:**\n{}\n\n**Evidence:**\n{}",
            files_header,
            status,
            check_summary,
            self.format_evidence()
        )
    }
    
    fn format_evidence(&self) -> String {
        self.evidence.iter()
            .enumerate()
            .filter_map(|(i, evidence)| {
                evidence.as_ref().map(|e| format!("{}. {}: {}", i + 1, self.check_descriptions[i], e))
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum IntegrityError {
    #[error("Invalid check index: {0} (must be 0-5)")]
    InvalidCheckIndex(usize),
    
    #[error("Integrity validation failed. Failing checks: {failures:?}")]
    ValidationFailed { failures: Vec<String> },
}

/// Reflect on Work tool with mandatory integrity validation
#[macros::mcp_tool(
    name = "reflect_on_work",
    description = "Perform mandatory 6-step integrity check and generate work log. All checks must pass."
)]
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
pub struct ReflectOnWork {
    pub task_id: String,
    pub work_summary: String,
    pub modified_files: Vec<String>,
    pub integrity_checks: IntegrityCheck,
}

impl ReflectOnWork {
    pub async fn execute_with_context(
        &self,
        ctx: &ReflectOnWorkContext,
    ) -> Result<CallToolResult, CallToolError> {
        // COLUMN GATING: Only in Verify column
        verify_column(ctx, "Verify").await?;
        
        // MANDATORY: All integrity checks must pass
        if !self.integrity_checks.all_pass() {
            let failures = self.integrity_checks.get_failures();
            let failure_list = failures.iter()
                .map(|(i, desc)| format!("{}. {}", i + 1, desc))
                .collect::<Vec<_>>()
                .join("\n");
            
            return Err(CallToolError::invalid_params(&format!(
                "❌ Integrity validation failed. All 6 checks must pass before task completion.\n\n\
                **Failed checks:**\n{}\n\n\
                Use `reject_to_execute` to return task to Execute column for fixes.",
                failure_list
            )));
        }
        
        // Generate work log with TLDR
        let tldr = self.integrity_checks.generate_tldr(&self.modified_files);
        
        // Create work log document
        let work_log = ctx.api.create_document(CreateDocumentRequest {
            project_id: ctx.get_project_id(&self.task_id).await?,
            title: format!("Work Log - {}", chrono::Utc::now().format("%Y-%m-%d %H:%M")),
            content: format!(
                "{}\n\n**Work Summary:**\n{}\n\n**Modified Files:**\n{}\n\n**Integrity Evidence:**\n{}",
                tldr,
                self.work_summary,
                self.modified_files.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n"),
                self.integrity_checks.format_evidence()
            ),
            doc_type: DocumentType::WorkLog,
        }).await?;
        
        // Link to task
        ctx.api.create_doc_link(CreateDocLinkRequest {
            task_id: self.task_id.clone(),
            document_id: work_log.id.to_string(),
            role: "WORK_LOG".to_string(),
            pinned_version: Some(work_log.version),
        }).await?;
        
        // Add TLDR comment to task
        ctx.api.add_task_comment(&self.task_id, &tldr).await?;
        
        Ok(CallToolResult::success(format!(
            "✅ Work reflection completed successfully.\n\n\
            All 6 integrity checks passed. Work log created and linked to task.\n\n\
            **Next steps:**\n\
            - Use `approve_completion` to mark task as done\n\
            - Or use `reject_to_execute` if additional work needed\n\n\
            Work Log: {}",
            work_log.url.unwrap_or_default()
        )))
    }
}
```

## Error Handling: OrchestratorError with MCP Mapping

**MANDATE**: All tools return `Result<CallToolResult, OrchestratorError>` with proper MCP error code mapping

```rust
#[derive(Debug, thiserror::Error)]
pub enum OrchestratorError {
    #[error("Hub API error: {message}")]
    HubApiError { message: String, status_code: Option<u16> },
    
    #[error("Agent permission denied: {message}")]
    PermissionDenied { message: String },
    
    #[error("Invalid tool parameters: {message}")]
    InvalidParameters { message: String },
    
    #[error("Column gating violation: {message}")]
    ColumnGatingViolation { message: String },
    
    #[error("Platform agent restriction: {message}")]
    PlatformAgentRestriction { message: String },
    
    #[error("Configuration error: {message}")]
    ConfigurationError { message: String },
    
    #[error("Integrity validation failed: {message}")]
    IntegrityValidationFailed { message: String },
    
    #[error("Task atomicity violation: {message}")]
    TaskAtomicityViolation { message: String },
}

impl From<OrchestratorError> for CallToolError {
    fn from(error: OrchestratorError) -> Self {
        match error {
            OrchestratorError::InvalidParameters { message } => {
                CallToolError::invalid_params(&message)
            }
            OrchestratorError::PermissionDenied { message } |
            OrchestratorError::ColumnGatingViolation { message } |
            OrchestratorError::PlatformAgentRestriction { message } => {
                CallToolError::invalid_request(&message)
            }
            OrchestratorError::HubApiError { message, .. } => {
                CallToolError::internal_error(&format!("Hub API error: {}", message))
            }
            OrchestratorError::ConfigurationError { message } |
            OrchestratorError::IntegrityValidationFailed { message } |
            OrchestratorError::TaskAtomicityViolation { message } => {
                CallToolError::internal_error(&message)
            }
        }
    }
}
```

## Testing Strategy

### Unit Tests with Fault Isolation

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;
    use tokio_test;
    
    #[tokio::test]
    async fn test_platform_agent_write_restriction() {
        let agent_type = AgentType::Platform {
            name: "TestPlatform".to_string(),
            allowed_endpoints: vec!["/api/agent/health".to_string()],
            effective_endpoints: vec!["/api/agent/health".to_string()],
        };
        
        let handler = VibeTaskHandler::new_with_agent_type(agent_type);
        
        let params = CallToolRequestParams {
            name: "commit_artifact".to_string(),
            arguments: serde_json::json!({
                "task_id": "123",
                "content": "# Test"
            }),
        };
        
        let result = handler.handle_call_tool_request(params, Arc::new(MockMcpServer::new())).await;
        
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.to_string().contains("Platform Agent attempted write operation"));
    }
    
    #[tokio::test]
    async fn test_integrity_check_strict_validation() {
        let mut integrity = IntegrityCheck::new();
        
        // Set 5 out of 6 checks to pass
        for i in 0..5 {
            integrity.set_check(i, true, Some("Test evidence".to_string())).unwrap();
        }
        
        // Should fail because not all checks pass
        assert!(!integrity.all_pass());
        
        let failures = integrity.get_failures();
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].0, 5); // Last check failed
    }
    
    #[tokio::test]
    async fn test_task_atomicity_duplicate_names() {
        let validator = TaskAtomicityValidator::new();
        
        let plan = r#"
## Task 1: Setup Database
- Create schema
- Add migrations

## Task 1: Setup Database  
- Different description but same name
"#;
        
        let result = validator.parse_implementation_plan(plan);
        assert!(result.is_err());
        
        match result.unwrap_err() {
            ParseError::DuplicateTaskName { name, .. } => {
                assert_eq!(name, "Task 1: Setup Database");
            }
            _ => panic!("Expected DuplicateTaskName error"),
        }
    }
    
    #[tokio::test]
    async fn test_atomic_config_write() {
        let temp_dir = tempfile::tempdir().unwrap();
        let config_path = temp_dir.path().join("test-config.toml");
        
        let config = AgentConfig {
            server: ServerConfig {
                name: "Test".to_string(),
                version: "1.0.0".to_string(),
                active_agent: "TestAgent".to_string(),
            },
            agents: vec![],
        };
        
        // Write should succeed
        AtomicConfigWriter::write_config(&config_path, &config).await.unwrap();
        
        // File should exist and be readable
        assert!(config_path.exists());
        let loaded: AgentConfig = toml::from_str(&tokio::fs::read_to_string(&config_path).await.unwrap()).unwrap();
        assert_eq!(loaded.server.name, "Test");
    }
}
```

## Summary

This design addresses all architectural gaps identified:

1. **Secure Key Management**: Keyring for production, .env for development
2. **Type Safety**: PermissionLevel enum instead of strings
3. **Tool Registry**: Compile-time tool-column enforcement with re-evaluation
4. **Atomic Configuration**: Crash-safe TOML writes with backup
5. **Task Atomicity**: Comprehensive validation with complexity limits
6. **Recursive Summarization**: Constitution immutability with proper error handling
7. **Strict Integrity Checks**: All 6 checks must pass, no weighted scoring
8. **Proper Error Mapping**: OrchestratorError → MCP error codes
9. **Comprehensive Testing**: Unit tests for all critical paths

The design ensures junior developers cannot accidentally bypass critical business logic while maintaining the flexibility needed for the dual-agent architecture.