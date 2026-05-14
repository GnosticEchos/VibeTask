use crate::atomic_writer::AtomicConfigWriter;
use crate::error::ConfigError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub server: ServerConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<PlatformConfig>,
    pub agents: Vec<AgentEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cli: Option<CliConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jwt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub active_agent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hub_url: Option<String>,
    #[serde(default)]
    pub allow_no_fences: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help_tree: Option<HelpTreeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelpTreeConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<TextThemeConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<TextThemeConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<TextThemeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextThemeConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub agent_type: String, // "Platform" or "ProjectDelegated"
    pub key_hash: String, // SHA-256 hash
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>, // Plain text API key

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

fn default_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

impl AgentConfig {
    /// Load configuration from TOML file
    pub async fn load<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let path = path.as_ref();

        if !path.exists() {
            return Err(ConfigError::FileNotFound(path.display().to_string()));
        }

        let content = fs::read_to_string(path)
            .await
            .map_err(|e| ConfigError::ReadError(e.to_string()))?;

        let config: AgentConfig =
            toml::from_str(&content).map_err(|e| ConfigError::ParseError(e.to_string()))?;

        config.validate()?;

        Ok(config)
    }

    /// Save configuration using atomic writes
    pub async fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), ConfigError> {
        self.validate()?;
        AtomicConfigWriter::write_config(path, self).await
    }

    /// Save configuration with backup
    pub async fn save_with_backup<P: AsRef<Path>>(&self, path: P) -> Result<(), ConfigError> {
        self.validate()?;
        AtomicConfigWriter::write_config_with_backup(path, self).await
    }

    /// Add a new agent to the configuration
    pub async fn add_agent(&mut self, agent: AgentEntry) -> Result<(), ConfigError> {
        // Remove existing agent with same name (if any)
        self.agents.retain(|a| a.name != agent.name);

        // Validate the new agent
        self.validate_agent(&agent)?;

        // Add new agent
        self.agents.push(agent);

        Ok(())
    }

    /// Update an existing agent or add if not found
    pub async fn update_agent(&mut self, agent: AgentEntry) -> Result<(), ConfigError> {
        self.validate_agent(&agent)?;

        if let Some(existing) = self.agents.iter_mut().find(|a| a.name == agent.name) {
            *existing = agent;
        } else {
            self.agents.push(agent);
        }

        Ok(())
    }

    /// Remove an agent by name
    pub fn remove_agent(&mut self, agent_name: &str) -> Result<(), ConfigError> {
        let initial_len = self.agents.len();
        self.agents.retain(|a| a.name != agent_name);

        if self.agents.len() == initial_len {
            return Err(ConfigError::ValidationError(format!(
                "Agent '{}' not found",
                agent_name
            )));
        }

        // If we removed the active agent, clear it
        if self.server.active_agent == agent_name {
            self.server.active_agent.clear();
        }

        Ok(())
    }

    /// Set the active agent
    pub fn set_active_agent(&mut self, agent_name: &str) -> Result<(), ConfigError> {
        if !self.agents.iter().any(|a| a.name == agent_name) {
            return Err(ConfigError::ValidationError(format!(
                "Agent '{}' not found in configuration",
                agent_name
            )));
        }

        self.server.active_agent = agent_name.to_string();
        Ok(())
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.server.name.is_empty() {
            return Err(ConfigError::ValidationError(
                "Server name cannot be empty".to_string(),
            ));
        }

        if self.server.active_agent.is_empty() {
            return Err(ConfigError::ValidationError(
                "Active agent cannot be empty".to_string(),
            ));
        }

        // Check if active agent exists
        if !self
            .agents
            .iter()
            .any(|a| a.name == self.server.active_agent)
        {
            return Err(ConfigError::ValidationError(format!(
                "Active agent '{}' not found in agents list",
                self.server.active_agent
            )));
        }

        // Validate agent entries
        for agent in &self.agents {
            self.validate_agent(agent)?;
        }

        // Check for duplicate agent names
        let mut names = std::collections::HashSet::new();
        for agent in &self.agents {
            if !names.insert(&agent.name) {
                return Err(ConfigError::ValidationError(format!(
                    "Duplicate agent name: '{}'",
                    agent.name
                )));
            }
        }

        Ok(())
    }

    /// Validate a single agent entry
    fn validate_agent(&self, agent: &AgentEntry) -> Result<(), ConfigError> {
        if agent.name.is_empty() {
            return Err(ConfigError::ValidationError(
                "Agent name cannot be empty".to_string(),
            ));
        }

        if !matches!(agent.agent_type.as_str(), "Platform" | "ProjectDelegated") {
            return Err(ConfigError::ValidationError(format!(
                "Invalid agent type '{}'. Must be 'Platform' or 'ProjectDelegated'",
                agent.agent_type
            )));
        }

        if !agent.key_hash.starts_with("sha256:") && agent.api_key.is_none() {
            return Err(ConfigError::ValidationError(format!(
                "Agent '{}' must have key_hash starting with 'sha256:' or an api_key",
                agent.name
            )));
        }

        // Validate agent type specific fields
        match agent.agent_type.as_str() {
            "Platform" => {
                if agent.allowed_endpoints.is_none() {
                    return Err(ConfigError::ValidationError(format!(
                        "Platform agent '{}' must have allowed_endpoints",
                        agent.name
                    )));
                }
            }
            "ProjectDelegated" => {
                if agent.projects.is_none() || agent.permissions.is_none() {
                    return Err(ConfigError::ValidationError(format!(
                        "ProjectDelegated agent '{}' must have projects and permissions",
                        agent.name
                    )));
                }
            }
            _ => unreachable!(), // Already validated above
        }

        Ok(())
    }

    /// Get active agent entry
    pub fn get_active_agent(&self) -> Option<&AgentEntry> {
        self.agents
            .iter()
            .find(|a| a.name == self.server.active_agent)
    }

    /// Get agent by name
    pub fn get_agent(&self, name: &str) -> Option<&AgentEntry> {
        self.agents.iter().find(|a| a.name == name)
    }

    /// List all agent names
    pub fn list_agent_names(&self) -> Vec<&str> {
        self.agents.iter().map(|a| a.name.as_str()).collect()
    }

    /// Create a default configuration template
    pub fn create_default(server_name: &str) -> Self {
        Self {
            server: ServerConfig {
                name: server_name.to_string(),
                version: default_version(),
                active_agent: String::new(), // Will be set when first agent is added
                hub_url: None,
                allow_no_fences: false,
            },
            platform: None,
            agents: Vec::new(),
            cli: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_load_valid_config() {
        let config_content = r#"
[server]
name = "Test Server"
active_agent = "TestAgent"

[[agents]]
name = "TestAgent"
type = "Platform"
key_hash = "sha256:abcd1234"
allowed_endpoints = ["/api/agent/health"]
"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(config_content.as_bytes()).unwrap();

        let config = AgentConfig::load(temp_file.path()).await.unwrap();
        assert_eq!(config.server.name, "Test Server");
        assert_eq!(config.server.active_agent, "TestAgent");
        assert_eq!(config.agents.len(), 1);
        assert_eq!(config.agents[0].name, "TestAgent");
        assert_eq!(config.agents[0].agent_type, "Platform");
    }

    #[tokio::test]
    async fn test_validation_errors() {
        let mut config = AgentConfig {
            server: ServerConfig {
                name: "".to_string(),
                version: "1.0.0".to_string(),
                active_agent: "TestAgent".to_string(),
                hub_url: None,
                allow_no_fences: false,
            },
            platform: None,
            agents: vec![],
            cli: None,
        };

        // Empty server name should fail
        assert!(config.validate().is_err());

        // Fix server name but missing active agent should fail
        config.server.name = "Test Server".to_string();
        assert!(config.validate().is_err());

        // Add agent with invalid type should fail
        config.agents.push(AgentEntry {
            name: "TestAgent".to_string(),
            agent_type: "Invalid".to_string(),
            key_hash: "sha256:abcd1234".to_string(),
            api_key: None,
            allowed_endpoints: None,
            effective_endpoints: None,
            projects: None,
            permissions: None,
            delegated_at: None,
        });
        config.cli = None;
        assert!(config.validate().is_err());

        // Fix agent type but invalid key hash should fail
        config.agents[0].agent_type = "Platform".to_string();
        config.agents[0].key_hash = "invalid_hash".to_string();
        assert!(config.validate().is_err());

        // Fix key hash but missing required fields should fail
        config.agents[0].key_hash = "sha256:abcd1234".to_string();
        assert!(config.validate().is_err());

        // Add required fields should pass
        config.agents[0].allowed_endpoints = Some(vec!["/api/agent/health".to_string()]);
        assert!(config.validate().is_ok());
    }

    #[tokio::test]
    async fn test_agent_management() {
        let mut config = AgentConfig::create_default("Test Server");

        // Add first agent
        let agent1 = AgentEntry {
            name: "Agent1".to_string(),
            agent_type: "Platform".to_string(),
            key_hash: "sha256:hash1".to_string(),
            api_key: None,
            allowed_endpoints: Some(vec!["/api/agent/health".to_string()]),
            effective_endpoints: None,
            projects: None,
            permissions: None,
            delegated_at: None,
        };

        config.add_agent(agent1).await.unwrap();
        config.set_active_agent("Agent1").unwrap();
        assert_eq!(config.agents.len(), 1);
        assert_eq!(config.server.active_agent, "Agent1");

        // Add second agent
        let agent2 = AgentEntry {
            name: "Agent2".to_string(),
            agent_type: "ProjectDelegated".to_string(),
            key_hash: "sha256:hash2".to_string(),
            api_key: None,
            allowed_endpoints: None,
            effective_endpoints: None,
            projects: Some(vec![1, 2]),
            permissions: Some(vec!["USER".to_string()]),
            delegated_at: Some("2024-01-01T00:00:00Z".to_string()),
        };

        config.add_agent(agent2).await.unwrap();
        assert_eq!(config.agents.len(), 2);

        // Update existing agent
        let mut updated_agent1 = config.get_agent("Agent1").unwrap().clone();
        updated_agent1.allowed_endpoints = Some(vec![
            "/api/agent/health".to_string(),
            "/api/agent/projects".to_string(),
        ]);
        config.update_agent(updated_agent1).await.unwrap();
        assert_eq!(config.agents.len(), 2);
        assert_eq!(
            config
                .get_agent("Agent1")
                .unwrap()
                .allowed_endpoints
                .as_ref()
                .unwrap()
                .len(),
            2
        );

        // Remove agent
        config.remove_agent("Agent2").unwrap();
        assert_eq!(config.agents.len(), 1);
        assert!(config.get_agent("Agent2").is_none());

        // Try to remove non-existent agent
        assert!(config.remove_agent("NonExistent").is_err());
    }

    #[tokio::test]
    async fn test_save_and_load_roundtrip() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let config_path = temp_dir.path().join("test-config.toml");

        let mut config = AgentConfig::create_default("Test Server");
        let agent = AgentEntry {
            name: "TestAgent".to_string(),
            agent_type: "Platform".to_string(),
            key_hash: "sha256:abcd1234".to_string(),
            api_key: None,
            allowed_endpoints: Some(vec!["/api/agent/health".to_string()]),
            effective_endpoints: None,
            projects: None,
            permissions: None,
            delegated_at: None,
        };

        config.add_agent(agent).await.unwrap();
        config.set_active_agent("TestAgent").unwrap();
        config.cli = None;

        // Save config
        config.save(&config_path).await.unwrap();

        // Load and verify
        let loaded_config = AgentConfig::load(&config_path).await.unwrap();
        assert_eq!(loaded_config.server.name, config.server.name);
        assert_eq!(
            loaded_config.server.active_agent,
            config.server.active_agent
        );
        assert_eq!(loaded_config.agents.len(), config.agents.len());
        assert_eq!(loaded_config.agents[0].name, config.agents[0].name);
    }
}
