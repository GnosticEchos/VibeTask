use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use serde_json::Value;
use termimad::MadSkin;

use crate::output_render::util::extract_mcp_text;

pub fn render_comfy_mcp_fallback(payload: &Value, depth: u8) -> bool {
    if depth >= 3 {
        return false;
    }
    let Some(text) = extract_mcp_text(payload) else {
        return false;
    };
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            crate::output_render::render_comfy(&parsed, depth + 1);
            return true;
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
        return true;
    }

    println!("{trimmed}");
    true
}

pub fn render_markdown_mcp_fallback(payload: &Value, depth: u8) -> bool {
    if depth >= 3 {
        return false;
    }
    let Some(text) = extract_mcp_text(payload) else {
        return false;
    };
    let trimmed = text.trim();

    if trimmed.len() < 200 && !trimmed.contains('\n') {
        MadSkin::default().print_text(&format!("## Result\n\n{trimmed}\n"));
        return true;
    }

    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            crate::output_render::render_markdown(&parsed, depth + 1);
            return true;
        }
    }

    MadSkin::default().print_text(trimmed);
    true
}

pub fn render_json_fallback(payload: &Value) {
    println!(
        "{}",
        serde_json::to_string_pretty(payload)
            .unwrap_or_else(|_| "<failed to render output>".to_string())
    );
}

pub fn render_markdown_json_fallback(payload: &Value) {
    let markdown = format!(
        "```json\n{}\n```",
        serde_json::to_string_pretty(payload)
            .unwrap_or_else(|_| "<failed to render output>".to_string())
    );
    MadSkin::default().print_text(&markdown);
}
