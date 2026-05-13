use super::*;

use crate::generated_types::AgentTaskProgressInput;

const AGENT_PROGRESS_TEXT_MAX_CHARS: usize = 2000;

fn clamp_agent_progress_text(text: String) -> String {
    let count = text.chars().count();
    if count <= AGENT_PROGRESS_TEXT_MAX_CHARS {
        return text;
    }
    let mut s: String = text
        .chars()
        .take(AGENT_PROGRESS_TEXT_MAX_CHARS.saturating_sub(3))
        .collect();
    s.push_str("...");
    s
}

fn agent_progress_json(text: String) -> serde_json::Value {
    let input = AgentTaskProgressInput {
        text: clamp_agent_progress_text(text),
    };
    serde_json::to_value(&input).expect("AgentTaskProgressInput serializes to JSON")
}

//*********************//
//  ReflectOnWorkTool  //
//*********************//
#[mcp_tool(
    name = "reflect_on_work",
    description = "Perform mandatory 6-step integrity check and create work log (Verify column only)",
    title = "Reflect on Work",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ReflectOnWorkTool {
    /// Task ID to reflect on
    pub task_id: String,
    /// Summary of work completed
    pub work_summary: String,
    /// List of files that were modified during the work
    pub files_touched: Vec<String>,
    /// Integrity check results (all must be true to pass)
    pub integrity_check: IntegrityCheckInput,
    /// Optional top-level security flag (CLI parity alias for integrity_check.security_validated).
    #[serde(default)]
    pub security_validated: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct IntegrityCheckInput {
    /// Requirements have been fully met
    pub requirements_met: bool,
    /// All tests are passing
    pub tests_passing: bool,
    /// Code quality standards are met (linting, formatting, etc.)
    pub code_quality_ok: bool,
    /// Documentation is complete and up to date
    pub documentation_complete: bool,
    /// No breaking changes introduced
    pub no_breaking_changes: bool,
    /// Security validation has been performed
    pub security_validated: bool,
}

impl ReflectOnWorkTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Starting work reflection for task: {}", self.task_id);
        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "reflect_on_work")?;
        let api_key = &active.api_key;

        // STEP 1: Parse task_id to extract project_id and task_id
        let parts: Vec<&str> = self.task_id.split('-').collect();
        if parts.len() < 2 {
            return Err(tool_error(
                "runtime",
                format!(
                    "Invalid task ID format: {}. Expected format: project_id-task_id",
                    self.task_id
                ),
            ));
        }

        let project_id: i32 = parts[0].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse project ID from task ID: {}", self.task_id),
            )
        })?;
        let task_num: i32 = parts[1].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse task number from task ID: {}", self.task_id),
            )
        })?;

        // STEP 2: Get task context to verify we're in Verify column
        let task_details = ctx
            .api_client
            .get_task_context(api_key, project_id, task_num)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to get task context for '{}': {}", self.task_id, e),
                )
            })?;

        // Verify we're in the Verify column
        if task_details.column.name != "Verify" {
            return Err(tool_error(
                "runtime",
                format!(
                    "reflect_on_work can only be used in the Verify column. Current column: {}",
                    task_details.column.name
                ),
            ));
        }

        // STEP 2: Convert input to domain model
        let integrity_check = crate::domain::IntegrityCheck {
            requirements_met: self.integrity_check.requirements_met,
            tests_passing: self.integrity_check.tests_passing,
            code_quality_ok: self.integrity_check.code_quality_ok,
            documentation_complete: self.integrity_check.documentation_complete,
            no_breaking_changes: self.integrity_check.no_breaking_changes,
            security_validated: self
                .security_validated
                .unwrap_or(self.integrity_check.security_validated),
        };

        // STEP 3: Mandatory integrity validation - ALL must pass
        if !integrity_check.all_checks_pass() {
            let failed_checks = integrity_check.failed_checks();
            let error_message = format!(
                "❌ Integrity Check Failed - All checks must pass to complete work\n\n\
                Failed Checks:\n{}\n\n\
                💡 Actions Required:\n\
                • Address all failed integrity checks\n\
                • Use 'reject_to_execute' to return task to Execute column for fixes\n\
                • Re-run 'reflect_on_work' once all issues are resolved",
                failed_checks
                    .iter()
                    .map(|check| format!("  • {}", check))
                    .collect::<Vec<_>>()
                    .join("\n")
            );

            return Err(tool_error("runtime", error_message));
        }

        // STEP 4: Create work log with TLDR generation
        let mut work_log = crate::domain::WorkLog::new(
            self.task_id.clone(),
            task_details.name.clone(),
            active.entry.name.clone(),
        );

        work_log.work_summary = self.work_summary.clone();
        work_log.files_touched = self.files_touched.clone();
        work_log.update_integrity_check(integrity_check);

        // Generate TLDR with FILES TOUCHED header
        work_log
            .generate_tldr()
            .map_err(|e| tool_error("runtime", format!("Failed to generate TLDR: {}", e)))?;

        // STEP 5: Create work log document in Hub
        let work_log_content = self.format_work_log_document(&work_log, &task_details);

        let document_data = serde_json::json!({
            "title": format!("Work Log - {} - {}", task_details.name, chrono::Utc::now().format("%Y%m%d_%H%M%S")),
            "content": work_log_content,
            "role": "WORK_LOG"
        });

        let doc_response = ctx
            .api_client
            .create_document(api_key, project_id, &document_data)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to create work log document: {}", e),
                )
            })?;

        // STEP 6: Link work log document to task
        let link_data = serde_json::json!({
            "taskId": self.task_id,
            "docId": doc_response["id"].as_i64().unwrap_or(0),
            "linkType": "WORK_LOG"
        });

        ctx.api_client
            .create_document_link(api_key, project_id, &link_data)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to link work log to task: {}", e))
            })?;

        // STEP 7: Add TLDR as a progress log entry (`text` is the Hub contract field).
        let progress_body = agent_progress_json(format!("[WORK_LOG]\n{}", work_log.tldr));

        ctx.api_client
            .update_task_progress(api_key, project_id, task_num, &progress_body)
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to add TLDR comment: {}", e)))?;

        // STEP 8: Complete the work log
        work_log
            .complete()
            .map_err(|e| tool_error("runtime", format!("Failed to complete work log: {}", e)))?;

        // Format success response
        let response = format!(
            "✅ Work Reflection Completed Successfully\n\n\
            📋 Task: {} ({})\n\
            👤 Agent: {}\n\
            📁 Files Touched: {}\n\n\
            🔍 Integrity Check Results:\n\
            ✅ Requirements Met: {}\n\
            ✅ Tests Passing: {}\n\
            ✅ Code Quality OK: {}\n\
            ✅ Documentation Complete: {}\n\
            ✅ No Breaking Changes: {}\n\
            ✅ Security Validated: {}\n\n\
            📄 Work Log Document: Created and linked to task\n\
            💬 TLDR Comment: Added to task\n\n\
            🎯 Next Steps:\n\
            • Use 'approve_completion' to finalize task completion\n\
            • Or use 'reject_to_execute' if additional work is needed\n\n\
            📁 [FILES TOUCHED]: {}\n\
            {}",
            task_details.name,
            self.task_id,
            active.entry.name,
            self.files_touched.len(),
            self.integrity_check.requirements_met,
            self.integrity_check.tests_passing,
            self.integrity_check.code_quality_ok,
            self.integrity_check.documentation_complete,
            self.integrity_check.no_breaking_changes,
            self.integrity_check.security_validated,
            self.files_touched.join(", "),
            truncate_preview(&self.work_summary, 200)
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }

    /// Format work log as a structured document
    fn format_work_log_document(
        &self,
        work_log: &crate::domain::WorkLog,
        task_details: &crate::generated_types::TaskWithDetails,
    ) -> String {
        format!(
            "# Work Log: {}\n\n\
            **Task ID:** {}\n\
            **Agent:** {}\n\
            **Project:** Project {} (ID: {})\n\
            **Column:** {}\n\
            **Completed At:** {}\n\n\
            ## Work Summary\n\n\
            {}\n\n\
            ## Files Modified\n\n\
            {}\n\n\
            ## Integrity Check Results\n\n\
            | Check | Status | Result |\n\
            |-------|--------|--------|\n\
            | Requirements Met | ✅ | {} |\n\
            | Tests Passing | ✅ | {} |\n\
            | Code Quality OK | ✅ | {} |\n\
            | Documentation Complete | ✅ | {} |\n\
            | No Breaking Changes | ✅ | {} |\n\
            | Security Validated | ✅ | {} |\n\n\
            **Overall Status:** ✅ All integrity checks passed\n\n\
            ## TLDR\n\n\
            {}\n\n\
            ---\n\
            *Generated by VibeTask MCP Orchestrator v{} on {}*",
            task_details.name,
            work_log.task_id,
            work_log.agent_name,
            task_details.project_id,
            task_details.project_id,
            task_details.column.name,
            work_log
                .completed_at
                .unwrap_or(work_log.created_at)
                .format("%Y-%m-%d %H:%M:%S UTC"),
            work_log.work_summary,
            if work_log.files_touched.is_empty() {
                "No files were modified during this work.".to_string()
            } else {
                work_log
                    .files_touched
                    .iter()
                    .map(|f| format!("- `{}`", f))
                    .collect::<Vec<_>>()
                    .join("\n")
            },
            work_log.integrity_check.requirements_met,
            work_log.integrity_check.tests_passing,
            work_log.integrity_check.code_quality_ok,
            work_log.integrity_check.documentation_complete,
            work_log.integrity_check.no_breaking_changes,
            work_log.integrity_check.security_validated,
            work_log.tldr,
            env!("CARGO_PKG_VERSION"),
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
        )
    }
}

