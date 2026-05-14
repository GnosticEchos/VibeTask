use super::*;

//*********************//
//  EstimateComplexityTool  //
//*********************//
#[mcp_tool(
    name = "estimate_complexity",
    description = "Estimate task complexity based on implementation plan content. Available only in Plan column.",
    title = "Estimate Complexity",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = true
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct EstimateComplexityTool {
    /// Implementation plan content to analyze
    pub implementation_plan: String,
    /// Optional: Provide task names to focus analysis on specific tasks
    pub focus_tasks: Option<Vec<String>>,
}

impl EstimateComplexityTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Starting complexity estimation");

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "estimate_complexity")?;

        // Parse implementation plan into tasks
        let mut implementation_plan = crate::domain::ImplementationPlan::new(
            "Complexity Analysis".to_string(),
            self.implementation_plan.clone(),
        );

        implementation_plan
            .parse_tasks_from_content()
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to parse implementation plan: {}", e),
                )
            })?;

        // Create validator for complexity analysis
        let validator = crate::atomicity_validator::TaskAtomicityValidator::new();

        let mut response = "📊 Task Complexity Analysis\n\n".to_string();

        // Filter tasks if focus_tasks is provided
        let tasks_to_analyze: Vec<_> = if let Some(focus_names) = &self.focus_tasks {
            implementation_plan
                .tasks
                .iter()
                .filter(|task| focus_names.contains(&task.name))
                .collect()
        } else {
            implementation_plan.tasks.iter().collect()
        };

        if tasks_to_analyze.is_empty() {
            return Ok(CallToolResult::text_content(vec![TextContent::from(
                "No tasks found to analyze. Check implementation plan format.".to_string(),
            )]));
        }

        response.push_str(&format!("Analyzing {} tasks:\n\n", tasks_to_analyze.len()));

        // Analyze each task
        let mut total_complexity = 0u32;
        let mut total_files = 0u32;
        let mut high_complexity_tasks = Vec::new();
        let mut validation_issues = Vec::new();

        for (index, task) in tasks_to_analyze.iter().enumerate() {
            let calculated_complexity = validator.calculate_complexity_score(task);
            total_complexity += calculated_complexity as u32;
            total_files += task.estimated_files as u32;

            response.push_str(&format!("{}. **{}**\n", index + 1, task.name));
            response.push_str(&format!(
                "   📁 Files: {} | 🧮 Complexity: {}/10 | 📋 Requirements: {}\n",
                task.estimated_files,
                calculated_complexity,
                task.requirements_refs.len()
            ));

            // Complexity breakdown
            let base_score = task.estimated_files;
            let dep_score = (task.dependencies.len() as u8).min(3);
            let req_score = (task.requirements_refs.len() as u8 / 2).min(2);

            response.push_str(&format!(
                "   📈 Breakdown: Files({}) + Dependencies({}) + Requirements({}) = {}\n",
                base_score, dep_score, req_score, calculated_complexity
            ));

            // Check for complexity indicators in description
            let complexity_indicators = self.analyze_complexity_indicators(&task.description);
            if !complexity_indicators.is_empty() {
                response.push_str(&format!(
                    "   ⚠️  Complexity Indicators: {}\n",
                    complexity_indicators.join(", ")
                ));
            }

            // Validate task atomicity
            if let Err(validation_error) = validator.validate_task(task) {
                validation_issues.push((task.name.clone(), validation_error.to_string()));
                response.push_str(&format!("   ❌ Validation Issue: {}\n", validation_error));
            } else {
                response.push_str("   ✅ Passes atomicity validation\n");
            }

            // Track high complexity tasks
            if calculated_complexity > 6 {
                high_complexity_tasks.push((task.name.clone(), calculated_complexity));
            }

            response.push('\n');
        }

        // Overall analysis
        response.push_str("📈 Overall Analysis:\n\n");
        response.push_str(&format!(
            "• Total Tasks: {}\n\
            • Total Estimated Files: {}\n\
            • Average Complexity: {:.1}/10\n\
            • Total Complexity Score: {}\n",
            tasks_to_analyze.len(),
            total_files,
            total_complexity as f32 / tasks_to_analyze.len() as f32,
            total_complexity
        ));

        // Risk assessment
        response.push_str("\n🎯 Risk Assessment:\n\n");

        let avg_complexity = total_complexity as f32 / tasks_to_analyze.len() as f32;
        if avg_complexity > 7.0 {
            response.push_str("🔴 **HIGH RISK**: Average complexity is very high. Consider breaking down tasks further.\n");
        } else if avg_complexity > 5.0 {
            response.push_str(
                "🟡 **MEDIUM RISK**: Some tasks may be complex. Review high-complexity items.\n",
            );
        } else {
            response.push_str("🟢 **LOW RISK**: Tasks appear well-scoped and atomic.\n");
        }

        // High complexity tasks
        if !high_complexity_tasks.is_empty() {
            response.push_str("\n⚠️  High Complexity Tasks (>6/10):\n");
            for (name, score) in high_complexity_tasks {
                response.push_str(&format!("• {} ({})\n", name, score));
            }
        }

        // Validation issues summary
        if !validation_issues.is_empty() {
            response.push_str("\n❌ Validation Issues Found:\n");
            for (name, issue) in validation_issues {
                response.push_str(&format!("• {}: {}\n", name, issue));
            }
            response.push_str("\n💡 Fix these issues before creating sub-board.\n");
        } else {
            response.push_str("\n✅ All tasks pass atomicity validation.\n");
        }

        // Recommendations
        response.push_str("\n💡 Recommendations:\n");
        response.push_str("• Tasks with >3 files should be broken down further\n");
        response.push_str("• Tasks with complexity >8 may need simplification\n");
        response.push_str("• Ensure each task has clear requirements references\n");
        response.push_str("• Use spawn_sub_board when ready to create tasks\n");

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    /// Analyze description for complexity indicators
    fn analyze_complexity_indicators(&self, description: &str) -> Vec<String> {
        let mut indicators = Vec::new();
        let desc_lower = description.to_lowercase();

        let patterns = [
            ("refactor", "Refactoring"),
            ("restructure", "Restructuring"),
            ("redesign", "Redesigning"),
            ("integrate", "Integration"),
            ("migration", "Migration"),
            ("upgrade", "Upgrade"),
            ("multiple", "Multiple components"),
            ("several", "Several components"),
            ("complex", "Complex logic"),
            ("complicated", "Complicated implementation"),
            ("advanced", "Advanced features"),
            ("database", "Database operations"),
            ("api", "API integration"),
            ("network", "Network operations"),
            ("security", "Security considerations"),
        ];

        for (pattern, indicator) in patterns {
            if desc_lower.contains(pattern) {
                indicators.push(indicator.to_string());
            }
        }

        indicators
    }
}

