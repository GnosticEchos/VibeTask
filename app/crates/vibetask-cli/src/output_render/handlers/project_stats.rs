use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};
use serde_json::Value;

use crate::output_render::registry::StructuredRenderer;
use crate::output_render::util::{json_i64, json_str};

fn project_label(project: &Value) -> String {
    format!(
        "{} ({}) #{}",
        json_str(project, "name"),
        json_str(project, "prefix"),
        json_i64(project, "id")
    )
}

fn project_has_include_buckets(project: &Value) -> bool {
    [
        "documents",
        "workspaces",
        "agentReview",
        "helpRequests",
        "blocked",
    ]
    .iter()
    .any(|key| project.get(*key).is_some())
}

fn fleet_projects_have_bucket(projects: &[Value], key: &str) -> bool {
    projects.iter().any(|p| p.get(key).is_some())
}

fn fleet_bucket_cell(project: &Value, bucket: &str, count_key: &str) -> String {
    project
        .get(bucket)
        .and_then(|v| v.get(count_key))
        .and_then(|v| v.as_i64())
        .map(|n| n.to_string())
        .unwrap_or_else(|| "-".to_string())
}

fn render_comfy_include_buckets(project: &Value) {
    if let Some(docs) = project.get("documents").and_then(|v| v.as_object()) {
        let total = docs
            .get("total")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();
        println!("\nDocuments: {total}");
        if let Some(by_type) = docs.get("byType").and_then(|v| v.as_object()) {
            let mut table = Table::new();
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic)
                .set_header(vec!["Doc type", "Count"]);
            let mut pairs: Vec<_> = by_type.iter().collect();
            pairs.sort_by(|a, b| a.0.cmp(b.0));
            for (doc_type, count) in pairs {
                table.add_row(vec![
                    Cell::new(doc_type.as_str()),
                    Cell::new(count.as_i64().unwrap_or_default()),
                ]);
            }
            println!("{table}");
        }
    }

    if let Some(review) = project.get("agentReview").and_then(|v| v.as_object()) {
        let count = review
            .get("taskCount")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();
        println!("\nAgent review column: {count} task(s)");
        if let Some(ids) = review.get("identifiers").and_then(|v| v.as_array()) {
            if !ids.is_empty() {
                let rendered: Vec<String> = ids
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect();
                println!("  {}", rendered.join(", "));
            }
        }
    }

    if let Some(help) = project.get("helpRequests").and_then(|v| v.as_object()) {
        let open = help
            .get("open")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();
        println!("\nOpen help requests: {open}");
    }

    if let Some(blocked) = project.get("blocked").and_then(|v| v.as_object()) {
        let count = blocked
            .get("taskCount")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();
        println!("\nBlocked tasks: {count}");
    }

    if let Some(workspaces) = project.get("workspaces").and_then(|v| v.as_object()) {
        let active = workspaces
            .get("activeCount")
            .and_then(|v| v.as_i64())
            .unwrap_or_default();
        println!("\nWorkspaces: {active} active");
        if let Some(items) = workspaces.get("items").and_then(|v| v.as_array()) {
            let mut table = Table::new();
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic)
                .set_header(vec!["ID", "Identifier", "Title", "Children"]);
            for item in items {
                table.add_row(vec![
                    Cell::new(json_i64(item, "id")),
                    Cell::new(json_str(item, "identifier")),
                    Cell::new(json_str(item, "title")),
                    Cell::new(json_i64(item, "childCount")),
                ]);
            }
            println!("{table}");
        }
    }
}

fn render_comfy_fleet_include_details(projects: &[Value]) {
    for project in projects {
        if !project_has_include_buckets(project) {
            continue;
        }
        println!("\n--- {} ---", project_label(project));
        render_comfy_include_buckets(project);
    }
}

struct FleetIncludeColumns {
    documents: bool,
    workspaces: bool,
    agent_review: bool,
    help_requests: bool,
    blocked: bool,
}

impl FleetIncludeColumns {
    fn detect(projects: &[Value]) -> Self {
        Self {
            documents: fleet_projects_have_bucket(projects, "documents"),
            workspaces: fleet_projects_have_bucket(projects, "workspaces"),
            agent_review: fleet_projects_have_bucket(projects, "agentReview"),
            help_requests: fleet_projects_have_bucket(projects, "helpRequests"),
            blocked: fleet_projects_have_bucket(projects, "blocked"),
        }
    }

    fn any(&self) -> bool {
        self.documents || self.workspaces || self.agent_review || self.help_requests || self.blocked
    }
}

