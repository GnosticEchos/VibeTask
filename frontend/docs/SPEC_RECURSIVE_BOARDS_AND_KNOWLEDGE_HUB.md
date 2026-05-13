# Specification: Recursive Boards & Project Knowledge Hub

**Status:** Technical Specification
**Date:** 2026-03-31
**Goal:** Evolve Vibe Tasks into a hierarchical, lifecycle-driven knowledge engine supporting sub-projects (sprints), integrated markdown/mermaid documentation, **first-class links between tasks and project documents**, **project templates at create**, **protected columns**, and **column monitors** with explicit pass/clear rules—without multi-level sub-boards.

## 1. Lifecycle-Driven Workspace (Recursive Boards)

### Concept
The Project Board tracks both "One-off Tasks" and "Sub-Project Epics." Sub-projects move through a shared 5-stage lifecycle on the main board before "expanding" into their own implementation workspace.

### The "Expansion" Gate
*   **Trigger:** A task in the `2. Plan` column has its "Implementation Plan" (Artifact) accepted by a human. The accepted artifact **SHOULD** be traceable via a **task–document link** (e.g. role **`IMPLEMENTATION_PLAN`**) and **`accept-plan`** **SHOULD** persist **`documentId` + `version`** (or snapshot) that was reviewed.
*   **Effect:** 
    *   `planAccepted` toggle is set to `true`.
    *   The backend parses the implementation list and spawns sub-tasks with `parentId = TaskID`.
    *   The task card gains a visual `subBoardOutlineColor` (defined in project settings).
    *   The task stays on the main board in `3. Implement` as a progress proxy.

### Sub-Board Archive
*   When a Sub-Project Epic reaches `5. Finalized`, the sub-board is "Archived."
*   Archived boards are read-only but remain accessible via the hierarchy for historical context.

### Sub-board depth (explicit constraint)
*   **One workspace tier:** Only the **main project board** may host Sub-Project Epics that expand into a dedicated implementation workspace. There is **no** second level of “sub-board inside a sub-board.”
*   **Children and dependencies are fine:** A single epic may have **many child tasks** and normal **task dependencies** (relations) among those children; that is not the same as nesting another expandable sub-board.
*   **When work outgrows one epic:** Prefer **adding more tasks** (or child tasks) under the same epic, or **starting a new project/board** for a distinct initiative—rather than introducing deeper sub-board hierarchy.

## 2. Navigation: The "Workspace Switcher"

### Global Workspace Pulldown
*   **UI Location:** Top navigation bar, next to the Project Name.
*   **Function:** A dynamic dropdown listing all accepted Sub-Projects (`isContainer && planAccepted`).
*   **Metadata:** Displays the task identifier (e.g., `API-1`) and the custom outline color.
*   **Goal:** Allow users to "teleport" between active implementation frontiers without returning to the main board.

## 3. Project Knowledge Hub (Docs Page)

### Integrated Documentation
A new top-level tab in the Project View: **[Board] [Grid] [Members] [Docs]**.

### Features
*   **Markdown Support:** Full rendering of GFM (GitHub Flavored Markdown).
*   **Mermaid Integration:** Native support for rendering diagrams (Flowcharts, Gantt, Sequence) within markdown blocks.
*   **Document Categories:**
    *   `CONSTITUTION`: Global project rules.
    *   `SPECIFICATION`: Feature requirements.
    *   `BRAINSTORM`: Captured discussions/logs.
    *   `POST-MORTEM`: Summaries from finalized sprints.

### Task–document links (required)
*   **Model:** **Many-to-many** within a project: a **task may reference multiple `ProjectDocument`s**, and a **document may be linked from multiple tasks**. Links are **first-class** (not only implied by markdown text or comments).
*   **Link role (per association):** Optional but recommended—e.g. **`SPECIFICATION`**, **`IMPLEMENTATION_PLAN`**, **`REFERENCE`**, **`ATTACHMENT`**—so UIs and agents can treat “the spec for this epic” distinctly from background reading.
*   **Versioning / audit:** When a document **version** changes, the link should record **which document version** was in effect at important events (at minimum **`accept-plan`**: store **`documentId` + `version`**—or equivalent snapshot id—so expansion is tied to the artifact humans reviewed). Listing “current” links may still show the live doc with its latest version; historical acceptance remains queryable.
*   **Surfaces:** Task detail shows **linked docs**; Doc detail (or list) may show **linked tasks**; **Docs** tab remains the authoring home, with navigation from the board.

