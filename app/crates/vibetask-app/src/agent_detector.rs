use crate::config::{AgentConfig, AgentEntry, PlatformConfig};
use crate::error::{AgentError, ApiError};
use crate::generated_types::{AgentMeResponse, Delegation, PermissionLevel};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info};

/// Agent type enumeration with associated data
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
        permissions: HashMap<i32, PermissionLevel>,
        delegations: Vec<Delegation>,
    },
}

/// Agent type detector with Hub API integration
pub struct AgentTypeDetector {
    config_path: String,
    api_client: Arc<crate::vibetask_client::VibeTaskClient>,
}

impl AgentTypeDetector {
    pub fn new(
        config_path: String,
        api_client: Arc<crate::vibetask_client::VibeTaskClient>,
    ) -> Self {
        Self {
            config_path,
            api_client,
        }
    }

    /// Load configuration and detect active agent type.
    /// Two-phase detection:
    /// 1. Ensure platform session JWT is valid (refresh if needed)
    /// 2. Detect and return the active agent type
    pub async fn detect_active_agent(&self) -> Result<AgentType, DetectionError> {
        debug!("Starting agent type detection");

        let config = self.load_config().await?;
        info!("Configuration loaded successfully");

        let active_agent_entry = config
            .agents
            .iter()
            .find(|a| a.name == config.server.active_agent)
            .ok_or_else(|| DetectionError::AgentNotFound(config.server.active_agent.clone()))?;

        info!("Active agent found: {}", active_agent_entry.name);

        let active_name = active_agent_entry.name.clone();

        // Attach or refresh x-platform-session for platform-agent writes (draft create/accept)
        // and for delegated agents that mint session via the platform roster.
        ensure_platform_session(&self.config_path, &config, &self.api_client).await?;

        let key = self.get_agent_key(&active_name).await?;
        debug!("Agent key retrieved from secure storage");

        let me_response = self
            .api_client
            .get_agent_me(&key)
            .await
            .map_err(crate::error::ApiError::from)?;
        info!(
            "Hub API response received for agent: {}",
            me_response.agent.name
        );

        self.validate_key_expiration(&me_response.agent.expires_at)?;
        let agent_type = self.convert_to_agent_type(me_response, active_agent_entry)?;
        info!("Agent type detected successfully: {:?}", agent_type);

        Ok(agent_type)
    }

    async fn load_config(&self) -> Result<AgentConfig, DetectionError> {
        AgentConfig::load(&self.config_path)
            .await
            .map_err(|e| DetectionError::ConfigLoad(e.to_string()))
    }

    async fn get_agent_key(&self, agent_name: &str) -> Result<String, DetectionError> {
        retrieve_agent_key(&self.config_path, agent_name).await
    }