//************************//
//  ApproveCompletionTool //
//************************//
#[mcp_tool(
    name = "approve_completion",
    description = "Final verification gate - approve task completion after integrity validation (Verify column only)",
    title = "Approve Completion",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ApproveCompletionTool {
    /// Task ID to approve for completion
    pub task_id: String,
    /// Final completion notes
    pub completion_notes: String,
    /// Confirm that all integrity checks have passed
    pub confirm_integrity_passed: bool,
}

impl ApproveCompletionTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Starting task completion approval for task: {}",
            self.task_id
        );

        if !self.confirm_integrity_passed {
            return Err(tool_error("runtime", 
                "Cannot approve completion without confirming integrity checks have passed. Set confirm_integrity_passed to true.".to_string(),
            ));
        }
        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "approve_completion")?;
        let api_key = &active.api_key;

        // Parse task_id to extract project_id and task_id
        let parts: Vec<&str> = self.task_id.split('-').collect();
        if parts.len() < 2 {
            return Err(tool_error(
                "runtime",
                format!(
                    "Invalid task ID format: {}. Expected format: project_id-task_id",
                    self.task_id
                ),
            ));
        }

        let project_id: i32 = parts[0].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse project ID from task ID: {}", self.task_id),
            )
        })?;
        let task_num: i32 = parts[1].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse task number from task ID: {}", self.task_id),
            )
        })?;

        // Get task context to verify we're in Verify column
        let task_details = ctx
            .api_client
            .get_task_context(api_key, project_id, task_num)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to get task context for '{}': {}", self.task_id, e),
                )
            })?;

        // Verify we're in the Verify column
        if task_details.column.name != "Verify" {
            return Err(tool_error(
                "runtime",
                format!(
                    "approve_completion can only be used in the Verify column. Current column: {}",
                    task_details.column.name
                ),
            ));
        }

        let completion_text = format!(
            "[COMPLETION] status=COMPLETED approvedBy={} approvedAt={} notes={}",
            active.entry.name,
            chrono::Utc::now().to_rfc3339(),
            self.completion_notes
        );

        ctx.api_client
            .update_task_progress(
                api_key,
                project_id,
                task_num,
                &agent_progress_json(completion_text),
            )
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to update task status: {}", e)))?;

        // Add completion audit trail comment
        let audit_comment = format!(
            "✅ **TASK COMPLETED**\n\n\
            **Approved by:** {}\n\
            **Completion Date:** {}\n\
            **Final Notes:** {}\n\n\
            **Audit Trail:**\n\
            • Integrity checks: ✅ Passed\n\
            • Work reflection: ✅ Completed\n\
            • Final approval: ✅ Approved\n\n\
            *Task moved to COMPLETED status via MCP Orchestrator*",
            active.entry.name,
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            self.completion_notes
        );

        let audit_body = agent_progress_json(format!("[COMPLETION_AUDIT]\n{}", audit_comment));

        ctx.api_client
            .update_task_progress(api_key, project_id, task_num, &audit_body)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to add audit trail comment: {}", e),
                )
            })?;

        // Format success response
        let response = format!(
            "✅ Task Completion Approved Successfully\n\n\
            📋 Task: {} ({})\n\
            👤 Approved by: {}\n\
            📅 Completion Date: {}\n\
            📝 Notes: {}\n\n\
            🎯 Actions Completed:\n\
            • Task status updated to COMPLETED\n\
            • Completion audit trail added\n\
            • Provenance tracking recorded\n\n\
            🏆 Task has been successfully completed and is ready for delivery!",
            task_details.name,
            self.task_id,
            active.entry.name,
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            self.completion_notes
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//***********************//
//  RejectToExecuteTool  //
//***********************//
#[mcp_tool(
    name = "reject_to_execute",
    description = "Return task to Execute column for additional work (Verify column only)",
    title = "Reject to Execute",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RejectToExecuteTool {
    /// Task ID to return to Execute column
    pub task_id: String,
    /// Reason for rejection and required actions
    pub rejection_reason: String,
    /// Specific issues that need to be addressed
    pub required_actions: Vec<String>,
}

impl RejectToExecuteTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!("Rejecting task to Execute column: {}", self.task_id);
        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "reject_to_execute")?;
        let api_key = &active.api_key;

        // Parse task_id to extract project_id and task_id
        let parts: Vec<&str> = self.task_id.split('-').collect();
        if parts.len() < 2 {
            return Err(tool_error(
                "runtime",
                format!(
                    "Invalid task ID format: {}. Expected format: project_id-task_id",
                    self.task_id
                ),
            ));
        }

        let project_id: i32 = parts[0].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse project ID from task ID: {}", self.task_id),
            )
        })?;
        let task_num: i32 = parts[1].parse().map_err(|_| {
            tool_error(
                "runtime",
                format!("Cannot parse task number from task ID: {}", self.task_id),
            )
        })?;

        // Get task context to verify we're in Verify column
        let task_details = ctx
            .api_client
            .get_task_context(api_key, project_id, task_num)
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to get task context for '{}': {}", self.task_id, e),
                )
            })?;

        // Verify we're in the Verify column
        if task_details.column.name != "Verify" {
            return Err(tool_error(
                "runtime",
                format!(
                    "reject_to_execute can only be used in the Verify column. Current column: {}",
                    task_details.column.name
                ),
            ));
        }

        let rejection_text = format!(
            "[REJECTION] columnName=Execute status=IN_PROGRESS rejectedBy={} rejectedAt={} reason={}",
            active.entry.name,
            chrono::Utc::now().to_rfc3339(),
            self.rejection_reason
        );

        ctx.api_client
            .update_task_progress(
                api_key,
                project_id,
                task_num,
                &agent_progress_json(rejection_text),
            )
            .await
            .map_err(|e| {
                tool_error(
                    "runtime",
                    format!("Failed to move task to Execute column: {}", e),
                )
            })?;

        // Add rejection feedback comment with required actions
        let required_actions_list = self
            .required_actions
            .iter()
            .map(|action| format!("• {}", action))
            .collect::<Vec<_>>()
            .join("\n");

        let rejection_comment = format!(
            "🔄 **TASK RETURNED TO EXECUTE**\n\n\
            **Rejected by:** {}\n\
            **Rejection Date:** {}\n\
            **Reason:** {}\n\n\
            **Required Actions:**\n\
            {}\n\n\
            **Next Steps:**\n\
            • Address all required actions listed above\n\
            • Re-run tests and quality checks\n\
            • Use 'reflect_on_work' when ready for re-verification\n\n\
            *Task moved back to Execute column for additional work*",
            active.entry.name,
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            self.rejection_reason,
            required_actions_list
        );

        let rejection_body =
            agent_progress_json(format!("[REJECTION_FEEDBACK]\n{}", rejection_comment));

        ctx.api_client
            .update_task_progress(api_key, project_id, task_num, &rejection_body)
            .await
            .map_err(|e| {
                tool_error("runtime", format!("Failed to add rejection comment: {}", e))
            })?;

        // Format response
        let response = format!(
            "🔄 Task Returned to Execute Column\n\n\
            📋 Task: {} ({})\n\
            👤 Rejected by: {}\n\
            📅 Rejection Date: {}\n\
            📝 Reason: {}\n\n\
            🎯 Required Actions ({}):\n\
            {}\n\n\
            ✅ Actions Completed:\n\
            • Task moved back to Execute column\n\
            • Rejection feedback added with specific actions\n\
            • Status updated to IN_PROGRESS\n\n\
            💡 Next Steps:\n\
            • Address all required actions\n\
            • Use 'reflect_on_work' when ready for re-verification",
            task_details.name,
            self.task_id,
            active.entry.name,
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            self.rejection_reason,
            self.required_actions.len(),
            required_actions_list
        );

        Ok(CallToolResult::text_content(vec![TextContent::from(
            response,
        )]))
    }
}

