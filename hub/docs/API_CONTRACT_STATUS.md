# API Contract Status

Tracks **Kanban-rewrite** implementation vs **Kanban-frontend** expectations and the shared **OpenAPI** spec.

**Last updated:** 2026-03-27

---

## OpenAPI workflow

- **Source of truth (edited):** `Kanban-rewrite/src/openapi.json`
- **Frontend copy:** `Kanban-frontend/openapi.json` — keep in lockstep after spec changes.
- **Sync command** (sibling repos `…/Kanban-rewrite` and `…/Kanban-frontend`):

  ```bash
  cd Kanban-rewrite && npm run openapi:sync-fe
  ```

  From the frontend repo:

  ```bash
  cd Kanban-frontend && npm run openapi:sync
  ```

- **Human-readable alignment:** [Kanban-frontend/docs/API_CONTRACT_REVIEW.md](../../Kanban-frontend/docs/API_CONTRACT_REVIEW.md)

---

## Summary

| Area | Status | Notes |
|------|--------|--------|
| Auth / session | Aligned | SPA routes `/api/login`, `/api/register`, `/api/logout`, `/api/session` |
| Users (me, prefs, sessions, settings layout) | Aligned | `/api/users/me/settings-layout` GET/PUT/DELETE; table `UserSettingsLayout` (see migration) |
| Admin (rate limits, user roles) | Aligned | `/api/admin/*` in OpenAPI; requires global ADMIN |
| Agents | Aligned | List totals/limit, `avatarSlug`, metadata; see OpenAPI |
| Projects | Aligned | PATCH accepts `name`, `description`, `status` per `patchProjectSchema`; not `prefix` / membership `role` |
| Tasks | Aligned | `relationId` / `relationMode` in spec; `GET /api/tasks` without `projectId` for cross-project list; comment POST + legacy PATCH |
| Columns | Aligned | `PATCH` / `DELETE` `/api/columns/{id}` |
| Members | Aligned | `GET /api/members/{id}`; `DELETE` requires `projectId` query (frontend sends it) |

---

## Residual / product choices

1. **Project PATCH:** Clients must not rely on updating **`prefix`** or **membership `role`** via `PATCH /api/projects/{id}` — use member endpoints for role changes. Extra JSON keys may be rejected or stripped depending on validation middleware configuration.
2. **Task `relationMode`:** Backend validation accepts a **string**; OpenAPI documents common kebab-case values. Other values may still persist if the API accepts them.
3. **Agents list `500`:** Frontend treats some agent-list failures as an **empty list** for UX; prefer fixing root causes on the backend when they appear in logs.

---

## Implementation checklist (historical)

Earlier reports of missing column/member/task endpoints are **resolved** in both code and OpenAPI. If you add a new route in `src/index.ts`, update `src/openapi.json` and run **`npm run openapi:sync-fe`**.

---

## Testing

```bash
cd Kanban-rewrite
npm run test
npm run test:integration
```

---

## See also

- [REST API Documentation](./REST_API_DOCUMENTATION.md)
- [OpenAPI specification](../src/openapi.json)
- [Frontend API contract review](../../Kanban-frontend/docs/API_CONTRACT_REVIEW.md)
