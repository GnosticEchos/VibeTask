# VibeTask: Where Humans and AI Agents Share One Board

*An expression of ideas—for builders, product leaders, and curious engineers. Not a pitch deck; a thought experiment in progress.*

---

## What is VibeTask?

VibeTask is a Kanban-first project hub we’re exploring for mixed teams: people **and** AI agents on the same projects, the same columns, and the same tasks. The question isn’t “can a model do everything in one chat?” but “what **structure** lets humans and agents collaborate without either side going rogue?”

We’re still alpha. These notes capture **design threads** we’re trying—not finished answers. Recurring themes: **projects as the unit of work**, **boards as the unit of visibility**, **authorization layered on purpose**, and **interfaces that stay thin** so the hub remains the source of truth.

---

## Core ideas

### Projects

A **project** is a team workspace: Kanban columns, tasks, members, documents, and optional **workspaces** (nested boards inside container tasks). Every task gets a human-readable ID from a project prefix—`VT-42`, `OPSQ-7`—and can carry relations, comments, and linked specs.

Projects have a **lifecycle**:

| Status | Meaning |
|--------|---------|
| **DRAFT** | Planning-only. Backlog tasks and docs are fine; column-assigned work is blocked until go-live. |
| **ACTIVE** | Normal operation. The board is live; delegates can execute. |

Humans can create an **ACTIVE** project in one step from the web app. Agents typically start in **DRAFT**, run a structured planning conversation, and hand off to a human for **acceptance** before the board goes live.

---

### Agent types

VibeTask distinguishes three practical agent personas—not three different products, but three **shapes of access** you configure in Settings.

#### 1. Platform agent (scout / orchestrator)

Platform agents are **admin-provisioned only**—created in **Settings → Administration**, not by every project owner. They are intentionally **read-only** on the agent API: health checks, metadata, fleet summaries, draft creation—not arbitrary writes under their own key.

Their superpower is **acting context**: the host attaches a short-lived platform session (via MCP `delegate_agent` / CLI `agent session`) so a **delegate** can work on behalf of a real user with that user’s membership. With that context, a platform agent can also see **fleet-wide project stats** across every project the target user belongs to—not just delegated projects.

**Why admins gate the platform agent separately**

We wanted a clean split of responsibility:

| Who | Owns what |
|-----|-----------|
| **Administrator** | One (or few) **platform agents** per deployment—the MCP host, CI runner, or shared automation surface |
| **End users** | Their own **delegate agents** and per-project delegations in **Settings → AI Agents** |

Without that split, every new automation would look like an **admin ticket**: “please provision another agent for my project.” Instead, admins bless the **primary delegate path** (the platform agent on the trusted host). Users then spin up **project delegates** themselves—scoped keys, revocable per automation—without flooding the admin team with project-level churn.

The operational win is a **single upstream kill switch**: disable or revoke the platform agent and session minting stops for that deployment. Every delegate agent that depends on `x-platform-session` for writes goes quiet together—no scavenger hunt across ten projects to revoke individual delegations. Admins stay out of day-to-day project delegate management; users retain fine-grained control until something needs to stop **now**.

Think: *“The deployment the admin trusts to mint sessions—not every bot key in the building.”*

#### 2. Project delegate (full board)

**Delegate agents** are created by users in **Settings → AI Agents**. Each gets an API key (shown once). You assign **delegations**: which projects the agent may touch, at **VIEWER** or **USER** level, with **FULL** board access by default.

| Delegation level | Typical capability |
|------------------|-------------------|
| **VIEWER** | Read project, tasks, columns, docs |
| **USER** | Create/update tasks, comments, documents (writes require a platform session on the host) |

A full-board delegate sees every column and can move work across the workflow—subject to project roles, move policies, and “blocked-by” relations.

Think: *“AgentSmith on project 10—can implement, comment, and advance cards like a trusted teammate.”*

