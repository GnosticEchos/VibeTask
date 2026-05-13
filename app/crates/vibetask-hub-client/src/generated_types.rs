//! Generated types for VibeTask API
//!
//! This module contains the essential request/response types for the VibeTask Agent API,
//! focusing on the endpoints needed for MCP integration.

use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};

/// Agent identity and permissions response from GET /api/agent/me
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentMeResponse {
    pub agent: AgentInfo,
    pub delegations: Vec<Delegation>,
    pub api_allowance: ApiAllowance,
}

/// Agent information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub owner_id: i32,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub metadata: AgentMetadata,
}

/// Agent metadata including platform agent flags
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentMetadata {
    pub is_agent: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<i32>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_platform_agent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_read_endpoints: Option<Vec<String>>,
}

/// API allowance and endpoint permissions
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApiAllowance {
    pub is_platform_agent: bool,
    pub read_only: bool,
    pub always_allowed_read_endpoints: Vec<String>,
    pub configured_read_endpoints: Vec<String>,
    pub effective_read_endpoints: Vec<String>,
}

/// Project delegation information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Delegation {
    pub project_id: i32,
    pub project_name: String,
    pub project_prefix: String,
    pub permission_level: PermissionLevel,
    pub delegated_at: DateTime<Utc>,
    /// Defaults to [`DelegationMode::Full`] when omitted (older Hub responses).
    #[serde(default)]
    pub delegation_mode: DelegationMode,
    #[serde(default)]
    pub restricted_column_id: Option<i32>,
    #[serde(default)]
    pub allowed_move_range: Option<i32>,
    #[serde(default)]
    pub column_allowance: Option<ColumnAllowance>,
}

impl Delegation {
    /// Short line for MCP/CLI status: lattice scope and column allowance.
    pub fn lattice_summary(&self) -> String {
        let mode_label = match self.delegation_mode {
            DelegationMode::Full => "FULL",
            DelegationMode::ColumnBound => "COLUMN_BOUND",
        };

        if self.delegation_mode == DelegationMode::Full && self.column_allowance.is_none() {
            return format!("Delegation: {mode_label} (full project)");
        }

        let anchor = self
            .restricted_column_id
            .or_else(|| {
                self.column_allowance
                    .as_ref()
                    .and_then(|c| c.restricted_column_id)
            })
            .map(|id| format!("restrictedColumn={id}"))
            .unwrap_or_else(|| "restrictedColumn=n/a".to_string());

        let range = self
            .allowed_move_range
            .or_else(|| self.column_allowance.as_ref().map(|c| c.allowed_move_range))
            .map(|r| format!("allowedMoveRange=±{r}"))
            .unwrap_or_else(|| "allowedMoveRange=n/a".to_string());

        let (view_all, move_any, handoff) = self
            .column_allowance
            .as_ref()
            .map(|c| {
                (
                    c.can_view_all_columns,
                    c.can_move_anywhere,
                    c.can_handoff_to_review,
                )
            })
            .unwrap_or((true, true, true));

        format!(
            "Delegation: {mode_label}; {anchor}; {range}; columnAllowance(viewAll={view_all}, moveAnywhere={move_any}, handoffReview={handoff})"
        )
    }

    pub fn effective_restricted_column_id(&self) -> Option<i32> {
        self.restricted_column_id.or_else(|| {
            self.column_allowance
                .as_ref()
                .and_then(|c| c.restricted_column_id)
        })
    }

    pub fn effective_allowed_move_range(&self) -> Option<i32> {
        self.allowed_move_range
            .or_else(|| self.column_allowance.as_ref().map(|c| c.allowed_move_range))
    }

    pub fn can_move_anywhere(&self) -> bool {
        self.column_allowance
            .as_ref()
            .map(|c| c.can_move_anywhere)
            .unwrap_or(matches!(self.delegation_mode, DelegationMode::Full))
    }
}

/// Permission level for project access
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
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

