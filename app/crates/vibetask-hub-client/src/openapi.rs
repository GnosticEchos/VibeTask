//! Agent Hub API client generated at build time from `hub/src/openapi.json`.
//!
//! Regenerated via `build.rs` (Progenitor). Routes included: `/api/agent/*`.
//! Use [`HubOpenApiClient`] for typed, spec-aligned calls; [`crate::VibeTaskClient`]
//! adds API-key auth, retries, and circuit breaking.

include!(concat!(env!("OUT_DIR"), "/generated.rs"));

/// OpenAPI-generated HTTP client for agent routes.
pub use Client as HubOpenApiClient;