fn render_comfy_fleet_table(projects: &[Value], scope: &str) {
    let include = FleetIncludeColumns::detect(projects);
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic);

    let mut header = if scope == "main" {
        vec![
            "ID".to_string(),
            "Prefix".to_string(),
            "Name".to_string(),
            "Main board".to_string(),
            "All tasks".to_string(),
        ]
    } else {
        vec![
            "ID".to_string(),
            "Prefix".to_string(),
            "Name".to_string(),
            "Total tasks".to_string(),
            "Main board".to_string(),
        ]
    };
    if include.documents {
        header.push("Docs".to_string());
    }
    if include.workspaces {
        header.push("WS".to_string());
    }
    if include.agent_review {
        header.push("Review".to_string());
    }
    if include.help_requests {
        header.push("Help".to_string());
    }
    if include.blocked {
        header.push("Blocked".to_string());
    }
    header.push("Formality".to_string());
    table.set_header(header);

    for row in projects {
        let mut cells = vec![
            Cell::new(json_i64(row, "id")),
            Cell::new(json_str(row, "prefix")),
            Cell::new(json_str(row, "name")),
        ];
        if scope == "main" {
            cells.push(Cell::new(json_i64(row, "mainBoardTasks")));
            cells.push(Cell::new(json_i64(row, "totalTasks")));
        } else {
            cells.push(Cell::new(json_i64(row, "totalTasks")));
            cells.push(Cell::new(json_i64(row, "mainBoardTasks")));
        }
        if include.documents {
            cells.push(Cell::new(fleet_bucket_cell(row, "documents", "total")));
        }
        if include.workspaces {
            cells.push(Cell::new(fleet_bucket_cell(
                row,
                "workspaces",
                "activeCount",
            )));
        }
        if include.agent_review {
            cells.push(Cell::new(fleet_bucket_cell(
                row,
                "agentReview",
                "taskCount",
            )));
        }
        if include.help_requests {
            cells.push(Cell::new(fleet_bucket_cell(row, "helpRequests", "open")));
        }
        if include.blocked {
            cells.push(Cell::new(fleet_bucket_cell(row, "blocked", "taskCount")));
        }
        cells.push(Cell::new(
            row.get("formality")
                .or_else(|| row.get("formalityLevel"))
                .and_then(|v| v.as_str())
                .unwrap_or("-"),
        ));
        table.add_row(cells);
    }

    println!("{table}");

    if include.any() {
        render_comfy_fleet_include_details(projects);
    }
}

