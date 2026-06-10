mod fallback;
mod format;
mod handlers;
mod registry;
mod util;

pub use format::OutputFormat;

use handlers::all_handlers;
use registry::{render_first_matching_comfy, render_first_matching_markdown};
use serde_json::Value;
use termimad::MadSkin;
use util::{extract_document_markdown, extract_mcp_text, normalize_payload};

pub fn render_output(
    format: OutputFormat,
    payload: &Value,
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
            let normalized = normalize_payload(payload);
            let output = serde_json::to_string_pretty(normalized.as_ref())?;
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

pub(crate) fn render_comfy(payload: &Value, depth: u8) {
    if let Some(content) = extract_document_markdown(payload) {
        MadSkin::default().print_text(content);
        return;
    }

    let normalized = normalize_payload(payload);
    let payload = normalized.as_ref();

    let handlers = all_handlers();
    if render_first_matching_comfy(payload, &handlers) {
        return;
    }

    if fallback::generic_tables::render_comfy_tables(payload) {
        return;
    }

    if fallback::mcp_text::render_comfy_mcp_fallback(payload, depth) {
        return;
    }

    fallback::mcp_text::render_json_fallback(payload);
}

pub(crate) fn render_markdown(payload: &Value, depth: u8) {
    if let Some(content) = extract_document_markdown(payload) {
        MadSkin::default().print_text(content);
        return;
    }

    let normalized = normalize_payload(payload);
    let payload = normalized.as_ref();

    let handlers = all_handlers();
    if let Some(markdown) = render_first_matching_markdown(payload, &handlers) {
        MadSkin::default().print_text(&markdown);
        return;
    }

    if let Some(sectioned) = fallback::generic_tables::render_markdown_sections(payload) {
        MadSkin::default().print_text(&sectioned);
        return;
    }

    if fallback::mcp_text::render_markdown_mcp_fallback(payload, depth) {
        return;
    }

    fallback::mcp_text::render_markdown_json_fallback(payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::output_render::handlers::planning_preview::{
        is_planning_preview_payload, PlanningPreviewRenderer,
    };
    use crate::output_render::registry::StructuredRenderer;
    use crate::output_render::util::extract_mcp_text;
    use serde_json::json;

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
    fn detects_planning_preview_payload() {
        let preview = json!({
            "projectId": 21,
            "lifecycleStatus": "DRAFT",
            "checklist": [{ "id": "owner", "label": "Name", "passed": true }],
            "documents": []
        });
        assert!(is_planning_preview_payload(&preview));
        assert!(PlanningPreviewRenderer.matches(&preview));
    }

    #[test]
    fn registry_order_planning_before_documents() {
        let preview = json!({
            "projectId": 21,
            "lifecycleStatus": "DRAFT",
            "name": "Test",
            "prefix": "TST",
            "backlogCount": 0,
            "checklist": [{ "id": "owner", "label": "Name", "passed": true }],
            "documents": [],
            "columns": [],
            "warnings": []
        });
        assert!(PlanningPreviewRenderer.matches(&preview));
        assert!(!fallback::generic_tables::render_comfy_tables(&preview));
    }

    #[test]
    fn project_stats_matches_wrapper_shape() {
        let payload = json!({
            "project": {
                "id": 10,
                "name": "Spec",
                "prefix": "SPEC",
                "columns": []
            }
        });
        assert!(handlers::ProjectStatsRenderer.matches(&payload));
    }
}
