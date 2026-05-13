# Settings hub layout — backend sync (implemented)

The SPA persists settings hub layouts in **`localStorage`** and **syncs with the API** when signed in (merge by `lastUpdatedAt`; server wins on tie).

**Related:** Profile, password, sessions, and durable preferences are specified in [`ACCOUNT_SETTINGS_API_V1.md`](./ACCOUNT_SETTINGS_API_V1.md) (this doc covers **layout payload** sync only).

### Implemented API (Kanban-rewrite)

- **`GET /api/users/me/settings-layout`** → `{ layout: PersistedSettingsLayoutsV1 | null }`
- **`PUT /api/users/me/settings-layout`** → body `{ layout }` (full replace; validated server-side)
- **`DELETE /api/users/me/settings-layout`** → **204** (used by “Reset all” + clears server copy)

Database: migration `prisma/migrations/20260327130000_add_user_settings_layout` creates `"UserSettingsLayout"` (`userId` PK, `payload` JSONB). Persistence uses Prisma (`userSettingsLayout` upsert) in `settings-layout.repository.ts`. PUT validation enforces the same **card id allowlist** and **w/h bounds** as `SETTINGS_CARD_CONSTRAINTS` in the frontend normalizer (`settings-layout.service.ts` mirrors `src/utils/settingsLayoutNormalize.ts`).

## Current SPA implementation (mirror for backend)

The frontend types and normalizer are the **canonical definition** of `PersistedSettingsLayoutsV1` and allowed card geometry; the API accepts the same shape (see OpenAPI in Kanban-rewrite).

| Item | Location |
|------|-----------|
| Remote sync | `src/stores/settingsLayout.ts` (`pullRemoteLayout`, debounced `putSettingsLayout`); `src/api/v1/authApi.ts` |
| Persisted root type | `src/types/settingsLayoutTypes.ts` → `PersistedSettingsLayoutsV1` (`version: 1`, `userId`, `lastUpdatedAt`, `pages`) |
| Page keys | `SettingsHubPageKey`: `account`, `agents`, `project`, `admin`, `themeBuilder` (same strings as the `pages` map keys) |
| Default layouts per hub | `src/composables/useSettingsLayout.ts` → `defaultPageLayout()` |
| Card id allowlist + min/max `w`/`h` | `src/utils/settingsLayoutNormalize.ts` → `SETTINGS_CARD_CONSTRAINTS` |
| Agents hub default geometry | `AGENTS_LAYOUT_DEFAULT_CARDS` + legacy overlap migration `isLegacyAgentsDefaultFingerprint` in same file |
| Store | `src/stores/settingsLayout` (invoked by grid components) |
| Cross-tab WS | `src/composables/useWebsockets.ts`: subscribe `SettingsLayoutChannel` + `settings-layout:updated` → `applyRemoteWsLayoutPayload` |

**Known card ids** (server allowlist should match or be a superset):  
`account.profile`, `account.security`, `account.sessions`, `account.preferences`,  
`agents.list`, `agents.summary`, `agents.create`, `agents.delegations`,  
`project.context`, `project.general`, `project.invite`, `project.members`, `project.columns`, `project.danger`,  
`admin.users`, `admin.systemHealth`, `admin.rateLimits`, `admin.summary`,  
`admin.roadmapSecurity`, `admin.roadmapCompliance`, `admin.roadmapPlatform`,  
`theme.builder`.

Optional per-card **`hidden`** is supported on placements (see `SettingsLayoutCardPlacement`).

## Payload shape (mirror frontend)

- **Version**: `1`
- **User**: server-side user id (string or numeric as string)
- **`lastUpdatedAt`**: ISO-8601
- **`pages`**: map of page key → layout

Page keys: `account` | `agents` | `project` | `admin` | `themeBuilder`.

Each page:

```json
{
  "grid": { "columns": 12 },
  "cards": [
    { "id": "admin.rateLimits", "x": 0, "y": 0, "w": 7, "h": 7, "hidden": false }
  ]
}
```

- `x`, `y`, `w`, `h` are integers in **grid units** (columns 0-based; row bands use the same unit system as the frontend normalizer).
- Optional `hidden` for future card toggles.

## Notes

- Frontend **clamps** `w`/`h` when editing; backend **rejects** out-of-range `w`/`h` on PUT (same bounds as `SETTINGS_CARD_CONSTRAINTS`).
- **WebSocket:** After **`PUT`** or **`DELETE`** `/api/users/me/settings-layout`, Kanban-rewrite emits **`settings-layout:updated`** with `{ layout }` (`layout` is `null` after delete) to Socket.IO room `SettingsLayoutChannel` + `params: { userId }`. Only the matching session user may subscribe. SPA: `useWebsockets` joins on connect and updates the Pinia store via `applyRemoteWsLayoutPayload` (merge by `lastUpdatedAt`, same rule as pull).

## Project workspace drawer notes

- Project Settings now includes a right-side drawer that lists member projects and supports:
  - selecting active project context without leaving settings,
  - inline create-project flow,
  - fallback rendering of current project when project list fetch is rate-limited/unavailable.
- UI-only hints (e.g. "new" badge for recently created project, prefix validation copy) are client concerns and are not part of this sync payload.
