# Phase 4: DaisyUI UX polish — detailed plan

**Goal:** Replace all `window.alert` with app toasts, standardise loading/skeletons and modals on DaisyUI, fix grid layout to fit the page, and remove legacy UI (PrimeVue-style classes, custom skeletons).

**Prerequisites:** Phases 1–3 done (routing cleanup, data/DRY/CQRS, smoke testing).

---

## 1. Toasts (replace `window.alert`)

**Current state:** `layoutStore.openToast({ message, type, duration })` and `BaseToast.vue` (DaisyUI `toast` + `alert`) already exist and are used in `App.vue`. Several places still use `window.alert` with TODO comments.

**Action:** Replace every `window.alert` with `layoutStore.openToast(...)` and remove the TODO comments.

| # | File | Current code | Replacement |
|---|------|--------------|-------------|
| 1.1 | `src/router/index.ts` | `window.alert('Router error (TODO: DaisyUI toast)')` | `useLayoutStore().openToast({ message: '…', type: 'error' })` (get store before `next()` or pass from guard). |
| 1.2 | `src/views/ProjectView.vue` | `window.alert('Project view error …')` | `layoutStore.openToast({ message: '…', type: 'error' })`. |
| 1.3 | `src/components/layout/dialog/variants/AddNewMemberDialog.vue` | `window.alert(t('members.membersInvited'))` and error alert | `layoutStore.openToast({ message: t('members.membersInvited'), type: 'success' })` and `type: 'error'` for error. |
| 1.4 | `src/components/layout/dialog/variants/ConfirmProjectDeleteDialog.vue` | Two `window.alert` for delete error | `layoutStore.openToast({ message: '…', type: 'error' })` (ensure `useLayoutStore()` is in scope). |
| 1.5 | `src/components/layout/dialog/variants/MemberDialog.vue` | Error and success `window.alert` | `layoutStore.openToast({ message: '…', type: 'error' \| 'success' })`. |
| 1.6 | `src/components/layout/dialog/variants/partials/MemberInvitationPartial.vue` | `window.alert('Member invitation error …')` | `layoutStore.openToast({ message: '…', type: 'error' })`. |
| 1.7 | `src/components/layout/dialog/variants/CreateNewProjectDialog.vue` | Success and error `window.alert` | `layoutStore.openToast({ message: '…', type: 'success' \| 'error' })`. |
| 1.8 | `src/components/dashboard/project/ProjectMembers.vue` | `window.alert('Project member error …')` | `layoutStore.openToast({ message: '…', type: 'error' })`. |
| 1.9 | `src/components/dashboard/project/settings/partials/ProjectDataSectionPartial.vue` | Success and error alerts | `layoutStore.openToast({ message: '…', type: 'success' \| 'error' })`. |

**Router (1.1):** The guard runs outside a component. Either inject the layout store at app level and call it from the guard, or use `pinia.state.value` / get the store from the app instance. Prefer: get store in guard via `const layoutStore = useLayoutStore()` (if Pinia is installed before router) and call `layoutStore.openToast(...)` then `next(...)`.

**Optional:** In `AddNewTaskDialog.vue`, remove the local toast state and `showToast`; use `layoutStore.openToast` for success/error so all toasts go through the global toast. Then remove the local `<BaseToast>` from that dialog.

---

## 2. Modals and dialogs

**Current state:** `Dialog.vue` uses `class="modal modal-open"` and `modal-box`; `DialogTemplate.vue` uses `modal-box`, `modal-action`. These are already DaisyUI modal patterns. No structural change required.

**Actions:**

| # | File | Action |
|---|------|--------|
| 2.1 | `src/components/layout/dialog/Dialog.vue` | Remove the commented `// window.alert('TODO: Replace with DaisyUI Modal')` and the TODO comment. No code change. |
| 2.2 | `src/components/layout/dialog/Dialog.vue` | If `modal-box` width is not respecting `dialogData.size` (e.g. 900px for TaskDialog), apply the size: e.g. bind `style="max-width: dialogData.size || '32rem'"` or a class so large dialogs (TaskDialog) get the requested width. |

---

## 3. Spinners and skeletons

**Current state:** Many places use DaisyUI `loading loading-spinner`; some use custom skeletons or plain text "Loading...".

**Actions:**

