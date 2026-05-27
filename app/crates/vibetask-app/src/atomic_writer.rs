use crate::config::AgentConfig;
use crate::error::ConfigError;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tempfile::NamedTempFile;
use tokio::fs;
use tracing::{info, warn};

/// Atomic configuration writer that ensures configuration integrity
/// Uses tempfile + rename pattern for atomic writes
pub struct AtomicConfigWriter;

impl AtomicConfigWriter {
    /// Atomic write: create temp file, write content, then rename
    /// If process crashes during write, original config remains intact
    pub async fn write_config<P: AsRef<Path>>(
        path: P,
        config: &AgentConfig,
    ) -> Result<(), ConfigError> {
        let path = path.as_ref();

        // STEP 1: Serialize to string first (fail fast if serialization fails)
        let content = toml::to_string_pretty(config)
            .map_err(|e| ConfigError::WriteError(format!("Serialization failed: {}", e)))?;

        // STEP 2: Create temporary file in same directory (ensures same filesystem)
        let temp_dir = path.parent().unwrap_or_else(|| Path::new("."));
        let temp_file = NamedTempFile::new_in(temp_dir).map_err(|e| {
            ConfigError::AtomicWriteError(format!("Temp file creation failed: {}", e))
        })?;

        // STEP 3: Write to temp file
        fs::write(temp_file.path(), &content)
            .await
            .map_err(|e| ConfigError::WriteError(format!("Write to temp file failed: {}", e)))?;

        // STEP 4: Atomic rename (this is the critical atomic operation)
        temp_file
            .persist(path)
            .map_err(|e| ConfigError::AtomicWriteError(format!("Atomic rename failed: {}", e)))?;

        info!("Config atomically written to {}", path.display());
        Ok(())
    }

    /// Backup existing config before writing new one
    pub async fn write_config_with_backup<P: AsRef<Path>>(
        path: P,
        config: &AgentConfig,
    ) -> Result<(), ConfigError> {
        let path = path.as_ref();

        // Create backup if original exists
        if path.exists() {
            let backup_path = format!(
                "{}.backup.{}",
                path.display(),
                chrono::Utc::now().format("%Y%m%d_%H%M%S")
            );

            fs::copy(path, &backup_path)
                .await
                .map_err(|e| ConfigError::WriteError(format!("Backup failed: {}", e)))?;

            info!("Config backed up to {}", backup_path);
        }

        // Atomic write
        Self::write_config(path, config).await
    }
}

/// Secure key management utilities with rotation and validation
pub struct SecureKeyManager;

static EXTRA_ENV_SEARCH_ROOTS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

impl SecureKeyManager {
    const KEYRING_SERVICE: &'static str = "vibetask";

    /// Register directories to search for `.env.<agent>` files (e.g. from MCP config path).
    pub fn register_env_search_roots(roots: impl IntoIterator<Item = PathBuf>) {
        let Ok(mut guard) = EXTRA_ENV_SEARCH_ROOTS.lock() else {
            return;
        };
        for root in roots {
            if !guard.iter().any(|existing| existing == &root) {
                guard.push(root);
            }
        }
    }

    /// Derive agent env file directories from `app/config/vibe-mcp.toml` (or similar).
    pub fn env_search_roots_from_config(config_path: &str) -> Vec<PathBuf> {
        let config = PathBuf::from(config_path);
        let mut roots = Vec::new();
        if let Some(config_dir) = config.parent() {
            roots.push(config_dir.to_path_buf());
            if let Some(app_dir) = config_dir.parent() {
                roots.push(app_dir.to_path_buf());
                if let Some(project_root) = app_dir.parent() {
                    roots.push(project_root.to_path_buf());
                }
            }
        }
        roots
    }