//*********************//
//  SetWorkflowContextTool  //
//*********************//
#[mcp_tool(
    name = "set_workflow_context",
    description = "Set the active project and optional lattice column for this MCP session",
    title = "Set Workflow Context",
    idempotent_hint = true,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct SetWorkflowContextTool {
    /// Active project scope for subsequent tool calls.
    pub project_id: i32,
    /// Optional lattice column context (Specify, Plan, Execute, Verify).
    #[serde(default)]
    pub column: Option<String>,
}

impl SetWorkflowContextTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "set_workflow_context")?;

        if let Some(projects) = &active.entry.projects {
            if !projects.contains(&self.project_id) {
                return Err(tool_error(
                    "runtime",
                    format!(
                        "Project {} is not delegated to agent '{}'. Delegated projects: {}",
                        self.project_id,
                        active.entry.name,
                        projects
                            .iter()
                            .map(std::string::ToString::to_string)
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                ));
            }
        }

        let normalized_column = match self.column.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(raw) => {
                let normalized = match raw.to_ascii_lowercase().as_str() {
                    "specify" => "Specify",
                    "plan" => "Plan",
                    "execute" => "Execute",
                    "verify" => "Verify",
                    _ => {
                        return Err(tool_error(
                            "runtime",
                            format!(
                            "Invalid column '{}'. Valid columns: Specify, Plan, Execute, Verify",
                            raw
                        ),
                        ));
                    }
                };
                Some(normalized.to_string())
            }
        };

        {
            let mut workflow_context = ctx.workflow_context.write().await;
            workflow_context.current_project_id = Some(self.project_id);
            workflow_context.current_column = normalized_column.clone();
        }

        let column_line = normalized_column
            .as_deref()
            .unwrap_or("None (base tool surface only)");
        Ok(CallToolResult::text_content(vec![TextContent::from(
            format!(
                "✅ Workflow context set\n\
Project: {}\n\
Column: {}\n\n\
Run tools/list again to see the updated tool surface for this session.",
                self.project_id, column_line
            ),
        )]))
    }
}

