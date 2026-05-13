# Account Settings API v1 (Frontend + hub)

This document defines a minimal, implementation-ready API contract for Account Settings.

**Related:** Settings **hub grid layout** sync (`GET/PUT/DELETE …/settings-layout`) is documented in [`SETTINGS_LAYOUT_SYNC.md`](./SETTINGS_LAYOUT_SYNC.md).

Scope is intentionally small:
- Profile edit (name, avatar URL)
- Password change
- Session/device management (list + revoke)
- Optional user preferences (durable per-account settings)

Out of scope for v1:
- Full 2FA flow (tracked as v1.1 extension)
- Email change + verification pipeline
- Account deletion workflow

---

## 1) Current state (today)

Frontend account page currently exposes:
- editable profile card (`name`, `avatarUrl`, `email` read-only)
- password change form
- active sessions list with revoke actions
- preferences form (`locale`, `timezone`, email notification toggles)

Wiring uses `src/api/v1/authApi.ts` against hub routes under **`/api/users/me`** (see **`src/openapi.json`** in hub for the live contract).

Backend currently guarantees:
- `GET /api/session` with role + permissions hydration
- auth login/register/logout/session compatibility endpoints
- **§3 endpoints shipped:** `GET`/`PATCH` `/api/users/me`, `POST` `/api/users/me/password`, `GET`/`DELETE` session routes + `POST` `…/sessions/revoke-others`, `GET`/`PATCH` `/api/users/me/preferences`

Remaining gaps (relative to product goals, not this §3 list):
- 2FA flow endpoints + UI (v1.1)

---

## 2) Contract goals

- Keep auth/session source of truth on backend.
- Keep profile data in `User` record.
- Keep account-level preferences durable in DB (cross-device).
- Keep purely device-specific UI state in local storage.
- Use explicit, user-friendly error payloads for forms.

---

## 3) Proposed endpoints

Base path: `/api`

### 3.1 Profile

#### GET `/api/users/me`
- Purpose: Fetch editable account profile fields.
- Auth: required (Bearer token)
- Response `200`:

```json
{
  "user": {
    "id": 123,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "avatarUrl": "https://...",
    "role": "USER",
    "permissions": {
      "isAdmin": false,
      "canManageRateLimits": false,
      "canManageUsers": false,
      "canManageSystem": false
    }
  }
}
```

#### PATCH `/api/users/me`
- Purpose: Update profile basics.
- Auth: required
- Request body:

```json
{
  "name": "Jane Doe",
  "avatarUrl": "https://..."
}
```

- Response `200`: same shape as `GET /api/users/me`
- Validation:
  - `name`: 1..100 chars
  - `avatarUrl`: nullable, valid URL when provided

### 3.2 Password

#### POST `/api/users/me/password`
- Purpose: Change current user password.
- Auth: required
- Request body:

```json
{
  "currentPassword": "old-secret",
  "newPassword": "new-secret-strong"
}
```

- Response `204`: no body
- Validation:
  - `newPassword` must satisfy auth policy (length/complexity policy centralized server-side)
- Error cases:
  - `400` invalid payload
  - `401` invalid current password
  - `429` rate limited

### 3.3 Sessions (devices)

#### GET `/api/users/me/sessions`
- Purpose: List active sessions/devices for account security.
- Auth: required
- Response `200`:

```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "createdAt": "2026-03-25T12:00:00.000Z",
      "lastSeenAt": "2026-03-25T12:30:00.000Z",
      "ip": "203.0.113.10",
      "userAgent": "Chrome 135 / Linux",
      "isCurrent": true
    }
  ]
}
```

#### DELETE `/api/users/me/sessions/:sessionId`
- Purpose: Revoke one session/device.
- Auth: required
- Response `204`: no body

#### POST `/api/users/me/sessions/revoke-others`
- Purpose: Revoke all sessions except current.
- Auth: required
- Response `204`: no body

### 3.4 Preferences (durable user settings)

#### GET `/api/users/me/preferences`
- Purpose: Fetch account-scoped preferences used across devices.
- Auth: required
- Response `200`:

```json
{
  "preferences": {
    "locale": "en",
    "timezone": "UTC",
    "emailNotifications": {
      "taskAssigned": true,
      "taskCommented": true,
      "dailyDigest": false
    }
  }
}
```

#### PATCH `/api/users/me/preferences`
- Purpose: Partial update for preferences object.
- Auth: required
- Request body (partial allowed):

```json
{
  "locale": "pl",
  "emailNotifications": {
    "dailyDigest": true
  }
}
```

- Response `200`: full normalized preferences object

---

## 4) Error contract (all new account endpoints)

Standard error payload:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Display-friendly fallback message",
    "fieldErrors": {
      "name": "Name is required"
    }
  }
}
```

`fieldErrors` is optional and used for form-level feedback.

---

## 5) Storage ownership

- `User` table:
  - `name`
  - `email` (read-only in v1 UI)
  - `avatarUrl`
  - `role`
- Auth provider/session tables (Better Auth):
  - password hash lifecycle
  - active sessions/tokens
- New `UserPreference` table (or JSON column):
  - durable account preferences (locale/timezone/notification toggles)
- Frontend local storage:
  - transient UI state only (drawer open, temporary filters, draft form text)

---

## 6) Frontend integration mapping

- `ProfileCard.vue`
  - switch from read-only to editable `name` + `avatarUrl`
  - save with `PATCH /api/users/me`
- `SecurityCard.vue`
  - wire "Change password" modal to `POST /api/users/me/password`
  - add sessions list + revoke actions from `/api/users/me/sessions*`
- keep auth store hydration from `/api/session` as authoritative role/capability source

---

## 7) Suggested implementation order

1. Backend + frontend: preferences endpoints/UI (if needed in this cycle)
2. Backend + frontend: 2FA endpoints/UI