    fn validate_key_expiration(
        &self,
        expires_at: &chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DetectionError> {
        use crate::atomic_writer::SecureKeyManager;

        let expires_at_string = expires_at.to_rfc3339();
        SecureKeyManager::validate_key_expiration(&expires_at_string)
            .map_err(|e| DetectionError::KeyExpired(e.to_string()))
    }

    fn convert_to_agent_type(
        &self,
        response: AgentMeResponse,
        _config_entry: &AgentEntry,
    ) -> Result<AgentType, DetectionError> {
        if response.api_allowance.is_platform_agent {
            info!("Detected Platform Agent: {}", response.agent.name);
            Ok(AgentType::Platform {
                name: response.agent.name,
                allowed_endpoints: response.api_allowance.configured_read_endpoints,
                effective_endpoints: response.api_allowance.effective_read_endpoints,
            })
        } else {
            info!(
                "Detected Project Delegated Agent: {} with {} delegations",
                response.agent.name,
                response.delegations.len()
            );

            let permissions = response
                .delegations
                .iter()
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

/// Load config and attach a valid platform session JWT on `api_client` when configured.
///
/// Required for platform-agent planning routes (draft preview/accept) and delegated writes.
pub async fn ensure_platform_session_for_delegated_agent(
    config_path: &str,
    api_client: &Arc<crate::vibetask_client::VibeTaskClient>,
) -> Result<(), DetectionError> {
    let config = AgentConfig::load(config_path)
        .await
        .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;

    ensure_platform_session(config_path, &config, api_client).await
}

/// Result of creating or reusing a platform session JWT.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlatformSessionInfo {
    pub platform_agent: String,
    pub expires_at: String,
    pub refreshed: bool,
    pub agent_roster_count: usize,
}

/// Mint or reuse a platform session JWT and persist it under `[platform]` in config.
///
/// Uses `platform_agent_name` when set; otherwise the active agent if it is Platform, else the
/// first Platform agent in config. When `force` is false, returns the cached JWT if still valid.
pub async fn refresh_platform_session(
    config_path: &str,
    api_client: &Arc<crate::vibetask_client::VibeTaskClient>,
    platform_agent_name: Option<&str>,
    force: bool,
) -> Result<PlatformSessionInfo, DetectionError> {
    let config = AgentConfig::load(config_path)
        .await
        .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;

    let platform_name = resolve_platform_agent_name(&config, platform_agent_name)?;

    if !force {
        if let Some(jwt) = config.platform.as_ref().and_then(|p| {
            let jwt = p.jwt.as_ref()?;
            let expires_at = p.expires_at.as_ref()?;
            let expires = chrono::DateTime::parse_from_rfc3339(expires_at).ok()?;
            if chrono::Utc::now() < expires.with_timezone(&chrono::Utc) {
                Some(jwt.clone())
            } else {
                None
            }
        }) {
            api_client.set_platform_session(Some(jwt.clone()));
            let expires_at = config
                .platform
                .as_ref()
                .and_then(|p| p.expires_at.clone())
                .unwrap_or_default();
            return Ok(PlatformSessionInfo {
                platform_agent: platform_name,
                expires_at,
                refreshed: false,
                agent_roster_count: 0,
            });
        }
    }

    let platform_key = retrieve_agent_key(config_path, &platform_name).await?;
    let session = api_client
        .post_agent_session(&platform_key)
        .await
        .map_err(crate::error::ApiError::from)?;

    api_client.set_platform_session(Some(session.token.clone()));
    save_platform_session_to_config(config_path, &session.token, &session.expires_at).await?;

    Ok(PlatformSessionInfo {
        platform_agent: platform_name,
        expires_at: session.expires_at,
        refreshed: true,
        agent_roster_count: session.agents.len(),
    })
}

fn resolve_platform_agent_name(
    config: &AgentConfig,
    platform_agent_name: Option<&str>,
) -> Result<String, DetectionError> {
    if let Some(name) = platform_agent_name {
        let entry = config
            .get_agent(name)
            .ok_or_else(|| DetectionError::AgentNotFound(name.to_string()))?;
        if entry.agent_type != "Platform" {
            return Err(DetectionError::AgentError(AgentError::InvalidType(
                format!("Agent '{name}' is not a Platform agent"),
            )));
        }
        return Ok(name.to_string());
    }

    if let Some(active) = config.get_agent(&config.server.active_agent) {
        if active.agent_type == "Platform" {
            return Ok(active.name.clone());
        }
    }

    config
        .agents
        .iter()
        .find(|a| a.agent_type == "Platform")
        .map(|a| a.name.clone())
        .ok_or_else(|| {
            DetectionError::AgentError(AgentError::InvalidType(
                "No Platform agent configured".to_string(),
            ))
        })
}

/// Ensure platform session JWT is valid, refreshing if expired.
/// Sets the JWT on `api_client` so subsequent requests include `x-platform-session`.
pub async fn ensure_platform_session(
    config_path: &str,
    config: &AgentConfig,
    api_client: &Arc<crate::vibetask_client::VibeTaskClient>,
) -> Result<(), DetectionError> {
    let existing_valid = config.platform.as_ref().and_then(|p| {
        let jwt = p.jwt.as_ref()?;
        let expires_at = p.expires_at.as_ref()?;
        let expires = chrono::DateTime::parse_from_rfc3339(expires_at).ok()?;
        if chrono::Utc::now() < expires.with_timezone(&chrono::Utc) {
            Some(jwt.clone())
        } else {
            None
        }
    });

    if let Some(jwt) = existing_valid {
        debug!("Platform session JWT is still valid, setting on client");
        api_client.set_platform_session(Some(jwt));
        return Ok(());
    }

    let platform_agent = config.agents.iter().find(|a| a.agent_type == "Platform");
    let platform_entry = match platform_agent {
        Some(entry) => entry,
        None => {
            info!("No platform agent configured — proceeding without platform session");
            return Ok(());
        }
    };

    debug!("Platform session expired or missing, refreshing...");
    let platform_key = retrieve_agent_key(config_path, &platform_entry.name).await?;

    let session = api_client
        .post_agent_session(&platform_key)
        .await
        .map_err(crate::error::ApiError::from)?;

    api_client.set_platform_session(Some(session.token.clone()));
    save_platform_session_to_config(config_path, &session.token, &session.expires_at).await?;
    info!("Platform session refreshed successfully");

    Ok(())
}

async fn retrieve_agent_key(config_path: &str, agent_name: &str) -> Result<String, DetectionError> {
    use crate::atomic_writer::SecureKeyManager;

    let config = AgentConfig::load(config_path)
        .await
        .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;

    if let Some(agent) = config.agents.iter().find(|a| a.name == agent_name) {
        if let Some(ref api_key) = agent.api_key {
            if !api_key.is_empty() {
                debug!("Using api_key from TOML config for agent: {}", agent_name);
                return Ok(api_key.clone());
            }
        }
    }

    SecureKeyManager::retrieve_key(agent_name)
        .await
        .map_err(|e| DetectionError::KeyNotFound(e.to_string()))
}

/// Save platform session JWT to config (does not push agents — user manages those).
async fn save_platform_session_to_config(
    config_path: &str,
    token: &str,
    expires_at: &str,
) -> Result<(), DetectionError> {
    let mut config = AgentConfig::load(config_path)
        .await
        .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;

    config.platform = Some(PlatformConfig {
        jwt: Some(token.to_string()),
        expires_at: Some(expires_at.to_string()),
    });

    config
        .save(config_path)
        .await
        .map_err(|e| DetectionError::ConfigLoad(e.to_string()))?;

    Ok(())
}

/// Detection error types
#[derive(Debug, thiserror::Error)]
pub enum DetectionError {
    #[error("Config file error: {0}")]
    ConfigLoad(String),

    #[error("Agent '{0}' not found in config")]
    AgentNotFound(String),

    #[error("Key not found for agent '{0}'")]
    KeyNotFound(String),

    #[error("Key expired: {0}")]
    KeyExpired(String),

    #[error("Hub API error: {0}")]
    ApiError(#[from] ApiError),

    #[error("Agent error: {0}")]
    AgentError(#[from] AgentError),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_permission_level_capabilities() {
        let viewer = PermissionLevel::Viewer;
        let user = PermissionLevel::User;

        // Both can read
        assert!(viewer.can_read());
        assert!(user.can_read());

        // Only USER can write
        assert!(!viewer.can_write());
        assert!(user.can_write());
    }

    #[test]
    fn test_agent_me_response_parsing() {
        let json_response = json!({
            "agent": {
                "id": "agent_123",
                "name": "TestAgent",
                "ownerId": 1,
                "createdAt": "2024-01-01T00:00:00Z",
                "expiresAt": "2025-01-01T00:00:00Z",
                "metadata": {
                    "isAgent": true,
                    "createdBy": 1,
                    "description": "Test agent",
                    "isPlatformAgent": true,
                    "allowedReadEndpoints": ["/api/agent/health"]
                }
            },
            "delegations": [],
            "apiAllowance": {
                "isPlatformAgent": true,
                "readOnly": true,
                "alwaysAllowedReadEndpoints": ["/api/agent/health", "/api/agent/me"],
                "configuredReadEndpoints": ["/api/agent/projects"],
                "effectiveReadEndpoints": ["/api/agent/health", "/api/agent/me", "/api/agent/projects"]
            }
        });

        let response: AgentMeResponse = serde_json::from_value(json_response).unwrap();
        assert_eq!(response.agent.name, "TestAgent");
        assert!(response.api_allowance.is_platform_agent);
        assert_eq!(response.delegations.len(), 0);
    }

    #[test]
    fn test_project_delegated_response_parsing() {
        let json_response = json!({
            "agent": {
                "id": "agent_456",
                "name": "ProjectAgent",
                "ownerId": 1,
                "createdAt": "2024-01-01T00:00:00Z",
                "expiresAt": "2025-01-01T00:00:00Z",
                "metadata": {
                    "isAgent": true,
                    "createdBy": 1,
                    "description": "Project agent",
                    "isPlatformAgent": false
                }
            },
            "delegations": [
                {
                    "projectId": 10,
                    "projectName": "Test Project",
                    "projectPrefix": "TP",
                    "permissionLevel": "USER",
                    "delegatedAt": "2024-01-01T00:00:00Z"
                }
            ],
            "apiAllowance": {
                "isPlatformAgent": false,
                "readOnly": false,
                "alwaysAllowedReadEndpoints": [],
                "configuredReadEndpoints": [],
                "effectiveReadEndpoints": []
            }
        });

        let response: AgentMeResponse = serde_json::from_value(json_response).unwrap();
        assert_eq!(response.agent.name, "ProjectAgent");
        assert!(!response.api_allowance.is_platform_agent);
        assert_eq!(response.delegations.len(), 1);
        assert_eq!(response.delegations[0].project_id, 10);
        assert_eq!(
            response.delegations[0].permission_level,
            PermissionLevel::User
        );
    }

    #[test]
    fn test_column_bound_delegation_in_agent_me() {
        use crate::generated_types::DelegationMode;

        let json_response = json!({
            "agent": {
                "id": "agent_gate",
                "name": "GateKeeper",
                "ownerId": 1,
                "createdAt": "2024-01-01T00:00:00Z",
                "expiresAt": "2025-01-01T00:00:00Z",
                "metadata": {
                    "isAgent": true,
                    "createdBy": 1,
                    "description": "Auditor",
                    "isPlatformAgent": false
                }
            },
            "delegations": [{
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
            }],
            "apiAllowance": {
                "isPlatformAgent": false,
                "readOnly": false,
                "alwaysAllowedReadEndpoints": [],
                "configuredReadEndpoints": [],
                "effectiveReadEndpoints": []
            }
        });

        let response: AgentMeResponse = serde_json::from_value(json_response).unwrap();
        let d = &response.delegations[0];
        assert_eq!(d.delegation_mode, DelegationMode::ColumnBound);
        assert_eq!(d.restricted_column_id, Some(54));
        let ca = d.column_allowance.as_ref().expect("columnAllowance");
        assert_eq!(ca.mode, DelegationMode::ColumnBound);
        assert_eq!(ca.restricted_column_id, Some(54));
        assert_eq!(ca.allowed_move_range, 0);
        assert!(!ca.can_view_all_columns);
        assert!(!ca.can_move_anywhere);
        assert!(ca.can_handoff_to_review);
    }
}
