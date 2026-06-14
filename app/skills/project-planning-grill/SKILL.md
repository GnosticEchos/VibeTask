---
name: project-planning-grill
description: Lightweight agent-guided project onboarding for VibeTask draft projects. One clarifying question per turn; persist answers to hub documents via human API field names.
---

# Project planning grill (VibeTask)

Use this skill when a human asks you to plan a new project before board go-live.

## Workflow

| Step | Agent (MCP / CLI) | Human (Settings) |
|------|-------------------|------------------|
| **Create draft** | MCP `create_draft_project` (platform session; default template `ADHOC_OPS`; use `LIFECYCLE_EPIC` for epic/product flows). CLI: `vibetask-cli project draft create --name "…" --prefix … --template ADHOC_OPS`. | — (agent-owned; switch to the draft under **Settings → Project settings** or **Explore → Drafts** when ready) |
| **Grill** | MCP `load_planning_skill` → `project-planning-grill`. Ask **one question per turn**. Persist with `documents` / `backlog_tasks` on `create_draft_project`, or MCP `create_knowledge_document` / `create_task` with a delegate + platform session. | Answer in chat; optional **Settings → Project settings → Planning skills (project)** to review or customize the grill copy |
| **Preview** | MCP `preview_draft_project` · CLI `vibetask-cli project draft preview <project-id>` | **Settings → Project settings** — **Project acceptance** card (checklist, docs, backlog) |
| **Accept** | Optional kickoff only: MCP `request_project_accept` · CLI `vibetask-cli project accept <id> --init` (human must confirm — agents cannot go live alone) | **Settings → Project settings** — **Accept project**; then **Settings → AI Agents** — create a delegate agent |

## Payload conventions (critical)

- Task create body uses **`name`**, not `title`.
- Backlog tasks on DRAFT: omit `projectColumnId` (null). Column-assigned tasks are blocked until accept.
- Document types: `CONSTITUTION`, `SPECIFICATION`, `IMPLEMENTATION_PLAN`, etc.
- `accept-plan` expands workspaces; **project accept** (Settings or CLI device-code) activates the project.

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
