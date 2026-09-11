---
description: Structural architectural invariants and core USPs for Minge (Memory Isolation, Append-Only History, Yjs CRDTs, Dual Primitives, Server-Side Key Attribution, Terms v0.1 Lifecycle Compliance, and Strict Database/App Security)
globs: "**/*"
---

# Rule: Minge Core Architecture & USP Invariants

Every technical implementation, schema change, query builder, API route, and UI component in this repository must strictly adhere to the following 7 core architectural invariants:

### 1. Structural Project Memory Isolation (Anti-Bleed / Anti-Hallucination)
- **Schema Level**: Every memory item (embedding, fact, code snippet, decision, document) MUST have a non-null `project_id` foreign key constraint (`project_id UUID NOT NULL REFERENCES minge.projects(id)`).
- **Query Builder Level**: Queries must be scoped by `project_id` at the query builder layer. If `project_id` is missing, undefined, or empty, the query must **fail closed** (return an empty set immediately with zero database roundtrips). Never fall back to an unscoped search.
- **Prompt Grounding**: The LLM must never receive a "global memory". Context windows are assembled strictly server-side from that project's retrieved items. Cross-project data is never fetched into prompt context.

### 2. Append-Only Memory & Context-Bundled Prompt Packages
- **Append-Only Immutability**: Memory records are never destructively overwritten with SQL `UPDATE`. Updates insert a new version and update `superseded_by_id` on the prior record. Active vector queries filter for `superseded_by_id IS NULL AND deleted_at IS NULL`.
- **Top-K Grounded Retrieval**: Rank and retrieve the most relevant $K$ units (semantic similarity + recency + pinned items) rather than dumping raw history.
- **Prompt Packages**: A prompt is never a raw string. It is an immutable/versioned package containing:
  - `system_prompt` & `user_template`
  - References to grounded memory unit IDs (`grounded_memory_ids`)
  - `model_config` (model, temperature, top_p)
  - `latest_output`
  - Version lineage (`parent_id`, `version`, `branch`)

### 3. Yjs CRDT Multiplayer Synchronization
- **Real-Time Primitives**: Real-time multi-cursor, canvas state, and document co-editing rely on Yjs CRDTs over WebSockets.
- **Scoped Rooms**: Rooms are strictly formatted as `${project_id}:${document_id}`.
- **Snapshot & Update Log**: Periodically serialize binary snapshots (`Y.encodeStateAsUpdate`) into Postgres `minge.crdt_snapshots` (`bytea`), and log incremental updates in `minge.crdt_updates` for time-travel replay and undo/redo.
- **AI as a Peer**: When the AI edits documents or canvas nodes, it emits standard Yjs updates that merge seamlessly with human edits without clobbering.

### 4. Dual Collaboration Primitives
- **Prompt IDE (Desktop - Void / VS Code Fork)**: Discrete, versioned, git-shaped. Branch prompts to test in isolation, open Prompt Pull Requests (PPR), review diffs, and merge into production.
- **AI Canvas (Browser Web App)**: Spatial, synchronous infinite canvas. Live multiplayer cursors, document drops, and multi-user live AI steering with Roobinium dark cyberpunk glassmorphic UI.

### 5. Server-Side Shared API Keys & Attribution
- **Zero Client Credential Exposure**: Upstream AI keys live exclusively on the backend server, never shipped to client apps or extensions.
- **Per-User Attribution**: Every request requires `X-User-Id`. Token consumption and latency are recorded in `proxy_audit_logs`.
- **Per-Project Rate Limits**: Enforced at the proxy layer to prevent runaway usage.

### 6. Legal & Data Lifecycle Invariants (Terms v0.1 Compliance)
- **30-Day Soft-Delete Recovery (Section 16.3)**: Content deletion (memories, prompts, canvases) is implemented as a soft-delete (`deleted_at TIMESTAMPTZ`), retained for a 30-day recovery window before permanent purging.
- **Workspace Content Persistence (Sections 3.3, 16.1, 16.2)**: Shared team/enterprise content is decoupled from individual user account lifecycles. An individual member's deletion must not delete organization-owned project assets.
- **Project Memory Management (Section 9.3)**: The backend API must expose explicit endpoints for authorized users to inspect and clear project-scoped memory.
- **Usage Limits Enforcement (Sections 4.5, 14.5)**: Proxy and ingestion layers must enforce account-level and project-level quotas (AI token usage, request rate, file upload size, collaborator counts).

### 7. Database Hardening & Application Security Invariants
- **Row Level Security (RLS) Mandatory**: RLS must be explicitly enabled on all database tables (`ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`). Tenant isolation policies restrict row access strictly to the authenticated project/user context.
- **Dedicated Private Schema (Never in Public)**: Application tables must NEVER be created in the default `public` schema. All tables reside in a dedicated schema (`CREATE SCHEMA IF NOT EXISTS minge;`), and permissions on the `public` schema are revoked.
- **Zero Frontend API Keys**: Upstream AI provider API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) must NEVER exist in client-side code, frontend bundles, or browser environment variables. All requests must route through `services/backend-api`.
- **Mandatory Route Authentication**: All endpoints handling project data, memories, prompt packages, canvas sessions, and proxy completions must enforce JWT Bearer authentication or valid Project Key authorization. Unauthenticated access is immediately rejected with `401 Unauthorized`.
- **Zero Secret Commits (.env Exclusion)**: `.env`, `.env.*`, and credentials files must NEVER be committed or pushed to version control. `.gitignore` must strictly exclude all environment files.