//*********************//
//  SpawnSubBoardTool  //
//*********************//
#[mcp_tool(
    name = "spawn_sub_board",
    description = "Parse IMPLEMENTATION_PLAN.md and create atomic sub-tasks with parent-child relationships. Available only in Plan column.",
    title = "Spawn Sub-Board",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct SpawnSubBoardTool {
    /// Parent task ID that will contain the sub-tasks
    pub parent_task_id: i32,
    /// Implementation plan content to parse for sub-tasks
    pub implementation_plan: String,
    /// Optional: Specify project ID if not inferrable from context
    pub project_id: Option<i32>,
}

impl SpawnSubBoardTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Starting spawn_sub_board for parent task {}",
            self.parent_task_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "spawn_sub_board")?;
        let api_key = &active.api_key;

        // STEP 1: Get parent task details to validate context and get project ID
        let project_id = if let Some(pid) = self.project_id {
            pid
        } else {
            // Try to infer project ID from parent task
            // For now, we'll require it to be provided
            return Err(tool_error(
                "runtime",
                "project_id must be provided".to_string(),
            ));
        };

        let parent_task = ctx
            .api_client
            .get_task_details(api_key, project_id, self.parent_task_id, &[], true, true)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to get parent task details: {}", e),
                )
            })?;

        // STEP 2: Validate that parent task is in Plan column
        if parent_task.column.name != "Plan" {
            return Err(tool_error(
                "runtime",
                format!(
                "spawn_sub_board can only be used in Plan column. Parent task is in '{}' column",
                parent_task.column.name
            ),
            ));
        }

        // STEP 3: Check if parent task has a ratified specification
        let has_ratified_spec = parent_task
            .linked_documents
            .as_ref()
            .unwrap_or(&vec![])
            .iter()
            .any(|doc| {
                doc.role == crate::generated_types::DocumentRole::Specification
                    && doc.title.contains("[RATIFIED]")
            });

        if !has_ratified_spec {
            return Err(tool_error("runtime", 
                "Parent task must have a ratified specification ([RATIFIED] in title) before creating sub-board".to_string(),
            ));
        }

        // STEP 4: Parse implementation plan into tasks using domain logic
        let mut implementation_plan = crate::domain::ImplementationPlan::new(
            "Implementation Plan".to_string(),
            self.implementation_plan.clone(),
        );

        implementation_plan
            .parse_tasks_from_content()
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to parse implementation plan: {}", e),
                )
            })?;

        // STEP 5: Validate task atomicity with detailed reporting
        let validator = crate::atomicity_validator::TaskAtomicityValidator::new();

        // First, validate the entire task set
        if let Err(validation_error) = validator.validate_task_set(&implementation_plan.tasks) {
            return Err(tool_error("runtime", format!(
                "Task set validation failed: {}\n\n\
                💡 Use 'estimate_complexity' tool to analyze and fix issues before creating sub-board.",
                validation_error
            )));
        }

        // Calculate overall complexity metrics
        let total_complexity: u32 = implementation_plan
            .tasks
            .iter()
            .map(|t| validator.calculate_complexity_score(t) as u32)
            .sum();
        let avg_complexity = total_complexity as f32 / implementation_plan.tasks.len() as f32;
        let total_files: u32 = implementation_plan
            .tasks
            .iter()
            .map(|t| t.estimated_files as u32)
            .sum();

        // STEP 6: Create sub-tasks via Hub API
        let mut created_tasks = Vec::new();
        let mut response_summary =
            format!("🎯 Sub-Board Created for Task '{}'\n\n", parent_task.name);

        response_summary.push_str(&format!(
            "📋 Parsed {} atomic tasks from implementation plan:\n\n",
            implementation_plan.tasks.len()
        ));

        // Provide detailed validation report
        response_summary.push_str("✅ Atomicity Validation Passed:\n");
        response_summary.push_str("• No duplicate task names found\n");
        response_summary.push_str("• No reserved names used\n");
        response_summary.push_str("• No dependency cycles detected\n");
        response_summary.push_str("• All tasks meet complexity limits\n\n");

        response_summary.push_str(&format!(
            "📊 Complexity Analysis:\n\
            • Total Complexity Score: {}\n\
            • Average Complexity: {:.1}/10\n\
            • Total Estimated Files: {}\n\
            • Risk Level: {}\n\n",
            total_complexity,
            avg_complexity,
            total_files,
            if avg_complexity > 7.0 {
                "🔴 HIGH"
            } else if avg_complexity > 5.0 {
                "🟡 MEDIUM"
            } else {
                "🟢 LOW"
            }
        ));

        // Get the Plan column ID for the project (assuming it exists)
        let plan_column_id = parent_task.column_id;

        for (index, task) in implementation_plan.tasks.iter().enumerate() {
            // Create task request
            let create_request = CreateTaskRequest {
                project_id,
                name: task.name.clone(),
                description: Some(task.description.clone()),
                assignee_id: None, // Let project manager assign
                project_column_id: Some(plan_column_id), // Start in Plan column
                parent_id: Some(self.parent_task_id),
                relation_id: None,
                relation_mode: None,
            };

            match self
                .create_task_via_api(api_key, &create_request, ctx)
                .await
            {
                Ok(created_task) => {
                    created_tasks.push(created_task.clone());
                    response_summary.push_str(&format!(
                        "{}. ✅ {} (ID: {})\n",
                        index + 1,
                        created_task.name,
                        created_task.id
                    ));
                    response_summary.push_str(&format!(
                        "   📁 Est. Files: {} | Complexity: {} | Requirements: {}\n",
                        task.estimated_files,
                        validator.calculate_complexity_score(task),
                        task.requirements_refs.join(", ")
                    ));
                }
                Err(e) => {
                    response_summary.push_str(&format!(
                        "{}. ❌ {} - Failed: {}\n",
                        index + 1,
                        task.name,
                        e
                    ));
                }
            }
        }

        // STEP 7: Update parent task to mark as container with plan accepted
        // Note: This would typically be done via a separate API call to mark the task as a container
        // For now, we'll just note it in the response

        response_summary.push_str(&format!(
            "\n📊 Summary:\n\
            • Created: {} sub-tasks\n\
            • Parent Task: {} (ID: {})\n\
            • Column: {} → Ready for execution\n\
            • All tasks validated for atomicity\n\
            • Average Complexity: {:.1}/10\n\n",
            created_tasks.len(),
            parent_task.name,
            parent_task.id,
            parent_task.column.name,
            avg_complexity
        ));

        response_summary
            .push_str("🎯 **Checkpoint**: Can create sub-boards with validated atomic tasks\n\n");

        response_summary.push_str("💡 Next Steps:\n");
        response_summary.push_str("• Sub-tasks are ready for assignment and execution\n");
        response_summary.push_str("• Each sub-task references specific requirements\n");
        response_summary.push_str("• Use task management tools to track progress\n");
        response_summary.push_str("• Monitor complexity and adjust scope as needed\n");

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response_summary,
        )]))
    }

    /// Create a task via the Hub API
    async fn create_task_via_api(
        &self,
        api_key: &str,
        request: &CreateTaskRequest,
        ctx: &ToolContext,
    ) -> Result<CreatedTask, String> {
        create_project_task_via_api(ctx, api_key, request).await
    }
}