#### 3. Column-gated delegate (COLUMN_BOUND)

The same delegate machinery supports **column-bound** mode: the agent is restricted to **one workflow column** (for example, “Agent Review” or “Waiting on CI”). It cannot freely roam the board; moves and visibility respect that lane.

This is how you run **specialist agents**—review bots, triage bots, release gatekeepers—without giving them the keys to the entire pipeline.

Think: *“Only touch the review column; everything else is read-only or invisible.”*

---

### Authorization and sessions

VibeTask uses a **two-layer model**. Confusing the layers is the most common integration mistake—and the docs call it out on purpose.

```
┌─────────────────────┐     ┌──────────────────────────┐
│  Delegate API key   │     │  Platform session JWT    │
│  (who is the agent?)│  +  │  (who is the human?)     │
└─────────────────────┘     └──────────────────────────┘
            │                            │
            └───────────┬────────────────┘
                        ▼
              Mutating API calls on behalf
              of a user, within delegation scope
```

| Layer | Header / credential | Answers |
|-------|---------------------|---------|
| **Identity** | Agent API key | *Which agent is calling?* |
| **Acting context** | `x-platform-session` JWT | *On whose behalf—and with what membership?* |

**Reads** often work with the delegate key alone (within delegation scope). **Writes** from an agent require a valid platform session minted for a delegate that belongs to the target user.

Humans use normal **bearer sessions** in the web app—same projects, same boards, no agent headers.

**Why this matters:** you can register multiple delegate agents per person (isolation, revocation, different scopes) without sharing one mega-key. Platform agents stay read-only scouts; execution always traces back to a delegated identity plus an explicit user session.

From the **agent’s perspective**, none of this is HTTP. The model sees **MCP tool names** and **CLI subcommands**; the Rust layer attaches keys and sessions. We deliberately avoid teaching agents our REST paths.

---

### Why `/api/agent` exists (parallel surface, narrower gate)

The hub serves **two router families** for similar nouns—projects, tasks, documents—but not the same front door:

| Consumer | Typical routes | Auth model |
|----------|----------------|------------|
| **Web app (humans)** | `/api/projects`, `/api/tasks`, … | Bearer session, full membership roles (Owner → Viewer) |
| **Agents (MCP / CLI)** | `/api/agent/projects`, `/api/agent/.../tasks`, … | Agent API key + delegation lattice + platform session for writes |

The shapes look alike on purpose—agents and humans operate on **one Kanban truth**—but the **agent router is a separate interface** with its own middleware stack: delegation mode (`FULL` vs `COLUMN_BOUND`), `VIEWER` vs `USER`, platform-session requirements, draft-vs-active guards, and scout read-endpoint allowlists for platform agents.

**Why split routers instead of one mega-API?**

1. **Privilege containment** — even a capable agent should not inherit every human capability (invite members, change global settings, delete projects, admin paths). Gating at the **router boundary** keeps escalation logic localized instead of sprinkled through shared handlers.
2. **Simpler agent mental model** — MCP tools map to a smaller, auditable verb set; we don’t ask the model to reason about which human endpoint it might abuse.
3. **Defense in depth** — stolen delegate keys still hit delegation scope, column bounds, and session requirements before a write lands.

Humans stay on the full membership API; agents stay on the **agent-scoped** subset. MCP and CLI are thin translators—agents name tools; Rust names routes.

---

### A pseudo mono-repo bound by OpenAPI

VibeTask’s repo layout is a **pseudo mono-repo**: `hub/`, `frontend/`, and `app/` (Rust CLI + MCP) live at one commit, but each package is a distinct “project” in the organizational sense. What binds them is not shared runtime code—it’s the **OpenAPI contract** at `hub/src/openapi.json`.

```
hub/src/openapi.json  ──►  frontend (sync + TypeScript types)
                        ──►  app/vibetask-hub-client (Progenitor Rust client)
                        ──►  CI validation matrix (validate → sync → gen-types → cargo build)
```

