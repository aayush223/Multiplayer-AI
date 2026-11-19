# Product Requirements Document (PRD)

## Project: Minge — Multiplayer AI Platform

---

## 1. Executive Summary & Core Thesis

### 1.1 The Problem

Today, AI assistance is locked in isolated, private chat boxes per user. When team members interact with an AI model, their context, steering instructions, prompt modifications, and discovered insights remain siloed on their individual machines. Sharing prompts requires copying text into Slack or documentation, which loses grounding context, model parameters, and execution history.

### 1.2 The Solution & Thesis

**Minge** transforms AI from an isolated single-player tool into a **shared, persistent, multiplayer team member**. Multiple engineers and team members interact within the same live session simultaneously with shared project memory, real-time presence, and versioned artifacts — bringing the collaborative leap of Google Docs and Figma to AI systems.

### 1.3 The Two Collaboration Primitives

The platform recognizes that engineers and product collaborators think about AI differently:

1. **Prompt IDE (Engineers)**: Discrete, versioned, git-shaped. Prompts are treated as backend software artifacts with branch isolation, testing, Prompt Pull Requests (PPR), visual diffing, and merging into production.
2. **AI Canvas (Collaborators & Designers)**: Spatial, fluid, and synchronous. Multiple users share an infinite canvas, see each other's live cursors, drop reference documents, and steer live AI agents simultaneously. Correction is immediate via undo/redo rather than code review diffs.

---

## 2. Definitive Locked-In Tech Stack

To maintain architectural integrity and prevent drift, the technology choices are **strictly locked** as follows:

| Layer | Technology | Exact Version / Spec | Purpose / Rationale |
| :--- | :--- | :--- | :--- |
| **Workspace / Monorepo** | Node.js + npm workspaces | Node.js v20+ LTS | Multi-package repository management (`services/`, `apps/`, `packages/`). |
| **Language** | TypeScript | v5.4+ (Strict Mode, ES2022) | Full end-to-end type safety across backend, sync server, and clients. |
| **Backend API Service** | Fastify | v4.26+ | High-throughput, low-overhead HTTP API server for memory and proxying. |
| **Primary Database** | PostgreSQL + pgvector | PostgreSQL 16 (`pgvector:pg16`) | Relational integrity with native vector similarity search (`vector(1536)`). |
| **DB Client & Migrations** | `pg` (node-postgres) | v8.11+ | Clean parameterized SQL execution, connection pooling, and pgvector `<=>` distance queries. |
| **Real-Time Sync Protocol**| Yjs + `ws` | Yjs v13+, `ws` v8+ | Industrial-grade CRDT document synchronization and multi-client state management. |
| **Sync Server** | Standalone Node.js process | Node.js v20+ | Independent Yjs WebSocket service handling room isolation and binary persistence. |
| **Data Validation** | Zod | v3.23+ | Runtime contract validation for API payloads, environment variables, and schemas. |
| **LLM Gateway / Proxy** | Multi-Provider Gateway | OpenAI-compatible format | Standardized proxy supporting OpenAI, Gemini (via OpenAI adapter), Anthropic, and Ollama. |
| **Embedding Engine** | Standardized 1536-dim | `text-embedding-3-small` or equivalent | Consistent 1536-dimensional vector space for all ingested memory items. |
| **AI Canvas Frontend** | React + Vite | React 18, Vite 5 | Fast, responsive web SPA for the infinite spatial canvas. |
| **Canvas UI Styling** | Vanilla CSS + CSS Variables | CSS3 / Glassmorphism tokens | High-performance Roobinium cyberpunk aesthetic (dark mode, neon glows, glass cards). |
| **Prompt IDE Base** | Void (VS Code Fork) | Apache 2.0 Base | Desktop editor shell with custom Agent Webview panel and Yjs editor bindings. |
| **Test Framework** | Vitest | v1.4+ | Lightning-fast TypeScript test runner for unit and integration testing. |
| **Containerization** | Docker Compose | Compose v2 | Local container orchestration for PostgreSQL with pgvector and services. |

---

## 3. System Architecture & Topology