| # | File | Current | Action |
|---|------|---------|--------|
| 3.1 | `src/components/layout/topbar/TopbarTemplate.vue` | `props.loading` → `<span class="topbar__sceleton">Loading...</span>` | Replace with DaisyUI skeleton: e.g. `<span v-if="props.loading" class="skeleton h-6 w-48 block" aria-busy="true"></span>`. Remove scoped `.topbar__sceleton`. |
| 3.2 | `src/components/layout/topbar/TopbarTemplate.vue` | Scoped styles use `var(--p-surface-0)` and custom `.topbar__title` | Replace `--p-surface-0` with DaisyUI/Tailwind tokens (e.g. `text-base-content`). Use Tailwind/DaisyUI classes only; remove legacy SCSS that references PrimeVue vars. |
| 3.3 | `src/components/dashboard/board/BoardLoadingSkeleton.vue` | Custom divs with "Loading..." and `align-items-center` | Use DaisyUI `skeleton` class for placeholders: e.g. column headers as `<div class="skeleton h-8 w-32 mb-4">` and card areas as `<div class="skeleton h-24 w-full">`. Remove TODO comment. |
| 3.4 | `src/components/dashboard/board/BoardLoadingSkeleton.vue` | `class="header flex align-items-center mb-4"` | Use Tailwind: `flex items-center mb-4` (no `align-items-center`; use `items-center`). |
| 3.5 | `src/views/ExploreProjectsView.vue` | Already uses `<div class="skeleton rounded w-32 h-40">` | No change; optional: ensure count (3) and sizes match design. |
| 3.6 | `src/components/dashboard/project/ProjectMembers.vue` | Comment `// window.alert('TODO: Replace with DaisyUI Spinner')` and loading state | Remove the comment. Keep existing loading markup or use `<span class="loading loading-spinner loading-lg text-primary">` if not already. |
| 3.7 | `src/components/dashboard/project/ProjectGrid.vue` | Loading: `<span class="loading loading-spinner loading-lg text-primary">` | Already DaisyUI; no change. |
| 3.8 | `src/components/dashboard/project/settings/partials/SettingsSectionTemplate.vue` | `v-if="loading"` → `<div class="h-full w-full bg-blue-500 animate-pulse">` | Replace with DaisyUI skeleton: e.g. `<div class="skeleton h-full w-full">` or `animate-pulse` + `bg-base-300` for consistency. |
| 3.9 | `src/components/dashboard/columns/ColumnHeader.vue` | Comment `// window.alert('TODO: Replace with DaisyUI Tooltip')` | Remove comment. If a tooltip is needed, use DaisyUI `tooltip` + `data-tip` (or existing pattern elsewhere). Implement only if there is a real tooltip requirement. |
| 3.10 | `src/components/base/BaseDialogTextarea.vue` | Comment about DaisyUI Modal/Textarea | Remove comment only; no behaviour change. |

---

## 4. Grid layout (fit the page)

**Current state:** `ProjectGrid.vue` root is `flex flex-col flex-grow min-w-0 overflow-x-auto p-4`. Inner content is a card that can sit in the middle with extra space above/below.

**Actions:**

| # | File | Action |
|---|------|--------|
| 4.1 | `src/components/dashboard/project/ProjectGrid.vue` | Ensure root fills available height: e.g. keep `flex flex-col flex-grow min-h-0` (or `min-h-0` on a flex child so it can shrink). Parent (e.g. ProjectView) must provide a constrained height (flex container with `min-h-0`). |
| 4.2 | `src/components/dashboard/project/ProjectGrid.vue` | Reduce outer padding: e.g. change `p-4` to `py-2 px-4` or `p-2` so the grid card has less empty space above/below. |
| 4.3 | `src/components/dashboard/project/ProjectGrid.vue` | Make the table area scrollable: wrap the table (or card-body) in a div with `flex-1 min-h-0 overflow-auto` so when there are many rows, the card body scrolls instead of growing the page. The card should have `flex flex-col min-h-0` and the table wrapper `flex-1 min-h-0 overflow-auto`. |
| 4.4 | `src/views/ProjectView.vue` (or parent of grid) | Ensure the grid’s parent uses flex and `min-h-0` so the grid can shrink; e.g. the content area that wraps the router-view for the grid should be `flex-1 flex flex-col min-h-0 overflow-hidden` (or equivalent). |

---

## 5. Legacy UI cleanup (PrimeVue / non-DaisyUI)

**Current state:** Some components still use PrimeVue-style class names or CSS variables (`align-items-center`, `flex-column`, `justify-content-between`, `--p-primary-color`, `--p-surface-*`, `pi pi-*`).

**Actions:**

