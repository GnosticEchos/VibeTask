# Project scope and gap: target design → current state → actions

**Goal:** Define how the app should be structured, then list concrete steps to get from the current frontend to that design.

---

## 1. Target product scope (how the app should be designed)

### 1.1 Pages and routes

| Route | Purpose | Notes |
|-------|--------|--------|
| `/` | Home | Redirect to `/dashboard` or `/login` as today. |
| `/login` | Auth | Keep. |
| `/dashboard` | Shell | Redirect to `/dashboard/explore`. |
| `/dashboard/explore` | Project list / explore | Main entry: list projects, create project, open board/grid/backlog/members. **Delete project** entry point lives here (e.g. project card menu or dropdown). |
| `/dashboard/project/:id` | Project shell | Tabs: **Board**, **Grid**, **Members**. No project-level “Settings” or “Backlog” page. |
| `/dashboard/account` | User account | Single page for profile/session (when implemented). |
| `/dashboard/preferences` | App preferences | Theme / appearance only. One route; no duplicate “theme-playground”. |

**Removed or merged in target:**

- **Project settings page** (`/dashboard/project/:id/settings`) — remove. Project name/description and column management have never been fully functional here; removing reduces duplication and confusion. Revisit “project settings” later when backend and roles are clear.
- **Backlog page** (`/dashboard/project/:id/backlog`) — remove. Backlog and Grid have almost the same features; Grid (with BacklogStore data) covers unassigned tasks. Keep `useBacklogStore` and its use in Grid/Board; remove only the Backlog route, tab, and view.
- **App “Settings”** (`/dashboard/settings`) with tabs (Account, Theme Selector, Playground, Administration) — simplify. Target: one **Preferences** page for theme/appearance; Account and Administration are separate concerns and can be empty or stubbed until backend (e.g. roles) exists.

### 1.2 Feature ownership (target)

- **Explore:** List projects, create project, navigate to board/grid/members, **delete project** (trigger from project card/menu; re-use existing `ConfirmProjectDeleteDialog`).
- **Board:** Kanban view; works. No change to scope.
- **Grid:** Task table (includes unassigned/backlog tasks via BacklogStore); fits the viewport (minimal extra space above/below).
- **Members:** Project members; keep.
- **Account:** Stub or future profile/session UI; no duplicate “Settings” tab for it.
- **Preferences:** Theme / Theme Playground only; single route; theme selector in topbar/menu is enough — no separate “Theme Selector” tab.
- **Administration:** Stub or future; depends on backend roles; not in scope until roles exist.

### 1.3 Data and CQRS (target)

- **Queries:** One clear path per read (e.g. TanStack Query for projects, board, project, columns, tasks) with shared validation.
- **Commands:** Mutations (e.g. create/update project, update columns, delete project) invalidate the right query keys; no duplicate “project settings” page doing its own fetch/update flow.
- **Delete project:** Single entry point (Explore) and one dialog (`ConfirmProjectDeleteDialog`); no project settings page.

---

## 2. Current state vs target (gap)

| Area | Current | Target | Gap |
|------|--------|--------|-----|
| Project settings page | Exists at `/dashboard/project/:id/settings` (ProjectSettings.vue: project data, columns, danger zone). | Removed. | Remove route, tab, and nav links; relocate “delete project” to Explore. |
| Project tabs | Board, Grid, **Settings**, **Backlog** (+ Add Task). | Board, Grid, Members (no Settings, no Backlog). | Drop Settings and Backlog tabs/routes; keep Board, Grid, Members. |
| Delete project | Only from Danger Zone on project settings page. | From Explore (e.g. project card menu). | Add “Delete project” action on Explore; keep `ConfirmProjectDeleteDialog` and `projectsStore.deleteItem`. |
| Grid layout | Card with large padding; container doesn’t constrain height. | Grid fits viewport with minimal vertical waste. | Make grid container fill available height; reduce outer padding so the table card fits the page. |
| App Settings page | `/dashboard/settings` with tabs: Account (stub), Theme Selector (redundant), Theme Playground, Administration (stub). | Single **Preferences** page for theme; Account/Admin as future. | Simplify to one Preferences route; remove duplicate theme-playground route; drop “Theme Selector” tab (menu already has theme); keep Account/Admin as stubs or remove until backend ready. |
| Account page | `/dashboard/account` (AccountView.vue) is empty. | Same route; content TBD (profile/session). | Leave empty or add minimal stub; ensure nav points here for “Account” (no duplicate in Settings). |
| Theme routes | `/dashboard/preferences` and `/dashboard/theme-playground` both load ThemePlayground.vue. | One route: `/dashboard/preferences`. | Remove `theme-playground` route; point all theme UI to `preferences`. |
| Backlog page | Exists at `/dashboard/project/:id/backlog` (ProjectBacklog.vue). | Removed; Grid shows unassigned tasks. | Remove Backlog route, tab, and view; keep BacklogStore (used by Grid and Board). |

---

## 3. What to keep when removing project settings

- **CreateNewProjectDialog** and **ProjectDataInput** — used when creating a project from Explore; keep.
- **ConfirmProjectDeleteDialog** and **projectsStore.deleteItem** — keep; trigger from Explore (project card menu or dropdown).
- **DangerZone** partial and **ColumnsSectionPartial** / **ProjectDataSectionPartial** — only used by ProjectSettings.vue; can be removed or archived with the project settings page. Column/project-data editing can be re-added later when needed.
- **ProjectDataSectionPartial** — only used in ProjectSettings; safe to remove with the page. Create flow uses `ProjectDataInput` directly.

---

## 4. Ordered action list (current → target)

### Phase A — Remove project settings page and fix navigation

