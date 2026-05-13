# Manifest: The Vibe Product Platform
**Version:** 1.6.0 (Balanced6 Mesh)
**Status:** Architecture Finalized / Workspace Pivot
**Date:** 2026-04-12

## 1. Core Vision: The Distributed Lattice
Vibe Tasks is a **High-Fidelity Project OS**. The orchestrator is now architected as a **6-Crate Rust Workspace** to ensure total separation of concerns and zero business-logic duplication.

### The Balanced6 Architecture:
1.  **`vibetask-core`**: Pure domain logic and types.
2.  **`vibetask-hub-client`**: Hardened REST/WS integration.
3.  **`vibetask-app`**: CQRS command/query handlers.
4.  **`vibetask-tool-catalog`**: Centralized tool metadata and column mappings.
5.  **`vibetask-mcp`**: Thin transport adapter for IDE bots.
6.  **`vibetask-cli`**: Thin transport adapter for terminal/cron labor.

## 2. Behavioral Mandate (Stateless Swarm)
*   **One Source of Truth:** All state lives in the VibeTask Hub.
*   **Dual-Tier Identity:** Platform (Read-only) vs Project (Labor) tiers detected at handshake.
*   **JIT Context:** One-call `?inline=true` assembly with strict 4k token budgeting.

---
*Ratified for Balanced6 Workspace Implementation.*
