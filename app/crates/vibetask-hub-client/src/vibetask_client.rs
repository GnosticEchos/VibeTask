//! VibeTask HTTP Client with fault isolation and agent type awareness
//!
//! This module provides a robust HTTP client for the VibeTask API with:
//! - Agent type detection and endpoint validation
//! - Retry logic with exponential backoff
//! - Circuit breaker pattern for fault isolation
//! - Platform Agent endpoint restriction enforcement

use crate::error::{AgentError, ApiError};
use crate::generated_types::*;
use crate::openapi::HubOpenApiClient;
use reqwest::{Client, Response, StatusCode};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use url::Url;

/// Circuit breaker states
#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    Closed,
    Open { opened_at: Instant },
    HalfOpen,
}

/// Circuit breaker for fault isolation
#[derive(Debug)]
pub struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_count: RwLock<u32>,
    failure_threshold: u32,
    timeout: Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, timeout: Duration) -> Self {
        Self {
            state: RwLock::new(CircuitState::Closed),
            failure_count: RwLock::new(0),
            failure_threshold,
            timeout,
        }
    }

    pub async fn call<F, T, E>(&self, operation: F) -> Result<T, CircuitBreakerError<E>>
    where
        F: std::future::Future<Output = Result<T, E>>,
    {
        // Check if circuit is open
        {
            let state = self.state.read().await;
            if let CircuitState::Open { opened_at } = *state {
                if opened_at.elapsed() < self.timeout {
                    return Err(CircuitBreakerError::CircuitOpen);
                }
                // Timeout elapsed, transition to half-open
                drop(state);
                *self.state.write().await = CircuitState::HalfOpen;
            }
        }

        // Execute operation
        match operation.await {
            Ok(result) => {
                // Success - reset failure count and close circuit
                *self.failure_count.write().await = 0;
                *self.state.write().await = CircuitState::Closed;
                Ok(result)
            }
            Err(error) => {
                // Failure - increment count and potentially open circuit
                let mut failure_count = self.failure_count.write().await;
                *failure_count += 1;

                if *failure_count >= self.failure_threshold {
                    *self.state.write().await = CircuitState::Open {
                        opened_at: Instant::now(),
                    };
                    warn!(
                        "Circuit breaker opened after {} failures",
                        self.failure_threshold
                    );
                }

                Err(CircuitBreakerError::OperationFailed(error))
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CircuitBreakerError<E> {
    #[error("Circuit breaker is open")]
    CircuitOpen,
    #[error("Operation failed: {0}")]
    OperationFailed(E),
}

/// Retry configuration
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 2.0,
        }
    }
}

/// VibeTask API client with fault isolation
pub struct VibeTaskClient {
    pub client: Client,
    pub base_url: Url,
    hub_openapi: HubOpenApiClient,
    circuit_breaker: Arc<CircuitBreaker>,
    retry_config: RetryConfig,
    platform_session: Mutex<Option<String>>,
}

impl VibeTaskClient {
    /// Create a new VibeTask client
    pub fn new(base_url: impl AsRef<str>) -> Result<Self, ApiError> {
        let base_url =
            Url::parse(base_url.as_ref()).map_err(|e| ApiError::InvalidUrl(e.to_string()))?;

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("vibetask-mcp/0.1.0")
            .build()
            .map_err(|e| ApiError::ClientCreation(e.to_string()))?;

        let circuit_breaker = Arc::new(CircuitBreaker::new(
            5,                       // failure threshold
            Duration::from_secs(60), // timeout
        ));

        let hub_openapi = HubOpenApiClient::new_with_client(base_url.as_str(), client.clone());

        Ok(Self {
            client,
            base_url,
            hub_openapi,
            circuit_breaker,
            retry_config: RetryConfig::default(),
            platform_session: Mutex::new(None),
        })
    }

    /// OpenAPI-generated client for `/api/agent/*` (no auth headers attached).
    ///
    /// Prefer the typed methods on [`VibeTaskClient`] for production use; this accessor
    /// is for spec-aligned experimentation and gradual migration off hand-maintained types.
    pub fn hub_openapi(&self) -> &HubOpenApiClient {
        &self.hub_openapi
    }

    /// Set the platform session JWT token
    pub fn set_platform_session(&self, token: Option<String>) {
        *self.platform_session.lock().unwrap() = token;
    }

    /// Get current platform session JWT
    pub fn get_platform_session(&self) -> Option<String> {
        self.platform_session.lock().unwrap().clone()
    }

    /// Execute a request with retry logic and circuit breaker
    async fn execute_request<T>(
        &self,
        request_builder: reqwest::RequestBuilder,
    ) -> Result<T, ApiError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let mut attempt = 0;
        let mut delay = self.retry_config.base_delay;

