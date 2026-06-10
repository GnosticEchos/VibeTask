use serde_json::Value;
use std::borrow::Cow;

pub fn extract_mcp_text(payload: &Value) -> Option<String> {
    let content = match payload {
        Value::Array(items) => Some(items),
        Value::Object(_) => payload.get("content").and_then(|value| value.as_array()),
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

pub fn normalize_payload(payload: &Value) -> Cow<'_, Value> {
    if let Some(text) = extract_mcp_text(payload) {
        let trimmed = text.trim();
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                return Cow::Owned(parsed);
            }
        }
    }
    Cow::Borrowed(payload)
}

pub fn strip_inline_html(input: &str) -> String {
    input
        .replace("<mark>", "")
        .replace("</mark>", "")
        .replace("<MARK>", "")
        .replace("</MARK>", "")
}

pub fn json_i64(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(|v| v.as_i64()).unwrap_or(0)
}

pub fn json_str<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(|v| v.as_str()).unwrap_or("-")
}

pub fn extract_document_markdown(payload: &Value) -> Option<&str> {
    if let Some(content) = payload
        .get("document")
        .and_then(|doc| doc.get("content"))
        .and_then(|v| v.as_str())
    {
        return Some(content);
    }

    payload.get("content").and_then(|v| v.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_payload_unwraps_mcp_text_json() {
        let wrapped = json!([{
            "type": "text",
            "text": "{\"projectId\":21,\"lifecycleStatus\":\"DRAFT\"}"
        }]);
        let normalized = normalize_payload(&wrapped);
        assert_eq!(normalized.get("projectId").and_then(|v| v.as_i64()), Some(21));
    }
}
