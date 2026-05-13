# Grid Tab Implementation Checklist

This checklist guides the implementation of a new **Grid** tab/page on the dashboard project view, using TanStack Table (Vue) and Vue Draggable Plus, styled with DaisyUI/Tailwind and a frosted glass effect. The Grid page will replicate Backlog functionality, improve accessibility, and prepare for Backlog removal.

---

## 1. Tab & Route Setup
- [x] Add a new "Grid" tab to the dashboard project view.
    - Order: **Board, Grid, Settings, Add Task**
- [x] Update tab navigation logic and routes/views to include the new Grid page.
- [x] Ensure tab state (active, navigation) is managed correctly.

## 2. Component Structure
- [x] Create `ProjectGrid.vue` in `src/components/dashboard/project/`.
- [x] Use the same data sources and actions as `ProjectBacklog.vue` (Pinia store, API calls, modals).
- [x] Extract shared logic (data fetching, actions, modal opening) into composables or shared stores for DRYness.

## 3. TanStack Table Integration
- [x] Install `@tanstack/vue-table` if not already present.
- [x] Define columns and data for the table, using a `ref` or `computed` for reactivity.
- [x] Initialize the table with `useVueTable`.
- [x] Render the table using `<FlexRender>` for headers and cells.
- [x] Ensure each row has a unique, stable `id`.

## 4. Vue Draggable Plus Integration
- [x] Install `vue-draggable-plus` if not already present.
- [x] Apply `v-draggable` to the `<tbody>` or `<tr>` elements, binding to the data array.
- [x] Implement the `@end` event handler to update the data array and reassign it for reactivity.
- [x] Ensure row order updates are reflected in the store and UI.

## 5. Styling (DaisyUI/Tailwind + Frosted Glass)
- [x] Use DaisyUI `table`, `table-zebra`, and related classes for the table.
- [x] Wrap the table in a container with:
    - `bg-base-100/70` or `bg-base-200/70` (for frosted glass)
    - `backdrop-blur-md` (for blur effect)
    - `rounded-lg`, `shadow-lg` (for card-like appearance)
    - `overflow-x-auto` (for responsiveness)
- [x] Match the frosted glass look of Board.vue task cards.
- [x] Use DaisyUI/Tailwind for all spacing, font, and color.

## 6. Accessibility
- [x] Ensure all rows and cells are focusable and keyboard accessible (`tabindex`, ARIA roles).
- [ ] Enable keyboard DnD in Vue Draggable Plus config.
- [x] Use DaisyUI focus utilities (e.g., `focus:outline-primary`).
- [x] Test color contrast and focus indicators.

## 7. Modal/Action Integration
- [x] Use the same modal/dialog components for task details as Backlog.
- [x] Ensure actions (edit, assign, etc.) work from the Grid page.

## 8. DRY & Cleanup
- [x] Refactor shared logic into composables or stores to avoid duplication.
- [ ] Remove the Backlog page and tab once the Grid page is fully functional and tested.
- [ ] Update documentation and code comments to reflect the new structure.
- [ ] Investigate and resolve the 'will-change' CSS warning seen in browser logs.

---

## 9. Parent-Child Data Sync & VueDraggable Plus Best Practices
- [ ] Ensure ProjectGrid.vue always sources its data from the Pinia store or a computed property derived from it (never from a stale local copy).
- [ ] Use a local, deep-cloned array (`localTableData`) for VueDraggable Plus, and keep it in sync with the store/computed data using a `watch` (deep clone on change).
- [ ] After any modal edit or external mutation, update the Pinia store with a **new array reference** (deep clone or `$patch`), not by mutating objects in place.
- [ ] Use `storeToRefs` or `toRefs` for all Pinia store data in components to ensure reactivity.
- [ ] After a modal edit, ensure the store is patched or the relevant Vue Query cache is invalidated/refetched, so all children (including the grid) update reactively.
- [ ] Avoid direct mutation of store state; always use Pinia actions or `$patch` for updates.
- [ ] If data is updated externally (e.g., via API or another tab), re-fetch or re-patch the store to avoid stale data in the grid.
- [ ] Test that after any edit (drag, modal, or external), the grid updates immediately and reflects the latest state without a manual reload.
- [ ] Document any divergence from this pattern in code comments and the checklist.

---

**Tip:** Test each step before moving to the next. Use DaisyUI and Tailwind for all UI, and ensure accessibility and reactivity throughout. 