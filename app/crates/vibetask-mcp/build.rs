use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Tell cargo to rerun if the OpenAPI spec changes
    println!("cargo:rerun-if-changed=../KanbanAPI/openapi.json");

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("generated_types.rs");

    // Read the OpenAPI spec
    let spec_path = "../KanbanAPI/openapi.json";
    if !Path::new(spec_path).exists() {
        // If the spec doesn't exist, create a minimal stub
        let stub_content = r#"
// Generated types stub - OpenAPI spec not found
use serde::{Deserialize, Serialize};
use schemars::JsonSchema;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AgentMeResponse {
    pub agent: AgentInfo,
    pub delegations: Vec<Delegation>,
    #[serde(rename = "apiAllowance")]
    pub api_allowance: ApiAllowance,
}

// ... rest of stub types
"#;

        fs::write(&dest_path, stub_content).unwrap();
        return;
    }

    // OpenAPI spec exists, but /api/agent/me response schema is not fully defined
    // Use our custom template that includes the missing AgentMeResponse type
    // This is a hybrid approach: we have the real spec but need custom types for missing schemas

    println!("cargo:warning=Using custom generated types template - OpenAPI spec exists but lacks AgentMeResponse schema");

    let template_content = include_str!("generated_types_template.rs");
    fs::write(&dest_path, template_content).unwrap();

    // TODO: In the future, when the Hub API spec includes AgentMeResponse schema,
    // we can switch to proper OpenAPI code generation using progenitor:
    //
    // let spec = fs::read_to_string(spec_path).unwrap();
    // let generated = progenitor::generate_client(&spec).unwrap();
    // fs::write(&dest_path, generated).unwrap();
}
