//! Generates the Hub HTTP client from the monorepo OpenAPI spec via Progenitor.

use std::path::Path;

fn main() {
    let spec_path = "../../../hub/src/openapi.json";
    println!("cargo:rerun-if-changed={}", spec_path);

    let raw = std::fs::read_to_string(spec_path).expect("read hub OpenAPI spec");
    let full: serde_json::Value = serde_json::from_str(&raw).expect("parse hub OpenAPI JSON");

    let subset = agent_api_subset(&full);
    let subset_json =
        serde_json::to_string(&subset).expect("serialize agent API OpenAPI subset");

    let spec: openapiv3::OpenAPI =
        serde_json::from_str(&subset_json).expect("parse agent API subset as OpenAPI v3");

    let mut generator = progenitor::Generator::default();
    let tokens = generator
        .generate_tokens(&spec)
        .expect("progenitor generate agent API client");

    let ast = syn::parse2(tokens).expect("parse progenitor output");
    let content = prettyplease::unparse(&ast);

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir).join("generated.rs");
    std::fs::write(&out_path, content).expect("write generated.rs");
}

fn agent_api_subset(full: &serde_json::Value) -> serde_json::Value {
    let paths = full
        .get("paths")
        .and_then(|p| p.as_object())
        .expect("OpenAPI paths object");

    let agent_paths: serde_json::Map<String, serde_json::Value> = paths
        .iter()
        .filter(|(path, _)| path.starts_with("/api/agent/"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    serde_json::json!({
        "openapi": full.get("openapi").cloned().unwrap_or_else(|| serde_json::json!("3.0.3")),
        "info": full.get("info").cloned().unwrap_or_else(|| serde_json::json!({
            "title": "VibeTask Agent API",
            "version": "1.0.0"
        })),
        "paths": agent_paths,
        "components": full.get("components").cloned().unwrap_or_else(|| serde_json::json!({})),
    })
}