//*********************//
//  MoveTaskTool  //
//*********************//
#[mcp_tool(
    name = "move_task",
    description = "Move a task to a target column with lattice pre-validation (Execute column workflows)",
    title = "Move Task",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct MoveTaskTool {
    /// Project ID containing the task.
    pub project_id: i32,
    /// Task ID to move.
    pub task_id: i32,
    /// Target column ID.
    pub target_column_id: i32,
}

impl MoveTaskTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "move_task")?;
        let api_key = &active.api_key;

        let me_response = ctx.api_client.get_agent_me(api_key).await.map_err(|e| {
            tool_error(
                "runtime",
                format!(
                    "Failed to verify active agent '{}' with Hub: {}",
                    active.entry.name, e
                ),
            )
        })?;
        let delegation = me_response
            .delegations
            .iter()
            .find(|d| d.project_id == self.project_id)
            .ok_or_else(|| {
                tool_error(
                    "runtime",
                    format!(
                        "Agent '{}' has no delegation for project {}",
                        active.entry.name, self.project_id
                    ),
                )
            })?
            .clone();

        ctx.api_client
            .update_agent_task_column_with_precheck(
                api_key,
                self.project_id,
                self.task_id,
                self.target_column_id,
                &delegation,
            )
            .await
            .map_err(|e| tool_error("runtime", format!("Failed to move task: {}", e)))?;

        Ok(CallToolResult::text_content(vec![TextContent::from(
            format!(
                "✅ Task moved successfully\n\
Project: {}\n\
Task: {}\n\
Target Column ID: {}\n\
Delegation Mode: {:?}",
                self.project_id, self.task_id, self.target_column_id, delegation.delegation_mode
            ),
        )]))
    }
}

