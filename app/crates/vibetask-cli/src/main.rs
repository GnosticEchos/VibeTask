use clap::{Parser, Subcommand, ValueEnum};
use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use rust_mcp_sdk::schema::CallToolResult;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::io::IsTerminal;
use std::time::Instant;
use termimad::MadSkin;
use vibetask_app::agent_detector::{
    ensure_platform_session_for_delegated_agent, refresh_platform_session,
};
use vibetask_app::atomic_writer::SecureKeyManager;
use vibetask_app::config::AgentConfig;
use vibetask_app::telemetry::{classify_error, TelemetryEvent, TelemetryRecorder};
use vibetask_app::tools::IntegrityCheckInput;
use vibetask_app::tools::ToolContext;
use vibetask_app::tools::{
    AgentStatusTool, ApproveCompletionTool, CreateKnowledgeDocumentTool, CreateTaskTool,
    GetContextTool, LinkDocumentTool, ListAgentsTool, QueryProjectsTool, QueryTasksTool,
    ReadDocumentsTool, ReadProjectOverviewTool, ReadProjectStateTool, ReflectOnWorkTool,
    RejectToExecuteTool, RequestHelpTool, SwitchAgentTool, UpdateTaskProgressTool,
    VibeTaskMcpTools,
};
use vibetask_app::vibetask_client::VibeTaskClient;
use vibetask_tool_catalog::{column_tools, platform_tools};

mod help_tree;

#[derive(Parser)]
#[command(name = "vibetask-cli")]
#[command(about = "Thin CLI adapter over shared VibeTask app logic")]
#[command(subcommand_required = false)]
struct Cli {
    #[arg(long, default_value = "./config/vibe-cli.toml")]
    config: String,
    #[arg(long)]
    hub_url: Option<String>,
    #[arg(short = 'f', long = "format", value_enum, default_value = "json")]
    format: OutputFormat,
    /// Bypass CLI safety fences and render raw output.
    #[arg(long = "no-fences", default_value_t = false, action = clap::ArgAction::SetTrue)]
    no_fences: bool,

    /// Print a recursive command map derived from clap metadata (no hand-maintained strings).
    #[arg(
        long = "help-tree",
        global = true,
        default_value_t = false,
        action = clap::ArgAction::SetTrue
    )]
    help_tree: bool,

    /// Limit `--help-tree` recursion depth (Unix `tree -L` style).
    #[arg(long = "tree-depth", short = 'L', global = true)]
    tree_depth: Option<usize>,

    /// Exclude subtrees/commands from `--help-tree` output (repeatable).
    #[arg(long = "tree-ignore", short = 'I', global = true)]
    tree_ignore: Vec<String>,

    /// Include hidden subcommands in `--help-tree` output.
    #[arg(
        long = "tree-all",
        short = 'a',
        global = true,
        default_value_t = false,
        action = clap::ArgAction::SetTrue
    )]
    tree_all: bool,

    /// `--help-tree` output encoding (`text` is a UTF-8 tree; `json` is machine-readable metadata).
    #[arg(long = "tree-output", value_enum, global = true, hide = true)]
    tree_output: Option<help_tree::HelpTreeOutputFormat>,

    /// Tree text styling mode (`rich` uses bold/italic + optional color).
    #[arg(long = "tree-style", value_enum, global = true, default_value = "rich")]
    tree_style: help_tree::HelpTreeStyle,

    /// Tree color mode (`auto` uses ANSI colors only on TTY output).
    #[arg(long = "tree-color", value_enum, global = true, default_value = "auto")]
    tree_color: help_tree::HelpTreeColor,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Debug, Clone, Copy, ValueEnum, PartialEq, Eq)]
enum OutputFormat {
    Json,
    Comfy,
    Md,
}

#[derive(Debug, Clone, Copy, ValueEnum, PartialEq, Eq)]
enum AgentDuty {
    Platform,
    ProjectDelegated,
}

