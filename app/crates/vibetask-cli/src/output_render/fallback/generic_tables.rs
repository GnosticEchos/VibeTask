use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use serde_json::Value;

use crate::output_render::handlers::planning_preview::is_planning_preview_payload;
use crate::output_render::util::{json_i64, json_str, strip_inline_html};

pub(crate) fn render_comfy_tables(payload: &Value) -> bool {
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
        if projects
            .first()
            .is_some_and(|row| row.get("totalTasks").is_some())
        {
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic)
                .set_header(vec!["ID", "Prefix", "Name", "Total tasks"]);
            for row in projects {
                table.add_row(vec![
                    Cell::new(json_i64(row, "id")),
                    Cell::new(json_str(row, "prefix")),
                    Cell::new(json_str(row, "name")),
                    Cell::new(json_i64(row, "totalTasks")),
                ]);
            }
        } else {
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic)
                .set_header(vec!["Type", "ID", "Prefix", "Name", "Status"]);
            for row in projects {
                table.add_row(vec![
                    Cell::new("project"),
                    Cell::new(json_i64(row, "id")),
                    Cell::new(json_str(row, "prefix")),
                    Cell::new(json_str(row, "name")),
                    Cell::new(json_str(row, "status")),
                ]);
            }
        }
        println!("{table}");
        return true;
    }

    if let Some(docs) = payload.get("documents").and_then(|v| v.as_array()) {
        if is_planning_preview_payload(payload) {
            return false;
        }
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


pub(crate) fn render_markdown_sections(payload: &Value) -> Option<String> {
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
        if !is_planning_preview_payload(payload) {
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
    }

    if markdown.trim().is_empty() {
        None
    } else {
        Some(markdown)
    }
}