fn project_stats_summary_line(payload: &Value, project: &Value) -> Option<String> {
    payload
        .get("summary_line")
        .or_else(|| payload.get("summaryLine"))
        .or_else(|| project.get("summaryLine"))
        .or_else(|| project.get("summary_line"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn render_comfy_project_stats(project: &Value, header: Option<&str>) {
    if let Some(line) = header {
        println!("{line}\n");
    }

    let mut meta = Table::new();
    meta.load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(vec!["Field", "Value"]);
    meta.add_row(vec![
        Cell::new("Project"),
        Cell::new(format!(
            "{} ({}) #{}",
            json_str(project, "name"),
            json_str(project, "prefix"),
            json_i64(project, "id")
        )),
    ]);
    if project.get("formalityLevel").is_some() {
        meta.add_row(vec![
            Cell::new("Formality"),
            Cell::new(json_str(project, "formalityLevel")),
        ]);
    }
    if project.get("mainBoardTasks").is_some() {
        meta.add_row(vec![
            Cell::new("Main board tasks"),
            Cell::new(json_i64(project, "mainBoardTasks")),
        ]);
    }
    meta.add_row(vec![
        Cell::new("Total tasks"),
        Cell::new(json_i64(project, "totalTasks")),
    ]);
    if project.get("workspaceContainers").is_some() {
        meta.add_row(vec![
            Cell::new("Workspaces"),
            Cell::new(format!(
                "{} containers, {} child tasks",
                json_i64(project, "workspaceContainers"),
                json_i64(project, "workspaceChildTasks")
            )),
        ]);
    }
    println!("{meta}");

    if let Some(columns) = project.get("columns").and_then(|v| v.as_array()) {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .set_content_arrangement(ContentArrangement::Dynamic)
            .set_header(vec!["Column", "Role", "Count", "Main", "All"]);
        for col in columns {
            let count = col
                .get("taskCount")
                .and_then(|v| v.as_i64())
                .unwrap_or_default();
            let main = col
                .get("taskCountMain")
                .map(|v| v.as_i64().unwrap_or_default().to_string())
                .unwrap_or_else(|| "-".to_string());
            let all = col
                .get("taskCountAll")
                .map(|v| v.as_i64().unwrap_or_default().to_string())
                .unwrap_or_else(|| "-".to_string());
            table.add_row(vec![
                Cell::new(json_str(col, "name")),
                Cell::new(json_str(col, "roleType")),
                Cell::new(count),
                Cell::new(main),
                Cell::new(all),
            ]);
        }
        println!("\n{table}");
    }

    render_comfy_include_buckets(project);
}

fn render_project_stats_comfy(payload: &Value) -> bool {
    if let Some(project) = payload
        .get("project")
        .filter(|p| p.get("columns").and_then(|c| c.as_array()).is_some())
    {
        let mut header = project_stats_summary_line(payload, project);
        if let Some(scope) = payload.get("scope").and_then(|v| v.as_str()) {
            if !scope.is_empty() {
                header = Some(format!(
                    "{}{}",
                    header.as_deref().unwrap_or(""),
                    if header.is_some() {
                        format!(" (scope: {scope})")
                    } else {
                        format!("scope: {scope}")
                    }
                ));
            }
        }
        if let Some(include) = payload.get("include").and_then(|v| v.as_str()) {
            if !include.is_empty() {
                let suffix = format!("include: {include}");
                header = Some(match header {
                    Some(h) => format!("{h}; {suffix}"),
                    None => suffix,
                });
            }
        }
        render_comfy_project_stats(project, header.as_deref());
        return true;
    }

    if payload.get("projectCount").is_some() {
        let scope = payload
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("main");
        if let Some(line) = payload.get("summary_line").and_then(|v| v.as_str()) {
            println!("{line}\n");
        }
        if let Some(projects) = payload.get("projects").and_then(|v| v.as_array()) {
            if projects.len() == 1 {
                if let Some(project) = projects.first() {
                    render_comfy_project_stats(project, None);
                    return true;
                }
            }
            render_comfy_fleet_table(projects, scope);
        }
        return true;
    }

    false
}

fn render_markdown_project_stats(project: &Value, header: Option<&str>) -> String {
    let mut md = String::new();
    md.push_str("## Project stats\n\n");
    if let Some(line) = header {
        md.push_str(&format!("{line}\n\n"));
    }
    md.push_str(&format!(
        "- **{}** (`{}`, id `{}`)\n",
        json_str(project, "name"),
        json_str(project, "prefix"),
        json_i64(project, "id")
    ));
    if project.get("formalityLevel").is_some() {
        md.push_str(&format!(
            "- Formality: {}\n",
            json_str(project, "formalityLevel")
        ));
    }
    if project.get("mainBoardTasks").is_some() {
        md.push_str(&format!(
            "- Main board tasks: {}\n",
            json_i64(project, "mainBoardTasks")
        ));
    }
    md.push_str(&format!(
        "- Total tasks: {}\n",
        json_i64(project, "totalTasks")
    ));
    if project.get("workspaceContainers").is_some() {
        md.push_str(&format!(
            "- Workspaces: {} containers, {} child tasks\n",
            json_i64(project, "workspaceContainers"),
            json_i64(project, "workspaceChildTasks")
        ));
    }
    md.push('\n');

    if let Some(columns) = project.get("columns").and_then(|v| v.as_array()) {
        md.push_str("### Columns\n\n");
        md.push_str("| Column | Role | Count | Main | All |\n");
        md.push_str("| --- | --- | ---: | ---: | ---: |\n");
        for col in columns {
            let main = col
                .get("taskCountMain")
                .map(|v| v.as_i64().unwrap_or_default().to_string())
                .unwrap_or_else(|| "-".to_string());
            let all = col
                .get("taskCountAll")
                .map(|v| v.as_i64().unwrap_or_default().to_string())
                .unwrap_or_else(|| "-".to_string());
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                json_str(col, "name"),
                json_str(col, "roleType"),
                json_i64(col, "taskCount"),
                main,
                all
            ));
        }
        md.push('\n');
    }

    if let Some(docs) = project.get("documents").and_then(|v| v.as_object()) {
        md.push_str("### Documents\n\n");
        md.push_str(&format!(
            "- Total: {}\n",
            docs.get("total")
                .and_then(|v| v.as_i64())
                .unwrap_or_default()
        ));
        if let Some(by_type) = docs.get("byType").and_then(|v| v.as_object()) {
            let mut pairs: Vec<_> = by_type.iter().collect();
            pairs.sort_by(|a, b| a.0.cmp(b.0));
            for (doc_type, count) in pairs {
                md.push_str(&format!(
                    "- {}: {}\n",
                    doc_type,
                    count.as_i64().unwrap_or_default()
                ));
            }
        }
        md.push('\n');
    }

    if let Some(review) = project.get("agentReview").and_then(|v| v.as_object()) {
        md.push_str("### Agent review\n\n");
        md.push_str(&format!(
            "- Tasks in review column: {}\n",
            review
                .get("taskCount")
                .and_then(|v| v.as_i64())
                .unwrap_or_default()
        ));
        if let Some(ids) = review.get("identifiers").and_then(|v| v.as_array()) {
            if !ids.is_empty() {
                let rendered: Vec<String> = ids
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect();
                md.push_str(&format!("- Identifiers: {}\n", rendered.join(", ")));
            }
        }
        md.push('\n');
    }

    if let Some(help) = project.get("helpRequests").and_then(|v| v.as_object()) {
        md.push_str(&format!(
            "### Help requests\n\n- Open: {}\n\n",
            help.get("open")
                .and_then(|v| v.as_i64())
                .unwrap_or_default()
        ));
    }

    if let Some(blocked) = project.get("blocked").and_then(|v| v.as_object()) {
        md.push_str(&format!(
            "### Blocked\n\n- Task count: {}\n\n",
            blocked
                .get("taskCount")
                .and_then(|v| v.as_i64())
                .unwrap_or_default()
        ));
    }

    if let Some(workspaces) = project.get("workspaces").and_then(|v| v.as_object()) {
        md.push_str("### Workspaces\n\n");
        md.push_str(&format!(
            "- Active: {}\n",
            workspaces
                .get("activeCount")
                .and_then(|v| v.as_i64())
                .unwrap_or_default()
        ));
        if let Some(items) = workspaces.get("items").and_then(|v| v.as_array()) {
            for item in items {
                md.push_str(&format!(
                    "- `{}` {} — {} ({} children)\n",
                    json_str(item, "identifier"),
                    json_str(item, "title"),
                    json_i64(item, "id"),
                    json_i64(item, "childCount")
                ));
            }
        }
        md.push('\n');
    }

    md
}

fn render_project_stats_markdown(payload: &Value) -> Option<String> {
    if let Some(project) = payload
        .get("project")
        .filter(|p| p.get("columns").and_then(|c| c.as_array()).is_some())
    {
        let mut header = project_stats_summary_line(payload, project);
        if let Some(scope) = payload.get("scope").and_then(|v| v.as_str()) {
            if !scope.is_empty() {
                header = Some(format!(
                    "{}{}",
                    header.as_deref().unwrap_or(""),
                    if header.is_some() {
                        format!(" (scope: {scope})")
                    } else {
                        format!("scope: {scope}")
                    }
                ));
            }
        }
        if let Some(include) = payload.get("include").and_then(|v| v.as_str()) {
            if !include.is_empty() {
                let suffix = format!("include: {include}");
                header = Some(match header {
                    Some(h) => format!("{h}; {suffix}"),
                    None => suffix,
                });
            }
        }
        return Some(render_markdown_project_stats(project, header.as_deref()));
    }

    if payload.get("projectCount").is_some() {
        let mut md = String::new();
        if let Some(line) = payload.get("summary_line").and_then(|v| v.as_str()) {
            md.push_str(&format!("## Project overview\n\n{line}\n\n"));
        } else {
            md.push_str("## Project overview\n\n");
        }
        if let Some(projects) = payload.get("projects").and_then(|v| v.as_array()) {
            if projects.len() == 1 {
                if let Some(project) = projects.first() {
                    md.push_str(&render_markdown_project_stats(project, None));
                    return Some(md);
                }
            }
            let scope = payload
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or("main");
            if scope == "main" {
                md.push_str("| ID | Prefix | Name | Main board | All tasks |\n");
                md.push_str("| ---: | --- | --- | ---: | ---: |\n");
                for row in projects {
                    md.push_str(&format!(
                        "| {} | {} | {} | {} | {} |\n",
                        json_i64(row, "id"),
                        json_str(row, "prefix"),
                        json_str(row, "name"),
                        json_i64(row, "mainBoardTasks"),
                        json_i64(row, "totalTasks")
                    ));
                }
            } else {
                md.push_str("| ID | Prefix | Name | Total tasks | Main board |\n");
                md.push_str("| ---: | --- | --- | ---: | ---: |\n");
                for row in projects {
                    md.push_str(&format!(
                        "| {} | {} | {} | {} | {} |\n",
                        json_i64(row, "id"),
                        json_str(row, "prefix"),
                        json_str(row, "name"),
                        json_i64(row, "totalTasks"),
                        json_i64(row, "mainBoardTasks")
                    ));
                }
            }
            md.push('\n');
        }
        return Some(md);
    }

    None
}

pub struct ProjectStatsRenderer;

impl StructuredRenderer for ProjectStatsRenderer {
    fn id(&self) -> &'static str {
        "project_stats"
    }

    fn matches(&self, payload: &Value) -> bool {
        payload
            .get("project")
            .filter(|p| p.get("columns").and_then(|c| c.as_array()).is_some())
            .is_some()
            || payload.get("projectCount").is_some()
    }

    fn render_comfy(&self, payload: &Value) {
        let _ = render_project_stats_comfy(payload);
    }

    fn render_markdown(&self, payload: &Value) -> String {
        render_project_stats_markdown(payload).unwrap_or_default()
    }
}