/// Request structure for creating tasks
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CreateTaskRequest {
    project_id: i32,
    name: String,
    description: Option<String>,
    assignee_id: Option<i32>,
    project_column_id: Option<i32>,
    parent_id: Option<i32>,
    relation_id: Option<i32>,
    relation_mode: Option<String>,
}

/// Response structure for created tasks
#[derive(Debug, Deserialize, Clone)]
struct CreatedTask {
    id: i32,
    name: String,
    identifier: String,
    project_id: i32,
    column_id: i32,
    parent_id: Option<i32>,
}

async fn create_project_task_via_api(
    ctx: &ToolContext,
    api_key: &str,
    request: &CreateTaskRequest,
) -> Result<CreatedTask, String> {
    let body = crate::generated_types::AgentCreateTaskInput {
        name: request.name.clone(),
        description: request.description.clone(),
        column_id: request.project_column_id,
        assignee_id: request.assignee_id,
        parent_id: request.parent_id,
    };

    let response = ctx
        .api_client
        .create_agent_task(api_key, request.project_id, &[], &body)
        .await
        .map_err(|e| format!("API error: {}", e))?;

    let task = response.task;
    let column_id = task
        .project_column_id
        .or_else(|| task.column.as_ref().map(|c| c.id))
        .ok_or_else(|| "Task response missing column id".to_string())?;

    Ok(CreatedTask {
        id: task.id,
        name: task.name,
        identifier: task.identifier,
        project_id: task.project_id,
        column_id,
        parent_id: task.parent_id,
    })
}

async fn resolve_plan_column_id(
    ctx: &ToolContext,
    api_key: &str,
    project_id: i32,
) -> Result<i32, CallToolError> {
    let project = ctx
        .api_client
        .get_project_details(api_key, project_id)
        .await
        .map_err(|e| {
            tool_error(
                "runtime",
                format!(
                    "Failed to load project {} for column resolution: {}",
                    project_id, e
                ),
            )
        })?;

    let columns = project
        .get("project")
        .and_then(|p| p.get("columns"))
        .or_else(|| project.get("columns"))
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            tool_error(
                "runtime",
                format!(
                    "Project {} response did not include a columns array",
                    project_id
                ),
            )
        })?;

    for col in columns {
        let name = col.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if name == "Plan" {
            let id = col
                .get("id")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .ok_or_else(|| {
                    tool_error(
                        "runtime",
                        "Plan column in project response missing id".to_string(),
                    )
                })?;
            return Ok(id);
        }
    }

    Err(tool_error(
        "runtime",
        format!(
            "No column named 'Plan' found for project {}. Pass column_id explicitly.",
            project_id
        ),
    ))
}

