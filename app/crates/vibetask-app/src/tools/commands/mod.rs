// Command (mutation) tools — re-exported from their defining modules.
// Each tool is available at both `tools::commands::CreateTaskTool`
// and the legacy `tools::CreateTaskTool` path.

pub use crate::tools::core::{
    DelegateAgentTool, RegisterAgentTool, RemoveAgentTool, SwitchAgentTool,
};
pub use crate::tools::discovery::{
    AnnotateDocumentTool, CreateKnowledgeDocumentTool, PinDocumentVersionTool,
};
pub use crate::tools::governance::{
    CommitArtifactTool, ConfirmConstitutionAmendmentTool, CreateTaskTool,
    ProposeConstitutionAmendmentTool, RequestArchitectureReviewTool, SpawnSubBoardTool,
};
pub use crate::tools::workflow::{
    ApproveCompletionTool, LinkDocumentTool, MoveTaskTool, ReflectOnWorkTool, RejectToExecuteTool,
    RequestHelpTool, SetWorkflowContextTool, UpdateTaskProgressTool,
};
