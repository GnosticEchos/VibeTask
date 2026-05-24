//! Human- and machine-readable task references (identifier vs numeric API id).

use crate::error::ApiError;
use crate::tools::parse_compound_task_id;
use crate::vibetask_client::VibeTaskClient;

/// Dual label for CLI/MCP output, e.g. `SPEC-71 (task id 193, project 10)`.
pub fn format_task_label(identifier: &str, task_id: i32, project_id: i32) -> String {
    format!("{identifier} (task id {task_id}, project {project_id})")
}

/// Structured ids for JSON tool/CLI responses.
pub fn task_ref_json(identifier: &str, task_id: i32, project_id: i32) -> serde_json::Value {
    serde_json::json!({
        "identifier": identifier,
        "id": task_id,
        "projectId": project_id,
        "label": format_task_label(identifier, task_id, project_id),
    })
}

/// Resolve a task reference to the numeric Hub task id.
///
/// Accepts: plain numeric id (`193`), compound verify id (`10-152`), or board identifier (`SPEC-71`).
pub async fn resolve_numeric_task_id(
    client: &VibeTaskClient,
    api_key: &str,
    project_id: i32,
    task_ref: &str,
) -> Result<i32, ApiError> {
    let trimmed = task_ref.trim();
    if trimmed.is_empty() {
        return Err(ApiError::InvalidInput(
            "task reference cannot be empty".to_string(),
        ));
    }

    if let Ok(id) = trimmed.parse::<i32>() {
        return Ok(id);
    }

    if let Ok((compound_project, task_id)) = parse_compound_task_id(trimmed) {
        if compound_project != project_id {
            return Err(ApiError::InvalidInput(format!(
                "compound task id {trimmed} is for project {compound_project}, not project {project_id}"
            )));
        }
        return Ok(task_id);
    }

    let search = client
        .search_tasks(api_key, trimmed, None, Some(1), Some(50), &[])
        .await?;

    let exact: Vec<_> = search
        .tasks
        .iter()
        .filter(|row| row.project_id == project_id)
        .filter(|row| row.identifier.eq_ignore_ascii_case(trimmed))
        .collect();

    match exact.len() {
        1 => Ok(exact[0].id),
        0 => {
            let in_project: Vec<_> = search
                .tasks
                .iter()
                .filter(|row| row.project_id == project_id)
                .collect();
            if in_project.len() == 1 {
                Ok(in_project[0].id)
            } else {
                Err(ApiError::InvalidInput(format!(
                    "no task with identifier '{trimmed}' in project {project_id}"
                )))
            }
        }
        _ => Err(ApiError::InvalidInput(format!(
            "ambiguous identifier '{trimmed}' in project {project_id} ({} matches)",
            exact.len()
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_task_label_includes_all_parts() {
        assert_eq!(
            format_task_label("SPEC-71", 193, 10),
            "SPEC-71 (task id 193, project 10)"
        );
    }
}
