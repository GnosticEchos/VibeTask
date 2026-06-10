use serde_json::Value;

pub trait StructuredRenderer {
    #[allow(dead_code)]
    fn id(&self) -> &'static str;
    fn matches(&self, payload: &Value) -> bool;
    fn render_comfy(&self, payload: &Value);
    fn render_markdown(&self, payload: &Value) -> String;
}

pub fn render_first_matching_comfy(payload: &Value, handlers: &[&dyn StructuredRenderer]) -> bool {
    for handler in handlers {
        if handler.matches(payload) {
            handler.render_comfy(payload);
            return true;
        }
    }
    false
}

pub fn render_first_matching_markdown(
    payload: &Value,
    handlers: &[&dyn StructuredRenderer],
) -> Option<String> {
    for handler in handlers {
        if handler.matches(payload) {
            return Some(handler.render_markdown(payload));
        }
    }
    None
}