## 4. Technical Requirements

### Schema Extensions (`Kanban-rewrite`)
*   **Task Table:**
    *   `isContainer: Boolean` (default: false)
    *   `planAccepted: Boolean` (default: false)
    *   `subBoardOutlineColor: String?` (Hex code)
    *   `parentId: Int?` (Self-referential link; **only one hop from the main board**—a child task must not be promoted to `isContainer` with its own expanded sub-board; enforce in validation / `accept-plan`.)
*   **ProjectDocument Table:**
    *   `id, projectId, title, content, type (Enum), version, createdBy, updatedAt`.
*   **TaskDocumentLink Table (required):**
    *   `id, projectId, taskId, documentId`, optional **`role` (Enum)** aligned with link semantics above, optional **`pinnedVersion`** or **`linkedAtVersion`** for audit, timestamps / `createdBy` as needed. Enforce **`projectId`** consistency (task and document belong to the same project).
*   **Project settings (evolutionary):** Persist **column protection policies** and optional **monitor configuration** (which columns are monitored, entry rules). Shape may be **JSON on Project** or **normalized rows**; server must enforce on **task move** and **task update**.
*   **Task (evolutionary):** Persist **per-column monitor pass** state (map or keyed records) and support **clearing** per the rules in **Column monitors and pass flags**. Invalidation is server-applied on edits, re-entry, and human actions as specified.

### API Additions
*   **Agent/User Scoped:**
    *   `GET /api/projects/:id/active-workspaces`: Population for the pulldown.
    *   `POST /api/projects/:id/accept-plan/:taskId`: The expansion trigger (reject if `taskId` is already a child of another task—**no nested sub-boards**).
    *   `GET /api/projects/:id/docs`: List all documents.
    *   `POST /api/projects/:id/docs`: Save agent brainstorms or specs (mutating Docs routes share the **Maintainer or Owner** gate with `accept-plan`; see Permissions below).
    *   `GET /api/projects/:id/docs/:docId`: Retrieve rendered/raw MD.
    *   `GET /api/projects/:id/tasks/:taskId/doc-links`: List documents linked to a task (include **role** and version captured at link or at **accept-plan**).
    *   `PUT /api/projects/:id/tasks/:taskId/doc-links` (or decomposed `POST`/`PATCH`/`DELETE`): Mutate links for that task. **Editor or above** for ordinary **`REFERENCE`** / **`ATTACHMENT`** links; **`IMPLEMENTATION_PLAN`** (and links material to **accept-plan**) **Maintainer or Owner** only, same band as mutating Docs.
    *   Optional: `GET /api/projects/:id/docs/:docId/linked-tasks`: Reverse index for Doc detail UI.

### Permissions: plan acceptance and Docs
*   **Project membership roles** (same terms everywhere as the board: **Owner** > **Maintainer** > **Editor** > **Viewer**).
*   **`POST .../accept-plan`** and **mutating project Docs** (`POST` / `PATCH` / `DELETE` under `/api/projects/:id/docs…`): use **one** minimum role—**Maintainer or Owner**—for both, so “who may accept a plan” and “who may change Docs” are never described with different thresholds.
*   **Human gate (default):** **Agents must not** call `accept-plan` silently. Expansion happens only after a **human** action (UI or explicitly delegated human session). If product later allows agent-initiated accept, that must be a **documented, explicit** rule and API guard—not an accidental side effect of generic task permissions.

### Agents: scoped workspace context
*   When an agent works **inside** a sub-board (child tasks of an epic), **tooling and API defaults** must carry an **explicit `projectId` and parent epic (container task) id**. Prompts, tools, and server-side scoping should treat that pair as the workspace boundary so tasks and updates do **not** leak across epics or the main board without an explicit user/agent choice.

