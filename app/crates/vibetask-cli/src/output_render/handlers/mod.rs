pub mod planning_preview;
pub mod project_stats;

use crate::output_render::registry::StructuredRenderer;

pub use planning_preview::PlanningPreviewRenderer;
pub use project_stats::ProjectStatsRenderer;

pub fn all_handlers() -> [&'static dyn StructuredRenderer; 2] {
    [
        &PlanningPreviewRenderer,
        &ProjectStatsRenderer,
    ]
}
