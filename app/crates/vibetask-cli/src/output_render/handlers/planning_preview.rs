use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use serde_json::Value;

use crate::output_render::registry::StructuredRenderer;
use crate::output_render::util::{json_i64, json_str};

pub fn is_planning_preview_payload(payload: &Value) -> bool {
    payload.get("projectId").is_some()
        && payload.get("lifecycleStatus").is_some()
        && payload
            .get("checklist")
            .and_then(|value| value.as_array())
            .is_some()
}

fn render_comfy_planning_preview(payload: &Value) {
    println!("Draft project preview\n");

    let mut meta = Table::new();
    meta.load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(vec!["Field", "Value"]);
    meta.add_row(vec![
        Cell::new("Project"),
        Cell::new(format!(
            "{} ({}) #{}",
            json_str(payload, "name"),
            json_str(payload, "prefix"),
            json_i64(payload, "projectId")
        )),
    ]);
    meta.add_row(vec![
        Cell::new("Lifecycle"),
        Cell::new(json_str(payload, "lifecycleStatus")),
    ]);
    if payload.get("templateId").is_some() {
        meta.add_row(vec![
            Cell::new("Template"),
            Cell::new(json_str(payload, "templateId")),
        ]);
    }
    meta.add_row(vec![
        Cell::new("Backlog tasks"),
        Cell::new(json_i64(payload, "backlogCount")),
    ]);
    if let Some(description) = payload.get("description").and_then(|v| v.as_str()) {
        if !description.trim().is_empty() {
            meta.add_row(vec![Cell::new("Description"), Cell::new(description)]);
        }
    }
    println!("{meta}\n");

    if let Some(checklist) = payload.get("checklist").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec!["Checklist", "Status"]);
        for item in checklist {
            let passed = item.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
            table.add_row(vec![
                Cell::new(json_str(item, "label")),
                Cell::new(if passed { "pass" } else { "FAIL" }),
            ]);
        }
        println!("{table}\n");
    }

    if let Some(columns) = payload.get("columns").and_then(|v| v.as_array()) {
        if !columns.is_empty() {
            let mut table = Table::new();
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic)
                .set_header(vec!["#", "Column", "Role"]);
            for col in columns {
                table.add_row(vec![
                    Cell::new(json_i64(col, "order") + 1),
                    Cell::new(json_str(col, "name")),
                    Cell::new(json_str(col, "roleType")),
                ]);
            }
            println!("{table}\n");
        }
    }

    if let Some(documents) = payload.get("documents").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec!["Doc ID", "Title", "Type", "Preview"]);
        if documents.is_empty() {
            table.add_row(vec![
                Cell::new("-"),
                Cell::new("(none)"),
                Cell::new("-"),
                Cell::new("-"),
            ]);
        } else {
            for doc in documents {
                table.add_row(vec![
                    Cell::new(json_i64(doc, "id")),
                    Cell::new(json_str(doc, "title")),
                    Cell::new(json_str(doc, "docType")),
                    Cell::new(json_str(doc, "contentPreview")),
                ]);
            }
        }
        println!("{table}\n");
    }

    if let Some(warnings) = payload.get("warnings").and_then(|v| v.as_array()) {
        if !warnings.is_empty() {
            println!("Warnings");
            for warning in warnings {
                if let Some(text) = warning.as_str() {
                    println!("  - {text}");
                }
            }
            println!();
        }
    }
}

fn render_markdown_planning_preview(payload: &Value) -> String {
    let mut md = String::new();
    md.push_str("## Draft project preview\n\n");
    md.push_str(&format!(
        "- **Project:** {} ({}) `#{}`\n",
        json_str(payload, "name"),
        json_str(payload, "prefix"),
        json_i64(payload, "projectId")
    ));
    md.push_str(&format!(
        "- **Lifecycle:** {}\n",
        json_str(payload, "lifecycleStatus")
    ));
    if payload.get("templateId").is_some() {
        md.push_str(&format!(
            "- **Template:** {}\n",
            json_str(payload, "templateId")
        ));
    }
    md.push_str(&format!(
        "- **Backlog tasks:** {}\n",
        json_i64(payload, "backlogCount")
    ));
    if let Some(description) = payload.get("description").and_then(|v| v.as_str()) {
        if !description.trim().is_empty() {
            md.push_str(&format!("- **Description:** {description}\n"));
        }
    }
    md.push('\n');

    if let Some(checklist) = payload.get("checklist").and_then(|v| v.as_array()) {
        md.push_str("### Acceptance checklist\n\n");
        for item in checklist {
            let passed = item.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
            md.push_str(&format!(
                "- [{}] {}\n",
                if passed { "x" } else { " " },
                json_str(item, "label")
            ));
        }
        md.push('\n');
    }

    if let Some(columns) = payload.get("columns").and_then(|v| v.as_array()) {
        if !columns.is_empty() {
            md.push_str("### Columns\n\n");
            md.push_str("| # | Column | Role |\n");
            md.push_str("|---|--------|------|\n");
            for col in columns {
                md.push_str(&format!(
                    "| {} | {} | {} |\n",
                    json_i64(col, "order") + 1,
                    json_str(col, "name"),
                    json_str(col, "roleType")
                ));
            }
            md.push('\n');
        }
    }

    if let Some(documents) = payload.get("documents").and_then(|v| v.as_array()) {
        md.push_str("### Documents\n\n");
        if documents.is_empty() {
            md.push_str("_No documents yet._\n\n");
        } else {
            for doc in documents {
                md.push_str(&format!(
                    "- `{}` **{}** ({}) — {}\n",
                    json_i64(doc, "id"),
                    json_str(doc, "title"),
                    json_str(doc, "docType"),
                    json_str(doc, "contentPreview")
                ));
            }
            md.push('\n');
        }
    }

    if let Some(warnings) = payload.get("warnings").and_then(|v| v.as_array()) {
        if !warnings.is_empty() {
            md.push_str("### Warnings\n\n");
            for warning in warnings {
                if let Some(text) = warning.as_str() {
                    md.push_str(&format!("- {text}\n"));
                }
            }
            md.push('\n');
        }
    }

    md
}


pub struct PlanningPreviewRenderer;

impl StructuredRenderer for PlanningPreviewRenderer {
    fn id(&self) -> &'static str {
        "planning_preview"
    }

    fn matches(&self, payload: &Value) -> bool {
        is_planning_preview_payload(payload)
    }

    fn render_comfy(&self, payload: &Value) {
        render_comfy_planning_preview(payload);
    }

    fn render_markdown(&self, payload: &Value) -> String {
        render_markdown_planning_preview(payload)
    }
}
