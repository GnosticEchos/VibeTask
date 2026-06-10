//! CLI help-tree discovery (`--help-tree`) built from clap reflection (no hand-maintained maps).

use clap::{Arg, Command, CommandFactory};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::IsTerminal;
use vibetask_tool_catalog::cli_mcp_tools_for_path;

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, clap::ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum HelpTreeOutputFormat {
    Text,
    Json,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, clap::ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum HelpTreeStyle {
    Plain,
    Rich,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, clap::ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum HelpTreeColor {
    Auto,
    Always,
    Never,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TextEmphasis {
    Normal,
    Bold,
    Italic,
    BoldItalic,
}

#[derive(Clone, Debug)]
pub struct TextTokenTheme {
    pub emphasis: TextEmphasis,
    pub color_hex: Option<String>,
}

impl TextTokenTheme {
    pub fn normal() -> Self {
        Self {
            emphasis: TextEmphasis::Normal,
            color_hex: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct HelpTreeTheme {
    pub command: TextTokenTheme,
    pub options: TextTokenTheme,
    pub description: TextTokenTheme,
}

impl Default for HelpTreeTheme {
    fn default() -> Self {
        Self {
            command: TextTokenTheme {
                emphasis: TextEmphasis::Bold,
                color_hex: Some("#7ee7e6".to_string()),
            },
            options: TextTokenTheme::normal(),
            description: TextTokenTheme {
                emphasis: TextEmphasis::Italic,
                color_hex: Some("#90a2af".to_string()),
            },
        }
    }
}

#[derive(Clone, Debug)]
pub struct HelpTreeOpts {
    pub depth_limit: Option<usize>,
    pub ignore: Vec<String>,
    pub tree_all: bool,
    pub output: HelpTreeOutputFormat,
    pub style: HelpTreeStyle,
    pub color: HelpTreeColor,
    pub theme: HelpTreeTheme,
}

pub fn run_for_path<CF: CommandFactory>(
    opts: HelpTreeOpts,
    requested_path: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut cmd = CF::command();
    cmd.build();

    let (selected, _resolved_path) = select_command_by_path(&cmd, requested_path);

    let ignore: HashSet<String> = opts.ignore.iter().cloned().collect();

    match opts.output {
        HelpTreeOutputFormat::Json => {
            let omit_help_tree_discovery_flags = !requested_path.is_empty();
            let mut path = requested_path.to_vec();
            let value = command_to_json(
                selected,
                &ignore,
                opts.tree_all,
                opts.depth_limit,
                0,
                omit_help_tree_discovery_flags,
                &mut path,
            )?;
            println!("{}", serde_json::to_string_pretty(&value)?);
        }
        HelpTreeOutputFormat::Text => {
            println!(
                "{}",
                command_to_text(selected, &ignore, opts.tree_all, opts.depth_limit, &opts)?
            );
            println!();
            println!(
                "💡 Use `vibetask-cli <COMMAND> --help` for full details on arguments and flags."
            );
        }
    }

    Ok(())
}

#[derive(Clone, Debug)]
pub struct HelpTreeInvocation {
    pub opts: HelpTreeOpts,
    pub path: Vec<String>,
}

pub fn parse_help_tree_invocation(argv: &[String]) -> Result<Option<HelpTreeInvocation>, String> {
    let mut help_tree = false;
    let mut depth_limit: Option<usize> = None;
    let mut ignore: Vec<String> = Vec::new();
    let mut tree_all = false;
    let mut output: Option<HelpTreeOutputFormat> = None;
    let mut style = HelpTreeStyle::Rich;
    let mut color = HelpTreeColor::Auto;
    let mut path: Vec<String> = Vec::new();

    let mut idx = 0;
    while idx < argv.len() {
        let arg = &argv[idx];
        match arg.as_str() {
            "--help-tree" => {
                help_tree = true;
            }
            "--tree-depth" | "-L" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| format!("Missing value for '{}'", arg))?;
                depth_limit = Some(
                    value
                        .parse::<usize>()
                        .map_err(|_| format!("Invalid value for '{}': {}", arg, value))?,
                );
            }
            "--tree-ignore" | "-I" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| format!("Missing value for '{}'", arg))?;
                ignore.push(value.clone());
            }
            "--tree-all" | "-a" => {
                tree_all = true;
            }
            "--tree-output" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| "Missing value for '--tree-output'".to_string())?;
                output = Some(match value.as_str() {
                    "text" => HelpTreeOutputFormat::Text,
                    "json" => HelpTreeOutputFormat::Json,
                    _ => return Err(format!("Invalid --tree-output value: '{}'", value)),
                });
            }
            "--tree-style" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| "Missing value for '--tree-style'".to_string())?;
                style = match value.as_str() {
                    "plain" => HelpTreeStyle::Plain,
                    "rich" => HelpTreeStyle::Rich,
                    _ => return Err(format!("Invalid --tree-style value: '{}'", value)),
                };
            }
            "--tree-color" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| "Missing value for '--tree-color'".to_string())?;
                color = match value.as_str() {
                    "auto" => HelpTreeColor::Auto,
                    "always" => HelpTreeColor::Always,
                    "never" => HelpTreeColor::Never,
                    _ => return Err(format!("Invalid --tree-color value: '{}'", value)),
                };
            }
            // Non-tree global flags with values; skip the value.
            "--config" | "--hub-url" | "--format" | "-f" => {
                idx += 1;
                let value = argv
                    .get(idx)
                    .ok_or_else(|| format!("Missing value for '{}'", arg))?;
                if arg == "--format" || arg == "-f" {
                    output = Some(match value.as_str() {
                        "json" => HelpTreeOutputFormat::Json,
                        "comfy" | "md" => HelpTreeOutputFormat::Text,
                        _ => return Err(format!("Invalid --format value: '{}'", value)),
                    });
                }
            }
            token if token.starts_with('-') => {}
            token => {
                let normalized = match token {
                    "projects" => "project",
                    "tasks" => "task",
                    _ => token,
                };
                path.push(normalized.to_string());
            }
        }
        idx += 1;
    }

    if !help_tree {
        return Ok(None);
    }

    Ok(Some(HelpTreeInvocation {
        opts: HelpTreeOpts {
            depth_limit,
            ignore,
            tree_all,
            output: output.unwrap_or(HelpTreeOutputFormat::Text),
            style,
            color,
            theme: HelpTreeTheme::default(),
        },
        path,
    }))
}