#[derive(Subcommand)]
enum Commands {
    /// Agent lifecycle and identity commands.
    Agent {
        #[command(subcommand)]
        command: AgentCommands,
    },
    /// Project querying and context commands.
    #[command(visible_alias = "projects")]
    Project {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Task execution and verification commands.
    Task {
        #[command(subcommand)]
        command: TaskCommands,
    },
    /// Tool discovery commands (grouped by agent role and board column).
    Tools {
        #[command(subcommand)]
        command: ToolCommands,
    },
    /// Unified search commands (tasks, docs, projects, all).
    Search {
        #[command(subcommand)]
        command: SearchCommands,
    },
}

#[derive(Subcommand)]
enum AgentCommands {
    /// List registered agents and key/expiry status.
    List,
    /// Show details for the currently active agent.
    Status,
    /// Switch active agent by name.
    Switch { name: String },
    /// Enlist an agent key and cache server-verified identity in roster config.
    Enlist {
        #[arg(long)]
        key: String,
        #[arg(long)]
        passphrase: Option<String>,
        #[arg(long = "as")]
        duty: Option<AgentDuty>,
        #[arg(long, default_value_t = true)]
        set_active: bool,
    },
    /// Refresh roster cache from `/api/agent/me` for active (or named) agent.
    Refresh {
        #[arg(long)]
        name: Option<String>,
    },
    /// Mint or refresh platform session JWT (`POST /api/agent/session`) for delegated writes.
    Session {
        /// Platform agent to authenticate (default: active if Platform, else first Platform in config).
        #[arg(long)]
        name: Option<String>,
        /// Always call Hub even when a cached JWT is still valid.
        #[arg(long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum ProjectCommands {
    /// List projects available to the active agent.
    List,
    /// List tasks for a project. Default limit: 25.
    Tasks {
        project_id: i32,
        #[arg(long, default_value = "25")]
        limit: i32,
        /// Zero-based page offset (default: 0)
        #[arg(long, default_value = "0")]
        page: i32,
        /// Sort field: created_at, updated_at, name, identifier (default: updated_at)
        #[arg(long, default_value = "updated_at")]
        sort_by: String,
        /// Sort direction: asc or desc (default: desc)
        #[arg(long, default_value = "desc")]
        sort_order: String,
    },
    /// Read documents for a project. Default limit: 25.
    Docs {
        project_id: i32,
        #[arg(long)]
        doc_type: Option<String>,
        #[arg(long, default_value = "25")]
        limit: i32,
        /// Zero-based page offset (default: 0)
        #[arg(long, default_value = "0")]
        page: i32,
    },
    /// Read one full Knowledge Hub document.
    ReadDoc {
        project_id: i32,
        doc_id: i32,
        /// Optional output path for raw markdown export.
        #[arg(short = 'o', long = "output")]
        output: Option<String>,
    },
    /// Create a Knowledge Hub document from a local markdown file.
    CreateDoc {
        project_id: i32,
        #[arg(long)]
        title: String,
        #[arg(long)]
        role: String,
        #[arg(long)]
        file: std::path::PathBuf,
    },
    /// Get detailed task context.
    Context {
        project_id: i32,
        task_id: i32,
        #[arg(long, default_value_t = true)]
        inline: bool,
        #[arg(long, default_value_t = true)]
        compact: bool,
    },
    /// Consolidated project state: columns, task counts, recent tasks per column.
    State {
        project_id: i32,
        #[arg(long, default_value_t = 5)]
        per_column_limit: i32,
        #[arg(long)]
        include_details: bool,
    },
    /// Dashboard-style overview of all projects (task counts per project and per column).
    Overview,
}

#[derive(Subcommand)]
enum TaskCommands {
    /// Create a standalone task (defaults to Plan column when `--column-id` is omitted).
    Create {
        project_id: i32,
        name: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        column_id: Option<i32>,
        #[arg(long)]
        parent_id: Option<i32>,
        #[arg(long)]
        assignee_id: Option<i32>,
    },
    /// Move a task to another column with client-side lattice pre-validation before PATCH.
    Move {
        project_id: i32,
        /// Numeric id (`193`), compound verify id (`10-152`), or board identifier (`SPEC-71`).
        task_id: String,
        target_column_id: i32,
    },
    /// Update progress for a task in Execute column.
    UpdateProgress {
        project_id: i32,
        /// Numeric id, compound id, or board identifier (see `task move`).
        task_id: String,
        description: String,
        #[arg(long)]
        completion_percentage: Option<u8>,
        #[arg(long = "file")]
        files_in_progress: Vec<String>,
        #[arg(long = "blocker")]
        blockers: Vec<String>,
    },
    /// Link a document to a task in Execute column.
    LinkDocument {
        project_id: i32,
        /// Numeric id, compound id, or board identifier (see `task move`).
        task_id: String,
        title: String,
        content: String,
        role: String,
        #[arg(long)]
        link_description: Option<String>,
    },
    /// Request help while executing a task.
    RequestHelp {
        project_id: i32,
        /// Numeric id, compound id, or board identifier (see `task move`).
        task_id: String,
        help_type: String,
        description: String,
        #[arg(long)]
        requested_from: Option<String>,
        #[arg(long)]
        priority: Option<String>,
        #[arg(long)]
        context: Option<String>,
    },
    /// Run Verify-column reflection with mandatory integrity checks.
    Reflect {
        task_id: String,
        work_summary: String,
        #[arg(long = "file")]
        files_touched: Vec<String>,
        #[arg(long)]
        requirements_met: bool,
        #[arg(long)]
        tests_passing: bool,
        #[arg(long)]
        code_quality_ok: bool,
        #[arg(long)]
        documentation_complete: bool,
        #[arg(long)]
        no_breaking_changes: bool,
        #[arg(long)]
        security_validated: bool,
    },
    /// Approve completion in Verify column.
    Approve {
        task_id: String,
        completion_notes: String,
        #[arg(long)]
        confirm_integrity_passed: bool,
    },
    /// Reject task back to Execute with required actions.
    Reject {
        task_id: String,
        rejection_reason: String,
        #[arg(long = "required-action")]
        required_actions: Vec<String>,
    },
}

#[derive(Subcommand)]
enum ToolCommands {
    /// List grouped tool names available in the catalog.
    List {
        /// Optional board column filter: Specify, Plan, Execute, Verify.
        #[arg(long)]
        column: Option<String>,
    },
    /// Show where a tool is available (platform and/or board columns).
    Describe { name: String },
    /// Execute a tool by name with JSON arguments.
    Call {
        name: String,
        #[arg(long, default_value = "{}")]
        args_json: String,
    },
}

#[derive(Subcommand)]
enum SearchCommands {
    /// Search tasks via Hub agent endpoint `GET /api/agent/search` (`x-agent-api-key`).
    Tasks {
        query: String,
        #[arg(long)]
        project_id: Option<i32>,
        #[arg(long, default_value_t = 1)]
        page: i32,
        #[arg(long, default_value_t = 25)]
        limit: i32,
        #[arg(long)]
        global: bool,
    },
    /// Semantic search in project knowledge docs.
    Docs {
        query: String,
        #[arg(long)]
        project_id: Option<i32>,
        #[arg(long, default_value_t = 0.55)]
        threshold: f64,
        #[arg(long, default_value_t = 10)]
        limit: i32,
        #[arg(long)]
        global: bool,
    },
    /// Search delegated projects by name/prefix.
    Projects { query: String },
    /// Aggregate search across projects, tasks, and docs.
    All {
        query: String,
        #[arg(long)]
        project_id: Option<i32>,
        #[arg(long, default_value_t = 1)]
        page: i32,
        #[arg(long, default_value_t = 25)]
        limit: i32,
        #[arg(long, default_value_t = 0.55)]
        threshold: f64,
        #[arg(long, default_value_t = 10)]
        doc_limit: i32,
        #[arg(long)]
        global: bool,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();
    let config_path_hint = extract_config_path_hint(&raw_args);
    let cfg_for_help_tree = AgentConfig::load(&config_path_hint).await.ok();
    let theme_for_help_tree = cfg_for_help_tree
        .as_ref()
        .map(help_tree_theme_from_config)
        .unwrap_or_default();
    if let Some(invocation) = help_tree::parse_help_tree_invocation(&raw_args)
        .map_err(|e| format!("invalid --help-tree invocation: {e}"))?
    {
        let mut opts = invocation.opts;
        opts.theme = theme_for_help_tree;
        return help_tree::run_for_path::<Cli>(opts, &invocation.path);
    }

    let cli = Cli::parse();

    if cli.help_tree {
        let path = cli
            .command
            .as_ref()
            .map(help_tree_path_from_command)
            .unwrap_or_default();
        return help_tree::run_for_path::<Cli>(
            help_tree::HelpTreeOpts {
                depth_limit: cli.tree_depth,
                ignore: cli.tree_ignore.clone(),
                tree_all: cli.tree_all,
                output: cli
                    .tree_output
                    .unwrap_or_else(|| help_tree_output_from_format(cli.format)),
                style: cli.tree_style,
                color: cli.tree_color,
                theme: theme_for_help_tree,
            },
            &path,
        );
    }

    let output_format = cli.format;
    let config_path = cli.config.clone();
    let hub_url_override = cli.hub_url.clone();
    let cfg = AgentConfig::load(&config_path)
        .await
        .map_err(|e| format!("failed to load config: {e}"))?;
    SecureKeyManager::register_env_search_roots(SecureKeyManager::env_search_roots_from_config(
        &config_path,
    ));
    let bypass_safety = cli.no_fences;
    if bypass_safety && !cfg.server.allow_no_fences {
        return Err(
            "Unsafe mode denied by config: set server.allow_no_fences = true to use --no-fences"
                .into(),
        );
    }
    let hub_url = cli
        .hub_url
        .or(cfg.server.hub_url.clone())
        .or_else(|| std::env::var("VIBETASK_HUB_URL").ok())
        .unwrap_or_else(|| "https://api.vibetask.com".to_string());
    let ctx = ToolContext {
        config_path: config_path.clone(),
        api_client: std::sync::Arc::new(VibeTaskClient::new(hub_url)?),
        bypass_safety,
        workflow_context: std::sync::Arc::new(tokio::sync::RwLock::new(
            vibetask_app::tools::WorkflowContext::default(),
        )),
    };

    ensure_platform_session_for_delegated_agent(&ctx.config_path, &ctx.api_client)
        .await
        .map_err(|e| format!("failed to ensure platform session: {e}"))?;

    let Some(command) = cli.command else {
        return Err(
            "Missing subcommand. Try `vibetask-cli --help` or `vibetask-cli --help-tree`.".into(),
        );
    };

    let telemetry = TelemetryRecorder::from_env("cli");
    let telemetry_base = build_cli_telemetry(&command, &cfg);
    let started_at = Instant::now();

    let result: Result<serde_json::Value, Box<dyn std::error::Error>> = match command {
        Commands::Agent { command } => match command {
            AgentCommands::List => ListAgentsTool::default()
                .call_tool(&ctx)
                .await
                .map(|r| json!(r.content))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            AgentCommands::Status => AgentStatusTool {
                agent_name: cfg.server.active_agent.clone(),
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            AgentCommands::Switch { name } => SwitchAgentTool { agent_name: name }
                .call_tool(&ctx)
                .await
                .map(|r| json!(r.content))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            AgentCommands::Enlist {
                key,
                passphrase,
                duty,
                set_active,
            } => enlist_agent_cli(&ctx, key, passphrase, duty, set_active)
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            AgentCommands::Refresh { name } => refresh_agent_roster_cli(&ctx, name)
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            AgentCommands::Session { name, force } => {
                platform_session_cli(&ctx, name.as_deref(), force)
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
            }
        },
        Commands::Project { command } => match command {
            ProjectCommands::List => QueryProjectsTool {}
                .call_tool(&ctx)
                .await
                .map(|r| json!(r.content))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            ProjectCommands::Tasks {
                project_id,
                limit,
                page: _page,
                sort_by: _sort_by,
                sort_order: _sort_order,
            } => QueryTasksTool {
                project_id: Some(project_id),
                limit: Some(limit),
                global: Some(false),
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            ProjectCommands::Docs {
                project_id,
                doc_type,
                limit,
                page: _page,
            } => ReadDocumentsTool {
                project_id,
                doc_type,
                limit: Some(limit),
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            ProjectCommands::ReadDoc {
                project_id,
                doc_id,
                output,
            } => {
                execute_project_read_doc(
                    &ctx,
                    &cfg,
                    project_id,
                    doc_id,
                    output.as_deref(),
                    cli.format,
                )
                .await
            }
            ProjectCommands::CreateDoc {
                project_id,
                title,
                role,
                file,
            } => {
                let content = tokio::fs::read_to_string(&file).await.map_err(|e| {
                    std::io::Error::other(format!(
                        "failed to read markdown file {}: {}",
                        file.display(),
                        e
                    ))
                })?;
                let role_canonical =
                    parse_knowledge_document_role(role.as_str()).map_err(std::io::Error::other)?;
                CreateKnowledgeDocumentTool {
                    project_id,
                    title: title.clone(),
                    content,
                    role: role_canonical,
                    version: None,
                    tags: vec![],
                    linked_task_id: None,
                }
                .call_tool(&ctx)
                .await
                .map(|r| json!(r.content))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
            }
            ProjectCommands::Context {
                project_id,
                task_id,
                inline,
                compact,
            } => GetContextTool {
                project_id,
                task_id,
                inline,
                compact,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            ProjectCommands::State {
                project_id,
                per_column_limit,
                include_details,
            } => ReadProjectStateTool {
                project_id,
                per_column_limit,
                include_details,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            ProjectCommands::Overview => ReadProjectOverviewTool {}
                .call_tool(&ctx)
                .await
                .map(|r| json!(r.content))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
        },
        Commands::Task { command } => match command {
            TaskCommands::Create {
                project_id,
                name,
                description,
                column_id,
                parent_id,
                assignee_id,
            } => CreateTaskTool {
                project_id,
                name,
                description,
                column_id,
                parent_id,
                assignee_id,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            TaskCommands::Move {
                project_id,
                task_id,
                target_column_id,
            } => {
                let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
                    .await
                    .map_err(|e| {
                        std::io::Error::other(format!(
                            "failed to retrieve key for active agent '{}': {}",
                            cfg.server.active_agent, e
                        ))
                    })?;
                let resolved_task_id = vibetask_app::resolve_numeric_task_id(
                    &ctx.api_client,
                    &api_key,
                    project_id,
                    &task_id,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

                let me = ctx
                    .api_client
                    .get_agent_me(&api_key)
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

                let delegation = me
                    .delegations
                    .iter()
                    .find(|d| d.project_id == project_id)
                    .ok_or_else(|| {
                        std::io::Error::other(format!(
                            "active agent '{}' has no delegation for project {}",
                            cfg.server.active_agent, project_id
                        ))
                    })?;

                let patch_result = ctx
                    .api_client
                    .update_agent_task_column_with_precheck(
                        &api_key,
                        project_id,
                        resolved_task_id,
                        target_column_id,
                        delegation,
                    )
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

                let task_details = ctx
                    .api_client
                    .get_task_details(
                        &api_key,
                        project_id,
                        resolved_task_id,
                        &[],
                        false,
                        false,
                    )
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

                let label = vibetask_app::format_task_label(
                    &task_details.identifier,
                    task_details.id,
                    project_id,
                );

                Ok(json!({
                    "projectId": project_id,
                    "taskId": resolved_task_id,
                    "identifier": task_details.identifier,
                    "label": label,
                    "targetColumnId": target_column_id,
                    "precheck": {
                        "delegationMode": delegation.delegation_mode,
                        "summary": delegation.lattice_summary()
                    },
                    "result": patch_result
                }))
            }
            TaskCommands::UpdateProgress {
                project_id,
                task_id,
                description,
                completion_percentage,
                files_in_progress,
                blockers,
            } => {
                let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
                    .await
                    .map_err(|e| {
                        std::io::Error::other(format!(
                            "failed to retrieve key for active agent '{}': {}",
                            cfg.server.active_agent, e
                        ))
                    })?;
                let resolved_task_id = vibetask_app::resolve_numeric_task_id(
                    &ctx.api_client,
                    &api_key,
                    project_id,
                    &task_id,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
                UpdateTaskProgressTool {
                project_id,
                task_id: resolved_task_id,
                progress_description: description,
                completion_percentage,
                files_in_progress: if files_in_progress.is_empty() {
                    None
                } else {
                    Some(files_in_progress)
                },
                blockers: if blockers.is_empty() {
                    None
                } else {
                    Some(blockers)
                },
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
            }
            TaskCommands::LinkDocument {
                project_id,
                task_id,
                title,
                content,
                role,
                link_description,
            } => {
                let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
                    .await
                    .map_err(|e| {
                        std::io::Error::other(format!(
                            "failed to retrieve key for active agent '{}': {}",
                            cfg.server.active_agent, e
                        ))
                    })?;
                let resolved_task_id = vibetask_app::resolve_numeric_task_id(
                    &ctx.api_client,
                    &api_key,
                    project_id,
                    &task_id,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
                LinkDocumentTool {
                project_id,
                task_id: resolved_task_id,
                document_title: title,
                document_content: content,
                document_role: role,
                link_description,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
            }
            TaskCommands::RequestHelp {
                project_id,
                task_id,
                help_type,
                description,
                requested_from,
                priority,
                context,
            } => {
                let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
                    .await
                    .map_err(|e| {
                        std::io::Error::other(format!(
                            "failed to retrieve key for active agent '{}': {}",
                            cfg.server.active_agent, e
                        ))
                    })?;
                let resolved_task_id = vibetask_app::resolve_numeric_task_id(
                    &ctx.api_client,
                    &api_key,
                    project_id,
                    &task_id,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
                RequestHelpTool {
                project_id,
                task_id: resolved_task_id,
                help_type,
                help_description: description,
                requested_from,
                priority,
                context,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
            }
            TaskCommands::Reflect {
                task_id,
                work_summary,
                files_touched,
                requirements_met,
                tests_passing,
                code_quality_ok,
                documentation_complete,
                no_breaking_changes,
                security_validated,
            } => ReflectOnWorkTool {
                task_id,
                work_summary,
                files_touched,
                integrity_check: IntegrityCheckInput {
                    requirements_met,
                    tests_passing,
                    code_quality_ok,
                    documentation_complete,
                    no_breaking_changes,
                    security_validated,
                },
                security_validated: Some(security_validated),
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            TaskCommands::Approve {
                task_id,
                completion_notes,
                confirm_integrity_passed,
            } => ApproveCompletionTool {
                task_id,
                completion_notes,
                confirm_integrity_passed,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
            TaskCommands::Reject {
                task_id,
                rejection_reason,
                required_actions,
            } => RejectToExecuteTool {
                task_id,
                rejection_reason,
                required_actions,
            }
            .call_tool(&ctx)
            .await
            .map(|r| json!(r.content))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
        },
        Commands::Tools { command } => match command {
            ToolCommands::List { column } => {
                let hide_promoted = is_interactive_tty();
                let promoted = promoted_subcommand_tools();
                let platform: BTreeSet<String> = platform_tools()
                    .into_iter()
                    .filter(|tool| !(hide_promoted && promoted.contains(tool)))
                    .collect();
                let mut columns: BTreeMap<String, Vec<String>> = BTreeMap::new();
                let mut column_map = column_tools();

                if let Some(column_filter) = column {
                    let normalized = normalize_column_name(&column_filter);
                    let Some(set) = column_map.remove(&normalized) else {
                        return Err(format!(
                            "Unknown column '{}'. Expected one of: Specify, Plan, Execute, Verify",
                            column_filter
                        )
                        .into());
                    };
                    let mut tools: Vec<String> = set
                        .into_iter()
                        .filter(|tool| !(hide_promoted && promoted.contains(tool)))
                        .collect();
                    tools.sort();
                    columns.insert(normalized, tools);
                } else {
                    for (name, set) in column_map {
                        let mut tools: Vec<String> = set
                            .into_iter()
                            .filter(|tool| !(hide_promoted && promoted.contains(tool)))
                            .collect();
                        tools.sort();
                        columns.insert(name, tools);
                    }
                }

                Ok(json!({
                    "platform": platform.into_iter().collect::<Vec<_>>(),
                    "columns": columns
                }))
            }
            ToolCommands::Describe { name } => {
                let platform = platform_tools().contains(&name);
                let mut columns = Vec::new();
                for (column_name, tools) in column_tools() {
                    if tools.contains(&name) {
                        columns.push(column_name);
                    }
                }
                columns.sort();

                if !platform && columns.is_empty() {
                    return Err(format!("Tool '{}' not found in tool catalog", name).into());
                }

                Ok(json!({
                    "name": name,
                    "platform": platform,
                    "columns": columns
                }))
            }
            ToolCommands::Call { name, args_json } => {
                let args_value: serde_json::Value = serde_json::from_str(&args_json)
                    .map_err(|e| format!("Invalid --args-json payload: {}", e))?;
                let result =
                    execute_tool_call(&name, &args_value, &ctx, &cfg.server.active_agent).await?;
                Ok(json!(result.content))
            }
        },
        Commands::Search { command } => {
            run_search_command(command, &ctx, &cfg, hub_url_override.clone()).await
        }
    };

    let duration_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

    match result {
        Ok(payload) => {
            let mut event = telemetry_base.clone();
            event.duration_ms = duration_ms;
            event.success = true;
            if let Err(e) = telemetry.record_event(event) {
                eprintln!("Telemetry write failed: {}", e);
            }

            render_output(output_format, &payload, bypass_safety)?;
            Ok(())
        }
        Err(error) => {
            let err_text = error.to_string();
            if is_auth_or_permission_error(&err_text) {
                match reactive_refresh_active_agent_roster(&ctx, &cfg.server.active_agent).await {
                    Ok(note) => eprintln!("{note}"),
                    Err(note) => eprintln!("{note}"),
                }
            }

            let mut event = telemetry_base;
            event.duration_ms = duration_ms;
            event.success = false;
            event.error_class = Some(classify_error(&err_text));
            if let Err(e) = telemetry.record_event(event) {
                eprintln!("Telemetry write failed: {}", e);
            }

            Err(error)
        }
    }
}

fn duty_from_me(me: &vibetask_app::generated_types::AgentMeResponse) -> AgentDuty {
    if me.api_allowance.is_platform_agent {
        AgentDuty::Platform
    } else {
        AgentDuty::ProjectDelegated
    }
}

fn build_agent_entry_from_me(
    me: &vibetask_app::generated_types::AgentMeResponse,
    api_key: &str,
) -> vibetask_app::config::AgentEntry {
    let key_hash = SecureKeyManager::hash_key(api_key);
    if me.api_allowance.is_platform_agent {
        vibetask_app::config::AgentEntry {
            name: me.agent.name.clone(),
            agent_type: "Platform".to_string(),
            key_hash,
            api_key: None,
            allowed_endpoints: Some(me.api_allowance.configured_read_endpoints.clone()),
            effective_endpoints: Some(me.api_allowance.effective_read_endpoints.clone()),
            projects: None,
            permissions: None,
            delegated_at: None,
        }
    } else {
        vibetask_app::config::AgentEntry {
            name: me.agent.name.clone(),
            agent_type: "ProjectDelegated".to_string(),
            key_hash,
            api_key: None,
            allowed_endpoints: None,
            effective_endpoints: Some(me.api_allowance.effective_read_endpoints.clone()),
            projects: Some(me.delegations.iter().map(|d| d.project_id).collect()),
            permissions: Some(
                me.delegations
                    .iter()
                    .map(|d| format!("{:?}", d.permission_level))
                    .collect(),
            ),
            delegated_at: Some(me.agent.created_at.to_rfc3339()),
        }
    }
}

async fn upsert_roster_from_me(
    ctx: &ToolContext,
    me: &vibetask_app::generated_types::AgentMeResponse,
    api_key: &str,
    set_active: bool,
) -> Result<vibetask_app::config::AgentEntry, std::io::Error> {
    let mut config = AgentConfig::load(&ctx.config_path)
        .await
        .unwrap_or_else(|_| AgentConfig::create_default("VibeTask CLI"));

    let entry = build_agent_entry_from_me(me, api_key);
    config
        .update_agent(entry.clone())
        .await
        .map_err(std::io::Error::other)?;

    if set_active || config.server.active_agent.is_empty() {
        config
            .set_active_agent(&entry.name)
            .map_err(std::io::Error::other)?;
    }

    config
        .save(&ctx.config_path)
        .await
        .map_err(std::io::Error::other)?;

    Ok(entry)
}

async fn enlist_agent_cli(
    ctx: &ToolContext,
    key: String,
    passphrase: Option<String>,
    requested_duty: Option<AgentDuty>,
    set_active: bool,
) -> Result<serde_json::Value, std::io::Error> {
    SecureKeyManager::validate_key_format(&key).map_err(std::io::Error::other)?;
    let me = ctx
        .api_client
        .get_agent_me(&key)
        .await
        .map_err(std::io::Error::other)?;

    SecureKeyManager::store_key(&me.agent.name, &key)
        .await
        .map_err(std::io::Error::other)?;

    let entry = upsert_roster_from_me(ctx, &me, &key, set_active).await?;
    let verified_duty = duty_from_me(&me);
    let duty_mismatch = requested_duty.filter(|d| *d != verified_duty);

    Ok(json!({
        "status": "enlisted",
        "agent": entry.name,
        "type": entry.agent_type,
        "set_active": set_active,
        "cache": {
            "effective_endpoints": entry.effective_endpoints.unwrap_or_default(),
            "projects": entry.projects.unwrap_or_default(),
            "permissions": entry.permissions.unwrap_or_default()
        },
        "verification": {
            "source": "/api/agent/me",
            "verified_agent_id": me.agent.id
        },
        "requested_type": requested_duty.map(|d| format!("{d:?}")),
        "type_mismatch_warning": duty_mismatch
            .map(|d| format!("requested {:?} but server verified {:?}", d, verified_duty)),
        "passphrase_note": passphrase.map(|_| "accepted for phase-2 secret locking; key stored in secure keyring".to_string())
    }))
}

async fn platform_session_cli(
    ctx: &ToolContext,
    platform_agent_name: Option<&str>,
    force: bool,
) -> Result<serde_json::Value, std::io::Error> {
    let info = refresh_platform_session(
        &ctx.config_path,
        &ctx.api_client,
        platform_agent_name,
        force,
    )
    .await
    .map_err(|e| std::io::Error::other(format!("platform session failed: {e}")))?;

    Ok(json!({
        "status": if info.refreshed { "created" } else { "cached" },
        "platform_agent": info.platform_agent,
        "expires_at": info.expires_at,
        "refreshed": info.refreshed,
        "agent_roster_count": info.agent_roster_count,
        "detail": if info.refreshed {
            "New JWT from POST /api/agent/session; saved to [platform] in config"
        } else {
            "Reused valid JWT from [platform] in config"
        }
    }))
}

async fn refresh_agent_roster_cli(
    ctx: &ToolContext,
    name: Option<String>,
) -> Result<serde_json::Value, std::io::Error> {
    let config = AgentConfig::load(&ctx.config_path)
        .await
        .map_err(std::io::Error::other)?;
    let target = name.unwrap_or_else(|| config.server.active_agent.clone());
    if target.is_empty() {
        return Err(std::io::Error::other(
            "No active agent configured and --name was not provided",
        ));
    }

    let key = SecureKeyManager::retrieve_key(&target)
        .await
        .map_err(std::io::Error::other)?;
    let me = ctx
        .api_client
        .get_agent_me(&key)
        .await
        .map_err(std::io::Error::other)?;
    let entry = upsert_roster_from_me(ctx, &me, &key, target == config.server.active_agent).await?;

    Ok(json!({
        "status": "refreshed",
        "requested_agent": target,
        "verified_agent": entry.name,
        "type": entry.agent_type,
        "effective_endpoints": entry.effective_endpoints.unwrap_or_default(),
        "projects": entry.projects.unwrap_or_default(),
        "permissions": entry.permissions.unwrap_or_default()
    }))
}

fn is_auth_or_permission_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains(" 401")
        || lower.contains(" 403")
}

async fn reactive_refresh_active_agent_roster(
    ctx: &ToolContext,
    active_agent: &str,
) -> Result<String, String> {
    if active_agent.trim().is_empty() {
        return Err("⚠️ Roster self-heal skipped: no active agent configured".to_string());
    }

    let key = SecureKeyManager::retrieve_key(active_agent)
        .await
        .map_err(|e| format!("⚠️ Roster self-heal skipped: cannot load key: {e}"))?;
    let me = ctx
        .api_client
        .get_agent_me(&key)
        .await
        .map_err(|e| format!("⚠️ Roster self-heal attempted but /me failed: {e}"))?;
    let refreshed = upsert_roster_from_me(ctx, &me, &key, true)
        .await
        .map_err(|e| format!("⚠️ Roster self-heal attempted but save failed: {e}"))?;

    Ok(format!(
        "🔄 Roster self-heal: refreshed '{}' from /api/agent/me",
        refreshed.name
    ))
}

fn normalize_column_name(input: &str) -> String {
    let lower = input.to_ascii_lowercase();
    match lower.as_str() {
        "specify" => "Specify".to_string(),
        "plan" => "Plan".to_string(),
        "execute" => "Execute".to_string(),
        "verify" => "Verify".to_string(),
        _ => input.to_string(),
    }
}

fn promoted_subcommand_tools() -> BTreeSet<String> {
    ["query_tasks", "query_projects"]
        .into_iter()
        .map(|tool| tool.to_string())
        .collect()
}

fn extract_config_path_hint(raw_args: &[String]) -> String {
    let mut idx = 0;
    while idx < raw_args.len() {
        if raw_args[idx] == "--config" {
            if let Some(path) = raw_args.get(idx + 1) {
                return path.clone();
            }
            break;
        }
        idx += 1;
    }
    "./config/vibe-cli.toml".to_string()
}

fn help_tree_output_from_format(format: OutputFormat) -> help_tree::HelpTreeOutputFormat {
    match format {
        OutputFormat::Json => help_tree::HelpTreeOutputFormat::Json,
        OutputFormat::Comfy | OutputFormat::Md => help_tree::HelpTreeOutputFormat::Text,
    }
}

fn parse_tree_emphasis(
    value: Option<&str>,
    fallback: help_tree::TextEmphasis,
) -> help_tree::TextEmphasis {
    match value.map(|v| v.trim().to_ascii_lowercase()) {
        Some(style) if style == "normal" => help_tree::TextEmphasis::Normal,
        Some(style) if style == "bold" => help_tree::TextEmphasis::Bold,
        Some(style) if style == "italic" => help_tree::TextEmphasis::Italic,
        Some(style)
            if style == "bold_italic"
                || style == "bold-italic"
                || style == "italic_bold"
                || style == "italic-bold" =>
        {
            help_tree::TextEmphasis::BoldItalic
        }
        _ => fallback,
    }
}

fn token_theme_from_config(
    config: Option<&vibetask_app::config::TextThemeConfig>,
    fallback: &help_tree::TextTokenTheme,
) -> help_tree::TextTokenTheme {
    help_tree::TextTokenTheme {
        emphasis: parse_tree_emphasis(config.and_then(|c| c.style.as_deref()), fallback.emphasis),
        color_hex: config
            .and_then(|c| c.color.as_ref())
            .cloned()
            .or_else(|| fallback.color_hex.clone()),
    }
}

fn help_tree_theme_from_config(cfg: &AgentConfig) -> help_tree::HelpTreeTheme {
    let base = help_tree::HelpTreeTheme::default();
    let style_cfg = cfg.cli.as_ref().and_then(|cli| cli.help_tree.as_ref());

    help_tree::HelpTreeTheme {
        command: token_theme_from_config(style_cfg.and_then(|v| v.command.as_ref()), &base.command),
        options: token_theme_from_config(style_cfg.and_then(|v| v.options.as_ref()), &base.options),
        description: token_theme_from_config(
            style_cfg.and_then(|v| v.description.as_ref()),
            &base.description,
        ),
    }
}

fn help_tree_path_from_command(command: &Commands) -> Vec<String> {
    match command {
        Commands::Agent { command } => vec![
            "agent".to_string(),
            match command {
                AgentCommands::List => "list",
                AgentCommands::Status => "status",
                AgentCommands::Switch { .. } => "switch",
                AgentCommands::Enlist { .. } => "enlist",
                AgentCommands::Refresh { .. } => "refresh",
                AgentCommands::Session { .. } => "session",
            }
            .to_string(),
        ],
        Commands::Project { command } => vec![
            "project".to_string(),
            match command {
                ProjectCommands::List => "list",
                ProjectCommands::Tasks { .. } => "tasks",
                ProjectCommands::Docs { .. } => "docs",
                ProjectCommands::ReadDoc { .. } => "read-doc",
                ProjectCommands::CreateDoc { .. } => "create-doc",
                ProjectCommands::Context { .. } => "context",
                ProjectCommands::State { .. } => "state",
                ProjectCommands::Overview => "overview",
            }
            .to_string(),
        ],
        Commands::Task { command } => vec![
            "task".to_string(),
            match command {
                TaskCommands::Create { .. } => "create",
                TaskCommands::Move { .. } => "move",
                TaskCommands::UpdateProgress { .. } => "update-progress",
                TaskCommands::LinkDocument { .. } => "link-document",
                TaskCommands::RequestHelp { .. } => "request-help",
                TaskCommands::Reflect { .. } => "reflect",
                TaskCommands::Approve { .. } => "approve",
                TaskCommands::Reject { .. } => "reject",
            }
            .to_string(),
        ],
        Commands::Tools { command } => vec![
            "tools".to_string(),
            match command {
                ToolCommands::List { .. } => "list",
                ToolCommands::Describe { .. } => "describe",
                ToolCommands::Call { .. } => "call",
            }
            .to_string(),
        ],
        Commands::Search { command } => vec![
            "search".to_string(),
            match command {
                SearchCommands::Tasks { .. } => "tasks",
                SearchCommands::Docs { .. } => "docs",
                SearchCommands::Projects { .. } => "projects",
                SearchCommands::All { .. } => "all",
            }
            .to_string(),
        ],
    }
}

fn is_interactive_tty() -> bool {
    if std::io::stdout().is_terminal()
        || std::io::stderr().is_terminal()
        || std::io::stdin().is_terminal()
    {
        return true;
    }

    // Some integrated terminals proxy stdio and fail `is_terminal()` checks even when interactive.
    std::env::var("TERM").is_ok_and(|term| !term.trim().is_empty() && term != "dumb")
}

fn apply_project_scope_to_task_search(
    mut response: vibetask_app::generated_types::TaskSearchResponse,
    scope: Option<i32>,
) -> vibetask_app::generated_types::TaskSearchResponse {
    if let Some(pid) = scope {
        response.tasks.retain(|t| t.project_id == pid);
        response.total = response.tasks.len() as i32;
    }
    response
}

async fn execute_project_read_doc(
    ctx: &ToolContext,
    cfg: &AgentConfig,
    project_id: i32,
    doc_id: i32,
    output_path: Option<&str>,
    format: OutputFormat,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
        .await
        .map_err(|e| std::io::Error::other(format!("failed to retrieve active agent key: {e}")))?;

    let me = ctx
        .api_client
        .get_agent_me(&api_key)
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    let document = ctx
        .api_client
        .get_document(
            &api_key,
            project_id,
            doc_id,
            &me.api_allowance.effective_read_endpoints,
        )
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    if let Some(path) = output_path {
        eprintln!(
            "Exporting untruncated markdown for document {} to {}...",
            doc_id, path
        );
        std::fs::write(path, document.content.as_bytes())?;
        eprintln!(
            "Export complete: wrote {} bytes to {}",
            document.content.len(),
            path
        );

        return Ok(json!({
            "projectId": project_id,
            "docId": doc_id,
            "title": document.title,
            "output": path,
            "bytes": document.content.len(),
            "status": "exported"
        }));
    }

    if format == OutputFormat::Json {
        return Ok(json!(document));
    }

    Ok(json!({ "document": document }))
}

async fn run_search_command(
    command: SearchCommands,
    ctx: &ToolContext,
    cfg: &AgentConfig,
    _hub_url_override: Option<String>,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let api_key = SecureKeyManager::retrieve_key(&cfg.server.active_agent)
        .await
        .map_err(|e| std::io::Error::other(format!("failed to retrieve active agent key: {e}")))?;
    let me = ctx
        .api_client
        .get_agent_me(&api_key)
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
    let allowed_endpoints = me.api_allowance.effective_read_endpoints;

    match command {
        SearchCommands::Tasks {
            query,
            project_id,
            page,
            limit,
            global,
        } => {
            let scoped_project = resolve_project_scope(project_id, global, &me.delegations)?;
            let response = ctx
                .api_client
                .search_tasks(
                    &api_key,
                    &query,
                    scoped_project,
                    Some(page),
                    Some(limit),
                    &allowed_endpoints,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let response = apply_project_scope_to_task_search(response, scoped_project);
            Ok(json!(response))
        }
        SearchCommands::Projects { query } => {
            let response = ctx
                .api_client
                .get_projects(&api_key, &allowed_endpoints)
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let filtered = filter_projects(&response.data, &query);
            Ok(json!({
                "projects": filtered,
                "total": filtered.len()
            }))
        }
        SearchCommands::Docs {
            query,
            project_id,
            threshold,
            limit,
            global,
        } => {
            let project_ids = resolve_project_targets(project_id, global, &me.delegations)?;
            let documents = collect_document_matches(
                &ctx.api_client,
                &api_key,
                &allowed_endpoints,
                &project_ids,
                &query,
                threshold,
                Some(limit.max(1) as usize),
            )
            .await?;
            Ok(json!({ "documents": documents }))
        }
        SearchCommands::All {
            query,
            project_id,
            page,
            limit,
            threshold,
            doc_limit,
            global,
        } => {
            let scoped_project = resolve_project_scope(project_id, global, &me.delegations)?;
            let project_ids = resolve_project_targets(project_id, global, &me.delegations)?;
            let projects_response = ctx
                .api_client
                .get_projects(&api_key, &allowed_endpoints)
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let projects = filter_projects(&projects_response.data, &query);
            let tasks = ctx
                .api_client
                .search_tasks(
                    &api_key,
                    &query,
                    scoped_project,
                    Some(page),
                    Some(limit),
                    &allowed_endpoints,
                )
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let tasks = apply_project_scope_to_task_search(tasks, scoped_project);
            let documents = collect_document_matches(
                &ctx.api_client,
                &api_key,
                &allowed_endpoints,
                &project_ids,
                &query,
                threshold,
                Some(doc_limit.max(1) as usize),
            )
            .await?;

            Ok(json!({
                "projects": projects,
                "tasks": tasks.tasks,
                "documents": documents,
                "meta": {
                    "taskTotal": tasks.total,
                    "taskPage": tasks.page,
                    "taskLimit": tasks.limit
                }
            }))
        }
    }
}

fn filter_projects(
    projects: &[vibetask_app::generated_types::Project],
    query: &str,
) -> Vec<serde_json::Value> {
    let needle = query.to_ascii_lowercase();
    projects
        .iter()
        .filter(|project| {
            project.name.to_ascii_lowercase().contains(&needle)
                || project.prefix.to_ascii_lowercase().contains(&needle)
        })
        .filter_map(|project| serde_json::to_value(project).ok())
        .collect()
}

fn resolve_project_scope(
    explicit_project_id: Option<i32>,
    global: bool,
    delegations: &[vibetask_app::generated_types::Delegation],
) -> Result<Option<i32>, Box<dyn std::error::Error>> {
    if global {
        return Ok(None);
    }
    if let Some(project_id) = explicit_project_id {
        return Ok(Some(project_id));
    }
    if delegations.len() == 1 {
        return Ok(Some(delegations[0].project_id));
    }
    Err("No default project scope. Pass --project-id, or use --global.".into())
}

fn resolve_project_targets(
    explicit_project_id: Option<i32>,
    global: bool,
    delegations: &[vibetask_app::generated_types::Delegation],
) -> Result<Vec<i32>, Box<dyn std::error::Error>> {
    if global {
        return Ok(delegations.iter().map(|d| d.project_id).collect());
    }
    if let Some(project_id) = explicit_project_id {
        return Ok(vec![project_id]);
    }
    if delegations.len() == 1 {
        return Ok(vec![delegations[0].project_id]);
    }
    Err("No default project scope. Pass --project-id, or use --global.".into())
}

async fn collect_document_matches(
    api_client: &std::sync::Arc<VibeTaskClient>,
    api_key: &str,
    allowed_endpoints: &[String],
    project_ids: &[i32],
    query: &str,
    threshold: f64,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
    let mut rows = Vec::new();
    for project_id in project_ids {
        let docs = api_client
            .get_similar_documents(api_key, *project_id, query, threshold, allowed_endpoints)
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
        for row in docs {
            rows.push(serde_json::to_value(row)?);
        }
    }
    rows.sort_by(|a, b| {
        let a_score = a
            .get("rank")
            .and_then(|v| v.as_f64())
            .or_else(|| a.get("similarity_score").and_then(|v| v.as_f64()))
            .unwrap_or(0.0);
        let b_score = b
            .get("rank")
            .and_then(|v| v.as_f64())
            .or_else(|| b.get("similarity_score").and_then(|v| v.as_f64()))
            .unwrap_or(0.0);
        b_score
            .partial_cmp(&a_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if let Some(limit) = limit {
        rows.truncate(limit);
    }
    Ok(rows)
}

fn render_output(
    format: OutputFormat,
    payload: &serde_json::Value,
    bypass_safety: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if bypass_safety {
        if let Some(text) = extract_document_markdown(payload) {
            println!("{text}");
            return Ok(());
        }
        if let Some(text) = extract_mcp_text(payload) {
            println!("{text}");
            return Ok(());
        }
        println!("{}", serde_json::to_string(payload)?);
        return Ok(());
    }

    match format {
        OutputFormat::Json => {
            // Unwrap MCP CallToolResult wrapper: extract inner text and try to parse as JSON
            let output = if let Some(text) = extract_mcp_text(payload) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    serde_json::to_string_pretty(&parsed)?
                } else {
                    serde_json::to_string_pretty(payload)?
                }
            } else {
                serde_json::to_string_pretty(payload)?
            };
            println!("{output}");
        }
        OutputFormat::Comfy => {
            render_comfy(payload, 0);
        }
        OutputFormat::Md => {
            render_markdown(payload, 0);
        }
    }
    Ok(())
}

fn extract_mcp_text(payload: &serde_json::Value) -> Option<String> {
    let content = match payload {
        serde_json::Value::Array(items) => Some(items),
        serde_json::Value::Object(_) => payload.get("content").and_then(|value| value.as_array()),
        _ => None,
    }?;

    let mut parts = Vec::new();
    for item in content {
        if let Some(text) = item.get("text").and_then(|value| value.as_str()) {
            parts.push(text);
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn strip_inline_html(input: &str) -> String {
    input
        .replace("<mark>", "")
        .replace("</mark>", "")
        .replace("<MARK>", "")
        .replace("</MARK>", "")
}

fn render_comfy_tables(payload: &serde_json::Value) -> bool {
    if let Some(tasks) = payload.get("tasks").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec![
                "Type",
                "ID",
                "Identifier",
                "Name",
                "Project",
                "Column",
            ]);
        for row in tasks {
            table.add_row(vec![
                Cell::new("task"),
                Cell::new(row.get("id").and_then(|v| v.as_i64()).unwrap_or_default()),
                Cell::new(
                    row.get("identifier")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-"),
                ),
                Cell::new(row.get("name").and_then(|v| v.as_str()).unwrap_or("-")),
                Cell::new(
                    row.get("projectId")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                ),
                Cell::new(
                    row.get("columnId")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                ),
            ]);
        }
        println!("{table}");
        return true;
    }

    if let Some(projects) = payload.get("projects").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec!["Type", "ID", "Prefix", "Name", "Status"]);
        for row in projects {
            table.add_row(vec![
                Cell::new("project"),
                Cell::new(row.get("id").and_then(|v| v.as_i64()).unwrap_or_default()),
                Cell::new(row.get("prefix").and_then(|v| v.as_str()).unwrap_or("-")),
                Cell::new(row.get("name").and_then(|v| v.as_str()).unwrap_or("-")),
                Cell::new(row.get("status").and_then(|v| v.as_str()).unwrap_or("-")),
            ]);
        }
        println!("{table}");
        return true;
    }

    if let Some(docs) = payload.get("documents").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec![
                "Type", "Doc ID", "Project", "Title", "Rank", "Snippet",
            ]);
        for row in docs {
            table.add_row(vec![
                Cell::new("document"),
                Cell::new(row.get("id").and_then(|v| v.as_i64()).unwrap_or_default()),
                Cell::new(
                    row.get("projectId")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default(),
                ),
                Cell::new(row.get("title").and_then(|v| v.as_str()).unwrap_or("-")),
                Cell::new(
                    row.get("rank")
                        .or_else(|| row.get("similarity_score"))
                        .and_then(|v| v.as_f64())
                        .map(|v| format!("{v:.3}"))
                        .unwrap_or_else(|| "-".to_string()),
                ),
                Cell::new(
                    row.get("snippet")
                        .and_then(|v| v.as_str())
                        .map(|v| {
                            let compact = strip_inline_html(v).replace('\n', " ");
                            if compact.chars().count() > 80 {
                                format!("{}...", compact.chars().take(80).collect::<String>())
                            } else {
                                compact
                            }
                        })
                        .unwrap_or_else(|| "-".to_string()),
                ),
            ]);
        }
        println!("{table}");
        return true;
    }

    false
}

fn extract_document_markdown(payload: &serde_json::Value) -> Option<&str> {
    if let Some(content) = payload
        .get("document")
        .and_then(|doc| doc.get("content"))
        .and_then(|v| v.as_str())
    {
        return Some(content);
    }

    payload.get("content").and_then(|v| v.as_str())
}

fn render_comfy(payload: &serde_json::Value, depth: u8) {
    if let Some(content) = extract_document_markdown(payload) {
        MadSkin::default().print_text(content);
        return;
    }

    if render_comfy_tables(payload) {
        return;
    }

    if depth < 3 {
        if let Some(text) = extract_mcp_text(payload) {
            let trimmed = text.trim();
            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    render_comfy(&parsed, depth + 1);
                    return;
                }
            }

            if trimmed.len() < 180 && !trimmed.contains('\n') {
                let mut table = Table::new();
                table
                    .load_preset(UTF8_FULL)
                    .set_content_arrangement(ContentArrangement::Dynamic)
                    .set_header(vec!["Kind", "Message"]);
                table.add_row(vec![Cell::new("text"), Cell::new(trimmed)]);
                println!("{table}");
                return;
            }

            // For longer multi-line tool text, keep output human-readable (not wrapped JSON).
            println!("{trimmed}");
            return;
        }
    }

    println!(
        "{}",
        serde_json::to_string_pretty(payload)
            .unwrap_or_else(|_| "<failed to render output>".to_string())
    );
}

fn render_markdown_sections(payload: &serde_json::Value) -> Option<String> {
    let mut markdown = String::new();

    if let Some(projects) = payload.get("projects").and_then(|v| v.as_array()) {
        markdown.push_str("## Projects\n\n");
        for row in projects {
            markdown.push_str(&format!(
                "- `{}` **{}** ({})\n",
                row.get("id").and_then(|v| v.as_i64()).unwrap_or_default(),
                row.get("name").and_then(|v| v.as_str()).unwrap_or("-"),
                row.get("prefix").and_then(|v| v.as_str()).unwrap_or("-")
            ));
        }
        markdown.push('\n');
    }

    if let Some(tasks) = payload.get("tasks").and_then(|v| v.as_array()) {
        markdown.push_str("## Tasks\n\n");
        for row in tasks {
            markdown.push_str(&format!(
                "- `{}` {} — {} (project `{}` column `{}`)\n",
                row.get("id").and_then(|v| v.as_i64()).unwrap_or_default(),
                row.get("identifier")
                    .and_then(|v| v.as_str())
                    .unwrap_or("-"),
                row.get("name").and_then(|v| v.as_str()).unwrap_or("-"),
                row.get("projectId")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_default(),
                row.get("columnId")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_default()
            ));
        }
        markdown.push('\n');
    }

    if let Some(documents) = payload.get("documents").and_then(|v| v.as_array()) {
        markdown.push_str("## Documents\n\n");
        for row in documents {
            let rank = row
                .get("rank")
                .or_else(|| row.get("similarity_score"))
                .and_then(|v| v.as_f64())
                .map(|v| format!("{v:.3}"))
                .unwrap_or_else(|| "-".to_string());
            let snippet = row
                .get("snippet")
                .and_then(|v| v.as_str())
                .map(|v| v.replace('\n', " "))
                .unwrap_or_else(|| "-".to_string());
            markdown.push_str(&format!(
                "- `{}` {} (project `{}` rank `{}`)\n  - snippet: {}\n",
                row.get("id").and_then(|v| v.as_i64()).unwrap_or_default(),
                row.get("title").and_then(|v| v.as_str()).unwrap_or("-"),
                row.get("projectId")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_default(),
                rank,
                snippet
            ));
        }
        markdown.push('\n');
    }

    if markdown.trim().is_empty() {
        None
    } else {
        Some(markdown)
    }
}

fn render_markdown(payload: &serde_json::Value, depth: u8) {
    if let Some(content) = extract_document_markdown(payload) {
        MadSkin::default().print_text(content);
        return;
    }

    if let Some(sectioned) = render_markdown_sections(payload) {
        MadSkin::default().print_text(&sectioned);
        return;
    }

    if depth < 3 {
        if let Some(text) = extract_mcp_text(payload) {
            let trimmed = text.trim();

            if trimmed.len() < 200 && !trimmed.contains('\n') {
                MadSkin::default().print_text(&format!("## Result\n\n{trimmed}\n"));
                return;
            }

            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    render_markdown(&parsed, depth + 1);
                    return;
                }
            }

            MadSkin::default().print_text(trimmed);
            return;
        }
    }

    let markdown = format!(
        "```json\n{}\n```",
        serde_json::to_string_pretty(payload)
            .unwrap_or_else(|_| "<failed to render output>".to_string())
    );
    MadSkin::default().print_text(&markdown);
}

async fn execute_tool_call(
    name: &str,
    args: &serde_json::Value,
    ctx: &ToolContext,
    active_agent_name: &str,
) -> Result<CallToolResult, Box<dyn std::error::Error>> {
    // Handle agent_status special case: fill in agent_name if not provided
    let filled_args = if name == "agent_status" {
        let mut map = match args.as_object() {
            Some(m) => m.clone(),
            None => serde_json::Map::new(),
        };
        if !map.contains_key("agent_name") {
            map.insert(
                "agent_name".to_string(),
                serde_json::Value::String(active_agent_name.to_string()),
            );
        }
        serde_json::Value::Object(map)
    } else {
        args.clone()
    };

    let params = rust_mcp_sdk::schema::CallToolRequestParams {
        name: name.to_string(),
        arguments: filled_args.as_object().cloned(),
        meta: None,
        task: None,
    };

    let tool: VibeTaskMcpTools = VibeTaskMcpTools::try_from(params)
        .map_err(|e| format!("Unknown tool '{}': {}", name, e))?;

    let result = tool
        .execute(ctx)
        .await
        .map_err(|e| format!("Tool '{}' failed: {}", name, e))?;

    Ok(result)
}

fn parse_knowledge_document_role(input: &str) -> Result<String, String> {
    match input.trim().to_lowercase().as_str() {
        "constitution" => Ok("Constitution".to_string()),
        "specification" => Ok("Specification".to_string()),
        "plan" | "implementation_plan" | "implementation plan" => Ok("Plan".to_string()),
        "worklog" | "work_log" => Ok("WorkLog".to_string()),
        "reference" => Ok("Reference".to_string()),
        "research" => Ok("Research".to_string()),
        "notes" => Ok("Notes".to_string()),
        other => Err(format!(
            "invalid role '{other}'. Expected Constitution, Specification, Plan, WorkLog, Reference, Research, Notes"
        )),
    }
}

fn build_cli_telemetry(command: &Commands, cfg: &AgentConfig) -> TelemetryEvent {
    let (command_name, tool_name, project_id, task_id) = extract_cli_dimensions(command);
    let mut event = TelemetryEvent::new("cli", command_name);
    event.tool_name = tool_name;
    event.project_id = project_id;
    event.task_id = task_id;
    event.agent_type = cfg
        .get_agent(&cfg.server.active_agent)
        .map(|a| a.agent_type.clone());
    event
}

fn extract_cli_dimensions(
    command: &Commands,
) -> (String, Option<String>, Option<i32>, Option<i32>) {
    match command {
        Commands::Agent { command } => match command {
            AgentCommands::List => ("agent.list".to_string(), None, None, None),
            AgentCommands::Status => ("agent.status".to_string(), None, None, None),
            AgentCommands::Switch { .. } => ("agent.switch".to_string(), None, None, None),
            AgentCommands::Enlist { .. } => (
                "agent.enlist".to_string(),
                Some("register_agent".to_string()),
                None,
                None,
            ),
            AgentCommands::Refresh { .. } => (
                "agent.refresh".to_string(),
                Some("agent_refresh".to_string()),
                None,
                None,
            ),
            AgentCommands::Session { .. } => ("agent.session".to_string(), None, None, None),
        },
        Commands::Project { command } => match command {
            ProjectCommands::List => ("project.list".to_string(), None, None, None),
            ProjectCommands::Tasks { project_id, .. } => {
                ("project.tasks".to_string(), None, Some(*project_id), None)
            }
            ProjectCommands::Docs { project_id, .. } => {
                ("project.docs".to_string(), None, Some(*project_id), None)
            }
            ProjectCommands::ReadDoc {
                project_id, doc_id, ..
            } => (
                "project.read_doc".to_string(),
                Some("read_document".to_string()),
                Some(*project_id),
                Some(*doc_id),
            ),
            ProjectCommands::CreateDoc { project_id, .. } => (
                "project.create_doc".to_string(),
                Some("create_knowledge_document".to_string()),
                Some(*project_id),
                None,
            ),
            ProjectCommands::Context {
                project_id,
                task_id,
                ..
            } => (
                "project.context".to_string(),
                None,
                Some(*project_id),
                Some(*task_id),
            ),
            ProjectCommands::State { project_id, .. } => (
                "project.state".to_string(),
                Some("read_project_state".to_string()),
                Some(*project_id),
                None,
            ),
            ProjectCommands::Overview => (
                "project.overview".to_string(),
                Some("read_project_overview".to_string()),
                None,
                None,
            ),
        },
        Commands::Task { command } => match command {
            TaskCommands::Create { project_id, .. } => (
                "task.create".to_string(),
                Some("create_task".to_string()),
                Some(*project_id),
                None,
            ),
            TaskCommands::Move {
                project_id,
                task_id,
                ..
            } => (
                "task.move".to_string(),
                None,
                Some(*project_id),
                task_id.parse::<i32>().ok(),
            ),
            TaskCommands::UpdateProgress {
                project_id,
                task_id,
                ..
            } => (
                "task.update_progress".to_string(),
                None,
                Some(*project_id),
                task_id.parse::<i32>().ok(),
            ),
            TaskCommands::LinkDocument {
                project_id,
                task_id,
                ..
            } => (
                "task.link_document".to_string(),
                None,
                Some(*project_id),
                task_id.parse::<i32>().ok(),
            ),
            TaskCommands::RequestHelp {
                project_id,
                task_id,
                ..
            } => (
                "task.request_help".to_string(),
                None,
                Some(*project_id),
                task_id.parse::<i32>().ok(),
            ),
            TaskCommands::Reflect { task_id, .. } => {
                let parsed_task = task_id
                    .split('-')
                    .nth(1)
                    .and_then(|v| v.parse::<i32>().ok());
                (
                    "task.reflect".to_string(),
                    None,
                    task_id
                        .split('-')
                        .next()
                        .and_then(|v| v.parse::<i32>().ok()),
                    parsed_task,
                )
            }
            TaskCommands::Approve { task_id, .. } => {
                let parsed_task = task_id
                    .split('-')
                    .nth(1)
                    .and_then(|v| v.parse::<i32>().ok());
                (
                    "task.approve".to_string(),
                    None,
                    task_id
                        .split('-')
                        .next()
                        .and_then(|v| v.parse::<i32>().ok()),
                    parsed_task,
                )
            }
            TaskCommands::Reject { task_id, .. } => {
                let parsed_task = task_id
                    .split('-')
                    .nth(1)
                    .and_then(|v| v.parse::<i32>().ok());
                (
                    "task.reject".to_string(),
                    None,
                    task_id
                        .split('-')
                        .next()
                        .and_then(|v| v.parse::<i32>().ok()),
                    parsed_task,
                )
            }
        },
        Commands::Tools { command } => match command {
            ToolCommands::List { .. } => ("tools.list".to_string(), None, None, None),
            ToolCommands::Describe { name } => {
                ("tools.describe".to_string(), Some(name.clone()), None, None)
            }
            ToolCommands::Call { name, .. } => {
                ("tools.call".to_string(), Some(name.clone()), None, None)
            }
        },
        Commands::Search { command } => match command {
            SearchCommands::Tasks { project_id, .. } => (
                "search.tasks".to_string(),
                Some("agent_search".to_string()),
                *project_id,
                None,
            ),
            SearchCommands::Docs { project_id, .. } => (
                "search.docs".to_string(),
                Some("query_similar_documents".to_string()),
                *project_id,
                None,
            ),
            SearchCommands::Projects { .. } => (
                "search.projects".to_string(),
                Some("query_projects".to_string()),
                None,
                None,
            ),
            SearchCommands::All { project_id, .. } => (
                "search.all".to_string(),
                Some("search.aggregate".to_string()),
                *project_id,
                None,
            ),
        },
    }
}

#[cfg(test)]
mod renderer_tests {
    use super::{build_agent_entry_from_me, extract_mcp_text, is_auth_or_permission_error};
    use serde_json::json;
    use vibetask_app::generated_types::AgentMeResponse;

    #[test]
    fn extracts_text_from_top_level_content_array() {
        let payload = json!([
            { "type": "text", "text": "hello" },
            { "type": "text", "text": "world" }
        ]);
        assert_eq!(
            extract_mcp_text(&payload).as_deref(),
            Some("hello\n\nworld")
        );
    }

    #[test]
    fn extracts_text_from_wrapped_content_array() {
        let payload = json!({
            "content": [
                { "type": "text", "text": "wrapped text" }
            ]
        });
        assert_eq!(extract_mcp_text(&payload).as_deref(), Some("wrapped text"));
    }

    #[test]
    fn maps_platform_agent_roster_cache_from_me() {
        let me: AgentMeResponse = serde_json::from_value(json!({
            "agent": {
                "id": "ag_platform",
                "name": "The Architect",
                "ownerId": 1,
                "createdAt": "2026-01-01T00:00:00Z",
                "expiresAt": "2027-01-01T00:00:00Z",
                "metadata": {
                    "isAgent": true,
                    "description": "platform"
                }
            },
            "delegations": [],
            "apiAllowance": {
                "isPlatformAgent": true,
                "readOnly": true,
                "alwaysAllowedReadEndpoints": ["/api/agent/health"],
                "configuredReadEndpoints": ["/api/agent/projects"],
                "effectiveReadEndpoints": ["/api/agent/health", "/api/agent/projects"]
            }
        }))
        .expect("valid /me payload");

        let entry = build_agent_entry_from_me(&me, "ag_test_platform_key");
        assert_eq!(entry.agent_type, "Platform");
        assert_eq!(
            entry.allowed_endpoints,
            Some(vec!["/api/agent/projects".to_string()])
        );
        assert_eq!(
            entry.effective_endpoints,
            Some(vec![
                "/api/agent/health".to_string(),
                "/api/agent/projects".to_string()
            ])
        );
        assert!(entry.projects.is_none());
    }

    #[test]
    fn maps_project_agent_roster_cache_from_me() {
        let me: AgentMeResponse = serde_json::from_value(json!({
            "agent": {
                "id": "ag_project",
                "name": "AgentSmith",
                "ownerId": 1,
                "createdAt": "2026-01-01T00:00:00Z",
                "expiresAt": "2027-01-01T00:00:00Z",
                "metadata": {
                    "isAgent": true,
                    "description": "project"
                }
            },
            "delegations": [{
                "projectId": 10,
                "projectName": "VibeEye",
                "projectPrefix": "VE",
                "permissionLevel": "USER",
                "delegatedAt": "2026-01-01T00:00:00Z"
            }],
            "apiAllowance": {
                "isPlatformAgent": false,
                "readOnly": false,
                "alwaysAllowedReadEndpoints": ["/api/agent/health"],
                "configuredReadEndpoints": [],
                "effectiveReadEndpoints": ["/api/agent/projects/:projectId/tasks"]
            }
        }))
        .expect("valid /me payload");

        let entry = build_agent_entry_from_me(&me, "ag_test_project_key");
        assert_eq!(entry.agent_type, "ProjectDelegated");
        assert_eq!(entry.projects, Some(vec![10]));
        assert_eq!(entry.permissions, Some(vec!["User".to_string()]));
        assert_eq!(
            entry.effective_endpoints,
            Some(vec!["/api/agent/projects/:projectId/tasks".to_string()])
        );
    }

    #[test]
    fn detects_auth_permission_errors() {
        assert!(is_auth_or_permission_error(
            "Unauthorized - invalid API key"
        ));
        assert!(is_auth_or_permission_error("HTTP 403 forbidden"));
        assert!(!is_auth_or_permission_error("network timeout"));
    }
}