//*********************//
//  UpdateTaskProgressTool  //
//*********************//
#[mcp_tool(
    name = "update_task_progress",
    description = "Update task progress and status tracking (Execute column only)",
    title = "Update Task Progress",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct UpdateTaskProgressTool {
    /// Project ID containing the task
    pub project_id: i32,
    /// Task ID to update
    pub task_id: i32,
    /// Progress update description
    pub progress_description: String,
    /// Optional: Percentage completion (0-100)
    #[serde(default)]
    pub completion_percentage: Option<u8>,
    /// Optional: Files being worked on
    #[serde(default)]
    pub files_in_progress: Option<Vec<String>>,
    /// Optional: Blockers or issues encountered
    #[serde(default)]
    pub blockers: Option<Vec<String>>,
}

impl UpdateTaskProgressTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Updating task progress for task {} in project {}",
            self.task_id, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "update_task_progress")?;
        let api_key = &active.api_key;

        // Validate completion percentage
        if let Some(percentage) = self.completion_percentage {
            if percentage > 100 {
                return Err(tool_error(
                    "runtime",
                    "Completion percentage must be between 0 and 100".to_string(),
                ));
            }
        }

        // Get current task context to verify column
        match ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
        {
            Ok(task_context) => {
                // Check if task is in Execute column
                if task_context.column.name != "Execute" {
                    return Err(tool_error("runtime", format!(
                        "update_task_progress is only available in Execute column. Current column: {}",
                        task_context.column.name
                    )));
                }

                let mut progress_text = self.progress_description.clone();
                if let Some(percentage) = self.completion_percentage {
                    progress_text.push_str(&format!("\n\nCompletion: {}%", percentage));
                }
                if let Some(files) = &self.files_in_progress {
                    if !files.is_empty() {
                        progress_text
                            .push_str(&format!("\n\nFiles in progress: {}", files.join(", ")));
                    }
                }
                if let Some(blockers) = &self.blockers {
                    if !blockers.is_empty() {
                        progress_text.push_str(&format!("\n\nBlockers: {}", blockers.join(", ")));
                    }
                }
                progress_text.push_str(&format!(
                    "\n\nUpdated by: {} at {}",
                    active.entry.name,
                    chrono::Utc::now().to_rfc3339()
                ));

                let progress_update = agent_progress_json(progress_text);

                // Update task progress via Hub API
                match ctx
                    .api_client
                    .update_task_progress(api_key, self.project_id, self.task_id, &progress_update)
                    .await
                {
                    Ok(_) => {
                        let mut response = format!(
                            "✅ Task Progress Updated\n\n\
                            Project: {} | Task: {}\n\
                            Progress: {}\n",
                            self.project_id, self.task_id, self.progress_description
                        );

                        if let Some(percentage) = self.completion_percentage {
                            response.push_str(&format!("Completion: {}%\n", percentage));
                        }

                        if let Some(files) = &self.files_in_progress {
                            if !files.is_empty() {
                                response.push_str(&format!(
                                    "Files in Progress: {}\n",
                                    files.join(", ")
                                ));
                            }
                        }

                        if let Some(blockers) = &self.blockers {
                            if !blockers.is_empty() {
                                response
                                    .push_str(&format!("⚠️ Blockers: {}\n", blockers.join(", ")));
                            }
                        }

                        response.push_str(&format!(
                            "\nUpdated by: {} at {}",
                            active.entry.name,
                            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
                        ));

                        response.push_str("\n\n💡 Next steps:\n");
                        response.push_str("• Continue work on the task\n");
                        response
                            .push_str("• Use 'link_document' to attach relevant documentation\n");
                        response.push_str("• Use 'request_help' if you encounter blockers\n");

                        Ok(CallToolResult::text_content(vec![TextContent::from(
                            response,
                        )]))
                    }
                    Err(e) => Err(tool_error(
                        "runtime",
                        format!("Failed to update task progress: {}", e),
                    )),
                }
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!(
                    "Failed to get task context: {}. Verify project_id and task_id are correct.",
                    e
                ),
            )),
        }
    }
}