/// How Hub scopes a project delegation (`GET /api/agent/me`, OpenAPI `AgentDelegationWithProject`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DelegationMode {
    #[default]
    Full,
    ColumnBound,
}

/// Column-bound capability allowance mirrored from Hub (`columnAllowance` on delegations).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColumnAllowance {
    pub mode: DelegationMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restricted_column_id: Option<i32>,
    pub allowed_move_range: i32,
    pub can_view_all_columns: bool,
    pub can_move_anywhere: bool,
    pub can_handoff_to_review: bool,
}

/// Health check response from GET /api/agent/health
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct HealthResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>, // "agent" for /api/agent/health
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<DateTime<Utc>>, // Only in /health endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<serde_json::Value>, // Only in /health endpoint
}

/// Project information from GET /api/agent/projects
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub prefix: String,
    pub description: Option<String>,
    pub status: ProjectStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Project status enumeration
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum ProjectStatus {
    #[serde(rename = "ACTIVE")]
    Active,
    #[serde(rename = "ARCHIVED")]
    Archived,
    #[serde(rename = "DELETED")]
    Deleted,
}

/// Task information from GET /api/agent/projects/{projectId}/tasks/{taskId}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskWithDetails {
    pub id: i32,
    pub name: String,
    pub identifier: String,
    pub description: Option<String>,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(rename = "projectColumnId", alias = "columnId")]
    pub column_id: i32,
    pub column: Column,
    pub project_id: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_api_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_accepted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_board_outline_color: Option<String>,
    #[serde(
        default,
        rename = "docLinks",
        deserialize_with = "deserialize_doc_links_to_linked_documents",
        skip_serializing_if = "Option::is_none"
    )]
    pub linked_documents: Option<Vec<ProjectDocument>>,
}

fn deserialize_doc_links_to_linked_documents<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<ProjectDocument>>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(project_documents_from_doc_links_value(raw))
}

/// Normalize `docLinks` payloads into inline [`ProjectDocument`] rows used on [`TaskWithDetails`].
pub fn project_documents_from_doc_links_value(
    raw: Option<serde_json::Value>,
) -> Option<Vec<ProjectDocument>> {
    let raw = raw?;

    if let Ok(rows) = serde_json::from_value::<Vec<TaskDocumentLink>>(raw.clone()) {
        return Some(
            rows.into_iter()
                .filter_map(|row| {
                    let TaskDocumentLink {
                        created_at,
                        document,
                        ..
                    } = row;
                    document.map(|doc| (created_at, doc))
                })
                .map(|(created_at, doc)| ProjectDocument {
                    id: doc.id,
                    title: doc.title,
                    content: doc.content,
                    role: doc.doc_type,
                    project_id: 0,
                    created_at: Some(created_at),
                    updated_at: Some(created_at),
                    created_by: None,
                    version: Some(doc.version),
                })
                .collect(),
        );
    }

    if let Ok(rows) = serde_json::from_value::<Vec<ProjectDocument>>(raw) {
        return Some(rows);
    }

    Some(vec![])
}

/// Task status enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
pub enum TaskStatus {
    #[serde(rename = "OPEN")]
    #[default]
    Open,
    #[serde(rename = "IN_PROGRESS")]
    InProgress,
    #[serde(rename = "COMPLETED")]
    Completed,
    #[serde(rename = "CANCELLED")]
    Cancelled,
}

/// Column information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub order: i32,
    pub color: Option<String>,
    pub column_type: Option<String>,
}

/// Project document from Knowledge Hub
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub id: i32,
    pub title: String,
    pub content: String,
    /// Hub / Prisma field name (`docType`), not `role`.
    #[serde(rename = "docType")]
    pub role: DocumentRole,
    #[serde(default)]
    pub project_id: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    /// Prisma exposes `createdById`; nested `createdBy` is ignored by serde.
    #[serde(skip_serializing_if = "Option::is_none", rename = "createdById")]
    pub created_by: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<i32>,
}