1. **Remove project settings and Backlog routes**  
   - In `src/router/index.ts`, delete the `path: 'settings', name: 'ProjectSettings', ...` and `path: 'backlog', name: 'ProjectBacklog', ...` children under `project/:id`.

2. **Remove Settings and Backlog tabs from project view**  
   - In `src/views/ProjectView.vue`, remove the Settings and Backlog entries from `tabRoutes` and adjust `onTabKeydown` so indices match. Resulting tabs: Board, Grid, Members, (Add Task).

3. **Relocate “Delete project” to Explore**  
   - In Explore (e.g. `ProjectSummaryCard.vue` or the view that lists projects), add a “Delete project” (or “…” menu) that opens `ConfirmProjectDeleteDialog` with the current project id/name. Re-use existing `layoutStore.openDialog({ component: 'ConfirmProjectDeleteDialog', ... })` and ensure `projectStore` has the correct project when dialog opens (e.g. set selected project when opening, or pass project id into the dialog).

4. **Remove or redirect settings-related nav**  
   - In `useProjectTopbarUtilities.ts`, remove or repurpose `navigateToSettings` (e.g. remove from ProjectMembersTopbar if it pointed to project settings).  
   - In `useDynamicTopbar.ts`, remove `ProjectSettings` topbar variant (or leave component but it will no longer be used).  
   - Any other links to `ProjectSettings` route or name should be removed or updated.

5. **Remove Backlog tab, nav, and view**  
   - In `src/views/ProjectView.vue`, ensure the Backlog tab is removed (see step 2).  
   - Remove or repurpose `navigateToBacklog` in `useProjectTopbarUtilities.ts`; remove `ProjectBacklog` from `useDynamicTopbar.ts` (ProjectBacklogTopbar).  
   - Delete or archive `ProjectBacklog.vue`. **Keep** `useBacklogStore` and its usage in `ProjectGrid.vue` and `Board.vue` (Grid and Board still use backlog data).

6. **Optional cleanup**  
   - Move `ProjectSettings.vue`, `DangerZone.vue`, `ColumnsSectionPartial.vue`, `ProjectDataSectionPartial.vue`, and related inputs (e.g. `ProjectColumnsTableInput.vue`) to an `_archived` or `_deprecated` folder if you want to reuse column/project-data UI later; or delete if you prefer to re-implement from scratch. Keep `ProjectDataInput.vue` and `CreateNewProjectDialog`; keep `ConfirmProjectDeleteDialog` and DangerZone logic (dialog only).

### Phase B — Grid fits the page

7. **Make grid fill viewport with minimal extra space**  
   - In `ProjectGrid.vue`, ensure the root container uses the full available height (e.g. `flex-1 min-h-0` so it doesn’t grow past viewport).  
   - Reduce vertical padding (e.g. change `p-4` to a smaller padding or use `py-2 px-4`) so the card isn’t floating with large empty space above/below.  
   - Optionally make the card body scrollable (e.g. `overflow-auto` on the table wrapper) so many rows don’t push the card off-screen. Goal: grid “fits the page” with minimal space above and below.

### Phase C — Simplify app Settings / Preferences

8. **Single Preferences route**  
   - In `src/router/index.ts`, remove the `theme-playground` route.  
   - Keep `/dashboard/preferences` as the only theme/appearance route; ensure it renders `ThemePlayground.vue` (or `UnifiedThemePlayground`).

9. **Simplify Settings view or replace with Preferences**  
   - Option A: Replace `/dashboard/settings` content with a redirect to `/dashboard/preferences` and a single “Preferences” page (theme only).  
   - Option B: Keep `/dashboard/settings` but reduce to one tab: “Theme” (or “Appearance”) that embeds the same theme playground; remove “Theme Selector” tab (redundant with menu); keep “Account” and “Administration” as stubs or remove.  
   - Topbar/menu: Point “Settings” to the chosen pattern (e.g. `/dashboard/preferences` only, or simplified `/dashboard/settings`). Remove duplicate “Theme Playground” link if both existed.

10. **Account and Administration**  
   - Leave Account at `/dashboard/account` (empty or minimal stub).  
   - Administration: keep as stub or menu item disabled until backend roles exist; no implementation required in this scope.

### Phase D — Consistency and docs

11. **Update CODE_REVIEW_AND_ACTION_ITEMS.md**  
    - Mark “Remove project settings page” and “Relocate delete project” as done (or add as new items).  
    - Add “Grid layout: fit page” and “Preferences/Settings simplification” to the checklist.

12. **i18n and accessibility**  
    - Ensure any removed routes/tabs are not referenced in locale files or aria labels. Add or adjust labels for “Delete project” on Explore if you add a button/menu there.

---

## 5. Out of scope (for later)

- **Project name/description and column management** — Reintroduce when backend and product requirements are clear (e.g. a dedicated “Project settings” or “Edit project” flow).
- **User roles and Administration** — Depends on backend; design when roles exist.
- **Account content** — Profile/session UI when needed; route is reserved.

---

## 6. Summary

- **Remove:** Project settings page and route; Settings tab from project view; **Backlog page and route**; duplicate theme-playground route; redundant Theme Selector tab.  
- **Relocate:** “Delete project” from project settings to Explore (project card/menu).  
- **Fix:** Grid layout so the grid fits the page (fill height, less padding).  
- **Simplify:** App Settings → one Preferences page for theme; Account/Admin stubbed or reserved.  
- **Keep:** Board, Grid, Members, Create project flow, ConfirmProjectDeleteDialog, theme in topbar/menu, and **BacklogStore** (used by Grid and Board for unassigned tasks).

Implementing in the order above (Phase A → B → C → D) gets the frontend from the current state to this scoped design. If you want, the next step can be a **PLAN** (file-level checklist for Phase A or B) or **EXECUTE** for specific steps after you confirm the scope.