fn select_command_by_path<'a>(root: &'a Command, tokens: &[String]) -> (&'a Command, Vec<String>) {
    let mut current = root;
    let mut resolved = Vec::new();

    for token in tokens {
        let maybe_next = current
            .get_subcommands()
            .find(|sub| sub.get_name() == token.as_str());
        let Some(next) = maybe_next else {
            break;
        };
        resolved.push(next.get_name().to_string());
        current = next;
    }

    (current, resolved)
}

fn should_use_color(opts: &HelpTreeOpts) -> bool {
    match opts.color {
        HelpTreeColor::Always => true,
        HelpTreeColor::Never => false,
        HelpTreeColor::Auto => std::io::stdout().is_terminal(),
    }
}

fn parse_hex_rgb(color_hex: &str) -> Option<(u8, u8, u8)> {
    let hex = color_hex.trim();
    let hex = hex.strip_prefix('#').unwrap_or(hex);
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

fn style_text(text: &str, token: &TextTokenTheme, opts: &HelpTreeOpts) -> String {
    if opts.style == HelpTreeStyle::Plain
        || matches!(token.emphasis, TextEmphasis::Normal) && token.color_hex.is_none()
    {
        return text.to_string();
    }

    let mut codes: Vec<String> = Vec::new();
    match token.emphasis {
        TextEmphasis::Normal => {}
        TextEmphasis::Bold => codes.push("1".to_string()),
        TextEmphasis::Italic => codes.push("3".to_string()),
        TextEmphasis::BoldItalic => {
            codes.push("1".to_string());
            codes.push("3".to_string());
        }
    }

    if should_use_color(opts) {
        if let Some(hex) = token.color_hex.as_deref() {
            if let Some((r, g, b)) = parse_hex_rgb(hex) {
                codes.push(format!("38;2;{r};{g};{b}"));
            }
        }
    }

    if codes.is_empty() {
        text.to_string()
    } else {
        format!("\x1b[{}m{text}\x1b[0m", codes.join(";"))
    }
}

struct TextRenderCtx<'a> {
    ignore: &'a HashSet<String>,
    tree_all: bool,
    depth_limit: Option<usize>,
    opts: &'a HelpTreeOpts,
}

fn should_skip_arg(arg: &Arg, tree_all: bool) -> bool {
    if tree_all {
        return false;
    }

    arg.get_id().as_str() == "help" || arg.get_id().as_str() == "version" || arg.is_hide_set()
}

fn should_skip_subcommand(sub: &Command, ignore: &HashSet<String>, tree_all: bool) -> bool {
    // `help` subcommands are clap plumbing noise in tree mode.
    if sub.get_name() == "help" {
        return true;
    }
    if ignore.contains(sub.get_name()) {
        return true;
    }
    if !tree_all && sub.is_hide_set() {
        return true;
    }
    false
}