/// Document role in the Knowledge Hub
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum DocumentRole {
    #[serde(rename = "CONSTITUTION")]
    Constitution,
    #[serde(rename = "SPECIFICATION")]
    Specification,
    #[serde(rename = "IMPLEMENTATION_PLAN")]
    ImplementationPlan,
    #[serde(rename = "WORK_LOG")]
    WorkLog,
    #[serde(rename = "GENERAL")]
    General,
    /// Knowledge Hub document type (agent inline JIT payload; OpenAPI `TaskDocumentLink.document.docType`)
    #[serde(rename = "BRAINSTORM")]
    Brainstorm,
    #[serde(rename = "POST_MORTEM")]
    PostMortem,
    #[serde(rename = "OTHER")]
    Other,
}

/// Task–document link as returned on agent task payloads (`docLinks`).
///
/// When `GET .../tasks/{taskId}?inline=true`, `document` is populated per OpenAPI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskDocumentLink {
    pub id: i32,
    pub task_id: i32,
    pub document_id: i32,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document: Option<TaskDocumentLinkInlineDocument>,
}

/// Nested document on [`TaskDocumentLink`] when `?inline=true`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskDocumentLinkInlineDocument {
    pub id: i32,
    pub title: String,
    pub doc_type: DocumentRole,
    pub content: String,
    pub version: i32,
}

/// Create document request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    pub title: String,
    pub content: String,
    pub role: DocumentRole,
}

/// Update document request
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PatchDocumentInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<DocumentRole>,
}

/// Error response structure
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Pagination metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaginationMeta {
    pub page: i32,
    pub limit: i32,
    pub total: i32,
    pub total_pages: i32,
}

/// Paginated response wrapper
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationMeta,
}

/// Specific paginated responses
pub type PaginatedProjectsResponse = PaginatedResponse<Project>;
pub type PaginatedDocumentsResponse = PaginatedResponse<ProjectDocument>;

/// Nested column payload on [`AgentTask`] list rows (`GET /api/agent/projects/{projectId}/tasks`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskColumn {
    pub id: i32,
    pub name: String,
    #[serde(default, rename = "type")]
    pub column_type: Option<String>,
}

/// Lightweight child task row returned on [`AgentTask`] payloads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskChild {
    pub id: i32,
    pub name: String,
    pub identifier: String,
    #[serde(default)]
    pub order: Option<i32>,
    #[serde(default)]
    pub is_container: Option<bool>,
    #[serde(default)]
    pub plan_accepted: Option<bool>,
}

/// Task row returned by agent task list routes (`GET /api/agent/projects/{projectId}/tasks`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTask {
    pub id: i32,
    pub name: String,
    pub identifier: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub order: i32,
    #[serde(default)]
    pub parent_id: Option<i32>,
    #[serde(default)]
    pub is_container: Option<bool>,
    #[serde(default)]
    pub plan_accepted: Option<bool>,
    pub project_id: i32,
    #[serde(default)]
    pub project_column_id: Option<i32>,
    #[serde(default)]
    pub assignee_id: Option<i32>,
    #[serde(default)]
    pub created_by_id: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub column: Option<AgentTaskColumn>,
    #[serde(default, rename = "docLinks")]
    pub doc_links: Option<Vec<TaskDocumentLink>>,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub relation_mode: Option<String>,
    #[serde(default)]
    pub relation_id: Option<i32>,
    #[serde(default)]
    pub children: Option<Vec<AgentTaskChild>>,
    #[serde(default)]
    pub child_count: Option<i32>,
}

/// Envelope for agent task list responses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskListEnvelope {
    pub tasks: Vec<AgentTask>,
}

impl From<AgentTaskColumn> for Column {
    fn from(value: AgentTaskColumn) -> Self {
        Self {
            id: value.id,
            name: value.name,
            description: None,
            order: 0,
            color: None,
            column_type: value.column_type,
        }
    }
}

