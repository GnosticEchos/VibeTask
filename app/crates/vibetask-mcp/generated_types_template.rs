// Generated types for VibeTask API
// This file is generated from the OpenAPI specification
use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use chrono::{DateTime, Utc};

// Agent API types (most important for MCP tools)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AgentMeResponse {
    pub agent: AgentInfo,
    pub delegations: Vec<Delegation>,
    #[serde(rename = "apiAllowance")]
    pub api_allowance: ApiAllowance,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    #[serde(rename = "ownerId")]
    pub owner_id: i32,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "expiresAt")]
    pub expires_at: DateTime<Utc>,
    pub metadata: AgentMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DelegationMode {
    Full,
    ColumnBound,
}

impl Default for DelegationMode {
    fn default() -> Self {
        Self::Full
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColumnAllowance {
    pub mode: DelegationMode,
    pub restricted_column_id: Option<i32>,
    pub allowed_move_range: i32,
    pub can_view_all_columns: bool,
    pub can_move_anywhere: bool,
    pub can_handoff_to_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Delegation {
    #[serde(rename = "projectId")]
    pub project_id: i32,
    #[serde(rename = "projectName")]
    pub project_name: String,
    #[serde(rename = "projectPrefix")]
    pub project_prefix: String,
    #[serde(rename = "permissionLevel")]
    pub permission_level: PermissionLevel,
    #[serde(rename = "delegatedAt")]
    pub delegated_at: DateTime<Utc>,
    #[serde(rename = "delegationMode", default)]
    pub delegation_mode: DelegationMode,
    #[serde(rename = "restrictedColumnId", default)]
    pub restricted_column_id: Option<i32>,
    #[serde(rename = "allowedMoveRange", default)]
    pub allowed_move_range: Option<i32>,
    #[serde(rename = "columnAllowance", default)]
    pub column_allowance: Option<ColumnAllowance>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
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

// Project types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub prefix: String,
    pub description: Option<String>,
    #[serde(rename = "ownerId")]
    pub owner_id: i32,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
    pub status: ProjectStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectSummary {
    pub id: i32,
    pub name: String,
    pub prefix: String,
    pub description: Option<String>,
    #[serde(rename = "taskCount")]
    pub task_count: i32,
    #[serde(rename = "memberCount")]
    pub member_count: i32,
    #[serde(rename = "lastActivity")]
    pub last_activity: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum ProjectStatus {
    #[serde(rename = "ACTIVE")]
    Active,
    #[serde(rename = "ARCHIVED")]
    Archived,
    #[serde(rename = "DELETED")]
    Deleted,
}

// Task types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Task {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub identifier: String,
    #[serde(rename = "projectId")]
    pub project_id: i32,
    #[serde(rename = "columnId")]
    pub column_id: i32,
    #[serde(rename = "assigneeId")]
    pub assignee_id: Option<i32>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
    pub status: TaskStatus,
    #[serde(rename = "parentId")]
    pub parent_id: Option<i32>,
    #[serde(rename = "planAccepted")]
    pub plan_accepted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskWithDetails {
    // Flatten the task fields directly
    #[serde(flatten)]
    pub task: Task,
    pub column: Option<Column>,
    pub project: Option<Project>,
    #[serde(rename = "linkedDocuments")]
    pub linked_documents: Option<Vec<ProjectDocument>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum TaskStatus {
    #[serde(rename = "ACTIVE")]
    Active,
    #[serde(rename = "COMPLETED")]
    Completed,
    #[serde(rename = "ARCHIVED")]
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Column {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "projectId")]
    pub project_id: i32,
    #[serde(default)]
    pub order: i32,
    pub color: Option<String>,
    #[serde(rename = "columnType")]
    pub column_type: Option<String>,
}

// Document types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub id: i32,
    pub title: String,
    pub content: String,
    #[serde(rename = "docType")]
    pub role: DocumentRole,
    #[serde(default)]
    pub project_id: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "createdById")]
    pub created_by: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum DocumentRole {
    #[serde(rename = "SPECIFICATION")]
    Specification,
    #[serde(rename = "IMPLEMENTATION_PLAN")]
    ImplementationPlan,
    #[serde(rename = "WORK_LOG")]
    WorkLog,
    #[serde(rename = "CONSTITUTION")]
    Constitution,
    #[serde(rename = "GENERAL")]
    General,
}

// Request/Response types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateDocumentInput {
    pub title: String,
    pub content: String,
    pub role: DocumentRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PatchDocumentInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub role: Option<DocumentRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub message: Option<String>,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginationMeta {
    pub page: i32,
    pub limit: i32,
    pub total: i32,
    #[serde(rename = "totalPages")]
    pub total_pages: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedProjectsResponse {
    pub data: Vec<Project>,
    pub pagination: PaginationMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedDocumentsResponse {
    pub data: Vec<ProjectDocument>,
    pub pagination: PaginationMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskListResponse {
    pub data: Vec<Task>,
    pub pagination: Option<PaginationMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct BoardResponse {
    pub project: Project,
    pub columns: Vec<Column>,
    pub tasks: Vec<Task>,
}

// Health check types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: DateTime<Utc>,
}

// User types (for completeness)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct User {
    pub id: i32,
    pub name: String,
    pub email: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UserWithPermissions {
    #[serde(flatten)]
    pub user: User,
    pub role: Option<String>,
    pub permissions: Option<Vec<String>>,
}

// Common re-exports for convenience
pub mod types {
    pub use super::{
        AgentMeResponse, AgentInfo, AgentMetadata, ApiAllowance, Delegation, PermissionLevel,
        Project, ProjectSummary, ProjectStatus, Task, TaskWithDetails, TaskStatus, Column,
        ProjectDocument, DocumentRole, CreateDocumentInput, PatchDocumentInput,
        ErrorResponse, PaginationMeta, PaginatedProjectsResponse, PaginatedDocumentsResponse,
        TaskListResponse, BoardResponse, HealthResponse, User, UserWithPermissions,
    };
}