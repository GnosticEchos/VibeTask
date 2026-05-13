use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum InitError {
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Agent detection error: {0}")]
    AgentDetection(String),

    #[error("MCP server initialization error: {0}")]
    McpServer(String),
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Configuration file not found: {0}")]
    FileNotFound(String),

    #[error("Failed to read configuration file: {0}")]
    ReadError(String),

    #[error("Failed to parse configuration: {0}")]
    ParseError(String),

    #[error("Configuration validation error: {0}")]
    ValidationError(String),

    #[error("Failed to write configuration: {0}")]
    WriteError(String),

    #[error("Atomic write operation failed: {0}")]
    AtomicWriteError(String),
}

#[derive(Debug, Error)]
#[allow(dead_code)]
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
#[allow(dead_code)]
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

    #[error("Hub client error: {0}")]
    HubClient(#[from] vibetask_hub_client::ApiError),

    #[error("Agent error: {0}")]
    Agent(#[from] AgentError),
}

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum McpError {
    #[error("Invalid tool call: {0}")]
    InvalidToolCall(String),

    #[error("Tool not available: {0}")]
    ToolNotAvailable(String),

    #[error("Permission denied for tool: {0}")]
    ToolPermissionDenied(String),

    #[error("Context assembly failed: {0}")]
    ContextAssemblyFailed(String),

    #[error("Token budget exceeded: {0}")]
    TokenBudgetExceeded(String),
}
