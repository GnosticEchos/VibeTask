# Dialog Overlay Audit & Redesign Plan

## 1. Dialog Overlay Inventory

| File Name                        | Purpose                        | Known Issues/Notes                                      |
|----------------------------------|--------------------------------|---------------------------------------------------------|
| TaskDialog.vue                   | View/edit task details         | Complex, cluttered, dynamic data issues                 |
| AddNewTaskDialog.vue             | Create a new task              | Input fields may not initialize, cluttered UI           |
| MemberDialog.vue                 | View/edit member details       | Not easily accessible, unclear trigger                  |
| AddNewMemberDialog.vue           | Add a new member               | Not easily accessible, unclear if used                  |
| CreateNewProjectDialog.vue       | Create a new project/board     | UI clutter, input issues, sometimes fails to load       |
| ConfirmProjectDeleteDialog.vue   | Confirm project deletion       | Simple, but may lack consistent styling                 |

## 2. Dialog Partials Inventory

| File Name                  | Used In                | Purpose/Notes                        |
|---------------------------|------------------------|--------------------------------------|
| ConnectedTaskPartial.vue  | TaskDialog             | Manage related tasks                 |
| MemberInvitationPartial.vue| MemberDialog           | Invite new members                   |
| TaskCommentsPartial.vue   | TaskDialog             | Show task comments                   |
| CommentInputPartial.vue   | TaskDialog             | Add a comment                        |
| TaskHistoryPartial.vue    | TaskDialog             | Show task history                    |

## 3. Dialog Base Components

| File Name         | Purpose/Notes                                      |
|------------------|---------------------------------------------------|
| Dialog.vue       | Main dialog loader/manager (dynamic import issues) |
| DialogTemplate.vue| Base template for dialog content                  |

## 4. Settings Page (PreferencesView.vue)
- Not a dialog, but suffers from similar issues: clutter, unclear data flow, poor UX.
- Needs redesign for clarity, usability, and maintainability.

## 5. Redesign Proposal

### Goals
- **Consistency:** Use PrimeVue `<Dialog>` for all overlays for accessibility, theming, and focus management.
- **Simplicity:** Each dialog should focus on a single task (e.g., edit task, add member).
- **Reliability:** Ensure all input fields are properly initialized and reactive to store/API data.
- **Accessibility:** All dialogs should be accessible from the UI with clear triggers.
- **Localization:** Centralize all string resources for dialogs and settings, enabling easy localization and management in a system settings-like way.

### Steps
1. **Migrate all overlays to PrimeVue `<Dialog>`.**
2. **Refactor dialog triggers:** Ensure every dialog is accessible from the UI.
3. **Simplify dialog content:** Remove clutter, focus on primary user actions.
4. **Centralize string resources:** Use a JSON or similar resource file for all dialog labels, help text, and messages.
5. **Redesign Settings page:** Apply the same clarity and usability principles.

## 6. Recommendations & Next Steps
- Audit all dialog triggers in the UI and codebase.
- Remove or refactor unused dialogs.
- Begin migration to PrimeVue `<Dialog>` for overlays.
- Design and implement a string resource management system for localization.
- Redesign the Settings page for clarity and maintainability.
- Document all changes and keep this audit up to date.

---

*This document should be updated as dialogs are refactored or new overlays are added.* 