impl From<AgentTask> for TaskWithDetails {
    fn from(task: AgentTask) -> Self {
        let fallback_column_id = task.column.as_ref().map(|c| c.id).unwrap_or(0);
        let column_id = task.project_column_id.unwrap_or(fallback_column_id);

        let column: Column = task.column.map(Column::from).unwrap_or_else(|| Column {
            id: column_id,
            name: "Unknown".to_string(),
            description: None,
            order: 0,
            color: None,
            column_type: None,
        });

        let linked_documents = project_documents_from_doc_links_value(
            task.doc_links
                .as_ref()
                .and_then(|links| serde_json::to_value(links).ok()),
        );

        Self {
            id: task.id,
            name: task.name,
            identifier: task.identifier,
            description: task.description,
            status: task.status,
            column_id,
            column,
            project_id: task.project_id,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_id: task.assignee_id,
            assignee_api_key_id: None,
            relation_mode: task.relation_mode,
            relation_id: task.relation_id,
            parent_id: task.parent_id,
            plan_accepted: task.plan_accepted,
            sub_board_outline_color: None,
            linked_documents,
        }
    }
}

/// Task list response (can be paginated or not)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct TaskListResponse {
    pub data: Vec<TaskWithDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination: Option<PaginationMeta>,
}

/// Hub task search row (`GET /api/search` for users, `GET /api/agent/search` for agents).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskSearchRow {
    pub id: i32,
    pub name: String,
    pub identifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub order: i32,
    pub project_id: i32,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "projectColumnId",
        alias = "columnId"
    )]
    pub column_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<i32>,
}

/// Paginated task search payload (`GET /api/search` for users, `GET /api/agent/search` for agents).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskSearchResponse {
    pub tasks: Vec<TaskSearchRow>,
    pub total: i32,
    pub page: i32,
    pub limit: i32,
}

/// Author metadata for document search rows (`GET /api/agent/projects/{projectId}/docs/search`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchAuthor {
    pub id: i32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub surname: Option<String>,
}

/// Search row from server-side document search endpoints.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchRow {
    pub id: i32,
    pub title: String,
    #[serde(rename = "docType", alias = "role")]
    pub doc_type: String,
    pub project_id: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub rank: f64,
    pub snippet: String,
    #[serde(default)]
    pub created_by: Option<DocumentSearchAuthor>,
}

/// Paginated document-search payload (`GET /api/agent/projects/{projectId}/docs/search`).
pub type DocumentSearchResponse = PaginatedResponse<DocumentSearchRow>;

/// Task context for work reflection and verification
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TaskContext {
    pub task_id: String,
    pub task_name: String,
    pub project_id: i32,
    pub project_name: String,
    pub column_name: String,
    pub description: Option<String>,
    pub assignee: Option<String>,
}

/// Document creation response
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentResponse {
    pub id: i32,
    pub title: String,
    pub content: String,
    pub doc_type: String,
}

/// Extended TaskWithDetails to include additional fields needed for context
impl TaskWithDetails {
    pub fn project_name(&self) -> Option<String> {
        // This would typically come from a join or separate query
        // For now, we'll return None and handle it in the client
        None
    }

    pub fn column_name(&self) -> Option<String> {
        Some(self.column.name.clone())
    }

    pub fn assignee(&self) -> Option<String> {
        // This would typically come from a join with user data
        // For now, we'll return a placeholder if assignee_id exists
        self.assignee_id.map(|id| format!("User {}", id))
    }
}

/// Request body for `POST /api/agent/projects/{projectId}/tasks/{taskId}/progress`.
///
/// Hub validates a single required string field named `text` (see KanbanAPI OpenAPI).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct AgentTaskProgressInput {
    pub text: String,
}

/// Request body for `POST /api/agent/projects/{projectId}/tasks` (Kanban-rewrite agent route).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentCreateTaskInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentCreatedTaskColumn {
    pub id: i32,
}

