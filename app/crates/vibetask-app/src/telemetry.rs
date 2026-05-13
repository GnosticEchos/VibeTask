use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

const TELEMETRY_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryEvent {
    pub schema_version: u8,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<i32>,
    pub duration_ms: u64,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_class: Option<String>,
}

impl TelemetryEvent {
    pub fn new(source: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            schema_version: TELEMETRY_SCHEMA_VERSION,
            timestamp: Utc::now(),
            source: source.into(),
            command: command.into(),
            tool_name: None,
            agent_type: None,
            project_id: None,
            task_id: None,
            duration_ms: 0,
            success: true,
            error_class: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryMetricsSnapshot {
    pub total_events: u64,
    pub success_events: u64,
    pub failed_events: u64,
    pub avg_duration_ms: f64,
    pub by_command: HashMap<String, u64>,
    pub by_error_class: HashMap<String, u64>,
}

#[derive(Debug, Default)]
struct TelemetryMetricsState {
    total_events: u64,
    success_events: u64,
    failed_events: u64,
    total_duration_ms: u128,
    by_command: HashMap<String, u64>,
    by_error_class: HashMap<String, u64>,
}

impl TelemetryMetricsState {
    fn apply_event(&mut self, event: &TelemetryEvent) {
        self.total_events += 1;
        self.total_duration_ms += u128::from(event.duration_ms);
        *self.by_command.entry(event.command.clone()).or_insert(0) += 1;

        if event.success {
            self.success_events += 1;
        } else {
            self.failed_events += 1;
            if let Some(error_class) = &event.error_class {
                *self.by_error_class.entry(error_class.clone()).or_insert(0) += 1;
            }
        }
    }

    fn snapshot(&self) -> TelemetryMetricsSnapshot {
        let avg_duration_ms = if self.total_events == 0 {
            0.0
        } else {
            self.total_duration_ms as f64 / self.total_events as f64
        };

        TelemetryMetricsSnapshot {
            total_events: self.total_events,
            success_events: self.success_events,
            failed_events: self.failed_events,
            avg_duration_ms,
            by_command: self.by_command.clone(),
            by_error_class: self.by_error_class.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TelemetryRecorder {
    source: String,
    events_path: PathBuf,
    metrics_path: PathBuf,
    metrics: Arc<Mutex<TelemetryMetricsState>>,
}

impl TelemetryRecorder {
    pub fn from_env(source: impl Into<String>) -> Self {
        let source = source.into();
        let events_path = std::env::var("VIBETASK_TELEMETRY_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./vibetask_logs/telemetry-events.jsonl"));
        let metrics_path = std::env::var("VIBETASK_TELEMETRY_METRICS_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./vibetask_logs/telemetry-metrics.json"));

        Self {
            source,
            events_path,
            metrics_path,
            metrics: Arc::new(Mutex::new(TelemetryMetricsState::default())),
        }
    }

    pub fn record_event(&self, mut event: TelemetryEvent) -> Result<(), std::io::Error> {
        event.source = self.source.clone();
        event.timestamp = Utc::now();

        ensure_parent_dir(&self.events_path)?;
        ensure_parent_dir(&self.metrics_path)?;

        let serialized = serde_json::to_string(&event)
            .map_err(|e| std::io::Error::other(format!("serialize telemetry event: {}", e)))?;

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events_path)?;
        file.write_all(serialized.as_bytes())?;
        file.write_all(b"\n")?;

        let snapshot = {
            let mut metrics = self
                .metrics
                .lock()
                .map_err(|e| std::io::Error::other(format!("telemetry metrics lock: {}", e)))?;
            metrics.apply_event(&event);
            metrics.snapshot()
        };

        let metrics_json = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| std::io::Error::other(format!("serialize telemetry metrics: {}", e)))?;
        std::fs::write(&self.metrics_path, metrics_json)?;

        Ok(())
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

pub fn classify_error(error_message: &str) -> String {
    // Check for structured error prefix [class] first
    if error_message.starts_with('[') {
        if let Some(end) = error_message.find(']') {
            let class = &error_message[1..end];
            if !class.is_empty() {
                return class.to_string();
            }
        }
    }
    let lower = error_message.to_ascii_lowercase();
    if lower.contains("access denied") || lower.contains("forbidden") {
        "permission_denied".to_string()
    } else if lower.contains("unauthorized")
        || lower.contains("invalid key")
        || lower.contains("key not found")
    {
        "auth_error".to_string()
    } else if lower.contains("timeout") {
        "timeout".to_string()
    } else if lower.contains("deserialization") || lower.contains("invalid response format") {
        "contract_error".to_string()
    } else if lower.contains("network") || lower.contains("hub is offline") {
        "network_error".to_string()
    } else if lower.contains("invalid input") || lower.contains("validation") {
        "validation_error".to_string()
    } else {
        "runtime_error".to_string()
    }
}