| Package | Role | Contract relationship |
|---------|------|-------------------------|
| **hub** | Source of truth for API behavior + spec | Owns and edits OpenAPI |
| **frontend** | Human thin UI over hub | Consumes synced spec; no second editable copy |
| **app** | Agent/human thin UI (MCP + CLI) | Same spec for generated client; ToolRegistry maps tools → agent routes |

We treat contract drift as a build failure, not a documentation nag. That discipline is how three teams-in-one-repo evolve without silent skew: **if it isn’t in the published contract, it isn’t a cross-package promise.**

Agents and humans ultimately talk to the same hub—but humans through membership routes in the SPA, agents through tool names that compile down to `/api/agent/*`. OpenAPI is the seam.

---

## Design threads we’re exploring

These ideas shape VibeTask beyond “another Kanban with an API.” Some are fully wired; others are directions we’re reasoning toward publicly.

### Context economics: don’t feed the frontier everything

A lot of our thinking follows one line: **frontier models are for judgment; smaller local models are for volume.**

Dumping an entire repo, every task comment, and every doc into one agent turn burns context and blurs accountability. We’d rather **partition work** so each call has a tight brief:

| Role (concept) | Model tier we imagine | Job |
|----------------|----------------------|-----|
| **Task research** | Smaller / local | Gather facts—linked docs, relation graph, column history, prior comments—into a **bounded digest** before anyone edits code or moves cards. |
| **Task validation** | Smaller / local | Check invariants: prefix rules, blocked-by policy, column move policies, draft vs active constraints—**mechanical gates** that don’t need a frontier model. |
| **Execution & planning** | Frontier (when needed) | Interpret intent, grill ambiguous requirements, draft specs, decide trade-offs. |

