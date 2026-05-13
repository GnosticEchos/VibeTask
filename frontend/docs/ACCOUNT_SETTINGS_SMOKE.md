# Account settings — manual smoke checklist

Run against a dev backend (`hub`) and SPA with a normal **USER** and an **ADMIN** account. Goal: confirm API + UI behavior matches [ACCOUNT_SETTINGS_API_V1.md](./ACCOUNT_SETTINGS_API_V1.md) and OpenAPI.

## Profile (`GET/PATCH /api/users/me`)

- [ ] Signed in: profile loads; name required on save; avatar URL optional / nullable behaves as expected.
- [ ] Invalid body returns a clear error (not a generic stack trace in UI).

## Password (`POST /api/users/me/password`)

- [ ] Wrong current password → **401** (or app message), not silent success.
- [ ] Weak new password → **400** with readable validation.
- [ ] If Better Auth `changePassword` is missing → **501**; UI explains unavailable state.

## Preferences (`GET/PATCH /api/users/me/preferences`)

- [ ] First load creates/returns defaults (`locale`, `timezone`, `emailNotifications.*`).
- [ ] PATCH partial fields only changes those columns (others unchanged).

## Sessions

- [ ] `GET /api/users/me/sessions`: each row has string `id`, `isCurrent` true for active Bearer session.
- [ ] `GET /api/users/me/sessions/:sessionId`: `expiresAt`, `isExpired` present; **404** for other users’ ids.
- [ ] `DELETE .../sessions/:id` → **204**; **404** if already gone.
- [ ] `POST .../sessions/revoke-others` without `Authorization: Bearer` → **401**; with token → **204** and other sessions cleared.

## Admin-only surfaces

- [ ] Non-admin: admin settings cards hidden or **403** on API; no broken infinite spinners.
- [ ] Admin: rate limits list loads; toggles/updates match UI feedback.

## Layout / i18n

- [ ] No untranslated keys in account cards (`en` / `pl` / `xx` as applicable).
- [ ] Settings grid edit mode: cards respect constraints from `settingsLayoutNormalize` after drag resize.
- [ ] Signed in: change a hub layout, reload — layout matches server (`GET /api/users/me/settings-layout`). “Reset all” clears **local + server** (`DELETE` then empty local).