//*********************//
//  CreateTaskTool  //
//*********************//
#[mcp_tool(
    name = "create_task",
    description = "Create a standalone task in a project (Hub-enforced permissions). When column_id is omitted, the task is created in the Plan column.",
    title = "Create Task",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct CreateTaskTool {
    /// Project ID where the task should be created
    pub project_id: i32,
    /// Task title
    pub name: String,
    /// Optional task description
    #[serde(default)]
    pub description: Option<String>,
    /// Optional target column id (defaults to Plan when omitted)
    #[serde(default)]
    pub column_id: Option<i32>,
    /// Optional parent task id
    #[serde(default)]
    pub parent_id: Option<i32>,
    /// Optional assignee user id
    #[serde(default)]
    pub assignee_id: Option<i32>,
}

impl CreateTaskTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Creating task '{}' in project {}",
            self.name, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "create_task")?;
        let api_key = &active.api_key;

        let column_id = if let Some(cid) = self.column_id {
            cid
        } else {
            resolve_plan_column_id(ctx, api_key, self.project_id).await?
        };

        let request = CreateTaskRequest {
            project_id: self.project_id,
            name: self.name.clone(),
            description: self.description.clone(),
            assignee_id: self.assignee_id,
            project_column_id: Some(column_id),
            parent_id: self.parent_id,
            relation_id: None,
            relation_mode: None,
        };

        match create_project_task_via_api(ctx, api_key, &request).await {
            Ok(created) => Ok(CallToolResult::text_content(vec![TextContent::from(
                format!(
                    "✅ Task created\n\n\
                    Project: {}\n\
                    Task: {} ({})\n\
                    ID: {}\n\
                    Column ID: {}\n\
                    Parent: {:?}\n",
                    created.project_id,
                    created.name,
                    created.identifier,
                    created.id,
                    created.column_id,
                    created.parent_id
                ),
            )])),
            Err(e) => Err(tool_error(
                "runtime",
                format!("Failed to create task: {}", e),
            )),
        }
    }
}

//*********************//
//  CommitArtifactTool  //
//*********************//
#[mcp_tool(
    name = "commit_artifact",
    description = "Create or update SPECIFICATION.md with ratification support (Specify column only)",
    title = "Commit Artifact",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct CommitArtifactTool {
    /// Project ID where the specification should be created/updated
    pub project_id: i32,
    /// Task ID for column verification and context
    pub task_id: i32,
    /// Title of the specification document
    pub title: String,
    /// Content of the specification in markdown format
    pub content: String,
    /// Whether to ratify the specification (adds [RATIFIED] marker)
    #[serde(default)]
    pub ratify: Option<bool>,
}

impl CommitArtifactTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Executing commit_artifact for project {} task {}",
            self.project_id, self.task_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "commit_artifact")?;
        let api_key = &active.api_key;

        // STEP 1: Verify task exists and get column information
        let task_context = ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to get task context for task {}: {}",
                        self.task_id, e
                    ),
                )
            })?;

        // STEP 2: Verify agent is in Specify column
        let column_name = &task_context.column.name;
        if column_name != "Specify" {
            return Err(tool_error(
                "runtime",
                format!(
                "commit_artifact tool is only available in 'Specify' column. Current column: '{}'",
                column_name
            ),
            ));
        }

        // STEP 3: Create specification with validation
        let mut specification =
            crate::domain::Specification::new(self.title.clone(), self.content.clone());

        // STEP 4: Handle ratification if requested
        let should_ratify = self.ratify.unwrap_or(false);
        if should_ratify {
            specification.ratify().map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Specification validation failed for ratification: {}", e),
                )
            })?;
        }

        // STEP 5: Prepare document for Hub API
        let document_title = if should_ratify && !specification.title.contains("[RATIFIED]") {
            format!("{} [RATIFIED]", specification.title)
        } else {
            specification.title.clone()
        };

        let create_doc_input = serde_json::json!({
            "title": document_title.clone(),
            "content": specification.content.clone(),
            "role": "SPECIFICATION"
        });

        // STEP 6: Check if SPECIFICATION.md already exists
        let existing_docs = ctx
            .api_client
            .get_project_documents(api_key, self.project_id, &[], None, None, None)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to check existing documents: {}", e),
                )
            })?;

        let existing_spec = existing_docs
            .data
            .iter()
            .find(|doc| doc.role == crate::generated_types::DocumentRole::Specification);

        let (document, action) = if let Some(existing_doc) = existing_spec {
            // STEP 7a: Update existing specification
            let patch_input = crate::generated_types::PatchDocumentInput {
                title: Some(document_title.clone()),
                content: Some(specification.content.clone()),
                role: Some(crate::generated_types::DocumentRole::Specification),
            };

            let updated_doc = ctx
                .api_client
                .update_document(api_key, self.project_id, existing_doc.id, &patch_input)
                .await
                .map_err(|e| {
                    tool_error(
                        "runtime",
                        format!("Failed to update existing specification: {}", e),
                    )
                })?;

            (
                serde_json::to_value(updated_doc).unwrap_or_default(),
                "updated",
            )
        } else {
            // STEP 7b: Create new specification
            let new_doc = ctx
                .api_client
                .create_document(api_key, self.project_id, &create_doc_input)
                .await
                .map_err(|e| {
                    tool_error(
                        "runtime",
                        format!("Failed to create specification document: {}", e),
                    )
                })?;

            (new_doc, "created")
        };

        // STEP 8: Note about document linking (manual process for now)
        let linking_note = if let Some(task_docs) = &task_context.linked_documents {
            let document_id = document
                .get("id")
                .and_then(|v: &serde_json::Value| v.as_i64())
                .unwrap_or(0);
            let is_already_linked = task_docs.iter().any(|doc| doc.id == document_id as i32);

            if is_already_linked {
                "✅ Document is already linked to this task".to_string()
            } else {
                "📝 Document created but not automatically linked to task. Link manually in VibeTask UI if needed.".to_string()
            }
        } else {
            "📝 Document created. Link to task manually in VibeTask UI if needed.".to_string()
        };

        let response = Self::format_commit_response(
            action, &document, should_ratify, specification.content.len(), &linking_note,
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    fn format_commit_response(
        action: &str, document: &serde_json::Value, should_ratify: bool,
        content_len: usize, linking_note: &str,
    ) -> String {
        let ratification_status = if should_ratify {
            "✅ RATIFIED - Ready for transition to Plan column"
        } else {
            "📝 DRAFT - Use ratify: true to mark as [RATIFIED]"
        };
        format!(
            "✅ Specification {} successfully\n\n\
            📋 Document Details:\n\
            • Title: {}\n\
            • ID: {}\n\
            • Role: SPECIFICATION\n\
            • Status: {}\n\
            • Content Length: {} characters\n\n\
            🔗 Task Linking: {}\n\n\
            💡 Next Steps:\n\
            {}",
            action,
            document
                .get("title")
                .and_then(|v: &serde_json::Value| v.as_str())
                .unwrap_or("Unknown"),
            document
                .get("id")
                .and_then(|v: &serde_json::Value| v.as_i64())
                .unwrap_or(0),
            ratification_status,
            content_len,
            linking_note,
            if should_ratify {
                "• Task can now transition to 'Plan' column\n\
                • Use spawn_sub_board tool in Plan column to create implementation tasks"
            } else {
                "• Review and refine the specification content\n\
                • Use commit_artifact with ratify: true when ready for implementation\n\
                • Only ratified specifications can transition to Plan column"
            }
        )
    }
}