//******************//
//  LinkDocumentTool  //
//******************//
#[mcp_tool(
    name = "link_document",
    description = "Link document to task with Knowledge Hub integration (Execute column only)",
    title = "Link Document",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct LinkDocumentTool {
    /// Project ID containing the task
    pub project_id: i32,
    /// Task ID to link document to
    pub task_id: i32,
    /// Document title
    pub document_title: String,
    /// Document content (markdown)
    pub document_content: String,
    /// Document role/type (SPEC, PLAN, WORK_LOG, REFERENCE, etc.)
    pub document_role: String,
    /// Optional: Link description explaining the relationship
    #[serde(default)]
    pub link_description: Option<String>,
}

impl LinkDocumentTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Linking document '{}' to task {} in project {}",
            self.document_title, self.task_id, self.project_id
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "link_document")?;
        let api_key = &active.api_key;

        // Validate document role
        let valid_roles = ["SPEC", "PLAN", "WORK_LOG", "REFERENCE", "NOTES", "RESEARCH"];
        if !valid_roles.contains(&self.document_role.as_str()) {
            return Err(tool_error(
                "runtime",
                format!(
                    "Invalid document role '{}'. Valid roles: {}",
                    self.document_role,
                    valid_roles.join(", ")
                ),
            ));
        }

        // Get current task context to verify column
        match ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
        {
            Ok(task_context) => {
                // Check if task is in Execute column
                if task_context.column.name != "Execute" {
                    return Err(tool_error(
                        "runtime",
                        format!(
                            "link_document is only available in Execute column. Current column: {}",
                            task_context.column.name
                        ),
                    ));
                }

                // STEP 1: Create document in Knowledge Hub
                let document_payload = serde_json::json!({
                    "title": self.document_title,
                    "content": self.document_content,
                    "role": self.document_role,
                    "created_by": active.entry.name,
                    "created_at": chrono::Utc::now().to_rfc3339(),
                    "metadata": {
                        "linked_task_id": self.task_id,
                        "project_id": self.project_id
                    }
                });

                match ctx
                    .api_client
                    .create_document(api_key, self.project_id, &document_payload)
                    .await
                {
                    Ok(document_response) => {
                        // STEP 2: Create document link to task
                        let link_payload = serde_json::json!({
                            "document_id": document_response.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                            "task_id": self.task_id,
                            "link_type": "ATTACHED",
                            "description": self.link_description.as_ref().unwrap_or(&format!(
                                "{} document for task execution",
                                self.document_role
                            )),
                            "created_by": active.entry.name,
                            "created_at": chrono::Utc::now().to_rfc3339()
                        });

                        match ctx
                            .api_client
                            .create_document_link(api_key, self.project_id, &link_payload)
                            .await
                        {
                            Ok(_) => {
                                let response = format!(
                                    "✅ Document Linked Successfully\n\n\
                                    📄 Document: {}\n\
                                    🔗 Linked to: Project {} | Task {}\n\
                                    📋 Role: {}\n\
                                    📝 Content Length: {} characters\n\
                                    👤 Created by: {}\n\
                                    🕒 Created at: {}\n\n\
                                    💡 Document is now available in Knowledge Hub and linked to the task.\n\
                                    Other agents can access this document for context and collaboration.\n\n\
                                    Next steps:\n\
                                    • Continue task execution with documented context\n\
                                    • Update task progress as work continues\n\
                                    • Use 'request_help' if collaboration is needed",
                                    self.document_title,
                                    self.project_id,
                                    self.task_id,
                                    self.document_role,
                                    self.document_content.len(),
                                    active.entry.name,
                                    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
                                );

                                Ok(CallToolResult::text_content(vec![TextContent::from(
                                    response,
                                )]))
                            }
                            Err(e) => {
                                // Document was created but linking failed
                                let doc_id = document_response
                                    .get("id")
                                    .and_then(|v| v.as_i64())
                                    .map(|id| id.to_string())
                                    .unwrap_or_else(|| "unknown".to_string());
                                Err(tool_error(
                                    "runtime",
                                    format!(
                                        "Document created but linking failed: {}. Document ID: {}",
                                        e, doc_id
                                    ),
                                ))
                            }
                        }
                    }
                    Err(e) => Err(tool_error(
                        "runtime",
                        format!("Failed to create document in Knowledge Hub: {}", e),
                    )),
                }
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!(
                    "Failed to get task context: {}. Verify project_id and task_id are correct.",
                    e
                ),
            )),
        }
    }
}