    fn extra_env_search_roots() -> Vec<PathBuf> {
        EXTRA_ENV_SEARCH_ROOTS
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    fn candidate_env_key_paths(agent_name: &str) -> Vec<PathBuf> {
        let file_name = format!(".env.{}", agent_name.to_lowercase());
        let mut candidates = Vec::new();
        let mut seen = HashSet::new();

        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let dirs_to_probe = Self::test_env_probe_dirs(cwd.clone());

        for dir in dirs_to_probe {
            let path = dir.join(&file_name);
            if seen.insert(path.clone()) {
                candidates.push(path);
            }
        }

        if cfg!(test) {
            return candidates;
        }

        // Probe likely workspace locations for existing development key files.
        for ancestor in cwd.ancestors().take(8) {
            let candidate_dirs = [
                ancestor.to_path_buf(),
                ancestor.join("app"),
                ancestor.join("app/crates/vibetask-app"),
                ancestor.join("crates/vibetask-mcp"),
                ancestor.join("crates/vibetask-mcp/examples"),
                ancestor.join("crates/vibetask-app"),
            ];
            for dir in candidate_dirs {
                let path = dir.join(&file_name);
                if seen.insert(path.clone()) {
                    candidates.push(path);
                }
            }
        }

        candidates
    }

    /// Stable directory for `.env.<agent>` files during `cargo test`.
    /// Avoids flaky reads when parallel tests change process CWD or register temp dirs
    /// that are deleted when those tests finish.
    fn test_keys_root() -> PathBuf {
        static ROOT: OnceLock<PathBuf> = OnceLock::new();
        ROOT.get_or_init(|| {
            let dir = std::env::temp_dir()
                .join(format!("vibetask-agent-test-keys-{}", std::process::id()));
            let _ = std::fs::create_dir_all(&dir);
            dir
        })
        .clone()
    }

    fn test_env_probe_dirs(cwd: PathBuf) -> Vec<PathBuf> {
        let mut dirs_to_probe = Vec::new();
        let mut seen = HashSet::new();

        let mut push_dir = |dir: PathBuf| {
            if seen.insert(dir.clone()) {
                dirs_to_probe.push(dir);
            }
        };

        if cfg!(test) {
            push_dir(Self::test_keys_root());
        }

        if let Ok(dir) = std::env::var("VIBETASK_AGENT_ENV_DIR") {
            push_dir(PathBuf::from(dir));
        }
        for root in Self::extra_env_search_roots() {
            push_dir(root);
        }

        if !cfg!(test) {
            push_dir(cwd);
        }

        dirs_to_probe
    }

    async fn read_key_from_env_file(path: &Path) -> Result<Option<String>, ConfigError> {
        let content = match fs::read_to_string(path).await {
            Ok(content) => content,
            Err(_) => return Ok(None),
        };

        for line in content.lines() {
            if let Some(key) = line.strip_prefix("VIBETASK_API_KEY=") {
                return Ok(Some(key.to_string()));
            }
        }

        Ok(None)
    }

    async fn read_key_from_env_candidates(
        agent_name: &str,
    ) -> Result<Option<(String, PathBuf)>, ConfigError> {
        let candidates = Self::candidate_env_key_paths(agent_name);
        for path in candidates {
            if let Some(key) = Self::read_key_from_env_file(&path).await? {
                return Ok(Some((key, path)));
            }
        }

        Ok(None)
    }

    fn candidate_env_help(agent_name: &str) -> String {
        let candidates = Self::candidate_env_key_paths(agent_name);
        let rendered = candidates
            .iter()
            .take(4)
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");

        format!("Create one of [{}] with VIBETASK_API_KEY=<key>", rendered)
    }

    /// Hash API key with SHA-256 for secure storage
    pub fn hash_key(api_key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(api_key.as_bytes());
        format!("sha256:{:x}", hasher.finalize())
    }

    /// Verify if a key matches the stored hash
    pub fn verify_key_hash(api_key: &str, stored_hash: &str) -> bool {
        let computed_hash = Self::hash_key(api_key);
        computed_hash == stored_hash
    }

    /// Store API key securely in the OS keyring.
    /// In debug builds, fall back to an env file only if the keyring is unavailable.
    pub async fn store_key(agent_name: &str, api_key: &str) -> Result<(), ConfigError> {
        if cfg!(test) {
            let env_file = format!(".env.{}", agent_name.to_lowercase());
            let content = format!("VIBETASK_API_KEY={}\n", api_key);
            let mut wrote_any = false;
            let mut write_errors: Vec<String> = Vec::new();

            // Write to CWD and any registered/env override roots so retrieval stays stable
            // even if other tests mutate process CWD.
            let probe_dirs = Self::test_env_probe_dirs(
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            );

            let mut seen = HashSet::new();
            for dir in probe_dirs {
                let path = dir.join(&env_file);
                if !seen.insert(path.clone()) {
                    continue;
                }
                match fs::write(&path, &content).await {
                    Ok(_) => wrote_any = true,
                    Err(err) => write_errors.push(format!("{} ({})", path.display(), err)),
                }
            }

            if wrote_any {
                return Ok(());
            }

            return Err(ConfigError::WriteError(format!(
                "Failed to write test env file to any candidate path: {}",
                write_errors.join("; ")
            )));
        }

        use keyring::Entry;

        let entry = Entry::new(Self::KEYRING_SERVICE, agent_name).map_err(|e| {
            ConfigError::WriteError(format!("Keyring entry creation failed: {}", e))
        })?;

        match entry.set_password(api_key) {
            Ok(()) => {
                info!(
                    "API key securely stored in system keyring for agent: {}",
                    agent_name
                );
                Ok(())
            }
            Err(keyring_err) => {
                #[cfg(debug_assertions)]
                {
                    warn!(
                        "Keyring storage failed for '{}': {}. Falling back to debug env file.",
                        agent_name, keyring_err
                    );
                    let env_file = format!(".env.{}", agent_name.to_lowercase());
                    let content = format!("VIBETASK_API_KEY={}\n", api_key);

                    fs::write(&env_file, content).await.map_err(|e| {
                        ConfigError::WriteError(format!("Failed to write fallback env file: {}", e))
                    })?;

                    info!("API key stored in development env file: {}", env_file);
                    Ok(())
                }
                #[cfg(not(debug_assertions))]
                {
                    Err(ConfigError::WriteError(format!(
                        "Keyring storage failed: {}",
                        keyring_err
                    )))
                }
            }
        }
    }

    /// Retrieve API key from secure storage
    pub async fn retrieve_key(agent_name: &str) -> Result<String, ConfigError> {
        if cfg!(test) {
            if let Some((key, _path)) = Self::read_key_from_env_candidates(agent_name).await? {
                return Ok(key);
            }
            return Err(ConfigError::ReadError(format!(
                "Test key not found for agent '{}'. {}",
                agent_name,
                Self::candidate_env_help(agent_name)
            )));
        }

        use keyring::Entry;

        let entry = Entry::new(Self::KEYRING_SERVICE, agent_name)
            .map_err(|e| ConfigError::ReadError(format!("Keyring entry creation failed: {}", e)))?;

        match entry.get_password() {
            Ok(key) => Ok(key),
            Err(keyring_err) => {
                warn!(
                    "Keyring lookup failed for '{}': {}. Falling back to env-file discovery.",
                    agent_name, keyring_err
                );

                if let Some((key, path)) = Self::read_key_from_env_candidates(agent_name).await? {
                    info!("Loaded API key from fallback env file: {}", path.display());
                    return Ok(key);
                }

                Err(ConfigError::ReadError(format!(
                    "Key not found for agent '{}': {}. {}",
                    agent_name,
                    keyring_err,
                    Self::candidate_env_help(agent_name)
                )))
            }
        }
    }

    /// Rotate API key for an agent (store new key and update config)
    pub async fn rotate_key(
        agent_name: &str,
        new_api_key: &str,
        config_path: &str,
    ) -> Result<String, ConfigError> {
        // Hash the new key
        let new_key_hash = Self::hash_key(new_api_key);

        // Store the new key securely
        Self::store_key(agent_name, new_api_key).await?;

        // Load and update configuration
        let mut config = crate::config::AgentConfig::load(config_path).await?;

        // Find and update the agent's key hash
        if let Some(agent) = config.agents.iter_mut().find(|a| a.name == agent_name) {
            let old_hash = agent.key_hash.clone();
            agent.key_hash = new_key_hash.clone();

            // Save updated configuration
            config.save_with_backup(config_path).await?;

            info!(
                "Key rotated for agent '{}': {} -> {}",
                agent_name,
                &old_hash[..16], // Show only first 16 chars for security
                &new_key_hash[..16]
            );

            Ok(new_key_hash)
        } else {
            Err(ConfigError::ValidationError(format!(
                "Agent '{}' not found in configuration",
                agent_name
            )))
        }
    }

    /// Remove API key from secure storage
    pub async fn remove_key(agent_name: &str) -> Result<(), ConfigError> {
        if cfg!(test) {
            let env_file = format!(".env.{}", agent_name.to_lowercase());
            let probe_dirs = Self::test_env_probe_dirs(
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            );
            let mut seen = HashSet::new();
            for dir in probe_dirs {
                let path = dir.join(&env_file);
                if !seen.insert(path.clone()) {
                    continue;
                }
                if tokio::fs::metadata(&path).await.is_ok() {
                    tokio::fs::remove_file(&path).await.map_err(|e| {
                        ConfigError::WriteError(format!(
                            "Failed to remove test env file {}: {}",
                            path.display(),
                            e
                        ))
                    })?;
                }
            }
            return Ok(());
        }

        use keyring::Entry;

        let entry = Entry::new(Self::KEYRING_SERVICE, agent_name).map_err(|e| {
            ConfigError::WriteError(format!("Keyring entry creation failed: {}", e))
        })?;

        let keyring_result = entry.delete_credential();

        #[cfg(debug_assertions)]
        {
            let env_file = format!(".env.{}", agent_name.to_lowercase());
            if tokio::fs::metadata(&env_file).await.is_ok() {
                tokio::fs::remove_file(&env_file).await.map_err(|e| {
                    ConfigError::WriteError(format!("Failed to remove env file: {}", e))
                })?;
                info!("Removed development env file: {}", env_file);
            }
        }

        keyring_result.map_err(|e| {
            ConfigError::WriteError(format!("Failed to remove key from keyring: {}", e))
        })?;

        info!(
            "Removed API key from system keyring for agent: {}",
            agent_name
        );
        Ok(())
    }

    /// Validate key expiration and warn if needed
    pub fn validate_key_expiration(expires_at: &str) -> Result<(), ConfigError> {
        let expires = chrono::DateTime::parse_from_rfc3339(expires_at).map_err(|e| {
            ConfigError::ValidationError(format!("Invalid expiration date format: {}", e))
        })?;

        let now = chrono::Utc::now();
        let expires_utc = expires.with_timezone(&chrono::Utc);

        if expires_utc <= now {
            return Err(ConfigError::ValidationError(format!(
                "API key expired at {}",
                expires_at
            )));
        }

        // Warn if expiring within 7 days
        let days_until_expiry = (expires_utc - now).num_days();
        if days_until_expiry <= 7 {
            warn!(
                "API key expires in {} days ({})",
                days_until_expiry, expires_at
            );
        }

        Ok(())
    }

    /// Check if key expiration notification is needed
    pub fn check_expiration_notification(expires_at: &str) -> Option<ExpirationNotification> {
        let expires = chrono::DateTime::parse_from_rfc3339(expires_at).ok()?;
        let now = chrono::Utc::now();
        let expires_utc = expires.with_timezone(&chrono::Utc);

        if expires_utc <= now {
            return Some(ExpirationNotification::Expired {
                expired_at: expires_at.to_string(),
            });
        }

        let days_until_expiry = (expires_utc - now).num_days();

        match days_until_expiry {
            0 => Some(ExpirationNotification::ExpiringToday),
            1..=3 => Some(ExpirationNotification::ExpiringSoon {
                days_remaining: days_until_expiry,
            }),
            4..=7 => Some(ExpirationNotification::ExpiringThisWeek {
                days_remaining: days_until_expiry,
            }),
            8..=30 => Some(ExpirationNotification::ExpiringThisMonth {
                days_remaining: days_until_expiry,
            }),
            _ => None,
        }
    }

    /// Validate key format and strength
    pub fn validate_key_format(api_key: &str) -> Result<(), ConfigError> {
        // Basic validation rules for VibeTask API keys
        if api_key.is_empty() {
            return Err(ConfigError::ValidationError(
                "API key cannot be empty".to_string(),
            ));
        }

        if api_key.len() < 32 {
            return Err(ConfigError::ValidationError(
                "API key too short (minimum 32 characters)".to_string(),
            ));
        }

        if api_key.len() > 256 {
            return Err(ConfigError::ValidationError(
                "API key too long (maximum 256 characters)".to_string(),
            ));
        }

        // Check for common patterns that might indicate a weak key
        if api_key.chars().all(|c| c.is_ascii_digit()) {
            return Err(ConfigError::ValidationError(
                "API key cannot be all digits".to_string(),
            ));
        }

        if api_key.to_lowercase() == api_key || api_key.to_uppercase() == api_key {
            warn!("API key has uniform case - consider using mixed case for better security");
        }

        Ok(())
    }

    /// List all stored agent keys (names only, not the actual keys)
    pub async fn list_stored_agents() -> Result<Vec<String>, ConfigError> {
        if cfg!(test) {
            return Self::list_stored_agents_from_env_files().await;
        }

        #[cfg(debug_assertions)]
        {
            Self::list_stored_agents_from_env_files().await
        }

        #[cfg(not(debug_assertions))]
        {
            // Production: This would require platform-specific keyring enumeration
            // For now, return empty list as keyring doesn't provide a standard way to list entries
            warn!("Listing stored agents not supported in production keyring mode");
            Ok(Vec::new())
        }
    }

    async fn list_stored_agents_from_env_files() -> Result<Vec<String>, ConfigError> {
        let mut agents = HashSet::new();
        let probe_dirs = Self::test_env_probe_dirs(
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
        );
        let mut seen_dirs = HashSet::new();
        for dir in probe_dirs {
            if !seen_dirs.insert(dir.clone()) {
                continue;
            }
            let mut entries = match tokio::fs::read_dir(&dir).await {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            while let Some(entry) = entries.next_entry().await.map_err(|e| {
                ConfigError::ReadError(format!("Failed to read directory entry: {}", e))
            })? {
                if let Some(file_name) = entry.file_name().to_str() {
                    if file_name.starts_with(".env.") && file_name != ".env" {
                        let agent_name = file_name.strip_prefix(".env.").unwrap();
                        agents.insert(agent_name.to_string());
                    }
                }
            }
        }

        let mut sorted: Vec<String> = agents.into_iter().collect();
        sorted.sort();
        Ok(sorted)
    }
}

/// Key expiration notification types
#[derive(Debug, Clone, PartialEq)]
pub enum ExpirationNotification {
    Expired { expired_at: String },
    ExpiringToday,
    ExpiringSoon { days_remaining: i64 },
    ExpiringThisWeek { days_remaining: i64 },
    ExpiringThisMonth { days_remaining: i64 },
}

impl ExpirationNotification {
    pub fn message(&self) -> String {
        match self {
            ExpirationNotification::Expired { expired_at } => {
                format!("⚠️  API key EXPIRED on {}", expired_at)
            }
            ExpirationNotification::ExpiringToday => {
                "🚨 API key expires TODAY! Please rotate immediately.".to_string()
            }
            ExpirationNotification::ExpiringSoon { days_remaining } => {
                format!(
                    "⚠️  API key expires in {} day{}. Consider rotating soon.",
                    days_remaining,
                    if *days_remaining == 1 { "" } else { "s" }
                )
            }
            ExpirationNotification::ExpiringThisWeek { days_remaining } => {
                format!("📅 API key expires in {} days this week.", days_remaining)
            }
            ExpirationNotification::ExpiringThisMonth { days_remaining } => {
                format!("📅 API key expires in {} days this month.", days_remaining)
            }
        }
    }

    pub fn is_urgent(&self) -> bool {
        matches!(
            self,
            ExpirationNotification::Expired { .. }
                | ExpirationNotification::ExpiringToday
                | ExpirationNotification::ExpiringSoon { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AgentEntry, ServerConfig};
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_test_config() -> AgentConfig {
        AgentConfig {
            server: ServerConfig {
                name: "Test Server".to_string(),
                version: "1.0.0".to_string(),
                active_agent: "TestAgent".to_string(),
                hub_url: None,
                allow_no_fences: false,
            },
            platform: None,
            agents: vec![AgentEntry {
                name: "TestAgent".to_string(),
                agent_type: "Platform".to_string(),
                key_hash: "sha256:abcd1234".to_string(),
                api_key: None,
                allowed_endpoints: Some(vec!["/api/agent/health".to_string()]),
                effective_endpoints: None,
                projects: None,
                permissions: None,
                delegated_at: None,
            }],
            cli: None,
        }
    }

    #[tokio::test]
    async fn test_atomic_write_config() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("test-config.toml");
        let config = create_test_config();

        // Write config
        AtomicConfigWriter::write_config(&config_path, &config)
            .await
            .unwrap();

        // Verify file exists and can be read back
        assert!(config_path.exists());
        let loaded_config = AgentConfig::load(&config_path).await.unwrap();
        assert_eq!(loaded_config.server.name, config.server.name);
        assert_eq!(loaded_config.agents.len(), 1);
    }

    #[tokio::test]
    async fn test_atomic_write_with_backup() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("test-config.toml");
        let config = create_test_config();

        // Write initial config
        AtomicConfigWriter::write_config(&config_path, &config)
            .await
            .unwrap();

        // Modify and write with backup
        let mut modified_config = config;
        modified_config.server.name = "Modified Server".to_string();

        AtomicConfigWriter::write_config_with_backup(&config_path, &modified_config)
            .await
            .unwrap();

        // Verify backup was created
        let backup_files: Vec<PathBuf> = std::fs::read_dir(temp_dir.path())
            .unwrap()
            .filter_map(|entry| {
                let path = entry.ok()?.path();
                if path.file_name()?.to_str()?.contains("backup") {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        assert_eq!(backup_files.len(), 1);

        // Verify modified config was written
        let loaded_config = AgentConfig::load(&config_path).await.unwrap();
        assert_eq!(loaded_config.server.name, "Modified Server");
    }

    #[test]
    fn env_search_roots_from_config_includes_app_dir() {
        let roots = SecureKeyManager::env_search_roots_from_config(
            "/tmp/VibeTask/app/config/vibe-mcp.toml",
        );
        assert!(roots.iter().any(|p| p.ends_with("app")));
        assert!(roots.iter().any(|p| p.ends_with("config")));
    }

    #[tokio::test]
    async fn retrieve_key_uses_registered_config_app_dir() {
        let temp = tempfile::tempdir().unwrap();
        let app_dir = temp.path().join("app");
        let config_dir = app_dir.join("config");
        tokio::fs::create_dir_all(&config_dir).await.unwrap();
        let config_path = config_dir.join("vibe-mcp.toml");
        tokio::fs::write(&config_path, "[server]\nname=\"t\"\n")
            .await
            .unwrap();

        let env_file = app_dir.join(".env.probeagent");
        tokio::fs::write(&env_file, "VIBETASK_API_KEY=probe-key\n")
            .await
            .unwrap();

        let previous_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(temp.path()).unwrap();
        SecureKeyManager::register_env_search_roots(
            SecureKeyManager::env_search_roots_from_config(config_path.to_str().unwrap()),
        );

        let key = SecureKeyManager::retrieve_key("ProbeAgent").await.unwrap();
        assert_eq!(key, "probe-key");

        std::env::set_current_dir(previous_cwd).unwrap();
    }

    #[test]
    fn test_key_hashing() {
        let api_key = "test-api-key-12345";
        let hash1 = SecureKeyManager::hash_key(api_key);
        let hash2 = SecureKeyManager::hash_key(api_key);

        // Same key should produce same hash
        assert_eq!(hash1, hash2);

        // Hash should start with sha256:
        assert!(hash1.starts_with("sha256:"));

        // Verify hash validation
        assert!(SecureKeyManager::verify_key_hash(api_key, &hash1));
        assert!(!SecureKeyManager::verify_key_hash("wrong-key", &hash1));
    }

    #[tokio::test]
    async fn test_key_storage_and_retrieval() {
        let agent_name = "test_agent";
        let api_key = "test-api-key-12345";

        // Store key
        SecureKeyManager::store_key(agent_name, api_key)
            .await
            .unwrap();

        // Retrieve key
        let retrieved_key = SecureKeyManager::retrieve_key(agent_name).await.unwrap();
        assert_eq!(retrieved_key, api_key);
    }

    #[tokio::test]
    async fn test_key_rotation() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("test-config.toml");
        let config = create_test_config();

        // Save initial config
        config.save(&config_path).await.unwrap();

        let agent_name = "TestAgent";
        let old_key = "old-api-key-12345";
        let new_key = "new-api-key-67890";

        // Store initial key
        SecureKeyManager::store_key(agent_name, old_key)
            .await
            .unwrap();

        // Rotate key
        let new_hash =
            SecureKeyManager::rotate_key(agent_name, new_key, config_path.to_str().unwrap())
                .await
                .unwrap();

        // Verify new key can be retrieved
        let retrieved_key = SecureKeyManager::retrieve_key(agent_name).await.unwrap();
        assert_eq!(retrieved_key, new_key);

        // Verify hash was updated in config
        let updated_config = AgentConfig::load(&config_path).await.unwrap();
        let agent = updated_config.get_agent(agent_name).unwrap();
        assert_eq!(agent.key_hash, new_hash);
        assert!(SecureKeyManager::verify_key_hash(new_key, &agent.key_hash));
    }

    #[tokio::test]
    async fn test_key_removal() {
        let agent_name = "test_removal_agent";
        let api_key = "test-removal-key-12345";

        // Store key
        SecureKeyManager::store_key(agent_name, api_key)
            .await
            .unwrap();

        // Verify key exists
        assert!(SecureKeyManager::retrieve_key(agent_name).await.is_ok());

        // Remove key
        SecureKeyManager::remove_key(agent_name).await.unwrap();

        // Verify key is gone
        assert!(SecureKeyManager::retrieve_key(agent_name).await.is_err());
    }

    #[test]
    fn test_key_validation() {
        // Valid key
        let valid_key = "abcdef1234567890abcdef1234567890";
        assert!(SecureKeyManager::validate_key_format(valid_key).is_ok());

        // Empty key
        assert!(SecureKeyManager::validate_key_format("").is_err());

        // Too short
        assert!(SecureKeyManager::validate_key_format("short").is_err());

        // Too long
        let long_key = "a".repeat(300);
        assert!(SecureKeyManager::validate_key_format(&long_key).is_err());

        // All digits (should fail)
        let all_digits = "1234567890123456789012345678901234567890";
        assert!(SecureKeyManager::validate_key_format(all_digits).is_err());
    }

    #[test]
    fn test_expiration_notifications() {
        use super::ExpirationNotification;

        // Expired key
        let past_date = (chrono::Utc::now() - chrono::Duration::days(1)).to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&past_date);
        assert!(matches!(
            notification,
            Some(ExpirationNotification::Expired { .. })
        ));
        assert!(notification.unwrap().is_urgent());

        // Expiring today (use a time later today to ensure it's still "today")
        let today = chrono::Utc::now() + chrono::Duration::hours(12);
        let today_rfc3339 = today.to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&today_rfc3339);
        // Should be either ExpiringToday or ExpiringSoon with 0 days
        match notification {
            Some(ExpirationNotification::ExpiringToday) => {
                // Test passes - notification is correct
            }
            Some(ExpirationNotification::ExpiringSoon { days_remaining: 0 }) => {
                // Test passes - notification is correct
            }
            _ => panic!(
                "Expected ExpiringToday or ExpiringSoon with 0 days, got: {:?}",
                notification
            ),
        }

        // Expiring in 2 days - let's be more flexible about the exact days
        let soon = (chrono::Utc::now() + chrono::Duration::days(2) + chrono::Duration::hours(1))
            .to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&soon);
        match notification {
            Some(ExpirationNotification::ExpiringSoon { days_remaining }) => {
                assert!(
                    (1..=3).contains(&days_remaining),
                    "Expected 1-3 days, got {}",
                    days_remaining
                );
                assert!(notification.unwrap().is_urgent());
            }
            _ => panic!("Expected ExpiringSoon, got: {:?}", notification),
        }

        // Expiring in 5 days
        let this_week =
            (chrono::Utc::now() + chrono::Duration::days(5) + chrono::Duration::hours(1))
                .to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&this_week);
        match notification {
            Some(ExpirationNotification::ExpiringThisWeek { days_remaining }) => {
                assert!(
                    (4..=7).contains(&days_remaining),
                    "Expected 4-7 days, got {}",
                    days_remaining
                );
                assert!(!notification.unwrap().is_urgent());
            }
            _ => panic!("Expected ExpiringThisWeek, got: {:?}", notification),
        }

        // Expiring in 15 days
        let this_month =
            (chrono::Utc::now() + chrono::Duration::days(15) + chrono::Duration::hours(1))
                .to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&this_month);
        match notification {
            Some(ExpirationNotification::ExpiringThisMonth { days_remaining }) => {
                assert!(
                    (8..=30).contains(&days_remaining),
                    "Expected 8-30 days, got {}",
                    days_remaining
                );
                assert!(!notification.unwrap().is_urgent());
            }
            _ => panic!("Expected ExpiringThisMonth, got: {:?}", notification),
        }

