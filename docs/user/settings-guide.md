# Settings guide

VibeTask groups personal and project configuration in the **Settings hub** (`/dashboard/settings/...`). Cards can be **reordered** when **Edit layout** is on (drag handles). This guide describes each area in user terms.

**Navigation:** Sidebar **Settings**, or **Explore → My account**, then use the left nav: **Account**, **AI Agents**, **Project Settings**, **Theme Builder**, and **Administration** (admins only).

Permissions below use **project role** (Owner, Maintainer, Editor, Viewer) unless noted as **global admin**.

---

## Account (`Settings → Account`)

| Card | What it does | Who can edit |
|------|----------------|--------------|
| **Profile Information** | Display name and how you appear to others | Signed-in user |
| **Password** | Change password (current + new + confirm) | Signed-in user |
| **Active sessions** | Devices/browsers logged in; revoke one session or **Revoke others** | Signed-in user |
| **Preferences** | Language, timezone, email notification toggles (assigned, commented, digest) | Signed-in user |

If you only see read-only text, you are not signed in or the section is hidden for your session.

---

## AI Agents (`Settings → Agents`)

For the platform vs delegate model, see [Working with AI agents](agents.md). Cards:

| Card | What it does |
|------|----------------|
| **Agent Registry** | List your delegate agents, status, regenerate key, delete |
| **Create Agent** | New delegate agent name/description → API key (copy once) |
| **Agent Summary** | Counts (total / active) |
| **Project access** | Per-agent **delegations**: which projects, **VIEWER** or **USER** level, optional column-bound mode |

**Delegation levels (reminder):**

| Level | Agents can |
|-------|------------|
| **VIEWER** | Read project, tasks, columns |
| **USER** | Create/update tasks, comments (writes need platform session on the host) |

---

## Project Settings (`Settings → Project Settings`)

Manages the **currently selected project** (use **Your projects** drawer to switch). Requires membership; many actions need **Maintainer** or **Owner**.

| Card | What it does | Typical role |
|------|----------------|--------------|
| **Overview / context** | Shows which project is active | All members |
| **General Information** | Edit project name, prefix, description; save | Maintainer+ |
| **Add Team Member** | Invite by email with initial role | Maintainer+ |
| **Workspace Members** | Table of members, roles, remove (rules apply) | Maintainer+ view/edit |
| **Columns & descriptions** | Per-column help text for humans and agents | Maintainer+ |
| **Danger Zone** | Delete project (permanent) | Maintainer+ |

**Your projects** drawer: create a new project inline, switch active project for these cards, see fallback if the project list fails to load.

**Jump links** on the page scroll to Overview, General, Invite, Members, Columns, Danger zone.

### Also on the project board (not in Settings hub)

| Location | Purpose |
|----------|---------|
| Project **Members** tab | Same membership ideas as invite/members cards (dialog) |
| **Docs** tab | Project documents |
| **Sub-board** menu | Switch main vs container boards |

---

## Theme Builder (`Settings → Theme Builder`)

| Card | What it does |
|------|----------------|
| **Theme builder** | Preview DaisyUI/Tailwind-style themes, tune palettes, add to your collection |

App-wide theme selection may also appear in preferences or the top bar depending on build. This page is for experimentation and collection management.

---

## Administration (`Settings → Administration`)

Visible to users with **global admin** (or rate-limit management permission). Not for normal project members.

| Card | What it does |
|------|----------------|
| **User directory** | All users, global role, issue **temporary password** |
| **System health** | Database and WebSocket status |
| **Rate Limit Rules** | View/edit/toggle API rate limits |
| **Platform agents** | Deployment-level agents, allowed endpoints, keys |
| **Admin Summary** | Counts (users, rules) |
| **Roadmap cards** | Security, compliance, platform — planned work (informational) |

End users configuring **delegate agents** should use **AI Agents**, not Administration.

---

## Layout controls

On settings pages that support it:

- **Edit layout** — drag cards to reorder your personal grid.
- **Done** — finish editing layout (saved per user via settings-layout API).

---

## Role cheat sheet

| Action | Viewer | Editor | Maintainer | Owner |
|--------|--------|--------|------------|-------|
| View board/tasks | Yes | Yes | Yes | Yes |
| Edit tasks | No | Yes | Yes | Yes |
| Invite / remove members | No | No | Yes | Yes |
| Edit columns / project general | No | No | Yes | Yes |
| Accept implementation plan | No | No | Yes | Yes |
| Delete project | No | No | Yes | Yes |
| Manage delegate agents (own) | — | — | — | Any signed-in user |
| Admin settings | — | — | — | Global admin only |

---

## Related guides

- [Projects and boards](projects-and-boards.md)
- [Tasks and assignments](tasks-and-assignments.md)
- [Working with AI agents](agents.md)
- [User guide index](README.md)
