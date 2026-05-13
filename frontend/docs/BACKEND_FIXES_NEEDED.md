# Backend fixes needed (for backend team)

Specific issues the frontend is hitting. Fix these so we can remove workarounds and get full functionality.

---

## Resolved

### GET `/api/tasks?projectId=<id>` — fixed (backend)

**Issue:** Returned 500 because Express query params are strings and Prisma expected numbers.

**Backend fix (in `src/api/routes/tasks.ts`):** Added proper type conversion for `projectId` and `assigneeIds` (e.g. `parseInt(projectIdStr, 10)`; for `assigneeIds`, split string and map to numbers). All 103 backend tests pass. Frontend backlog fetch now receives 200 and the task list.

### `relationId` type: create vs update — fixed (backend)

**Issue:** 
- POST /api/tasks: Zod expected `relationId` as **string**
- PATCH /api/tasks: Prisma expected `relationId` as **Int**

**Backend fix (in `src/validation/schemas/task.schemas.ts`):** Changed `relationId` to `z.number().int().positive().optional().nullable()` in all three schemas (createTaskSchema, updateTaskSchema, patchTaskSchema). Now both create and update accept number.

---

## Still open (optional)

### Task move persistence (optional clarification)

**Documented frontend behaviour:** We send **both** (1) a PATCH per moved task with `projectColumnId` and (2) a bulk `PATCH /columns` with updated column order. See `docs/CQRS_DATA_FLOW.md` (Task move strategy). If the backend only needs one of these, we can simplify the frontend; until then we keep both for reliability.

### POST `/api/tasks` — optional hardening (already worked around on frontend)

**Current frontend behavior:**  
- We omit `relationId` and `relationMode` when the user doesn’t set a relation (to avoid 500 on `null`).  
- We send `relationMode` as the API enum (`relates-to`, `blocked-by`, `blocks`), not the display label.

**Nice to have from backend:**  
- Accept optional `relationId` / `relationMode` when present; ignore or treat as “no relation” when omitted.  
- If you validate these fields, return **400** with a clear `message` or `error` (or `errors[]`) so we can show it in the UI. We already read `response.data.message`, `response.data.error`, and `response.data.errors[0]` for the toast.

No change required for current flows; this is for robustness and better error messages.

---

## Summary for backend

| Status   | Endpoint | Note |
|----------|----------|------|
| Resolved | `GET /api/tasks?projectId=<id>` | Fixed via type conversion in `tasks.ts`; backlog loads. |
| Resolved | `relationId` type consistency | Now uses number/int in both POST and PATCH. |
| Optional | `POST /apitasks` | Accept optional relation fields; return 400 with clear validation message if invalid. |