        // Far future (no notification)
        let far_future = (chrono::Utc::now() + chrono::Duration::days(365)).to_rfc3339();
        let notification = SecureKeyManager::check_expiration_notification(&far_future);
        assert!(notification.is_none());
    }

    #[test]
    fn test_expiration_notification_messages() {
        use super::ExpirationNotification;

        let expired = ExpirationNotification::Expired {
            expired_at: "2024-01-01T00:00:00Z".to_string(),
        };
        assert!(expired.message().contains("EXPIRED"));
        assert!(expired.is_urgent());

        let today = ExpirationNotification::ExpiringToday;
        assert!(today.message().contains("TODAY"));
        assert!(today.is_urgent());

        let soon = ExpirationNotification::ExpiringSoon { days_remaining: 2 };
        assert!(soon.message().contains("2 days"));
        assert!(soon.is_urgent());

        let week = ExpirationNotification::ExpiringThisWeek { days_remaining: 5 };
        assert!(week.message().contains("5 days"));
        assert!(!week.is_urgent());

        let month = ExpirationNotification::ExpiringThisMonth { days_remaining: 15 };
        assert!(month.message().contains("15 days"));
        assert!(!month.is_urgent());
    }

    #[tokio::test]
    async fn test_list_stored_agents() {
        let agent1 = "test_list_agent1";
        let agent2 = "test_list_agent2";
        let key = "test-key-for-listing";

        SecureKeyManager::store_key(agent1, key).await.unwrap();
        SecureKeyManager::store_key(agent2, key).await.unwrap();

        let agents = SecureKeyManager::list_stored_agents().await.unwrap();
        assert!(agents.contains(&agent1.to_string()));
        assert!(agents.contains(&agent2.to_string()));

        SecureKeyManager::remove_key(agent1).await.unwrap();
        SecureKeyManager::remove_key(agent2).await.unwrap();
    }
}