| # | File | Current | Action |
|---|------|---------|--------|
| 5.1 | `src/components/preferences/LocaleSelector.vue` | `align-items-center`, `justify-content-between` | Replace with Tailwind: `items-center`, `justify-between`. |
| 5.2 | `src/components/layout/dialog/variants/partials/TaskCommentsPartial.vue` | `align-items-start`, `flex flex-column` | Use `items-start`, `flex flex-col`. |
| 5.3 | `src/components/layout/dialog/variants/CreateNewProjectDialog.vue` | `class="flex flex-column"` | Use `flex flex-col`. |
| 5.4 | `src/components/layout/dialog/variants/ConfirmProjectDeleteDialog.vue` | `class="flex flex-column gap-2"` | Use `flex flex-col gap-2`. |
| 5.5 | `src/components/layout/dialog/variants/AddNewMemberDialog.vue` | `class="flex flex-column gap-2"` | Use `flex flex-col gap-2`. |
| 5.6 | `src/components/layout/dialog/variants/partials/ConnectedTaskPartial.vue` | `pi-plus`, `pi-times` classes and `class="pi pi-times …"` | Replace with Heroicons or inline SVG, or a small icon component; remove dependency on PrimeIcons. |
| 5.7 | `src/components/layout/topbar/partials/SelectProjectMembers.vue` | `var(--p-primary-color)`, `var(--p-surface-700)` etc. | Replace with DaisyUI/Tailwind: e.g. `border-primary`, `bg-base-300`, `text-base-content`. Remove PrimeVue CSS variables. |
| 5.8 | `src/components/layout/dialog/variants/partials/TaskHistoryPartial.vue` | `flex align-items-start`, `flex flex-column` | Use `flex items-start`, `flex flex-col`. |
| 5.9 | `src/components/layout/topbar/variants/ExploreTopbar.vue` | `flex align-items-center` | Use `flex items-center`. |
| 5.10 | `src/components/base/BaseButton.vue` | Comment "Use class names like \"pi pi-plus\" for icons" | Update comment to mention Heroicons or your icon approach; remove PrimeIcons reference. |
| 5.11 | `src/components/layout/dialog/variants/partials/MemberInvitationPartial.vue` | `flex flex-column`, `p-fluid`, `pi pi-times` | Use `flex flex-col`; replace `p-fluid` with Tailwind width/space classes; replace `pi pi-times` with an icon component or Heroicon. |

---

## 6. BaseToast and layout store

**Current state:** `BaseToast.vue` uses `toast toast-top toast-end` and `alert alert-${type}`; layout store has `openToast`. Works with DaisyUI.

**Optional improvements:**

| # | Action |
|---|--------|
| 6.1 | Ensure `BaseToast` is only rendered once in `App.vue` and receives `duration` from the store so auto-close uses the same value. |
| 6.2 | If `BaseToast` does not already, pass `duration` from layout store and use it in the component’s auto-close (store already sets timeout; component can also respect `duration` for accessibility). |

No mandatory change if current behaviour is correct.

---

## 7. Implementation checklist (ordered)

Execute in this order to avoid rework and keep a single source of truth for toasts and styles.

1. **Toasts**
   - 1.1 Router guard: use `layoutStore.openToast` for router error (ensure store is available in guard).
   - 1.2–1.9 Replace all `window.alert` with `layoutStore.openToast` in the listed files; remove TODO comments.
   - Optional: AddNewTaskDialog – switch to `layoutStore.openToast`, remove local toast.

2. **Modals**
   - 2.1 Remove TODO comment in Dialog.vue.
   - 2.2 Apply `dialogData.size` to modal width in Dialog.vue.

3. **Spinners and skeletons**
   - 3.1 TopbarTemplate: DaisyUI skeleton for loading title; remove `.topbar__sceleton`.
   - 3.2 TopbarTemplate: Replace `--p-surface-*` with Tailwind/DaisyUI classes.
   - 3.3–3.4 BoardLoadingSkeleton: DaisyUI `skeleton` classes; fix `align-items` → `items-center`.
   - 3.6, 3.8, 3.9, 3.10 Remove TODO comments; standardise loading/skeleton markup where needed.

4. **Grid layout**
   - 4.1–4.3 ProjectGrid.vue: flex, padding, and scroll wrapper as above.
   - 4.4 ProjectView (or parent): ensure flex + `min-h-0` for grid area.

5. **Legacy UI**
   - 5.1–5.11 Replace PrimeVue-style classes and variables with Tailwind/DaisyUI; replace `pi-*` icons with your icon set.

6. **Docs**
   - Update CODE_REVIEW_AND_ACTION_ITEMS.md: mark “Replace window.alert with toast” and “DaisyUI polish” items as done (or add a “Phase 4 done” note).
   - Optionally add a short “UI stack” note: DaisyUI + Tailwind; toasts via layoutStore; no PrimeVue.

---

## 8. Summary

| Area | Scope |
|------|--------|
| **Toasts** | 9 files: replace all `window.alert` with `layoutStore.openToast`; optional: unify AddNewTaskDialog toast. |
| **Modals** | Remove TODOs; apply size to Dialog.vue. |
| **Spinners/skeletons** | TopbarTemplate, BoardLoadingSkeleton, SettingsSectionTemplate use DaisyUI skeleton/spinner; remove legacy SCSS vars and TODO comments. |
| **Grid** | ProjectGrid + parent: flex, min-h-0, reduced padding, scrollable table area. |
| **Legacy** | 11 touchpoints: `flex-column` → `flex-col`, `align-items-*` → `items-*`, `--p-*` → DaisyUI/Tailwind, `pi-*` → Heroicons or app icon component. |

After this, the app should have consistent toasts, DaisyUI-based loading/skeletons, a grid that fits the viewport, and no PrimeVue-style classes or variables in active code paths.