/// Task row returned inside `{ "task": ... }` from agent task creation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentCreatedTask {
    pub id: i32,
    pub name: String,
    pub identifier: String,
    pub project_id: i32,
    #[serde(default)]
    pub project_column_id: Option<i32>,
    #[serde(default)]
    pub parent_id: Option<i32>,
    #[serde(default)]
    pub column: Option<AgentCreatedTaskColumn>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct AgentCreateTaskResponse {
    pub task: AgentCreatedTask,
}

/// Agent session delegation info matching the /api/agent/session response
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionDelegation {
    pub project_id: i32,
    pub project_name: String,
    pub project_prefix: String,
    pub permission_level: PermissionLevel,
    #[serde(default)]
    pub delegation_mode: DelegationMode,
    #[serde(default)]
    pub restricted_column_id: Option<i32>,
    #[serde(default)]
    pub allowed_move_range: i32,
    pub is_active: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_allowance: Option<ColumnAllowance>,
}

/// Agent entry in the session response roster
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionAgent {
    pub id: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub expires_at: Option<String>,
    pub prefix: String,
    pub delegations: Vec<SessionDelegation>,
}

/// Response from POST /api/agent/session
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionResponse {
    pub token: String,
    pub expires_at: String,
    pub agents: Vec<SessionAgent>,
}

/// Agent entry in the my-agents response (no token field, includes metadata, no keys)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MyAgentEntry {
    pub id: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub is_platform_agent: bool,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub prefix: String,
    pub created_at: String,
    pub metadata: Option<serde_json::Value>,
    pub delegations: Vec<SessionDelegation>,
}

/// Response from GET /api/agent/my-agents
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MyAgentsResponse {
    pub agents: Vec<MyAgentEntry>,
    pub total: i32,
    pub active_total: i32,
}

#[cfg(test)]
mod delegation_tests {
    use super::*;

    #[test]
    fn deserializes_column_bound_delegation_from_hub() {
        let json = r##"{
            "projectId": 10,
            "projectName": "Spec Task Board",
            "projectPrefix": "SPEC",
            "permissionLevel": "USER",
            "delegationMode": "COLUMN_BOUND",
            "restrictedColumnId": 54,
            "allowedMoveRange": 0,
            "delegatedAt": "2024-01-01T00:00:00Z",
            "columnAllowance": {
                "mode": "COLUMN_BOUND",
                "restrictedColumnId": 54,
                "allowedMoveRange": 0,
                "canViewAllColumns": false,
                "canMoveAnywhere": false,
                "canHandoffToReview": true
            }
        }"##;