fn is_help_tree_discovery_flag(arg: &Arg) -> bool {
    matches!(
        arg.get_id().as_str(),
        "help_tree"
            | "tree_depth"
            | "tree_ignore"
            | "tree_all"
            | "tree_output"
            | "tree_style"
            | "tree_color"
    )
}

fn command_inline_parts(cmd: &Command, tree_all: bool) -> (String, String) {
    let mut suffix = String::new();

    for arg in cmd.get_arguments() {
        if should_skip_arg(arg, tree_all) {
            continue;
        }
        if arg.is_positional() {
            let label = arg.get_id().to_string().to_ascii_uppercase();
            if arg.is_required_set() {
                suffix.push_str(&format!(" <{label}>"));
            } else {
                suffix.push_str(&format!(" [{label}]"));
            }
        }
    }

    let has_flags = cmd
        .get_arguments()
        .any(|arg| !arg.is_positional() && !should_skip_arg(arg, tree_all));
    if has_flags {
        suffix.push_str(" [flags]");
    }

    (cmd.get_name().to_string(), suffix)
}

fn arg_payload(arg: &Arg) -> Value {
    let mut out = serde_json::Map::new();
    out.insert("type".to_string(), json!("option"));
    out.insert("name".to_string(), json!(arg.get_id().to_string()));

    if let Some(h) = arg.get_help() {
        out.insert("description".to_string(), json!(h.to_string()));
    }

    if let Some(s) = arg.get_short() {
        out.insert("short".to_string(), json!(s.to_string()));
    }

    if let Some(l) = arg.get_long() {
        out.insert("long".to_string(), json!(l.to_string()));
    }

    let default_values: Vec<String> = arg
        .get_default_values()
        .iter()
        .map(|value| value.to_string_lossy().to_string())
        .collect();
    if !default_values.is_empty() {
        out.insert("default".to_string(), json!(default_values.join(", ")));
    }

    out.insert("required".to_string(), json!(arg.is_required_set()));
    out.insert("takes_value".to_string(), json!(!arg.is_positional()));

    Value::Object(out)
}

fn positional_payload(arg: &Arg) -> Value {
    let mut out = serde_json::Map::new();
    out.insert("type".to_string(), json!("argument"));
    out.insert("name".to_string(), json!(arg.get_id().to_string()));

    if let Some(h) = arg.get_help() {
        out.insert("description".to_string(), json!(h.to_string()));
    }

    out.insert("required".to_string(), json!(arg.is_required_set()));
    Value::Object(out)
}

fn command_to_json(
    cmd: &Command,
    ignore: &HashSet<String>,
    tree_all: bool,
    depth_limit: Option<usize>,
    depth: usize,
    omit_help_tree_discovery_flags: bool,
    path: &mut Vec<String>,
) -> Result<Value, Box<dyn std::error::Error>> {
    if path.last().map(|s| s.as_str()) != Some(cmd.get_name()) {
        path.push(cmd.get_name().to_string());
    }

    let mut root = serde_json::Map::new();
    root.insert("type".to_string(), json!("command"));
    root.insert("name".to_string(), json!(cmd.get_name()));

    if let Some(about) = cmd.get_about() {
        root.insert("description".to_string(), json!(about.to_string()));
    }

    let mut options = Vec::new();
    let mut positionals = Vec::new();

    for arg in cmd.get_arguments() {
        if should_skip_arg(arg, tree_all) {
            continue;
        }

        if is_help_tree_discovery_flag(arg) && (omit_help_tree_discovery_flags || depth > 0) {
            continue;
        }

        if arg.is_positional() {
            positionals.push(positional_payload(arg));
        } else {
            options.push(arg_payload(arg));
        }
    }

    if !options.is_empty() {
        root.insert("options".to_string(), Value::Array(options));
    }

    if !positionals.is_empty() {
        root.insert("arguments".to_string(), Value::Array(positionals));
    }

    let mut children = Vec::new();
    let can_recurse = depth_limit.is_none_or(|max| depth < max);
    if can_recurse {
        for sub in cmd.get_subcommands() {
            if should_skip_subcommand(sub, ignore, tree_all) {
                continue;
            }
            children.push(command_to_json(
                sub,
                ignore,
                tree_all,
                depth_limit,
                depth + 1,
                omit_help_tree_discovery_flags,
                path,
            )?);
        }
    }

    let visible_subcommands = cmd
        .get_subcommands()
        .filter(|sub| !should_skip_subcommand(sub, ignore, tree_all))
        .count();
    let is_leaf = children.is_empty() && visible_subcommands == 0;
    if !children.is_empty() {
        root.insert("subcommands".to_string(), Value::Array(children));
    }
    if is_leaf {
        let path_refs: Vec<&str> = path.iter().map(String::as_str).collect();
        let mcp_tools: Vec<&str> = cli_mcp_tools_for_path(&path_refs);
        if !mcp_tools.is_empty() {
            root.insert(
                "mcp_tools".to_string(),
                Value::Array(mcp_tools.into_iter().map(|t| json!(t)).collect()),
            );
        }
    }

    path.pop();
    Ok(Value::Object(root))
}