        loop {
            attempt += 1;

            let request = request_builder
                .try_clone()
                .ok_or_else(|| ApiError::RequestClone)?;

            let result = self
                .circuit_breaker
                .call(async {
                    let response = request.send().await?;
                    self.handle_response(response).await
                })
                .await;

            match result {
                Ok(response) => return Ok(response),
                Err(CircuitBreakerError::CircuitOpen) => {
                    return Err(ApiError::CircuitBreakerOpen);
                }
                Err(CircuitBreakerError::OperationFailed(error)) => {
                    if attempt >= self.retry_config.max_attempts || !self.is_retryable_error(&error)
                    {
                        return Err(error);
                    }

                    warn!(
                        "Request failed (attempt {}/{}): {}. Retrying in {:?}",
                        attempt, self.retry_config.max_attempts, error, delay
                    );

                    tokio::time::sleep(delay).await;

                    // Exponential backoff
                    delay = std::cmp::min(
                        Duration::from_millis(
                            (delay.as_millis() as f64 * self.retry_config.backoff_multiplier)
                                as u64,
                        ),
                        self.retry_config.max_delay,
                    );
                }
            }
        }
    }

    /// Handle HTTP response and deserialize
    async fn handle_response<T>(&self, response: Response) -> Result<T, ApiError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let status = response.status();
        let url = response.url().clone();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| ApiError::Deserialization {
                    url: url.to_string(),
                    error: e.to_string(),
                })
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error response".to_string());

            match status {
                StatusCode::UNAUTHORIZED => Err(ApiError::Unauthorized),
                StatusCode::FORBIDDEN => Err(ApiError::Forbidden),
                StatusCode::NOT_FOUND => Err(ApiError::NotFound),
                StatusCode::TOO_MANY_REQUESTS => Err(ApiError::RateLimited),
                status if status.is_server_error() => Err(ApiError::ServerError {
                    status: status.as_u16(),
                    message: error_text,
                }),
                _ => Err(ApiError::HttpError {
                    status: status.as_u16(),
                    message: error_text,
                }),
            }
        }
    }

    /// Check if an error is retryable
    fn is_retryable_error(&self, error: &ApiError) -> bool {
        matches!(
            error,
            ApiError::ServerError { .. }
                | ApiError::RateLimited
                | ApiError::NetworkError(_)
                | ApiError::Timeout
        )
    }

    /// Build URL for endpoint
    fn build_url(&self, path: &str) -> Result<Url, ApiError> {
        self.base_url
            .join(path)
            .map_err(|e| ApiError::InvalidUrl(e.to_string()))
    }

    /// Create authenticated request builder
    fn authenticated_request(
        &self,
        method: reqwest::Method,
        url: Url,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        let mut builder = self
            .client
            .request(method, url)
            .header("x-agent-api-key", api_key)
            .header("Content-Type", "application/json");
        if let Some(ref jwt) = *self.platform_session.lock().unwrap() {
            builder = builder.header("x-platform-session", jwt);
        }
        builder
    }

    /// Mark: backward compat alias — automatically includes x-platform-session from state.
    pub fn authenticated_request_with_session(
        &self,
        method: reqwest::Method,
        url: Url,
        api_key: &str,
        _session: Option<&str>,
    ) -> reqwest::RequestBuilder {
        self.authenticated_request(method, url, api_key)
    }

    /// Validate endpoint access for Platform Agents
    pub fn validate_platform_agent_access(
        &self,
        endpoint: &str,
        allowed_endpoints: &[String],
    ) -> Result<(), AgentError> {
        // Always allowed endpoints for Platform Agents
        let always_allowed = ["/api/agent/health", "/api/agent/me", "/api/agent/search"];

        if always_allowed.contains(&endpoint) {
            return Ok(());
        }

        // Check if endpoint matches any configured patterns
        for allowed_pattern in allowed_endpoints {
            if self.endpoint_matches_pattern(endpoint, allowed_pattern) {
                return Ok(());
            }
        }

        Err(AgentError::EndpointNotAllowed {
            endpoint: endpoint.to_string(),
            allowed_endpoints: allowed_endpoints.to_vec(),
        })
    }

    /// Check if endpoint matches a pattern (supports :param placeholders)
    pub fn endpoint_matches_pattern(&self, endpoint: &str, pattern: &str) -> bool {
        let endpoint_parts: Vec<&str> = endpoint.split('/').collect();
        let pattern_parts: Vec<&str> = pattern.split('/').collect();

        if endpoint_parts.len() != pattern_parts.len() {
            return false;
        }

        for (endpoint_part, pattern_part) in endpoint_parts.iter().zip(pattern_parts.iter()) {
            if pattern_part.starts_with(':') {
                // Parameter placeholder - matches any value
                continue;
            } else if endpoint_part != pattern_part {
                return false;
            }
        }

        true
    }

    // Agent API endpoints

    /// Get agent identity and permissions
    pub async fn get_agent_me(&self, api_key: &str) -> Result<AgentMeResponse, ApiError> {
        let url = self.build_url("/api/agent/me")?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching agent identity");
        let response = self.execute_request(request).await?;
        info!("Successfully retrieved agent identity");

        Ok(response)
    }

    /// Post to /api/agent/session — platform agent creates a session JWT
    pub async fn post_agent_session(
        &self,
        api_key: &str,
    ) -> Result<AgentSessionResponse, ApiError> {
        let url = self.build_url("/api/agent/session")?;
        let request = self.authenticated_request(reqwest::Method::POST, url, api_key);

        debug!("Creating platform session");
        let response = self.execute_request(request).await?;
        info!("Successfully created platform session");

        Ok(response)
    }

    /// Get /api/agent/my-agents — list all agents for the platform agent's target user
    /// Uses platform session JWT if available, otherwise falls back to platform API key
    pub async fn get_my_agents(
        &self,
        api_key: &str,
        platform_session: Option<&str>,
    ) -> Result<MyAgentsResponse, ApiError> {
        let url = self.build_url("/api/agent/my-agents")?;
        let request = self.authenticated_request_with_session(
            reqwest::Method::GET,
            url,
            api_key,
            platform_session,
        );

        debug!("Fetching my agents");
        let response = self.execute_request(request).await?;
        info!("Successfully retrieved my agents");

        Ok(response)
    }

    /// Get health status
    pub async fn get_health(&self, api_key: &str) -> Result<HealthResponse, ApiError> {
        let url = self.build_url("/api/agent/health")?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Checking health status");
        self.execute_request(request).await
    }

    /// Get projects (Platform Agent endpoint)
    pub async fn get_projects(
        &self,
        api_key: &str,
        allowed_endpoints: &[String],
    ) -> Result<PaginatedProjectsResponse, ApiError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct DelegatedProject {
            id: i32,
            name: String,
            #[serde(default)]
            prefix: Option<String>,
            #[serde(default, rename = "projectPrefix")]
            project_prefix: Option<String>,
            #[serde(default, rename = "delegatedAt")]
            delegated_at: Option<chrono::DateTime<chrono::Utc>>,
        }

        #[derive(Deserialize)]
        struct DelegatedProjectsEnvelope {
            projects: Vec<DelegatedProject>,
        }

        let endpoint = "/api/agent/projects";

        // Only validate Platform Agent access if allowed_endpoints is not empty
        if !allowed_endpoints.is_empty() {
            self.validate_platform_agent_access(endpoint, allowed_endpoints)
                .map_err(ApiError::from)?;
        }

        let url = self.build_url(endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching projects list");
        let raw: serde_json::Value = self.execute_request(request).await?;

        if let Ok(paginated) = serde_json::from_value::<PaginatedProjectsResponse>(raw.clone()) {
            return Ok(paginated);
        }

        if let Ok(items) = serde_json::from_value::<Vec<Project>>(raw.clone()) {
            let total = items.len() as i32;
            return Ok(PaginatedProjectsResponse {
                data: items,
                pagination: PaginationMeta {
                    page: 1,
                    limit: total.max(1),
                    total,
                    total_pages: 1,
                },
            });
        }

        if let Some(items) = raw.get("projects") {
            if let Ok(projects) = serde_json::from_value::<Vec<Project>>(items.clone()) {
                let total = projects.len() as i32;
                return Ok(PaginatedProjectsResponse {
                    data: projects,
                    pagination: PaginationMeta {
                        page: 1,
                        limit: total.max(1),
                        total,
                        total_pages: 1,
                    },
                });
            }
        }

        if let Ok(envelope) = serde_json::from_value::<DelegatedProjectsEnvelope>(raw.clone()) {
            let now = chrono::Utc::now();
            let projects = envelope
                .projects
                .into_iter()
                .map(|item| Project {
                    id: item.id,
                    name: item.name,
                    prefix: item
                        .project_prefix
                        .or(item.prefix)
                        .unwrap_or_else(|| "UNKNOWN".to_string()),
                    description: None,
                    status: ProjectStatus::Active,
                    created_at: item.delegated_at.unwrap_or(now),
                    updated_at: now,
                })
                .collect::<Vec<_>>();
            let total = projects.len() as i32;
            return Ok(PaginatedProjectsResponse {
                data: projects,
                pagination: PaginationMeta {
                    page: 1,
                    limit: total.max(1),
                    total,
                    total_pages: 1,
                },
            });
        }

        Err(ApiError::Deserialization {
            url: endpoint.to_string(),
            error: "Unsupported project response shape".to_string(),
        })
    }

    /// Get project overview summary (lightweight stats per project)
    pub async fn get_project_summary(
        &self,
        api_key: &str,
        project_id_filter: Option<i32>,
        scope: Option<&str>,
        include: Option<&str>,
        list_workspaces: bool,
        include_draft: bool,
    ) -> Result<serde_json::Value, ApiError> {
        let mut url = self.build_url("/api/agent/projects/summary")?;
        Self::append_project_summary_query(
            &mut url,
            project_id_filter,
            scope,
            include,
            list_workspaces,
            include_draft,
        );
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching project overview summary");
        self.execute_request(request).await
    }

    /// Get single-project summary stats from /api/agent/projects/{projectId}/summary
    ///
    /// If the hub returns 404 (route not deployed yet), falls back to
    /// `GET /api/agent/projects/summary?projectId=…` which older hubs expose.
    pub async fn get_project_summary_for_project(
        &self,
        api_key: &str,
        project_id: i32,
        scope: Option<&str>,
        include: Option<&str>,
        list_workspaces: bool,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/summary", project_id);
        let mut url = self.build_url(&endpoint)?;
        Self::append_project_summary_query(&mut url, None, scope, include, list_workspaces, false);

        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);
        debug!("Fetching single project summary for {}", project_id);
        match self.execute_request(request).await {
            Ok(value) => return Ok(value),
            Err(ApiError::NotFound) => {
                debug!(
                    "Single-project summary route returned 404; retrying fleet summary with projectId={}",
                    project_id
                );
            }
            Err(err) => return Err(err),
        }

        let mut fleet_url = self.build_url("/api/agent/projects/summary")?;
        Self::append_project_summary_query(
            &mut fleet_url,
            Some(project_id),
            scope,
            include,
            list_workspaces,
            false,
        );
        let request = self.authenticated_request(reqwest::Method::GET, fleet_url, api_key);
        let fleet: serde_json::Value = self.execute_request(request).await?;
        let project = fleet
            .get("projects")
            .and_then(|p| p.as_array())
            .and_then(|arr| arr.first())
            .cloned()
            .ok_or(ApiError::NotFound)?;
        Ok(serde_json::json!({ "project": project }))
    }

    fn append_project_summary_query(
        url: &mut Url,
        project_id_filter: Option<i32>,
        scope: Option<&str>,
        include: Option<&str>,
        list_workspaces: bool,
        include_draft: bool,
    ) {
        let mut qp = url.query_pairs_mut();
        if let Some(pid) = project_id_filter {
            qp.append_pair("projectId", &pid.to_string());
        }
        if let Some(scope) = scope.filter(|s| !s.trim().is_empty()) {
            qp.append_pair("scope", scope);
        }
        if let Some(include) = include.filter(|s| !s.trim().is_empty()) {
            qp.append_pair("include", include);
        }
        if list_workspaces {
            qp.append_pair("listWorkspaces", "true");
        }
        if include_draft {
            qp.append_pair("includeDraft", "true");
        }
    }

    /// Get project tasks
    pub async fn get_project_tasks(
        &self,
        api_key: &str,
        project_id: i32,
        allowed_endpoints: &[String],
    ) -> Result<TaskListResponse, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/tasks", project_id);

        // Only validate Platform Agent access if allowed_endpoints is not empty
        if !allowed_endpoints.is_empty() {
            self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                .map_err(ApiError::from)?;
        }

        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching tasks for project {}", project_id);
        let raw: serde_json::Value = self.execute_request(request).await?;

        if let Ok(task_list) = serde_json::from_value::<TaskListResponse>(raw.clone()) {
            return Ok(task_list);
        }

        if let Ok(tasks) = serde_json::from_value::<Vec<TaskWithDetails>>(raw.clone()) {
            return Ok(TaskListResponse {
                data: tasks,
                pagination: None,
            });
        }

        if let Ok(envelope) = serde_json::from_value::<AgentTaskListEnvelope>(raw.clone()) {
            let tasks = envelope
                .tasks
                .into_iter()
                .map(TaskWithDetails::from)
                .collect();
            return Ok(TaskListResponse {
                data: tasks,
                pagination: None,
            });
        }

        Err(ApiError::Deserialization {
            url: endpoint,
            error: "Unsupported task list response shape".to_string(),
        })
    }

    /// Search tasks for agents using `GET /api/agent/search` (`x-agent-api-key`).
    ///
    /// `project_id` is **not** sent to the Hub (the agent endpoint searches across delegations);
    /// callers may filter client-side using [`TaskSearchRow::project_id`].
    #[allow(unused_variables)]
    pub async fn search_tasks(
        &self,
        api_key: &str,
        query: &str,
        project_id: Option<i32>,
        page: Option<i32>,
        limit: Option<i32>,
        allowed_endpoints: &[String],
    ) -> Result<TaskSearchResponse, ApiError> {
        let query = query.trim();
        if query.is_empty() {
            return Err(ApiError::InvalidInput(
                "search query cannot be empty".to_string(),
            ));
        }

        let endpoint = "/api/agent/search";

        if !allowed_endpoints.is_empty() {
            self.validate_platform_agent_access(endpoint, allowed_endpoints)
                .map_err(ApiError::from)?;
        }

        let mut url = self.build_url(endpoint)?;
        {
            let mut query_pairs = url.query_pairs_mut();
            query_pairs.append_pair("q", query);
            if let Some(page) = page {
                query_pairs.append_pair("page", &page.to_string());
            }
            if let Some(limit) = limit {
                query_pairs.append_pair("limit", &limit.to_string());
            }
        }

        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);
        let raw: serde_json::Value = self.execute_request(request).await?;

        if let Ok(payload) = serde_json::from_value::<TaskSearchResponse>(raw.clone()) {
            return Ok(payload);
        }

        if let Ok(tasks) = serde_json::from_value::<Vec<TaskSearchRow>>(raw.clone()) {
            return Ok(TaskSearchResponse {
                total: tasks.len() as i32,
                page: page.unwrap_or(1),
                limit: limit.unwrap_or(tasks.len().max(1) as i32),
                tasks,
            });
        }

        Err(ApiError::Deserialization {
            url: endpoint.to_string(),
            error: "Unsupported task search response shape".to_string(),
        })
    }

    /// Get task details with context
    pub async fn get_task_details(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
        allowed_endpoints: &[String],
        inline: bool,
        compact: bool,
    ) -> Result<TaskWithDetails, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/tasks/{}", project_id, task_id);

        // Only validate Platform Agent access if allowed_endpoints is not empty
        // Empty allowed_endpoints indicates a Project Agent with full access
        if !allowed_endpoints.is_empty() {
            let list_endpoint = format!("/api/agent/projects/{}/docs", project_id);
            let has_access = allowed_endpoints.iter().any(|pattern| {
                self.endpoint_matches_pattern(&endpoint, pattern)
                    || self.endpoint_matches_pattern(&list_endpoint, pattern)
            });
            if !has_access {
                self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                    .map_err(ApiError::from)?;
            }
        }

        let mut url = self.build_url(&endpoint)?;

        // Add query parameters
        {
            let mut query_pairs = url.query_pairs_mut();
            if inline {
                query_pairs.append_pair("inline", "true");
            }
            if compact {
                query_pairs.append_pair("compact", "true");
            }
        } // query_pairs is dropped here

        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!(
            "Fetching task details for project {} task {}",
            project_id, task_id
        );
        let raw: serde_json::Value = self.execute_request(request).await?;

        if let Ok(task) = serde_json::from_value::<TaskWithDetails>(raw.clone()) {
            return Ok(task);
        }

        if let Some(task_value) = raw.get("task") {
            if let Ok(task) = serde_json::from_value::<TaskWithDetails>(task_value.clone()) {
                return Ok(task);
            }
        }

        let task_value = raw.get("task").unwrap_or(&raw);
        let now = chrono::Utc::now();
        let parse_datetime = |value: Option<&str>| -> chrono::DateTime<chrono::Utc> {
            value
                .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or(now)
        };
        let parse_status = |value: Option<&str>| -> TaskStatus {
            match value {
                Some("OPEN") => TaskStatus::Open,
                Some("IN_PROGRESS") => TaskStatus::InProgress,
                Some("COMPLETED") => TaskStatus::Completed,
                Some("CANCELLED") => TaskStatus::Cancelled,
                _ => TaskStatus::Open,
            }
        };

        let id = task_value
            .get("id")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .ok_or_else(|| ApiError::Deserialization {
                url: endpoint.clone(),
                error: "Missing task.id in task detail response".to_string(),
            })?;
        let name = task_value
            .get("name")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string())
            .ok_or_else(|| ApiError::Deserialization {
                url: endpoint.clone(),
                error: "Missing task.name in task detail response".to_string(),
            })?;
        let identifier = task_value
            .get("identifier")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string())
            .ok_or_else(|| ApiError::Deserialization {
                url: endpoint.clone(),
                error: "Missing task.identifier in task detail response".to_string(),
            })?;

        let column_value = task_value
            .get("column")
            .ok_or_else(|| ApiError::Deserialization {
                url: endpoint.clone(),
                error: "Missing task.column in task detail response".to_string(),
            })?;

        let column_id = task_value
            .get("projectColumnId")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .or_else(|| {
                column_value
                    .get("id")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32)
            })
            .unwrap_or_default();

        let linked_documents = task_value
            .get("docLinks")
            .and_then(|value| value.as_array())
            .map(|links| {
                links
                    .iter()
                    .filter_map(|item| {
                        let link: TaskDocumentLink = serde_json::from_value(item.clone()).ok()?;
                        let doc = link.document?;
                        Some(ProjectDocument {
                            id: doc.id,
                            title: doc.title,
                            content: doc.content,
                            role: doc.doc_type,
                            project_id,
                            created_at: Some(link.created_at),
                            updated_at: Some(link.created_at),
                            created_by: None,
                            version: Some(doc.version),
                        })
                    })
                    .collect::<Vec<_>>()
            });

        Ok(TaskWithDetails {
            id,
            name,
            identifier,
            description: task_value
                .get("description")
                .and_then(|v| v.as_str().map(|s| s.to_string())),
            status: parse_status(task_value.get("status").and_then(|v| v.as_str())),
            column_id,
            column: Column {
                id: column_value
                    .get("id")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_default() as i32,
                name: column_value
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                description: None,
                order: 0,
                color: None,
                column_type: column_value
                    .get("type")
                    .and_then(|v| v.as_str().map(|s| s.to_string())),
            },
            project_id: task_value
                .get("projectId")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(project_id),
            created_at: parse_datetime(task_value.get("createdAt").and_then(|v| v.as_str())),
            updated_at: parse_datetime(task_value.get("updatedAt").and_then(|v| v.as_str())),
            assignee_id: task_value
                .get("assigneeId")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            assignee_api_key_id: task_value
                .get("assigneeApiKeyId")
                .and_then(|v| v.as_str().map(|s| s.to_string())),
            relation_mode: task_value
                .get("relationMode")
                .and_then(|v| v.as_str().map(|s| s.to_string())),
            relation_id: task_value
                .get("relationId")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            parent_id: task_value
                .get("parentId")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            plan_accepted: task_value.get("planAccepted").and_then(|v| v.as_bool()),
            sub_board_outline_color: task_value
                .get("subBoardOutlineColor")
                .and_then(|v| v.as_str().map(|s| s.to_string())),
            linked_documents,
        })
    }

    /// Get project documents
    pub async fn get_project_documents(
        &self,
        api_key: &str,
        project_id: i32,
        allowed_endpoints: &[String],
        page: Option<i32>,
        limit: Option<i32>,
        doc_type: Option<&str>,
    ) -> Result<PaginatedDocumentsResponse, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs", project_id);

        // Only validate Platform Agent access if allowed_endpoints is not empty
        if !allowed_endpoints.is_empty() {
            let list_endpoint = format!("/api/agent/projects/{}/docs", project_id);
            let has_access = allowed_endpoints.iter().any(|pattern| {
                self.endpoint_matches_pattern(&endpoint, pattern)
                    || self.endpoint_matches_pattern(&list_endpoint, pattern)
            });
            if !has_access {
                self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                    .map_err(ApiError::from)?;
            }
        }

        let mut url = self.build_url(&endpoint)?;

        // Add query parameters
        {
            let mut query_pairs = url.query_pairs_mut();
            if let Some(page) = page {
                query_pairs.append_pair("page", &page.to_string());
            }
            if let Some(limit) = limit {
                query_pairs.append_pair("limit", &limit.to_string());
            }
            if let Some(doc_type) = doc_type {
                query_pairs.append_pair("type", doc_type);
            }
        }

        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching documents for project {}", project_id);
        self.execute_request(request).await
    }

    /// Get a single project document with full, untruncated content.
    pub async fn get_document(
        &self,
        api_key: &str,
        project_id: i32,
        doc_id: i32,
        allowed_endpoints: &[String],
    ) -> Result<ProjectDocument, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs/{}", project_id, doc_id);

        if !allowed_endpoints.is_empty() {
            let list_endpoint = format!("/api/agent/projects/{}/docs", project_id);
            let has_access = allowed_endpoints.iter().any(|pattern| {
                self.endpoint_matches_pattern(&endpoint, pattern)
                    || self.endpoint_matches_pattern(&list_endpoint, pattern)
            });
            if !has_access {
                self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                    .map_err(ApiError::from)?;
            }
        }

        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Fetching document {} for project {}", doc_id, project_id);
        self.execute_request(request).await
    }

    /// Update a document (Project Agent only)
    pub async fn update_document(
        &self,
        api_key: &str,
        project_id: i32,
        doc_id: i32,
        updates: &PatchDocumentInput,
    ) -> Result<ProjectDocument, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs/{}", project_id, doc_id);
        let url = self.build_url(&endpoint)?;

        let request = self
            .authenticated_request(reqwest::Method::PATCH, url, api_key)
            .json(updates);

        debug!("Updating document {} in project {}", doc_id, project_id);
        self.execute_request(request).await
    }

    /// Get project details (for delegation operations)
    pub async fn get_project_details(
        &self,
        api_key: &str,
        project_id: i32,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}", project_id);
        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!("Getting project details for project {}", project_id);
        self.execute_request(request).await
    }

    fn extract_project_columns(
        &self,
        project_id: i32,
        project_response: &serde_json::Value,
    ) -> Result<Vec<(i32, i32, Option<String>)>, ApiError> {
        let columns = project_response
            .get("project")
            .and_then(|p| p.get("columns"))
            .or_else(|| project_response.get("columns"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| ApiError::Deserialization {
                url: format!("/api/agent/projects/{}", project_id),
                error: "Missing project.columns in project detail response".to_string(),
            })?;

        let mut parsed = Vec::with_capacity(columns.len());
        for column in columns {
            let id = column
                .get("id")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .ok_or_else(|| ApiError::Deserialization {
                    url: format!("/api/agent/projects/{}", project_id),
                    error: "Missing column.id in project detail response".to_string(),
                })?;
            let order = column
                .get("order")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .ok_or_else(|| ApiError::Deserialization {
                    url: format!("/api/agent/projects/{}", project_id),
                    error: "Missing column.order in project detail response".to_string(),
                })?;
            let role_type = column
                .get("roleType")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            parsed.push((id, order, role_type));
        }

        parsed.sort_by_key(|(_, order, _)| *order);
        Ok(parsed)
    }

    /// Validate a delegated move using project column order before PATCH.
    pub async fn validate_task_move_precheck(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
        target_column_id: i32,
        delegation: &Delegation,
    ) -> Result<(), ApiError> {
        let project_response = self.get_project_details(api_key, project_id).await?;
        let columns = self.extract_project_columns(project_id, &project_response)?;

        let target_column = columns.iter().find(|(id, _, _)| *id == target_column_id);
        let Some((_, _, target_role_type)) = target_column else {
            return Err(ApiError::InvalidInput(format!(
                "Target column {} is not part of project {}",
                target_column_id, project_id
            )));
        };

        if target_role_type.as_deref() == Some("AGENT_REVIEW") {
            return Err(ApiError::InvalidInput(
                "Moving tasks to AGENT_REVIEW must use escalation/delete flow, not PATCH move"
                    .to_string(),
            ));
        }

        if matches!(delegation.delegation_mode, DelegationMode::Full)
            || delegation.can_move_anywhere()
        {
            return Ok(());
        }

        let anchor_column_id = delegation.effective_restricted_column_id().ok_or_else(|| {
            ApiError::InvalidInput(
                "Column-bound delegation is missing restrictedColumnId".to_string(),
            )
        })?;
        let allowed_range = delegation
            .effective_allowed_move_range()
            .unwrap_or(0)
            .max(0);

        let current_task = self.get_task_context(api_key, project_id, task_id).await?;
        let current_column_id = current_task.column_id;

        let mut order_by_column_id = std::collections::HashMap::new();
        for (id, order, _) in &columns {
            order_by_column_id.insert(*id, *order);
        }

        let anchor_order = order_by_column_id
            .get(&anchor_column_id)
            .copied()
            .ok_or_else(|| {
                ApiError::InvalidInput(format!(
                    "Anchor column {} is not present in project {}",
                    anchor_column_id, project_id
                ))
            })?;
        let target_order = order_by_column_id
            .get(&target_column_id)
            .copied()
            .ok_or_else(|| {
                ApiError::InvalidInput(format!(
                    "Target column {} is not present in project {}",
                    target_column_id, project_id
                ))
            })?;
        let current_order = order_by_column_id
            .get(&current_column_id)
            .copied()
            .ok_or_else(|| {
                ApiError::InvalidInput(format!(
                    "Task {} current column {} is not present in project {}",
                    task_id, current_column_id, project_id
                ))
            })?;

        let current_delta = (current_order - anchor_order).abs();
        let target_delta = (target_order - anchor_order).abs();
        if current_delta > allowed_range || target_delta > allowed_range {
            return Err(ApiError::InvalidInput(format!(
                "Move denied by column-bound delegation: anchor={}, range=±{}, currentOrder={}, targetOrder={}",
                anchor_order, allowed_range, current_order, target_order
            )));
        }

        Ok(())
    }

    /// Validate lattice constraints for delegated agents and then PATCH the task column.
    pub async fn update_agent_task_column_with_precheck(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
        column_id: i32,
        delegation: &Delegation,
    ) -> Result<serde_json::Value, ApiError> {
        self.validate_task_move_precheck(api_key, project_id, task_id, column_id, delegation)
            .await?;
        self.update_agent_task_column(api_key, project_id, task_id, column_id)
            .await
    }

    /// Get task context (for delegation operations)
    pub async fn get_task_context(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
    ) -> Result<TaskWithDetails, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/tasks/{}", project_id, task_id);
        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);

        debug!(
            "Getting task context for task {} in project {}",
            task_id, project_id
        );
        let raw: serde_json::Value = self.execute_request(request).await?;

        if let Ok(task) = serde_json::from_value::<TaskWithDetails>(raw.clone()) {
            return Ok(task);
        }

        if let Some(task_value) = raw.get("task") {
            if let Ok(task) = serde_json::from_value::<TaskWithDetails>(task_value.clone()) {
                return Ok(task);
            }
        }

        Err(ApiError::Deserialization {
            url: endpoint,
            error: format!(
                "Failed to deserialize task context response as TaskWithDetails or wrapped {{ task: ... }} payload: {}",
                raw
            ),
        })
    }

    /// Move a task to another column (`PATCH /api/agent/projects/{projectId}/tasks/{taskId}`).
    ///
    /// Request body: `{ "columnId": <id> }`. Contract examples live in
    /// `Kanban-frontend/docs/GATEKEEPER_PROTOCOL_TESTS.md` (auditor / laborer hand-off flows).
    pub async fn update_agent_task_column(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
        column_id: i32,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/tasks/{}", project_id, task_id);
        let url = self.build_url(&endpoint)?;
        let body = serde_json::json!({ "columnId": column_id });

        let request = self
            .authenticated_request(reqwest::Method::PATCH, url, api_key)
            .json(&body);

        debug!(
            "PATCH task {} in project {} -> column {}",
            task_id, project_id, column_id
        );
        self.execute_request(request).await
    }

    /// Create task under a project (agent route: `POST /api/agent/projects/{projectId}/tasks`).
    pub async fn create_agent_task(
        &self,
        api_key: &str,
        project_id: i32,
        allowed_endpoints: &[String],
        body: &AgentCreateTaskInput,
    ) -> Result<AgentCreateTaskResponse, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/tasks", project_id);

        if !allowed_endpoints.is_empty() {
            self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                .map_err(ApiError::from)?;
        }

        let url = self.build_url(&endpoint)?;
        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(body);

        debug!("Creating task in project {}", project_id);
        self.execute_request(request).await
    }

    /// Update task progress (Project Agent only)
    pub async fn update_task_progress(
        &self,
        api_key: &str,
        project_id: i32,
        task_id: i32,
        progress_update: &serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!(
            "/api/agent/projects/{}/tasks/{}/progress",
            project_id, task_id
        );
        let url = self.build_url(&endpoint)?;

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(progress_update);

        debug!(
            "Updating progress for task {} in project {}",
            task_id, project_id
        );
        self.execute_request(request).await
    }

    /// Create document (Project Agent only) - using serde_json::Value for flexibility
    pub async fn create_document(
        &self,
        api_key: &str,
        project_id: i32,
        document: &serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs", project_id);
        let url = self.build_url(&endpoint)?;

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(document);

        debug!("Creating document in project {}", project_id);
        self.execute_request(request).await
    }

    /// Create document link (Project Agent only)
    pub async fn create_document_link(
        &self,
        api_key: &str,
        project_id: i32,
        link_data: &serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/doc-links", project_id);
        let url = self.build_url(&endpoint)?;

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(link_data);

        debug!("Creating document link in project {}", project_id);
        self.execute_request(request).await
    }

    /// Create document with Knowledge Hub integration (Project Agent only)
    pub async fn create_knowledge_document(
        &self,
        api_key: &str,
        project_id: i32,
        document: &vibetask_core::domain::KnowledgeDocument,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs", project_id);
        let url = self.build_url(&endpoint)?;

        // Convert KnowledgeDocument to API format
        let document_payload = serde_json::json!({
            "title": document.title,
            "content": document.content,
            "role": match document.role {
                vibetask_core::domain::DocumentRole::Constitution => "CONSTITUTION",
                vibetask_core::domain::DocumentRole::Specification => "SPECIFICATION",
                vibetask_core::domain::DocumentRole::Plan => "IMPLEMENTATION_PLAN",
                vibetask_core::domain::DocumentRole::WorkLog => "WORK_LOG",
                vibetask_core::domain::DocumentRole::Reference => "GENERAL",
                vibetask_core::domain::DocumentRole::Research => "GENERAL",
                vibetask_core::domain::DocumentRole::Notes => "GENERAL",
            },
            "metadata": {
                "version": document.version,
                "state": document.state,
                "created_by": document.created_by,
                "annotations": document.annotations,
                "version_pin": document.version_pin,
                "word_count": document.metadata.word_count,
                "review_status": document.metadata.review_status,
                "linked_tasks": document.metadata.linked_tasks,
                "tags": document.metadata.tags
            }
        });

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(&document_payload);

        debug!("Creating Knowledge Hub document in project {}", project_id);
        self.execute_request(request).await
    }

    /// Update document with version management (Project Agent only)
    pub async fn update_knowledge_document(
        &self,
        api_key: &str,
        project_id: i32,
        doc_id: i32,
        document: &vibetask_core::domain::KnowledgeDocument,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs/{}", project_id, doc_id);
        let url = self.build_url(&endpoint)?;

        let update_payload = serde_json::json!({
            "title": document.title,
            "content": document.content,
            "metadata": {
                "version": document.version,
                "state": document.state,
                "last_modified_by": document.metadata.last_modified_by,
                "annotations": document.annotations,
                "version_pin": document.version_pin,
                "word_count": document.metadata.word_count,
                "review_status": document.metadata.review_status,
                "linked_tasks": document.metadata.linked_tasks,
                "tags": document.metadata.tags
            }
        });

        let request = self
            .authenticated_request(reqwest::Method::PATCH, url, api_key)
            .json(&update_payload);

        debug!(
            "Updating Knowledge Hub document {} in project {}",
            doc_id, project_id
        );
        self.execute_request(request).await
    }

    /// Add annotation to document (Project Agent only)
    pub async fn add_document_annotation(
        &self,
        api_key: &str,
        project_id: i32,
        doc_id: i32,
        annotation: &vibetask_core::domain::DocumentAnnotation,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!(
            "/api/agent/projects/{}/docs/{}/annotations",
            project_id, doc_id
        );
        let url = self.build_url(&endpoint)?;

        let annotation_payload = serde_json::json!({
            "annotation_type": annotation.annotation_type,
            "content": annotation.content,
            "agent_name": annotation.agent_name,
            "tags": annotation.tags,
            "context": annotation.context
        });

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(&annotation_payload);

        debug!(
            "Adding annotation to document {} in project {}",
            doc_id, project_id
        );
        self.execute_request(request).await
    }

    /// Search project documents via server-side full-text ranking endpoint.
    pub async fn get_similar_documents(
        &self,
        api_key: &str,
        project_id: i32,
        reference_content: &str,
        similarity_threshold: f64,
        allowed_endpoints: &[String],
    ) -> Result<Vec<DocumentSearchRow>, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/docs/search", project_id);

        if !allowed_endpoints.is_empty() {
            let list_endpoint = format!("/api/agent/projects/{}/docs", project_id);
            let has_access = allowed_endpoints.iter().any(|pattern| {
                self.endpoint_matches_pattern(&endpoint, pattern)
                    || self.endpoint_matches_pattern(&list_endpoint, pattern)
            });
            if !has_access {
                self.validate_platform_agent_access(&endpoint, allowed_endpoints)
                    .map_err(ApiError::from)?;
            }
        }

        let mut url = self.build_url(&endpoint)?;
        {
            let mut query_pairs = url.query_pairs_mut();
            query_pairs.append_pair("q", reference_content);
            query_pairs.append_pair("page", "1");
            query_pairs.append_pair("limit", "100");
        }

        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);
        let response: DocumentSearchResponse = self.execute_request(request).await?;

        let mut rows = response.data;

        if similarity_threshold > 0.0 {
            rows.retain(|row| row.rank >= similarity_threshold);
        }

        rows.sort_by(|a, b| b.rank.total_cmp(&a.rank));

        Ok(rows)
    }

    /// Pin document version for consistency (Project Agent only)
    pub async fn pin_document_version(
        &self,
        api_key: &str,
        project_id: i32,
        doc_id: i32,
        version: &str,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!(
            "/api/agent/projects/{}/docs/{}/pin-version",
            project_id, doc_id
        );
        let url = self.build_url(&endpoint)?;

        let pin_payload = serde_json::json!({
            "version": version
        });

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(&pin_payload);

        debug!(
            "Pinning version {} for document {} in project {}",
            version, doc_id, project_id
        );
        self.execute_request(request).await
    }

    /// Create help request (Project Agent only)
    pub async fn create_help_request(
        &self,
        api_key: &str,
        project_id: i32,
        help_request: &serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/projects/{}/help-requests", project_id);
        let url = self.build_url(&endpoint)?;

        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(help_request);

        debug!("Creating help request in project {}", project_id);
        self.execute_request(request).await
    }

    /// POST /api/agent/projects/draft — create DRAFT project (platform session required)
    pub async fn post_agent_draft_project(
        &self,
        api_key: &str,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let url = self.build_url("/api/agent/projects/draft")?;
        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(body);
        debug!("Creating draft project");
        self.execute_request(request).await
    }

    /// GET /api/agent/planning/projects/{id}/preview
    pub async fn get_agent_planning_preview(
        &self,
        api_key: &str,
        project_id: i32,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/planning/projects/{}/preview", project_id);
        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);
        self.execute_request(request).await
    }

    /// POST /api/agent/planning/projects/{id}/accept/init
    pub async fn post_agent_accept_init(
        &self,
        api_key: &str,
        project_id: i32,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/planning/projects/{}/accept/init", project_id);
        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::POST, url, api_key);
        self.execute_request(request).await
    }

    /// POST /api/agent/planning/projects/{id}/accept/confirm
    pub async fn post_agent_accept_confirm(
        &self,
        api_key: &str,
        project_id: i32,
        user_code: &str,
    ) -> Result<serde_json::Value, ApiError> {
        let endpoint = format!("/api/agent/planning/projects/{}/accept/confirm", project_id);
        let url = self.build_url(&endpoint)?;
        let request = self
            .authenticated_request(reqwest::Method::POST, url, api_key)
            .json(&serde_json::json!({ "userCode": user_code }));
        self.execute_request(request).await
    }

    /// GET /api/agent/planning/skills/{slug}
    pub async fn get_agent_planning_skill(
        &self,
        api_key: &str,
        slug: &str,
        project_id: Option<i32>,
    ) -> Result<serde_json::Value, ApiError> {
        let mut endpoint = format!("/api/agent/planning/skills/{}", slug);
        if let Some(pid) = project_id {
            endpoint.push_str(&format!("?projectId={}", pid));
        }
        let url = self.build_url(&endpoint)?;
        let request = self.authenticated_request(reqwest::Method::GET, url, api_key);
        self.execute_request(request).await
    }

    /// Get base URL as string for external API calls
    pub fn base_url_string(&self) -> String {
        self.base_url.to_string().trim_end_matches('/').to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_endpoint_pattern_matching() {
        let client = VibeTaskClient::new("http://localhost:3000").unwrap();

        // Test exact match
        assert!(client.endpoint_matches_pattern("/api/agent/health", "/api/agent/health"));

        // Test parameter matching
        assert!(client.endpoint_matches_pattern(
            "/api/agent/projects/123/tasks",
            "/api/agent/projects/:projectId/tasks"
        ));
        assert!(client.endpoint_matches_pattern(
            "/api/agent/projects/456/docs",
            "/api/agent/projects/:projectId/docs"
        ));

        // Test non-matching
        assert!(!client.endpoint_matches_pattern(
            "/api/agent/projects",
            "/api/agent/projects/:projectId/tasks"
        ));
        assert!(!client.endpoint_matches_pattern("/api/different/path", "/api/agent/health"));
    }

    #[tokio::test]
    async fn test_platform_agent_validation() {
        let client = VibeTaskClient::new("http://localhost:3000").unwrap();
        let allowed_endpoints = vec![
            "/api/agent/projects".to_string(),
            "/api/agent/projects/:projectId/docs".to_string(),
        ];

        // Always allowed endpoints should pass
        assert!(client
            .validate_platform_agent_access("/api/agent/health", &allowed_endpoints)
            .is_ok());
        assert!(client
            .validate_platform_agent_access("/api/agent/me", &allowed_endpoints)
            .is_ok());

        // Configured endpoints should pass
        assert!(client
            .validate_platform_agent_access("/api/agent/projects", &allowed_endpoints)
            .is_ok());
        assert!(client
            .validate_platform_agent_access("/api/agent/projects/123/docs", &allowed_endpoints)
            .is_ok());

        // Non-allowed endpoints should fail
        assert!(client
            .validate_platform_agent_access("/api/agent/projects/123/tasks", &allowed_endpoints)
            .is_err());
    }

    #[tokio::test]
    async fn test_get_agent_me_success() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        let mock_response = AgentMeResponse {
            agent: AgentInfo {
                id: "agent_123".to_string(),
                name: "TestAgent".to_string(),
                owner_id: 1,
                created_at: chrono::Utc::now(),
                expires_at: chrono::Utc::now() + chrono::Duration::days(30),
                metadata: AgentMetadata {
                    is_agent: true,
                    created_by: Some(1),
                    description: Some("Test agent".to_string()),
                    avatar_slug: None,
                    is_platform_agent: Some(true),
                    allowed_read_endpoints: Some(vec!["/api/agent/projects".to_string()]),
                },
            },
            delegations: vec![],
            api_allowance: ApiAllowance {
                is_platform_agent: true,
                read_only: true,
                always_allowed_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                ],
                configured_read_endpoints: vec!["/api/agent/projects".to_string()],
                effective_read_endpoints: vec![
                    "/api/agent/health".to_string(),
                    "/api/agent/me".to_string(),
                    "/api/agent/projects".to_string(),
                ],
            },
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/me"))
            .and(header("x-agent-api-key", "test_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&mock_response))
            .mount(&mock_server)
            .await;

        let result = client.get_agent_me("test_key").await.unwrap();
        assert_eq!(result.agent.name, "TestAgent");
        assert!(result.api_allowance.is_platform_agent);
    }

    /// Mirrors the GateKeeper protocol PATCH contract (abbreviated task JSON is acceptable).
    #[tokio::test]
    async fn gatekeeper_patch_task_column_contract() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        Mock::given(method("PATCH"))
            .and(path("/api/agent/projects/10/tasks/101"))
            .and(header("x-agent-api-key", "gk_key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "name": "Agent API Endpoints",
                "column": "Finalized"
            })))
            .mount(&mock_server)
            .await;

        let body = client
            .update_agent_task_column("gk_key", 10, 101, 55)
            .await
            .unwrap();

        assert_eq!(body["column"], "Finalized");
    }

    #[tokio::test]
    async fn column_bound_precheck_blocks_move_outside_range() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        let delegation = Delegation {
            project_id: 10,
            project_name: "Spec".to_string(),
            project_prefix: "SPEC".to_string(),
            permission_level: PermissionLevel::User,
            delegated_at: chrono::Utc::now(),
            delegation_mode: DelegationMode::ColumnBound,
            restricted_column_id: Some(54),
            allowed_move_range: Some(0),
            column_allowance: Some(ColumnAllowance {
                mode: DelegationMode::ColumnBound,
                restricted_column_id: Some(54),
                allowed_move_range: 0,
                can_view_all_columns: false,
                can_move_anywhere: false,
                can_handoff_to_review: true,
            }),
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/projects/10"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "project": {
                    "id": 10,
                    "columns": [
                        {"id": 53, "order": 4, "roleType": "STANDARD"},
                        {"id": 54, "order": 5, "roleType": "STANDARD"},
                        {"id": 55, "order": 6, "roleType": "STANDARD"}
                    ]
                }
            })))
            .mount(&mock_server)
            .await;

        Mock::given(method("GET"))
            .and(path("/api/agent/projects/10/tasks/101"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": 101,
                "name": "Task",
                "identifier": "SPEC-101",
                "status": "OPEN",
                "projectId": 10,
                "projectColumnId": 54,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
                "column": {
                    "id": 54,
                    "name": "Verify",
                    "description": null,
                    "order": 5,
                    "color": null,
                    "columnType": "STANDARD"
                }
            })))
            .mount(&mock_server)
            .await;

        let err = client
            .validate_task_move_precheck("gk_key", 10, 101, 55, &delegation)
            .await
            .unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("column-bound delegation") || msg.contains("Invalid input"),
            "{msg}"
        );
    }

    #[tokio::test]
    async fn column_bound_precheck_blocks_agent_review_patch_flow() {
        let mock_server = MockServer::start().await;
        let client = VibeTaskClient::new(mock_server.uri()).unwrap();

        let delegation = Delegation {
            project_id: 10,
            project_name: "Spec".to_string(),
            project_prefix: "SPEC".to_string(),
            permission_level: PermissionLevel::User,
            delegated_at: chrono::Utc::now(),
            delegation_mode: DelegationMode::Full,
            restricted_column_id: None,
            allowed_move_range: None,
            column_allowance: None,
        };

        Mock::given(method("GET"))
            .and(path("/api/agent/projects/10"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "project": {
                    "id": 10,
                    "columns": [
                        {"id": 54, "order": 5, "roleType": "STANDARD"},
                        {"id": 57, "order": 7, "roleType": "AGENT_REVIEW"}
                    ]
                }
            })))
            .mount(&mock_server)
            .await;

        let err = client
            .validate_task_move_precheck("gk_key", 10, 101, 57, &delegation)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("AGENT_REVIEW"));
    }

    #[tokio::test]
    async fn test_circuit_breaker_opens_after_failures() {
        let circuit_breaker = CircuitBreaker::new(2, Duration::from_secs(60));

        // First failure
        let result = circuit_breaker
            .call(async { Err::<(), &str>("error") })
            .await;
        assert!(matches!(
            result,
            Err(CircuitBreakerError::OperationFailed(_))
        ));

        // Second failure - should open circuit
        let result = circuit_breaker
            .call(async { Err::<(), &str>("error") })
            .await;
        assert!(matches!(
            result,
            Err(CircuitBreakerError::OperationFailed(_))
        ));

        // Third call - circuit should be open
        let result = circuit_breaker.call(async { Ok::<(), &str>(()) }).await;
        assert!(matches!(result, Err(CircuitBreakerError::CircuitOpen)));
    }

    /// Agent `GET /api/agent/projects/:id/docs` returns Prisma-shaped rows (`docType`, `createdById`, nested `createdBy`).
    #[test]
    fn paginated_documents_deserializes_agent_route_shape() {
        let json = r#"{
            "data": [{
                "id": 1,
                "projectId": 10,
                "title": "T",
                "content": "",
                "docType": "SPECIFICATION",
                "version": 1,
                "createdById": 2,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
                "createdBy": {"id": 2, "name": "A", "surname": "B"}
            }],
            "pagination": {"page": 1, "limit": 50, "total": 1, "totalPages": 1}
        }"#;
        let parsed: PaginatedDocumentsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].role, DocumentRole::Specification);
        assert_eq!(parsed.data[0].created_by, Some(2));
        assert_eq!(parsed.data[0].version, Some(1));
    }
}