//*********************************//
//  RequestArchitectureReviewTool  //
//*********************************//
#[mcp_tool(
    name = "request_architecture_review",
    description = "Request technical architecture review for complex specifications (Specify column only)",
    title = "Request Architecture Review",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RequestArchitectureReviewTool {
    /// Project ID where the review document should be created
    pub project_id: i32,
    /// Task ID for column verification and context
    pub task_id: i32,
    /// Title of the architecture review request
    pub title: String,
    /// Technical areas that need review (e.g., "Security", "Performance", "Scalability")
    pub review_areas: Vec<String>,
    /// Specific questions or concerns for the review
    pub questions: Vec<String>,
    /// Priority level of the review (Low, Medium, High, Critical)
    #[serde(default = "default_priority")]
    pub priority: String,
}

fn default_priority() -> String {
    "Medium".to_string()
}

impl RequestArchitectureReviewTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Executing request_architecture_review for project {} task {}",
            self.project_id, self.task_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "request_architecture_review")?;
        let api_key = &active.api_key;

        // STEP 1: Verify task exists and get column information
        let task_context = ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to get task context for task {}: {}",
                        self.task_id, e
                    ),
                )
            })?;

        // STEP 2: Verify agent is in Specify column
        let column_name = &task_context.column.name;
        if column_name != "Specify" {
            return Err(tool_error("runtime", format!(
                "request_architecture_review tool is only available in 'Specify' column. Current column: '{}'",
                column_name
            )));
        }

        // STEP 3: Validate inputs
        if self.review_areas.is_empty() {
            return Err(tool_error(
                "runtime",
                "At least one review area must be specified".to_string(),
            ));
        }

        if self.questions.is_empty() {
            return Err(tool_error(
                "runtime",
                "At least one question or concern must be specified".to_string(),
            ));
        }

        let valid_priorities = ["Low", "Medium", "High", "Critical"];
        if !valid_priorities.contains(&self.priority.as_str()) {
            return Err(tool_error(
                "runtime",
                format!(
                    "Invalid priority '{}'. Must be one of: {}",
                    self.priority,
                    valid_priorities.join(", ")
                ),
            ));
        }

        // STEP 4: Generate review document content
        let review_content = self.generate_review_document(&task_context);

        // STEP 5: Create architecture review document
        let create_doc_input = serde_json::json!({
            "title": format!("{} - Architecture Review Request", self.title),
            "content": review_content.clone(),
            "role": "GENERAL"
        });

        let document = ctx
            .api_client
            .create_document(api_key, self.project_id, &create_doc_input)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to create architecture review document: {}", e),
                )
            })?;

        // STEP 6: Format response
        let response = format!(
            "✅ Architecture Review Request Created\n\n\
            📋 Review Details:\n\
            • Title: {}\n\
            • Document ID: {}\n\
            • Priority: {}\n\
            • Review Areas: {}\n\
            • Questions: {} items\n\n\
            📄 Review Document:\n\
            {}\n\n\
            💡 Next Steps:\n\
            • Share this review request with your architecture team\n\
            • Address feedback and update specification accordingly\n\
            • Use commit_artifact with ratify: true once review is complete",
            document
                .get("title")
                .and_then(|v: &serde_json::Value| v.as_str())
                .unwrap_or("Unknown"),
            document
                .get("id")
                .and_then(|v: &serde_json::Value| v.as_i64())
                .unwrap_or(0),
            self.priority,
            self.review_areas.join(", "),
            self.questions.len(),
            review_content,
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    fn generate_review_document(
        &self,
        task_context: &crate::generated_types::TaskWithDetails,
    ) -> String {
        let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC");

        format!(
            "# Architecture Review Request: {}\n\n\
            **Created:** {}\n\
            **Priority:** {}\n\
            **Task:** {} (ID: {})\n\
            **Project:** Project ID {}\n\n\
            ## Review Areas\n\n\
            {}\n\n\
            ## Questions and Concerns\n\n\
            {}\n\n\
            ## Task Context\n\n\
            **Column:** {}\n\
            **Task Description:** {}\n\n\
            ## Linked Documents\n\n\
            {}\n\n\
            ## Review Checklist\n\n\
            - [ ] Security implications reviewed\n\
            - [ ] Performance considerations addressed\n\
            - [ ] Scalability requirements validated\n\
            - [ ] Integration points identified\n\
            - [ ] Risk assessment completed\n\
            - [ ] Alternative approaches considered\n\
            - [ ] Implementation complexity evaluated\n\n\
            ## Reviewer Notes\n\n\
            _Please add your review comments and recommendations here._\n\n\
            ## Approval\n\n\
            - [ ] Architecture review approved\n\
            - [ ] Specification ready for ratification\n\n\
            **Reviewer:** _______________  **Date:** _______________",
            self.title,
            timestamp,
            self.priority,
            task_context.name,
            task_context.id,
            task_context.project_id,
            self.review_areas
                .iter()
                .map(|area| format!("- **{}**", area))
                .collect::<Vec<_>>()
                .join("\n"),
            self.questions
                .iter()
                .enumerate()
                .map(|(i, q)| format!("{}. {}", i + 1, q))
                .collect::<Vec<_>>()
                .join("\n"),
            task_context.column.name,
            task_context
                .description
                .as_deref()
                .unwrap_or("No description"),
            if let Some(docs) = &task_context.linked_documents {
                if docs.is_empty() {
                    "No documents currently linked to this task.".to_string()
                } else {
                    docs.iter()
                        .map(|doc| {
                            format!("- {} (ID: {}) - Role: {:?}", doc.title, doc.id, doc.role)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                }
            } else {
                "No documents currently linked to this task.".to_string()
            }
        )
    }
}

//************************************//
//  ProposeConstitutionAmendmentTool  //
//************************************//
#[mcp_tool(
    name = "propose_constitution_amendment",
    description = "Propose changes to project Constitution with diff generation and TTL confirmation (Specify column only)",
    title = "Propose Constitution Amendment",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ProposeConstitutionAmendmentTool {
    /// Project ID where the Constitution exists
    pub project_id: i32,
    /// Task ID for column verification and context
    pub task_id: i32,
    /// Title/summary of the proposed amendment
    pub amendment_title: String,
    /// Rationale for the proposed change
    pub rationale: String,
    /// The proposed new content (will be diffed against current Constitution)
    pub proposed_content: String,
}

impl ProposeConstitutionAmendmentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Executing propose_constitution_amendment for project {} task {}",
            self.project_id, self.task_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "propose_constitution_amendment")?;
        let api_key = &active.api_key;

        // STEP 1: Verify task exists and get column information
        let task_context = ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!(
                        "Failed to get task context for task {}: {}",
                        self.task_id, e
                    ),
                )
            })?;

        // STEP 2: Verify agent is in Specify column
        let column_name = &task_context.column.name;
        if column_name != "Specify" {
            return Err(tool_error("runtime", format!(
                "propose_constitution_amendment tool is only available in 'Specify' column. Current column: '{}'",
                column_name
            )));
        }

        // STEP 3: Find existing Constitution document
        let existing_docs = ctx
            .api_client
            .get_project_documents(api_key, self.project_id, &[], None, None, None)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to get project documents: {}", e))
            })?;

        let constitution_doc = existing_docs
            .data
            .iter()
            .find(|doc| doc.role == crate::generated_types::DocumentRole::Constitution)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    "No Constitution document found in this project. Create one first.".to_string(),
                )
            })?;

        // STEP 4: Generate diff between current and proposed content
        let diff = self.generate_diff(&constitution_doc.content, &self.proposed_content);

        // STEP 5: Generate confirmation code with TTL (5 minutes)
        let confirmation_code = self.generate_confirmation_code();
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(5);

        // STEP 6: Create amendment proposal document
        let proposal_content = self.generate_proposal_document(
            constitution_doc,
            &diff,
            &confirmation_code,
            &expires_at,
        );

        let create_doc_input = serde_json::json!({
            "title": format!("Constitution Amendment Proposal: {}", self.amendment_title),
            "content": proposal_content.clone(),
            "role": "GENERAL"
        });

        let proposal_doc = ctx
            .api_client
            .create_document(api_key, self.project_id, &create_doc_input)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to create amendment proposal document: {}", e),
                )
            })?;

        // STEP 7: Format response with confirmation instructions
        let response = format!(
            "⚖️  Constitution Amendment Proposed\n\n\
            📋 Proposal Details:\n\
            • Title: {}\n\
            • Proposal Document ID: {}\n\
            • Current Constitution ID: {}\n\
            • Confirmation Code: **{}**\n\
            • Expires: {} (5 minutes)\n\n\
            📄 Proposed Changes:\n\
            {}\n\n\
            ⚠️  **GOVERNANCE SAFETY CONTROLS ACTIVE**\n\n\
            To confirm this amendment:\n\
            1. Review the diff carefully\n\
            2. Use confirm_constitution_amendment tool\n\
            3. Provide the confirmation code: **{}**\n\
            4. Must confirm within 5 minutes\n\n\
            💡 Amendment Process:\n\
            • Proposals expire after 5 minutes for security\n\
            • All Constitution changes are audited\n\
            • Failed confirmations require re-proposal\n\
            • Use this process for any governance changes",
            self.amendment_title,
            proposal_doc
                .get("id")
                .and_then(|v: &serde_json::Value| v.as_i64())
                .unwrap_or(0),
            constitution_doc.id,
            confirmation_code,
            expires_at.format("%Y-%m-%d %H:%M:%S UTC"),
            diff,
            confirmation_code
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    fn generate_diff(&self, current: &str, proposed: &str) -> String {
        use similar::{ChangeTag, TextDiff};

        let diff = TextDiff::from_lines(current, proposed);
        let mut result = String::new();

        result.push_str("```diff\n");

        for change in diff.iter_all_changes() {
            let sign = match change.tag() {
                ChangeTag::Delete => "-",
                ChangeTag::Insert => "+",
                ChangeTag::Equal => " ",
            };
            result.push_str(&format!("{}{}", sign, change));
        }

        result.push_str("```\n");
        result
    }

    fn generate_confirmation_code(&self) -> String {
        use nanoid::nanoid;
        nanoid!(8) // 8-character confirmation code
    }

    fn generate_proposal_document(
        &self,
        constitution_doc: &crate::generated_types::ProjectDocument,
        diff: &str,
        confirmation_code: &str,
        expires_at: &chrono::DateTime<chrono::Utc>,
    ) -> String {
        let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC");
        let expires_fmt = expires_at.format("%Y-%m-%dT%H:%M:%S+00:00");

        format!(
            "# Constitution Amendment Proposal\n\n\
            **Title:** {}\n\
            **Proposed:** {}\n\
            **Expires:** {}\n\
            **Expires ISO:** {}\n\
            **Confirmation Code:** `{}`\n\n\
            ## Rationale\n\n\
            {}\n\n\
            ## Current Constitution\n\n\
            **Document ID:** {}\n\
            **Title:** {}\n\n\
            ## Proposed Changes\n\n\
            {}\n\n\
            ## Governance Audit Trail\n\n\
            - **Proposer:** Agent (via MCP)\n\
            - **Proposal Time:** {}\n\
            - **Expiration:** {}\n\
            - **Status:** Pending Confirmation\n\n\
            ## Safety Controls\n\n\
            - ✅ Diff generated and reviewed\n\
            - ✅ TTL confirmation required (5 minutes)\n\
            - ✅ Audit trail maintained\n\
            - ⏳ Awaiting confirmation with code: `{}`\n\n\
            ## Confirmation Instructions\n\n\
            Use the `confirm_constitution_amendment` tool with:\n\
            - confirmation_code: `{}`\n\
            - project_id: {}\n\n\
            **⚠️ This proposal expires at {} UTC**",
            self.amendment_title,
            timestamp,
            expires_fmt,
            expires_fmt,
            confirmation_code,
            self.rationale,
            constitution_doc.id,
            constitution_doc.title,
            diff,
            timestamp,
            expires_fmt,
            confirmation_code,
            confirmation_code,
            self.project_id,
            expires_fmt
        )
    }
}