fn write_command_tree_lines(
    cmd: &Command,
    prefix: &str,
    depth: usize,
    ctx: &TextRenderCtx<'_>,
    out: &mut String,
) {
    let subs: Vec<&Command> = cmd
        .get_subcommands()
        .filter(|s| !should_skip_subcommand(s, ctx.ignore, ctx.tree_all))
        .collect();

    if subs.is_empty() {
        return;
    }

    let at_limit = ctx.depth_limit.is_some_and(|max| depth >= max);

    for (idx, sub) in subs.iter().enumerate() {
        let is_last = idx + 1 == subs.len();
        let branch = if is_last { "└── " } else { "├── " };
        let (command_name, suffix) = command_inline_parts(sub, ctx.tree_all);
        let signature = format!("{command_name}{suffix}");
        let about = sub.get_about().map(|s| s.to_string()).unwrap_or_default();
        let signature_styled = format!(
            "{}{}",
            style_text(&command_name, &ctx.opts.theme.command, ctx.opts),
            style_text(&suffix, &ctx.opts.theme.options, ctx.opts)
        );
        let decorated = if about.is_empty() {
            signature_styled
        } else {
            let dots = ".".repeat(4.max(28usize.saturating_sub(signature.chars().count())));
            format!(
                "{} {dots} {}",
                signature_styled,
                style_text(&about, &ctx.opts.theme.description, ctx.opts)
            )
        };

        out.push_str(prefix);
        out.push_str(branch);
        out.push_str(&decorated);
        out.push('\n');

        if at_limit {
            continue;
        }

        let extension = if is_last { "    " } else { "│   " };
        let next_prefix = format!("{prefix}{extension}");
        write_command_tree_lines(sub, &next_prefix, depth + 1, ctx, out);
    }
}

fn command_to_text(
    cmd: &Command,
    ignore: &HashSet<String>,
    tree_all: bool,
    depth_limit: Option<usize>,
    opts: &HelpTreeOpts,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut out = String::new();
    let ctx = TextRenderCtx {
        ignore,
        tree_all,
        depth_limit,
        opts,
    };

    out.push_str(&style_text(cmd.get_name(), &opts.theme.command, opts));
    out.push('\n');

    for arg in cmd.get_arguments() {
        if should_skip_arg(arg, tree_all) {
            continue;
        }
        if arg.is_positional() {
            continue;
        }

        let long = arg
            .get_long()
            .map(|l| format!("--{l}"))
            .unwrap_or_else(|| arg.get_id().to_string());
        let short = arg.get_short().map(|s| format!("-{s}")).unwrap_or_default();
        let meta = if short.is_empty() {
            long
        } else {
            format!("{short}, {long}")
        };
        let help = arg.get_help().map(|h| h.to_string()).unwrap_or_default();
        out.push_str(&format!(
            "  {} … {}\n",
            style_text(&meta, &opts.theme.options, opts),
            style_text(&help, &opts.theme.description, opts)
        ));
    }

    out.push('\n');
    write_command_tree_lines(cmd, "", 0, &ctx, &mut out);

    Ok(out.trim_end().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Cli;

    #[test]
    fn json_leaf_includes_mcp_tools_for_draft_create() {
        let mut cmd = Cli::command();
        cmd.build();
        let (selected, _) = select_command_by_path(&cmd, &["project".into(), "draft".into()]);
        let mut path = vec!["project".into(), "draft".into()];
        let value = command_to_json(selected, &HashSet::new(), false, None, 0, true, &mut path)
            .expect("command_to_json");
        let create = value
            .get("subcommands")
            .and_then(|v| v.as_array())
            .and_then(|subs| {
                subs.iter()
                    .find(|s| s.get("name") == Some(&json!("create")))
            })
            .expect("create subcommand");
        let mcp_tools = create
            .get("mcp_tools")
            .and_then(|v| v.as_array())
            .expect("mcp_tools on create leaf");
        assert_eq!(mcp_tools[0], json!("create_draft_project"));
    }
}
