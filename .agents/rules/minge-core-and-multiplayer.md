---
trigger: always_on
description: Structural architectural invariants, core USPs, and Yjs multiplayer conflict/hierarchy/locking rules for Minge AI.
---

# Rule: Minge Core Architecture, USP & Multiplayer CRDT Invariants

Every schema change, query builder, sync gateway handler, API route, and UI component in this repository MUST strictly adhere to these 8 architectural invariants:

### 1. Structural Project Memory Isolation (Anti-Bleed / Anti-Hallucination)
- **Schema Level**: Every memory item (embedding, fact, code snippet, decision, document) MUST have `project_id UUID NOT NULL REFERENCES minge.projects(id)`.
- **Query Builder Level**: Every query MUST be scoped by `project_id` at the query builder layer. If `project_id` is missing, undefined, or empty, **fail closed** (return empty immediately with zero DB roundtrips). Never fall back to unscoped search.
- **Prompt Grounding**: Never inject "global memory" into an LLM. Assemble context windows strictly server-side from the target project's retrieved items.

### 2. Append-Only Memory & Context-Bundled Prompt Packages
- **Append-Only Immutability**: Never destructively overwrite memory rows via SQL `UPDATE`. Insert a new version and set `superseded_by_id` on the prior record. Active vector queries MUST filter `superseded_by_id IS NULL AND deleted_at IS NULL`.
- **Top-K Grounded Retrieval**: Rank and retrieve Top-K units (semantic similarity + recency + pinned items) rather than dumping raw history.
- **Prompt Packages**: Prompts are immutable, versioned packages containing `system_prompt`, `user_template`, `grounded_memory_ids`, `model_config`, `latest_output`, and lineage (`parent_id`, `version`, `branch`).

### 3. Yjs CRDT Multiplayer Synchronization
- **Real-Time Primitives**: Multi-cursor presence, canvas state, and co-editing use Yjs CRDTs over authenticated WebSockets (Hocuspocus / Yjs WS Gateway + Redis Pub/Sub).
- **Scoped Rooms**: Rooms MUST follow `${project_id}:${document_id}` and fail closed on WebSocket upgrade if JWT/Project membership fails.
- **Snapshot & Update Log**: Persist binary snapshots (`Y.encodeStateAsUpdate`) in `minge.crdt_snapshots` (`bytea`) and append incremental deltas in `minge.crdt_updates` for replay and time-travel.
- **AI as a Peer**: Backend AI workers apply streamed outputs as standard Yjs transactions using origin `'ai-peer:<jobId>'` so edits merge cleanly with human edits without breaking human `Y.UndoManager` stacks.

### 4. CRDT Collision, Hierarchy & Concurrency Invariants
- **Flat Node Map Only (No Nested Child Arrays)**: Store canvas/tree nodes in a flat `Y.Map<Y.Map>` keyed by `nodeId`. NEVER represent parent-child ownership via nested `Y.Array`s (concurrent cross-parent moves cause node duplication).
- **Deterministic Cycle-Free Trees (Mutable Tree Projection)**:
  - Each node MUST store `parentEdges: Y.Map<number>` mapping `parentId -> monotonic counter`. Reparenting increments the node's max counter by 1.
  - Derive the rendered tree via a pure, deterministic projection function `resolveTree(nodes)` that selects the highest `(counter, parentId)` edge per node and breaks any concurrent cycle by ignoring the lower `(counter, nodeId)` edge and falling back to its prior valid parent. Never write reactive mutations back into Yjs to "fix" cycles.
- **Fractional Indexing for Sibling Order**: Store sibling order as a `sortKey` string using fractional indexing with a deterministic `clientId` tie-breaker suffix so concurrent inserts at the same index never collide.
- **Text vs. Property Merging**: Use `Y.Text` (never whole-string `Y.Map` replacement) for prompt/document bodies. Atomic metadata (`x`, `y`, `modelConfig`) uses LWW via `Y.Map`.
- **Yjs Soft-Delete Compliance (No Hard `Y.Map.delete`)**: Because native Yjs deletions drop actor and timestamp metadata, NEVER call `nodes.delete(nodeId)` for user deletions. Set `deletedAt` (epoch ms) and `deletedBy` inside the node's `Y.Map`. `resolveTree()` MUST hide any node whose ancestor has `deletedAt !== null` (tombstone-wins), enabling 30-day recovery.
- **3-Tier Locking for Concurrent AI Execution**:
  1. Broadcast ephemeral generating state via Yjs Awareness to disable duplicate UI triggers.
  2. Enforce a server-side Redis lease (`SET lock:ai:${projectId}:${nodeId} ${jobId} NX EX 60`) plus a monotonic fencing token (`INCR fence:ai:${projectId}:${nodeId}`). Return `409 Conflict` with the active `jobId` on collision.
  3. Validate the fencing token before writing streamed AI chunks to the `Y.Doc` so expired/stalled workers cannot overwrite newer generations.

### 5. Dual Collaboration Primitives
- **Prompt IDE (Desktop - Void / VS Code Fork)**: Git-shaped branching, Prompt Pull Requests (PPR), diffs, and merges into immutable `minge.prompt_packages`.
- **AI Canvas (Browser Web App)**: Spatial synchronous infinite canvas with live multiplayer cursors, document drops, and multi-user AI steering.
- **Bridge Rule**: Canvas sessions edit live Yjs state; explicit Commit/Snapshot actions materialize immutable `minge.prompt_packages` or append-only `minge.memories` rows in Postgres.

### 6. Server-Side Shared API Keys & Attribution
- **Zero Client Credential Exposure**: Upstream AI keys live exclusively in `services/backend-api`.
- **Per-User Attribution**: Every proxy/generation request requires `X-User-Id`; log token usage and latency to `minge.proxy_audit_logs`.
- **Per-Project Rate Limits**: Enforce project and account quotas at the proxy layer before acquiring AI locks.

### 7. Legal & Data Lifecycle Invariants (Terms v0.1 Compliance)
- **30-Day Soft-Delete Recovery (Section 16.3)**: Soft-delete via `deleted_at TIMESTAMPTZ` (and `deletedAt` in Yjs node maps) with a 30-day recovery window before permanent purge.
- **Workspace Content Persistence (Sections 3.3, 16.1, 16.2)**: Decouple shared workspace assets from individual user deletion.
- **Project Memory Management (Section 9.3)**: Expose authorized endpoints to inspect and clear project-scoped memory.
- **Usage Limits Enforcement (Sections 4.5, 14.5)**: Enforce token, rate, upload size, and collaborator quotas at proxy and ingestion layers.

### 8. Database Hardening & Application Security Invariants
- **Mandatory RLS**: `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` on every table with tenant-scoped policies.
- **Dedicated Private Schema**: All tables reside in `minge` (`CREATE SCHEMA IF NOT EXISTS minge;`). Never create tables in `public`; revoke `public` permissions.
- **Zero Frontend API Keys**: No `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` in client bundles or frontend env vars.
- **Mandatory Route Authentication**: All project, memory, prompt package, canvas, and proxy endpoints require valid JWT Bearer or Project Key auth (`401 Unauthorized` otherwise).
- **Zero Secret Commits**: Strictly exclude `.env` and `.env.*` in `.gitignore`.