//******************//
//  RequestHelpTool  //
//******************//
#[mcp_tool(
    name = "request_help",
    description = "Request help for escalation and collaboration (Execute column only)",
    title = "Request Help",
    idempotent_hint = false,
    destructive_hint = false,
    open_world_hint = false,
    read_only_hint = false
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RequestHelpTool {
    /// Project ID containing the task
    pub project_id: i32,
    /// Task ID needing help
    pub task_id: i32,
    /// Type of help needed (TECHNICAL, CLARIFICATION, REVIEW, BLOCKED, COLLABORATION)
    pub help_type: String,
    /// Detailed description of the help needed
    pub help_description: String,
    /// Optional: Specific agent or role to request help from
    #[serde(default)]
    pub requested_from: Option<String>,
    /// Optional: Priority level (LOW, MEDIUM, HIGH, URGENT)
    #[serde(default)]
    pub priority: Option<String>,
    /// Optional: Context or background information
    #[serde(default)]
    pub context: Option<String>,
}

impl RequestHelpTool {
    pub async fn call_tool(&self, ctx: &ToolContext) -> Result<CallToolResult, CallToolError> {
        info!(
            "Requesting help for task {} in project {}: {}",
            self.task_id, self.project_id, self.help_type
        );

        let active = ctx.resolve_active_agent().await?;
        ToolContext::require_agent_type(&active.entry, "ProjectDelegated", "request_help")?;
        let api_key = &active.api_key;

        if let Some(priority) = &self.priority {
            let valid_priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
            if !valid_priorities.contains(&priority.as_str()) {
                return Err(tool_error(
                    "runtime",
                    format!(
                        "Invalid priority '{}'. Valid priorities: {}",
                        priority,
                        valid_priorities.join(", ")
                    ),
                ));
            }
        }

        // Get current task context to verify column
        match ctx
            .api_client
            .get_task_context(api_key, self.project_id, self.task_id)
            .await
        {
            Ok(task_context) => {
                // Check if task is in Execute column
                if task_context.column.name != "Execute" {
                    return Err(tool_error(
                        "runtime",
                        format!(
                            "request_help is only available in Execute column. Current column: {}",
                            task_context.column.name
                        ),
                    ));
                }

                // Create help request payload
                let help_request = serde_json::json!({
                    "task_id": self.task_id,
                    "project_id": self.project_id,
                    "help_type": self.help_type,
                    "description": self.help_description,
                    "requested_by": active.entry.name,
                    "requested_from": self.requested_from,
                    "priority": self.priority.as_ref().unwrap_or(&"MEDIUM".to_string()),
                    "context": self.context,
                    "status": "OPEN",
                    "created_at": chrono::Utc::now().to_rfc3339(),
                    "task_name": task_context.name,
                    "task_description": task_context.description
                });

                // Create help request via Hub API
                match ctx
                    .api_client
                    .create_help_request(api_key, self.project_id, &help_request)
                    .await
                {
                    Ok(help_response) => {
                        let help_id = help_response
                            .get("id")
                            .and_then(|v| v.as_i64())
                            .map(|id| id.to_string())
                            .unwrap_or_else(|| "unknown".to_string());

                        let mut response = format!(
                            "🆘 Help Request Created\n\n\
                            📋 Request ID: {}\n\
                            🎯 Task: {} (ID: {})\n\
                            📂 Project: {}\n\
                            🔧 Help Type: {}\n\
                            ⚡ Priority: {}\n\
                            👤 Requested by: {}\n\
                            🕒 Created: {}\n\n\
                            📝 Description:\n{}\n",
                            help_id,
                            task_context.name,
                            self.task_id,
                            self.project_id,
                            self.help_type,
                            self.priority.as_ref().unwrap_or(&"MEDIUM".to_string()),
                            active.entry.name,
                            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
                            self.help_description
                        );

                        if let Some(requested_from) = &self.requested_from {
                            response
                                .push_str(&format!("\n🎯 Requested from: {}\n", requested_from));
                        }

                        if let Some(context) = &self.context {
                            response.push_str(&format!("\n📖 Context:\n{}\n", context));
                        }

                        response.push_str("\n✅ Help request has been logged and will be visible to other agents.\n");
                        response.push_str(
                            "📬 Notifications have been sent to relevant team members.\n\n",
                        );

                        response.push_str("💡 What happens next:\n");
                        response
                            .push_str("• Other agents can see this help request in the project\n");
                        response.push_str("• You'll be notified when someone responds\n");
                        response.push_str(
                            "• Continue working on other aspects while waiting for help\n",
                        );
                        response
                            .push_str("• Use 'update_task_progress' to log any interim progress\n");

                        // Add help type specific guidance
                        match self.help_type.as_str() {
                            "TECHNICAL" => {
                                response.push_str("\n🔧 Technical Help Tips:\n");
                                response.push_str(
                                    "• Include error messages, stack traces, or specific issues\n",
                                );
                                response.push_str("• Mention what you've already tried\n");
                                response.push_str(
                                    "• Provide relevant code snippets or configuration\n",
                                );
                            }
                            "BLOCKED" => {
                                response.push_str("\n🚧 Blocked Task Tips:\n");
                                response.push_str("• Clearly identify what's blocking progress\n");
                                response.push_str("• Mention dependencies or external factors\n");
                                response
                                    .push_str("• Consider if there are alternative approaches\n");
                            }
                            "CLARIFICATION" => {
                                response.push_str("\n❓ Clarification Tips:\n");
                                response.push_str(
                                    "• Reference specific requirements or specifications\n",
                                );
                                response.push_str(
                                    "• Ask specific questions rather than general ones\n",
                                );
                                response.push_str(
                                    "• Provide context about your current understanding\n",
                                );
                            }
                            _ => {}
                        }

                        Ok(CallToolResult::text_content(vec![TextContent::from(
                            response,
                        )]))
                    }
                    Err(e) => Err(tool_error(
                        "runtime",
                        format!("Failed to create help request: {}", e),
                    )),
                }
            }
            Err(e) => Err(tool_error(
                "runtime",
                format!(
                    "Failed to get task context: {}. Verify project_id and task_id are correct.",
                    e
                ),
            )),
        }
    }
}
