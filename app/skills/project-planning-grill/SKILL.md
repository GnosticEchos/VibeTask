---
name: project-planning-grill
description: Lightweight agent-guided project onboarding for VibeTask draft projects. One clarifying question per turn; persist answers to hub documents via human API field names.
---

# Project planning grill (VibeTask)

Use this skill when a human asks you to plan a new project before board go-live.

## Workflow

1. **Create draft** — `POST /api/agent/projects/draft` with platform session (default template `ADHOC_OPS`; use `LIFECYCLE_EPIC` for epic/product flows).
2. **Grill** — Ask **one question per turn**. Capture decisions in hub docs (`POST /api/projects/{id}/docs`) or backlog tasks (`POST /api/tasks`).
3. **Preview** — Human reviews `GET /api/projects/{id}/planning/preview` in Settings or CLI `project draft preview`.
4. **Accept** — Human accepts in Settings or CLI device-code flow; then create a delegate agent.

## API conventions (critical)

- Task create body uses **`name`**, not `title`.
- Backlog tasks on DRAFT: omit `projectColumnId` (null). Column-assigned tasks are blocked until accept.
- Document types: `CONSTITUTION`, `SPECIFICATION`, `IMPLEMENTATION_PLAN`, etc.
- `accept-plan` expands workspaces; **project accept** (`POST .../planning/accept`) activates the project.

## Templates

| Template | When | Accept checklist |
|----------|------|------------------|
| `ADHOC_OPS` | Ticket queue / sysadmin (default) | Spec optional |
| `LIFECYCLE_EPIC` | Product epic | Spec required |

## Grill rules

- One question per message; wait for the answer before the next.
- Prefer updating a single living `SPECIFICATION` or `CONSTITUTION` doc over many tiny docs.
- Summarize after every 3–4 answers and offer to continue or move to preview.
- Do not create delegate agents until the project is **ACTIVE**.

## Draft create batch example

```json
{
  "name": "Ops Queue",
  "prefix": "OPSQ",
  "template": "ADHOC_OPS",
  "description": "Internal ticket queue",
  "documents": [
    { "title": "Operating notes", "docType": "OTHER", "content": "# Notes\n" }
  ],
  "backlogTasks": [
    { "name": "Define intake SLA" }
  ]
}
```
