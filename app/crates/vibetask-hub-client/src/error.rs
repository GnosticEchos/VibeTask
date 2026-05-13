use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("Agent not found: {0}")]
    NotFound(String),
    #[error("Invalid agent type: {0}")]
    InvalidType(String),
    #[error("Key management error: {0}")]
    KeyManagement(String),
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Endpoint not allowed: {endpoint}. Allowed endpoints: {allowed_endpoints:?}")]
    EndpointNotAllowed {
        endpoint: String,
        allowed_endpoints: Vec<String>,
    },
}

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("Invalid response format: {0}")]
    InvalidResponse(String),
    #[error("API error {status}: {message}")]
    HttpError { status: u16, message: String },
    #[error("Hub is offline or unreachable")]
    HubOffline,
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("Failed to create HTTP client: {0}")]
    ClientCreation(String),
    #[error("Failed to clone request")]
    RequestClone,
    #[error("Unauthorized - invalid API key")]
    Unauthorized,
    #[error("Forbidden - insufficient permissions")]
    Forbidden,
    #[error("Resource not found")]
    NotFound,
    #[error("Rate limited - too many requests")]
    RateLimited,
    #[error("Server error {status}: {message}")]
    ServerError { status: u16, message: String },
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Request timeout")]
    Timeout,
    #[error("Circuit breaker is open")]
    CircuitBreakerOpen,
    #[error("Deserialization error for {url}: {error}")]
    Deserialization { url: String, error: String },
    #[error("Agent error: {0}")]
    Agent(#[from] AgentError),
}
