use serde_json::Value;

/// Per-project task count for fleet overview, aligned with hub `ProjectStats` scope semantics.
pub fn fleet_task_count_for_scope(project: &Value, scope: &str) -> i64 {
    if scope == "main" && project.get("mainBoardTasks").is_some() {
        return project
            .get("mainBoardTasks")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
    }
    project
        .get("totalTasks")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
}

pub fn fleet_summary_line(project_count: usize, scope: &str, scoped_total: i64) -> String {
    match scope {
        "main" => format!("{project_count} projects, {scoped_total} tasks on main board"),
        "all" => format!("{project_count} projects, {scoped_total} total tasks"),
        s if s.starts_with("workspace:") => {
            format!("{project_count} projects, {scoped_total} tasks ({s})")
        }
        _ => format!("{project_count} projects, {scoped_total} total tasks"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fleet_summary_line_respects_main_scope() {
        assert_eq!(
            fleet_summary_line(9, "main", 71),
            "9 projects, 71 tasks on main board"
        );
        assert_eq!(
            fleet_summary_line(9, "all", 128),
            "9 projects, 128 total tasks"
        );
    }

    #[test]
    fn fleet_task_count_for_scope_uses_main_board_tasks() {
        let project = json!({
            "mainBoardTasks": 44,
            "totalTasks": 81
        });
        assert_eq!(fleet_task_count_for_scope(&project, "main"), 44);
        assert_eq!(fleet_task_count_for_scope(&project, "all"), 81);
    }
}
