//! Generates the Hub HTTP client from the monorepo OpenAPI spec via Progenitor.

use std::path::Path;

fn main() {
    let spec_path = "../../../hub/src/openapi.json";
    println!("cargo:rerun-if-changed={}", spec_path);

    let raw = std::fs::read_to_string(spec_path).expect("read hub OpenAPI spec");

    let mut spec: openapiv3::OpenAPI =
        serde_json::from_str(&raw).expect("parse hub OpenAPI as OpenAPI v3");

    spec.paths
        .paths
        .retain(|path, _| path.starts_with("/api/agent/"));

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