//************************************//
//  ConfirmConstitutionAmendmentTool  //
//************************************//
#[mcp_tool(
    name = "confirm_constitution_amendment",
    description = "Confirm a proposed Constitution amendment with TTL validation",
    title = "Confirm Constitution Amendment",
    idempotent_hint = false,
    destructive_hint = true,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ConfirmConstitutionAmendmentTool {
    /// Project ID where the Constitution exists
    pub project_id: i32,
    /// Confirmation code from the proposal (8-character code)
    pub confirmation_code: String,
}

impl ConfirmConstitutionAmendmentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Executing confirm_constitution_amendment for project {} with code {}",
            self.project_id, self.confirmation_code
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "confirm_constitution_amendment")?;
        let api_key = &active.api_key;

        // STEP 1: Find the proposal document with matching confirmation code
        let existing_docs = ctx
            .api_client
            .get_project_documents(api_key, self.project_id, &[], None, None, None)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to get project documents: {}", e))
            })?;

        let proposal_doc = existing_docs
            .data
            .iter()
            .find(|doc| {
                doc.title.contains("Constitution Amendment Proposal")
                    && doc.content.contains(&format!(
                        "**Confirmation Code:** `{}`",
                        self.confirmation_code
                    ))
            })
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    format!(
                    "No pending Constitution amendment proposal found with confirmation code '{}'",
                    self.confirmation_code
                ),
                )
            })?;

        // STEP 2: Extract and validate TTL from proposal
        let expires_at = self.extract_expiration_from_proposal(&proposal_doc.content)?;
        let now = chrono::Utc::now();

        if now > expires_at {
            return Err(tool_error(
                "runtime",
                format!(
                    "Confirmation code '{}' has expired at {}. Please create a new proposal.",
                    self.confirmation_code,
                    expires_at.format("%Y-%m-%d %H:%M:%S UTC")
                ),
            ));
        }

        // STEP 3: Extract proposed content from the proposal
        let proposed_content =
            self.extract_proposed_content_from_proposal(&proposal_doc.content)?;

        // STEP 4: Find and update the Constitution document
        let constitution_doc = existing_docs
            .data
            .iter()
            .find(|doc| doc.role == crate::generated_types::DocumentRole::Constitution)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    "No Constitution document found in this project".to_string(),
                )
            })?;

        let patch_input = crate::generated_types::PatchDocumentInput {
            title: None, // Keep existing title
            content: Some(proposed_content.clone()),
            role: None, // Keep existing role
        };

        let updated_constitution = ctx
            .api_client
            .update_document(api_key, self.project_id, constitution_doc.id, &patch_input)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to update Constitution: {}", e)))?;

        // STEP 5: Update proposal document to mark as confirmed
        let confirmed_proposal_content = format!(
            "{}\n\n## ✅ AMENDMENT CONFIRMED\n\n\
            **Confirmed At:** {}\n\
            **Constitution Updated:** Document ID {}\n\
            **Status:** APPLIED\n\n\
            This amendment has been successfully applied to the project Constitution.",
            proposal_doc.content,
            now.format("%Y-%m-%d %H:%M:%S UTC"),
            constitution_doc.id
        );

        let update_proposal_input = crate::generated_types::PatchDocumentInput {
            title: Some(format!("✅ CONFIRMED - {}", proposal_doc.title)),
            content: Some(confirmed_proposal_content),
            role: None,
        };

        ctx.api_client
            .update_document(
                api_key,
                self.project_id,
                proposal_doc.id,
                &update_proposal_input,
            )
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to update proposal document: {}", e),
                )
            })?;

        // STEP 6: Format response
        let response = format!(
            "✅ Constitution Amendment Confirmed and Applied\n\n\
            📋 Amendment Details:\n\
            • Confirmation Code: {}\n\
            • Constitution Document ID: {}\n\
            • Proposal Document ID: {}\n\
            • Applied At: {}\n\n\
            🔒 Governance Audit Trail:\n\
            • Amendment proposal created and reviewed\n\
            • TTL validation passed (confirmed before expiration)\n\
            • Constitution successfully updated\n\
            • Proposal marked as confirmed\n\
            • All changes logged for audit\n\n\
            ⚖️  Constitution Changes:\n\
            The project Constitution has been updated with the proposed changes.\n\
            All agents will now operate under the new governance rules.\n\n\
            💡 Next Steps:\n\
            • Review the updated Constitution document\n\
            • Communicate changes to team members\n\
            • Update any related specifications if needed",
            self.confirmation_code,
            updated_constitution.id,
            proposal_doc.id,
            now.format("%Y-%m-%d %H:%M:%S UTC")
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    fn extract_expiration_from_proposal(
        &self,
        content: &str,
    ) -> Result<chrono::DateTime<chrono::Utc>, CallToolError> {
        // Look for the ISO expiration timestamp first, then fall back to human-readable
        for line in content.lines() {
            if line.starts_with("**Expires ISO:**") {
                let timestamp_str = line.strip_prefix("**Expires ISO:**").unwrap_or("").trim();
                return chrono::DateTime::parse_from_rfc3339(timestamp_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|e| {
                        tool_error(
                            "runtime",
                            format!(
                                "Failed to parse expiration timestamp '{}': {}",
                                timestamp_str, e
                            ),
                        )
                    });
            }
        }
        // Fallback: try the human-readable format for legacy proposals
        for line in content.lines() {
            if line.starts_with("**Expires:**") {
                let timestamp_str = line.strip_prefix("**Expires:**").unwrap_or("").trim();
                return chrono::DateTime::parse_from_str(timestamp_str, "%Y-%m-%d %H:%M:%S UTC")
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|e| {
                        tool_error(
                            "runtime",
                            format!(
                                "Failed to parse expiration timestamp '{}': {}",
                                timestamp_str, e
                            ),
                        )
                    });
            }
        }

        Err(tool_error(
            "runtime",
            "Could not find expiration timestamp in proposal document".to_string(),
        ))
    }

    fn extract_proposed_content_from_proposal(
        &self,
        content: &str,
    ) -> Result<String, CallToolError> {
        // Look for the proposed content in the diff section
        // This is a simplified approach - in production you'd want more robust storage

        let lines: Vec<&str> = content.lines().collect();
        let mut in_diff_section = false;
        let mut proposed_lines = Vec::new();

        for line in lines {
            if line.starts_with("## Proposed Changes") {
                in_diff_section = true;
                continue;
            }

            if in_diff_section {
                if line.starts_with("## ") {
                    // End of diff section
                    break;
                }

                if line.starts_with("```diff") {
                    continue;
                }

                if line.starts_with("```") {
                    break;
                }

                // Extract lines that are additions (start with +)
                if line.starts_with("+") {
                    proposed_lines.push(line.strip_prefix("+").unwrap_or(line));
                } else if !line.starts_with("-") && !line.starts_with(" ") {
                    // Include context lines that aren't deletions or unchanged
                    proposed_lines.push(line);
                }
            }
        }

        if proposed_lines.is_empty() {
            return Err(tool_error(
                "runtime",
                "Could not extract proposed content from diff. Please create a new proposal."
                    .to_string(),
            ));
        }

        Ok(proposed_lines.join("\n"))
    }
}