```text
                               ┌─────────────────────────────────────────┐
                               │       Desktop Prompt IDE (Void)         │
                               │  - Tabbed Editor & Source Control       │
                               │  - Agent Webview Panel (Prompt PRs)     │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    │  (Yjs WS / REST)
┌────────────────────────────────────────┐          │
│        Standalone AI Canvas            │──────────┤
│        (React / Vite Web App)          │          │
│  - Spatial Infinite Canvas             │          │
│  - Multiplayer Presence & Cursors      │          │
│  - Roobinium Cyberpunk Glassmorphism   │          │
└───────────────────┬────────────────────┘          │
                    │                               │
                    │ (Yjs WebSocket)               │ (REST: Memory & Proxy)
                    ▼                               ▼
     ┌─────────────────────────────┐  Sync  ┌───────────────────────────────────┐
     │      Yjs Sync Server        │◄──────►│         Backend API Service       │
     │      (services/sync-server) │ Bridge │        (services/backend-api)     │
     │  - Room: project_id:doc_id  │        │  - Strict Project Isolation       │
     │  - Binary Update Log        │        │  - Append-Only Memory Store       │
     │  - Periodic Snapshotter     │        │  - Multi-Provider LLM Gateway     │
     │  - Agent Update Dispatcher  │        │  - Server-Side API Keys & Quotas  │
     └──────────────┬──────────────┘        └─────────────────┬─────────────────┘
                    │                                         │
                    │               PostgreSQL 16             │
                    └────────────────────►▲◄──────────────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │   Extension: pgvector (1536)    │
                         │   - projects                    │
                         │   - memories (append-only)      │
                         │   - prompt_packages (branches)  │
                         │   - crdt_snapshots (bytea)      │
                         │   - crdt_updates (bytea)        │
                         │   - proxy_audit_logs            │
                         └─────────────────────────────────┘
```

---

## 4. Data Models & Database Schema

### 4.1 Schema Definition (PostgreSQL 16 + pgvector)

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dedicated private application schema (Never use public schema)
CREATE SCHEMA IF NOT EXISTS minge;
REVOKE ALL ON SCHEMA public FROM public;

-- 1. Projects (Tenant / Workspace boundary)
CREATE TABLE minge.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'individual', -- 'individual', 'team', 'enterprise'
    api_key_hash VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Memories (Strictly project-scoped, append-only, 30-day recoverable)