### Protected columns (project settings)
*   **First-class project settings:** Each column may declare a **protection policy** (by column id / stable key). Policies are data-driven so the same board engine applies everywhere; no separate “board type” schema is required for human-in-the-loop zones.
*   **Permission axes (configure per column):**
    *   **Enter:** Who may move a task **into** this column (e.g. **Editor and above**, **Maintainer or Owner only**, or “agent allowed when explicitly prompted” if product enables it).
    *   **Inside:** What agents may do while the task sits here—typically **no forward move** and **no edits** to core fields if the zone is human-owned; optional allowance for **comments** (e.g. findings) if that is explicitly enabled.
    *   **Exit:** Who may move a task **out** to the **next** column—usually **human only** (or **Maintainer or Owner** only) for protected / review columns so agents cannot silently advance work.
*   **Alignment:** Describe **Enter / Inside / Exit** with the same **Owner / Maintainer / Editor / Viewer** vocabulary as the rest of the board. Implementation should enforce policies in the API for both humans and agents (local agents are **untrusted**; the server is authoritative).

### Column monitors and pass flags
*   **Intent:** **Smaller, locally running agents** (or equivalent workers) act as **column monitors**. When a task **lands** in a monitored column, the monitor **challenges** it once per “visit”; the monitor may **pass** the check or **send the task back** to the **previous** column only. **Forward** progression to the **next** stage remains **human-controlled** (and compatible with **protected columns** above: agents do not own the forward edge).
*   **Pass flag:** Per task, track **monitor-passed state per column** (e.g. `passedForColumnId` map or equivalent). After **pass**, the monitor **need not re-run** until that pass is **cleared**—avoids infinite polling on idle cards.
*   **What clears `passed` (mandatory to specify in product + API behavior):**
    *   **Re-entry:** The task **leaves** the column and **enters it again** → clear `passed` for that column.
    *   **Material edit:** A change to fields the monitor cares about (at minimum **title/description/acceptance**; optionally other fields) → clear `passed` for the **current** column.
    *   **Human “request re-review”** (explicit UI or API) → clear `passed` for the selected column.
    *   **Optional (product choice):** New **comments** from non-monitor actors clear `passed` for the current column—use if you want maximum safety; omit if comment noise would thrash monitors.
*   **Who may move a task into a monitored column:** Default: **same as Enter** on that column’s protection policy (often **human or Editor+**). If **agents** may move work **into** a sensitive column (e.g. when “prompted”), that must be **explicit** in settings, **rate-limited**, and optionally gated (e.g. **only from column Y**, or **Maintainer-approved** automation). Prevents abuse such as agents emptying their queue into “Legal review.”
*   **Abuse and thrashing:** Consider **max backward bumps per window**, **cool-off** after repeated rejections, and **audit entries** for pass / bump-back with a **reason code** (task comment, event log, or both).
*   **Concurrency:** Moves use **optimistic concurrency** (`updatedAt` / version) so a **human forward move** and a **monitor backward move** cannot both succeed silently; one wins, the other retries with fresh state.

### Project templates (project create)
*   **On project create**, the user (or admin) picks a **template** that seeds **default columns**, optional **Docs** emphasis, and flags such as **epic / sub-board features** vs a **minimal lifecycle**. All templates share the **same** underlying model: **Project**, **Column**, **Task**—no nested sub-boards in any template.
*   **Examples:**
    *   **Lifecycle / epic** (aligned with §1): columns for Specify → Plan → Implement → …; Sub-Project Epics and workspace switcher available when enabled.
    *   **Ad-hoc ops / research queue:** a small team (e.g. sysadmins, researchers) tracks **one-off work** that is not really a product “project”—e.g. **Inbox → Doing → Waiting → Done**, lighter Docs, epic expansion **off** by default.
*   **Column protection** and **monitor** policies can ship as **template defaults**; projects may **override** in settings after create. Templates are **defaults**, not a second persistence model.

## 5. User Workflow Example
1.  **Init:** User/Agent initializes project with "Specify -> Finalized" columns.
2.  **Epic:** Create task "Sprint 1: Auth" in `Specify`.
3.  **Specify/Plan:** Agent tool generates a Spec and Implementation Plan.
4.  **Accept:** Human reviews MD in Docs tab, clicks "Accept Plan" on the card.
5.  **Build:** "Sprint 1" card outlines in Purple. User switches to "Sprint 1" via the Pulldown to see the generated sub-tasks.
6.  **Diagram:** User adds a Mermaid diagram to `AUTH_FLOW.md` in the Docs hub to guide agents.
