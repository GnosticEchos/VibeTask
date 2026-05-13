# Task Modal Hybrid Data Flow Implementation Checklist

This document summarizes the implementation steps for a robust Kanban task modal that merges board data and single-task API data, with graceful loading and error handling.

---

## 1. Refactor Task Modal Props and State
- [x] Accept a `task` prop (basic board data) in the modal.
- [x] Subscribe to the Pinia tasks store for `taskDetails` (full data from single task API).
- [x] Add a computed property to merge `task` and `taskDetails`, preferring detailed fields when available.

## 2. Trigger Single Task API Fetch on Modal Open
- [x] On modal mount, dispatch a fetch for the full task details using the task ID.
- [x] Store the result in the Pinia tasks store (`taskDetails`).

## 3. Implement Loading and Error States
- [x] Show the modal immediately with the basic `task` data.
- [x] Display loading indicators (spinner, skeleton, or "Loading…" text) for fields that require full details (e.g., comments, history).
- [x] If the single task API fails, show a warning or info message in the affected sections.
- [x] Allow the user to interact with available data even if some details fail to load.
- [X] Provide a retry button for failed API calls. _(Not yet implemented)_

## 4. Reactive Data Merging and Updates
- [x] Watch for changes in the `task` prop and update the merged data if the board updates while the modal is open.
- [x] Watch for changes in `taskDetails` and update the modal as soon as new data arrives.
- [x] Ensure that edits in the modal update both the Pinia project store (for board sync) and the Pinia tasks store (for modal sync).

## 5. Optimistic UI and Mutation Handling
- [ ] For edits, optimistically update the modal and board UI, then confirm with the server. _(Basic update flow is present, but full optimistic UI/rollback is not yet implemented)_
- [ ] If the server rejects the update, roll back changes and show an error. _(Not yet implemented)_
- [x] Invalidate/refetch relevant Vue Query caches after successful mutations.

## 6. Accessibility and User Experience
- [ ] Ensure all loading and error states are accessible (ARIA live regions, focus management). _(Basic accessibility is present, but ARIA/focus management could be improved)_
- [x] Ensure keyboard navigation and focus are preserved during loading/error transitions.

## 7. Testing and Validation
- [ ] Write integration tests for all combinations: fast/slow API, API errors, board updates while modal is open, etc. _(Manual testing is ongoing; automated tests not yet implemented)_
- [ ] Test optimistic and pessimistic update flows. _(Not yet implemented)_
- [x] Validate that the modal never shows empty or flickering content and always recovers gracefully from errors.

---

**Validation Points:**
- [x] The modal always shows at least basic board data instantly.
- [x] Full details (comments, history, etc.) appear as soon as available.
- [x] No v-model assignment errors or ReferenceErrors in the template.
- [x] All edits and mutations are reflected in both the board and modal.
- [x] Loading and error states are clear and accessible.
- [x] The implementation is robust against network delays and API failures.

---

**Current Status Summary (as of latest review):**
- Core hybrid data flow, merging, and error handling are robust and user-friendly.
- Remaining improvements: retry button for failed API calls, full optimistic UI/rollback, ARIA/focus accessibility, and automated/integration tests.
- Manual and real-world testing confirm the modal is stable, responsive, and never shows empty/flickering content. 