The **grill** pattern—borrowed from [mattpocock/skills](https://github.com/mattpocock/skills) (`grill-me`, `grill-with-docs`)—fits the same philosophy: one question per turn, don’t preload a 50-field wizard; grow the spec incrementally. We adapted it in `app/skills/project-planning-grill` so answers land in hub docs and backlog tasks, not just the chat transcript.

We’re interested in whether this split keeps agents **cheaper, faster, and more auditable** while reserving expensive reasoning for moments that actually need it.

### No agent delete—hand off to human review instead

From a **human** perspective, agents don’t get a delete button. Destructive intent is reframed as **escalation**.

When an agent requests removal, the hub **moves the card to the Agent Review column** and leaves an audit comment—not a silent wipe. On the web board, that lane is tucked behind **Review Inbox**: a drawer humans open when the badge lights up, pass or reject what the agent flagged, and keep the main columns clean.

```
Agent: "This task is obsolete"
        │
        ▼
  Escalation (agent tool path)  ──►  Move to Agent Review + comment
        │
        ▼
  Human: Review Inbox  ──►  Pass · Reject · Edit · Actually delete
```

Column-bound agents can also **hand off** to Agent Review when they’re done with their lane—same inbox, same human gate. The pattern: **agents propose motion; humans own irreversible outcomes.**

### MCP and CLI: pick your thin UI

End-users shouldn’t be locked into one host. VibeTask exposes the same capabilities through:

| Surface | Who it’s for |
|---------|----------------|
| **Web app** | Humans on the board—drag, Settings, Review Inbox, acceptance flows |
| **MCP** | IDE agents (Cursor, etc.)—tools map to hub operations |
| **CLI** | Scripts, terminals, CI, humans who prefer `vibetask-cli` |

MCP and CLI are intentionally **thin UIs** over shared Rust tooling and the hub OpenAPI contract—not parallel products with divergent behavior. Choose MCP in the editor or CLI in the shell; the **hub** stays authoritative. We’re exploring whether that symmetry makes agent integrations feel boring in the best way: predictable, testable, swappable.

### HelpTree: see the whole CLI before you guess

Nested subcommands are ergonomic for humans and miserable for agents. We kept watching models **invent** flags (`project create-draft`, `draft new`, `accept --force`) and burn turns on 404s before ever reading help. Deep trees (`project` → `draft` → `create`) make that worse—the correct path is three levels down, but the model’s prior is flat.

**HelpTree** is our answer: a recursive **command map** derived from **clap** metadata—no hand-maintained string lists that drift from the binary.

| Audience | How to invoke | What you get |
|----------|---------------|--------------|
| **Human (terminal)** | `vibetask-cli --help-tree` or `vibetask-cli project draft --help-tree` | UTF-8 tree (`tree`-style), optional rich ANSI styling |
| **Agent (host / script)** | Same flags with `-f json` or `--tree-output json` | Machine-readable nested JSON; leaf nodes include **`mcp_tools`** arrays (CLI ↔ MCP parity) |

Discovery flags are **global**—depth limit (`--tree-depth` / `-L`), ignore subtrees (`--tree-ignore`), include hidden commands (`--tree-all`)—so you can skim the surface or drill into one branch without dumping the entire CLI into context.

**Fun fact:** help-tree colors and emphasis are user-tweakable in settings TOML (`vibe-cli.toml` / MCP config), under `[cli.help_tree.command]`, `[cli.help_tree.options]`, and `[cli.help_tree.description]`—style (`normal`, `bold`, `italic`, `bold_italic`) and hex colors per token class. Your tree, your terminal aesthetic.

We leaned on **clap’s recursive command reflection** (`CommandFactory`, subcommand walks) so every new subcommand we add to the Rust CLI automatically appears in the tree—and in the JSON agents should read **before** improvising syntax. MCP `find_tools` helps keyword search; HelpTree is the structural map.

The pattern generalizes beyond VibeTask: we spun up a small **multi-language example repo**—[github.com/james4j/HelpTree](https://github.com/james4j/HelpTree)—showing how to introspect CLI frameworks and render the same nested graph for humans and agents. VibeTask’s Rust implementation is the production instance; the repo is the portable sketch.

---

## A day in the life: creating a project

Below is a **dialog-style walkthrough**—the same story told from each participant’s angle. Names are illustrative.

---

### Scene 1 — The human asks for something new

**Jordan (Product lead, human):**  
“I want to spin up a new project for our internal ops queue. Nothing on the board yet—I need to think through intake and SLAs first.”

**What Jordan sees:**  
Explore and Settings offer **Create project** for instant ACTIVE projects. For agent-assisted planning, Jordan instead says to their platform-connected assistant: *“Start a draft project for the ops queue.”*

---

### Scene 2 — Platform agent opens a draft

**Scout (Platform agent):**  
*Host attaches Jordan’s acting context; Scout invokes planning tools—not REST paths.*

| Surface | What Scout runs |
|---------|-----------------|
| **MCP** | `create_draft_project` (template **ADHOC_OPS**; use **LIFECYCLE_EPIC** when a full product spec is required before go-live) |
| **CLI** | `vibetask-cli project draft create --name "Ops Queue" --prefix OPSQ --template ADHOC_OPS` |
| **MCP** | `load_planning_skill` → `project-planning-grill` (grill playbook) |

**Scout (to Jordan):**  
“I created **Ops Queue** (`OPSQ`) as a **DRAFT**. No column-assigned tasks yet—that unlocks after you accept. First question: **Who submits tickets—only engineering, or the whole company?**”

*One question per turn. No questionnaire dump.*

---

### Scene 3 — The grill (mattpocock/skills → VibeTask draft planning)

**Jordan:**  
“Whole company. Slack and email.”

**Scout:**  
“Got it. Second question: **Do you want a hard SLA (e.g. 24h first response) or best-effort triage?**”

**Jordan:**  
“24h first response for P1; best-effort otherwise.”

**Scout:**  
*Persists answers via MCP `create_task` and document tools into a living **SPECIFICATION** doc and backlog task `Define intake SLA`—backlog only, no column assignment while DRAFT.*

> After 3–4 answers: “Here’s what I captured. Continue grilling, or move to **preview**?” (`preview_draft_project` / `vibetask-cli project draft preview`)

---

### Scene 4 — Preview and accept (human gate)

**Scout (optional, before Jordan opens Settings):**  
*Runs preview tools only—no accept without a human.*

| Surface | Scout |
|---------|-------|
| **MCP** | `preview_draft_project` |
| **CLI** | `vibetask-cli project draft preview <project-id>` |

**Jordan (Settings → Project acceptance):**  
Opens the same planning preview in the browser—name, prefix, template checklist, draft docs, backlog tasks.

**Jordan:**  
“This looks right. **Accept.**” *(human-only path—Settings UI or CLI device-code, not an agent tool that silently goes live)*

| Surface | Jordan |
|---------|--------|
| **Web** | Settings → Project acceptance → **Accept** |
| **CLI** | `vibetask-cli project accept <id> --init` → user code in Settings → `vibetask-cli project accept <id> --code <CODE>` |

Lifecycle: **DRAFT → ACTIVE**. Default columns materialize; accepting an implementation plan can expand workspace containers from linked docs.

**Jordan (Settings → AI Agents):**  
Creates **OpsBot** (delegate), copies API key once, assigns **Ops Queue** with **USER** + **FULL** delegation. OpsBot later joins via MCP `register_agent` / CLI `agent enlist`—still no raw HTTP in the agent’s head.

---

### Scene 5 — Same project, four perspectives

| Participant | What they see | What they can do |
|-------------|---------------|------------------|
| **Jordan (human, Owner)** | Full board, all columns, Settings | Everything—membership, columns, accept plans, delete project |
| **Scout (platform agent)** | Fleet overview tools; draft planning tools | `read_project_overview`, `create_draft_project`, `load_planning_skill`—scout reads, not arbitrary task writes under platform key alone |
| **OpsBot (project delegate, USER / FULL)** | All columns on Ops Queue | Create/update tasks, comments, docs **when host attaches platform session** |
| **ReviewBot (column-gated delegate)** | Primarily **Agent Review** column | Move/review cards in that lane only; cannot freely reprioritize the whole board |

**OpsBot (after session attach):**  
“I’ll take the backlog task **Define intake SLA**, draft the policy doc, and open a task in **Doing**.”

**ReviewBot (COLUMN_BOUND on Agent Review):**  
“I see three cards awaiting review. I’ll comment and move approved work toward **Done**—I can’t pull new work from **Inbox**.”

**OpsBot (later, stuck on a bad task):**  
*Requests removal through the agent escalation path—not a wipe.*

> Task lands in **Agent Review**. Jordan’s **Review Inbox** badge ticks up.

**Jordan (Review Inbox):**  
“OpsBot flagged **OPSQ-9** as obsolete. Fair—I’ll reject and close it myself.”

**Jordan (on Explore):**  
Project card shows **Main board** vs **All tasks** counts—the same scope toggle agents drive via MCP `read_project_overview` / CLI `vibetask-cli project overview --scope main`.

**Jordan (choosing an interface):**  
Morning standup in the browser; afternoon agent work in Cursor via **MCP**; a cron job uses the **CLI** for fleet overview. Same hub, three thin surfaces—none of them require the model to memorize URLs.

---

### Scene 6 — Work continues on one board

Tasks get identifiers humans quote in standup (`OPSQ-12`). Relations show **blocked-by** on the board. Workspaces nest larger efforts without losing the main board’s clarity. Documents hold constitution, spec, and implementation plan—linked from tasks when plans expand into workspace containers.

Humans drag cards; agents invoke **tools**. WebSocket updates keep the UI honest. The story stays coherent because **every actor’s permissions were chosen on purpose**—human routes vs `/api/agent` gates—not inferred from a single key with god-mode HTTP.

---

## Where the board came from

Before agents, drafts, and platform sessions, VibeTask started as a fork of a straightforward Kanban stack by **Łukasz Podlipski** ([@LukaszPodlipski](https://github.com/LukaszPodlipski)):

| Piece | Repository | Stack |
|-------|------------|-------|
| **Kanban frontend** | [github.com/LukaszPodlipski/Kanban-frontend](https://github.com/LukaszPodlipski/Kanban-frontend) | Vue 3, Vite, TypeScript, i18n, WebSockets |
| **Kanban backend** | [github.com/LukaszPodlipski/Kanban-backend](https://github.com/LukaszPodlipski/Kanban-backend) | Node.js, Express, TypeScript |

That pair became the bones of today’s `frontend/` and `hub/` packages. Everything since—multi-project Explore, workspaces, task relations, agent delegations, draft lifecycle, Rust CLI/MCP—was layered on top of that Kanban core. Credit where it’s due: the drag-and-drop board, real-time updates, and Express API heritage trace back to Łukasz’s repos.

---

## What we learned from others

VibeTask didn’t invent spec-driven, agent-native development from scratch. We’re riffing on patterns from projects we admire—then asking how they behave when **Kanban state lives in a hub**, **authorization is explicit**, and **humans keep a veto**.

| Inspiration | Repository | What we borrowed |
|-------------|------------|------------------|
| **GSD** (Get Shit Done) | [github.com/open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) | Relentless focus on shipping through structured agent workflows—**Git. Ship. Done.**—informed how we think about execution loops and CLI/MCP surfaces that serve both humans and agents. |
| **Grill** | [github.com/mattpocock/skills](https://github.com/mattpocock/skills) — [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me), [`grill-with-docs`](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) | Interview **one question at a time** until the decision tree is resolved—not a form dump. VibeTask’s [`project-planning-grill`](../../app/skills/project-planning-grill/SKILL.md) is our hub-backed adaptation (draft projects, docs, backlog tasks). |
| **Spec-Kitty** | [github.com/Priivacy-ai/spec-kitty](https://github.com/Priivacy-ai/spec-kitty) | Spec → plan → tasks → implement → review as a **repeatable lifecycle**; work packages and kanban lanes inspired our draft/accept split, document types, and agent-delegation model—reimplemented as hub projects rather than repo-local `kitty-specs/`. |
| **Agent skills packaging** | [github.com/mattpocock/skills](https://github.com/mattpocock/skills) (same repo) | Portable `SKILL.md` folders and discoverable agent instructions—the packaging pattern behind Grill and our `app/skills/` registry. |

Related lineage worth knowing: [GitHub Spec Kit](https://github.com/github/spec-kit) (`/speckit.*` constitution → specify → plan → tasks → implement) is the broader spec-driven movement Spec-Kitty extends. VibeTask maps that spirit onto **multi-tenant projects** with **explicit agent authorization** instead of a single-repo slash-command workflow.

---

## Closing thought

The industry spent years asking, *“Can AI write code?”* We’re more curious about: *“What scaffolding lets AI **participate** without becoming an admin—or a black hole of context?”*

So far the hypotheses look like this: **projects** everyone can see, **agents** with typed roles, **sessions** that tie automation to a real person, **acceptance** before a draft goes live, **Review Inbox** instead of agent delete, **local models for research and validation** while frontier models handle ambiguity, and **MCP/CLI as thin skins** on one hub.

None of that is sacred. It’s an exploration in public—if you’re thinking along similar lines, we’d love to compare notes.

---

*Document version: May 2026. Product behavior reflects alpha hub + MCP/CLI; verify against [docs/user/agents.md](../user/agents.md) and [docs/user/projects-and-boards.md](../user/projects-and-boards.md) for operational detail.*