CREATE TABLE minge.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'fact', 'decision', 'code_snippet', 'document'
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    superseded_by_id UUID REFERENCES minge.memories(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL, -- Soft-delete: 30-day recovery period
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_project_id ON minge.memories(project_id);
CREATE INDEX idx_memories_embedding ON minge.memories USING hnsw (embedding vector_cosine_ops)
    WHERE superseded_by_id IS NULL AND deleted_at IS NULL;

-- 3. Prompt Packages (Versioned prompt artifacts, 30-day recoverable)
CREATE TABLE minge.prompt_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    branch VARCHAR(100) NOT NULL DEFAULT 'main',
    system_prompt TEXT NOT NULL,
    user_template TEXT NOT NULL,
    grounded_memory_ids UUID[] DEFAULT '{}',
    model_config JSONB NOT NULL DEFAULT '{"model": "gpt-4o", "temperature": 0.7}'::jsonb,
    latest_output TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES minge.prompt_packages(id),
    status VARCHAR(50) DEFAULT 'merged', -- 'draft', 'in_review', 'merged'
    created_by VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL, -- Soft-delete: 30-day recovery period
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompts_project_branch ON minge.prompt_packages(project_id, branch)
    WHERE deleted_at IS NULL;

-- 4. CRDT Binary Snapshots (Yjs state persistence, 30-day recoverable)
CREATE TABLE minge.crdt_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL,
    snapshot BYTEA NOT NULL,
    update_count_at_snapshot INTEGER NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL, -- Soft-delete: 30-day recovery period
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_crdt_latest_snapshot ON minge.crdt_snapshots(project_id, document_id);

-- 5. CRDT Append-Only Update Log (Replay, time-travel, and undo/redo)
CREATE TABLE minge.crdt_updates (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL,
    update_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crdt_updates_doc ON minge.crdt_updates(project_id, document_id, id);

-- 6. Proxy Audit Logs (Attribution, rate limiting, and cost tracking)
CREATE TABLE minge.proxy_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_audit_project_user ON minge.proxy_audit_logs(project_id, user_id);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES - MANDATORY ON ALL TABLES
-- ==========================================================
ALTER TABLE minge.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.prompt_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.crdt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.crdt_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.proxy_audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (Project Context)
CREATE POLICY project_isolation_memories ON minge.memories
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

CREATE POLICY project_isolation_prompts ON minge.prompt_packages
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

CREATE POLICY project_isolation_snapshots ON minge.crdt_snapshots
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

CREATE POLICY project_isolation_updates ON minge.crdt_updates
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

CREATE POLICY project_isolation_audit ON minge.proxy_audit_logs
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);
```

---

## 5. Core Functional Specifications

### 5.1 Project-Scoped Memory Layer & Anti-Bleed Guarantees

- **Hard Schema Constraint**: Every memory record contains `project_id UUID NOT NULL REFERENCES projects(id)`.
- **Query Builder Isolation**: Memory retrieval queries MUST receive a validated `project_id`. If `project_id` is missing, undefined, or empty, the query builder **fails closed**, returning an empty set immediately with zero database roundtrips.
- **Append-Only Immutability**:
  - When a memory item is corrected or updated, the system does not execute a SQL `UPDATE` on content.
  - A new memory record is inserted with incremented `version`.
  - The superseded record's `superseded_by_id` pointer is updated to point to the new record.
  - Vector similarity queries filter for `superseded_by_id IS NULL`, ensuring only active knowledge is retrieved while complete historical lineage is preserved for audits and time-travel.
- **Semantic Retrieval**: Top-K retrieval utilizes cosine distance (`<=>` operator) with HNSW indexing, combining semantic score + recency weighting + explicit user pins.

### 5.2 Multi-Provider LLM Proxy Gateway

- **Zero Client Credential Leakage**: Clients never receive or store upstream provider API keys. All keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) reside exclusively in server-side configuration.
- **Standardized OpenAI-Compatible Ingestion**: Accepts standard chat completion requests (`messages`, `model`, `temperature`, `stream`) and translates them to the configured provider.
- **Streaming SSE**: Native Server-Sent Events streaming with low time-to-first-token.
- **Per-User Attribution**: Every request requires an `X-User-Id` header. The proxy records token consumption per user into `proxy_audit_logs` for team visibility and quota enforcement.

### 5.3 Standalone Yjs Real-Time Sync Server

- **Isolated Room Format**: Rooms are formatted strictly as `${project_id}:${document_id}`. Clients cannot subscribe across project boundaries.
- **Dual Persistence Strategy**:
  - *Periodic Snapshots*: Periodically (every N updates or M seconds of inactivity), the in-memory document is serialized with `Y.encodeStateAsUpdate(doc)` and written to `crdt_snapshots`.
  - *Append-Only Update Log*: Every incoming Yjs binary update message is written to `crdt_updates`.
- **Seamless Reconnect**: On room connection, the server queries the latest snapshot and replays subsequent updates to bring the client to the exact current state.
- **AI Agent as Collaborative Peer**: The backend API can dispatch synthetic Yjs updates directly to the sync server room, allowing AI edits to merge smoothly alongside human edits without clobbering.

### 5.4 Prompt IDE (Desktop - Void Fork)

- **Versioned Prompt Artifacts**: Prompts are stored in `.prompt.json` format containing the prompt text, model parameters, and references to grounded memory IDs.
- **Prompt Branching & PRs**:
  - Developers can create a branch (e.g., `experiment/clarify-summary`) to test prompt changes in isolation against benchmark evaluations.
  - Opening a Prompt PR computes a structured diff of system prompt, variables, and output quality metrics.
  - Team members review and approve before merging into the `main` branch.

### 5.5 AI Canvas (Browser - Roobinium Cyberpunk UI)

- **Infinite Spatial Workspace**: Infinite pan, zoom, and coordinate transform viewport.
- **Multiplayer Presence**: Live peer cursors with individual names and custom avatar colors rendered using Yjs Awareness.
- **Card Primitives**:
  - *Prompt Node*: Editable prompt block with model selector, run button, and token counter.
  - *Document Node*: File/text drop zone that auto-chunks and creates project memory embeddings.
  - *AI Output Node*: Streaming response card with undo/redo branching.
- **Visual Design (Roobinium Aesthetic)**:

### 5.6 30-Day Recovery Period & Soft-Deletion Lifecycle (Terms v0.1 Compliance)

- **Soft-Delete Invariant**: Deleting a memory item, prompt package, or canvas document sets `deleted_at = NOW()` rather than executing a destructive `DELETE`.
- **30-Day Recovery Window**: Soft-deleted entities remain recoverable for 30 calendar days via an explicit `POST /api/projects/:id/.../restore` endpoint.
- **Automated Retention Purge**: A scheduled background worker permanently purges records where `deleted_at < NOW() - INTERVAL '30 days'`.
- **Query Filtering**: All active memory retrieval queries, prompt listings, and room sync snapshots automatically filter `WHERE deleted_at IS NULL`.

### 5.7 User Memory Inspection & Deletion Controls (Terms Section 9.3)

- **Inspect Endpoint**: Users can view all ingested memory items, chunk metadata, and active embeddings for their project via `GET /api/projects/:id/memories`.
- **Clear Project Memory**: Users can clear all active project context via `DELETE /api/projects/:id/memories/clear` (soft-deletes all non-deleted project memories with a 30-day recovery undo capability).
- **Workspace Decoupling**: An individual member leaving or deleting their personal account does NOT delete organization-owned project memories or prompt packages.

### 5.8 Usage Limits & Quota Enforcement (Terms Sections 4.5 & 14.5)

- **Account Tiers**: `individual` (free tier quotas), `team` (higher concurrency & storage), `enterprise` (custom quotas & dedicated pools).
- **Proxy Rate Limiting**: Enforced per-minute request limits (e.g. 60 RPM for free tier) and daily token budgets tracked in `proxy_audit_logs`.
- **File Upload Limits**: Max 25MB per document drop on the canvas for free tier; higher limits for team/enterprise.

---

## 6. Monorepo Directory Layout

```text
minge/
├── docker-compose.yml              # PostgreSQL 16 + pgvector container
├── package.json                    # Workspace root (npm/pnpm workspaces)
├── tsconfig.json                   # Shared TypeScript base configuration
├── PRD.md                          # This locked specification document
│
├── packages/
│   └── shared/                     # Shared domain contracts & validation
│       ├── src/
│       │   ├── types/              # Project, Memory, Prompt, CRDT types
│       │   ├── schemas/            # Zod validation schemas
│       │   └── constants.ts        # Common error codes and constants
│       ├── package.json
│       └── tsconfig.json
│
├── services/
│   ├── backend-api/                # Fastify REST/Streaming API
│   │   ├── src/
│   │   │   ├── db/                 # Pool connection, schema, migrations
│   │   │   ├── memory/             # Project-scoped append-only memory store
│   │   │   ├── proxy/              # Multi-provider LLM gateway & attribution
│   │   │   ├── routes/             # Projects, Memories, Prompts, Proxy routes
│   │   │   └── server.ts           # Fastify server bootstrap
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sync-server/                # Standalone Yjs WebSocket CRDT server
│       ├── src/
│       │   ├── rooms/              # Room manager (project_id:doc_id)
│       │   ├── persistence/        # Postgres snapshot & update logger
│       │   └── server.ts           # WebSocket server bootstrap
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── canvas/                     # Standalone React + Vite Cyberpunk Web App
│       ├── src/
│       │   ├── components/         # Canvas, Nodes, Cursors, Glass panels
│       │   ├── hooks/              # useYjs, usePresence, useMemory
│       │   ├── styles/             # Roobinium cyberpunk design system (CSS)
│       │   └── App.tsx
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
│
└── tests/                          # Automated Vitest integration test suite
    ├── memory-isolation.test.ts    # Fail-closed cross-project verification
    ├── memory-append-only.test.ts  # Superseding & version lineage verification
    ├── llm-proxy.test.ts           # Attribution & multi-provider routing
    └── sync-server.test.ts         # CRDT room sync & snapshot persistence
```

---

## 7. Implementation Roadmap & Milestones

1. **Milestone 1: Backend Foundation & Memory Layer (Immediate)**
   - Initialize monorepo, Docker Compose (pgvector:pg16), and shared contracts.
   - Implement database migrations and PostgreSQL connection pool.
   - Implement `services/backend-api` memory store with strict project isolation and append-only versioning.
   - Implement multi-provider LLM proxy with attribution tracking.
   - Implement `services/sync-server` Yjs WebSocket server with Postgres snapshot persistence.
   - Execute automated Vitest test suite to verify 100% of memory isolation, proxy, and sync behaviors.

2. **Milestone 2: AI Canvas Standalone Web App**
   - Scaffold `apps/canvas` using React + Vite.
   - Implement Roobinium dark cyberpunk design system with glassmorphism and neon glows.
   - Build infinite spatial canvas with pan/zoom, multiplayer cursor presence, and node graph.
   - Wire Yjs sync to `services/sync-server` and memory queries to `services/backend-api`.

3. **Milestone 3: Prompt IDE (Void Desktop Fork Integration)**
   - Configure Void extension webview for prompt branch management and Prompt PR diffing.
   - Connect desktop editor to shared project memory and backend proxy.
   - End-to-end multi-client validation between Void desktop and Canvas web users.