        let d: Delegation = serde_json::from_str(json).unwrap();
        assert_eq!(d.delegation_mode, DelegationMode::ColumnBound);
        assert_eq!(d.restricted_column_id, Some(54));
        assert_eq!(d.allowed_move_range, Some(0));
        assert!(d.column_allowance.is_some());
        assert!(d.lattice_summary().contains("COLUMN_BOUND"));
    }

    #[test]
    fn deserializes_task_detail_aliases_and_doc_links() {
        let json = r##"{
            "id": 7,
            "name": "Wire search",
            "identifier": "KAN-7",
            "description": "Search task",
            "status": "OPEN",
            "projectId": 3,
            "projectColumnId": 12,
            "createdAt": "2026-04-14T10:00:00Z",
            "updatedAt": "2026-04-14T10:30:00Z",
            "assigneeId": 9,
            "assigneeApiKeyId": "ag_abc123",
            "relationMode": "relates-to",
            "relationId": 44,
            "column": {
                "id": 12,
                "name": "Plan",
                "description": "Planning",
                "order": 1,
                "color": "#000000",
                "columnType": "PLAN"
            },
            "docLinks": [
                {
                    "id": 1,
                    "taskId": 7,
                    "documentId": 99,
                    "createdAt": "2026-04-14T10:31:00Z",
                    "document": {
                        "id": 99,
                        "title": "Search Notes",
                        "docType": "SPECIFICATION",
                        "content": "details",
                        "version": 2
                    }
                }
            ]
        }"##;
        let task: TaskWithDetails = serde_json::from_str(json).unwrap();
        assert_eq!(task.column_id, 12);
        assert_eq!(task.assignee_api_key_id.as_deref(), Some("ag_abc123"));
        assert_eq!(task.relation_mode.as_deref(), Some("relates-to"));
        assert_eq!(task.relation_id, Some(44));
        let linked_docs = task.linked_documents.unwrap_or_default();
        assert_eq!(linked_docs.len(), 1);
        assert_eq!(linked_docs[0].title, "Search Notes");
    }

    #[test]
    fn deserializes_task_with_partial_column_and_doc_rows() {
        let json = r##"{
            "id": 120,
            "name": "Goal alignment",
            "identifier": "SPEC-120",
            "description": null,
            "status": "OPEN",
            "projectId": 10,
            "projectColumnId": 51,
            "createdAt": "2026-04-14T10:00:00Z",
            "updatedAt": "2026-04-14T10:30:00Z",
            "column": {
                "id": 51,
                "name": "Execute",
                "description": "Build"
            },
            "docLinks": [
                {
                    "id": 1,
                    "title": "Notes",
                    "content": "body",
                    "docType": "SPECIFICATION"
                }
            ]
        }"##;

        let task: TaskWithDetails = serde_json::from_str(json).unwrap();
        assert_eq!(task.column.order, 0);
        let docs = task.linked_documents.unwrap_or_default();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].project_id, 0);
        assert!(docs[0].created_at.is_none());
        assert!(docs[0].updated_at.is_none());
    }

    #[test]
    fn deserializes_task_search_rows_with_nullable_project_column_id() {
        let json = r##"{
            "tasks": [
                {
                    "id": 120,
                    "name": "Goal alignment",
                    "identifier": "KAN-120",
                    "description": null,
                    "order": 1,
                    "projectId": 10,
                    "projectColumnId": 51,
                    "assigneeId": null
                },
                {
                    "id": 170,
                    "name": "Null column row",
                    "identifier": "KAN-170",
                    "description": "pending lane",
                    "order": 2,
                    "projectId": 10,
                    "projectColumnId": null,
                    "assigneeId": 7
                }
            ],
            "total": 2,
            "page": 1,
            "limit": 25
        }"##;

        let parsed: TaskSearchResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.tasks.len(), 2);
        assert_eq!(parsed.tasks[0].column_id, Some(51));
        assert_eq!(parsed.tasks[1].column_id, None);
        assert_eq!(parsed.tasks[1].assignee_id, Some(7));
    }

    #[test]
    fn deserializes_task_search_rows_with_legacy_column_id_alias() {
        let json = r##"{
            "tasks": [
                {
                    "id": 1,
                    "name": "Legacy alias",
                    "identifier": "KAN-1",
                    "description": null,
                    "order": 1,
                    "projectId": 2,
                    "columnId": 99,
                    "assigneeId": null
                }
            ],
            "total": 1,
            "page": 1,
            "limit": 10
        }"##;

        let parsed: TaskSearchResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.tasks[0].column_id, Some(99));
    }

    #[test]
    fn test_agent_session_response() {
        let json = r##"{
            "token": "eyJhbGciOiJIUzI1NiIs...",
            "expiresAt": "2026-05-09T21:09:40.000Z",
            "agents": [
                {
                    "id": "ag_clx",
                    "name": "GateKeeper",
                    "isActive": true,
                    "expiresAt": null,
                    "prefix": "ag",
                    "delegations": [
                        {
                            "projectId": 10,
                            "projectName": "Test",
                            "projectPrefix": "T",
                            "permissionLevel": "USER",
                            "delegationMode": "FULL",
                            "isActive": true
                        }
                    ]
                }
            ]
        }"##;
        let parsed: AgentSessionResponse = serde_json::from_str(json).unwrap();
        assert!(!parsed.token.is_empty());
        assert_eq!(parsed.agents.len(), 1);
    }
}
