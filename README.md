# MinGE AI — Multiplayer AI Platform

**MinGE AI** is a real-time multiplayer AI workspace that unites a Git-shaped **Prompt IDE**, an infinite **Spatial AI Canvas**, and **Role-Based Team Hierarchy & Ticket Approvals** on a shared Yjs CRDT and PostgreSQL Row Level Security (RLS) backend.

---

## Key Features

- **Dual Collaborative Surfaces**:
  - **Prompt IDE**: Branching (`main`, `exp/*`), side-by-side prompt diffs, versioned immutable prompt packages (`system_prompt`, `user_template`, `model_config`, `grounded_memory_ids`), and grounded AI chat.
  - **Spatial AI Canvas**: Real-time multiplayer infinite canvas with live cursors, Prompt Nodes, AI Output Nodes, Document Drops, and Memory Capsules synced over Yjs CRDTs.
- **Role-Based Team Hierarchy & Ticket Approval Gate**:
  - **3-Tier Hierarchy (`Admin → Manager → Employee`)**: Managers have full freedom to govern their reporting tree—reassign employees, configure daily AI token caps, toggle permissions, and pause/resume workspace access.
  - **Ticket-to-Main Workflow**: Employees raise work approval tickets from the Prompt IDE or AI Canvas; managers review, optionally override payloads, request changes, or click **Approve & Add to Main Work** to atomically publish a versioned package onto `main`.
- **Multiplayer CRDT & Fenced AI Peer Architecture**:
  - Flat `Y.Map` document schema with deterministic cycle-breaking mutable tree projection (`resolveTree`), ASCII Base-62 fractional indexing with `clientId` tie-breakers, and tombstone-wins soft-deletes.
  - 3-tier AI concurrency locking: Yjs Awareness UI guard, Redis lease (`SET NX EX 60`) + monotonic fencing token (`INCR`), and attributed `'ai-peer:<jobId>'` Yjs transactions that preserve human `Y.UndoManager` stacks.
- **Zero-Bleed Security & 30-Day Recovery**:
  - Mandatory PostgreSQL Row Level Security (RLS) in private schema `minge` with fail-closed `project_id` query builders.
  - Append-only memories & prompt packages (`superseded_by_id`) and a 30-day soft-delete recovery vault (`deleted_at`).
  - Zero frontend API keys—all LLM provider keys (`OpenAI`, `Gemini`, `OpenRouter`, `Groq`, `Ollama`) remain strictly server-side with per-user `X-User-Id` audit logging.

---

## Architecture & Monorepo Structure

```text
minge/
├── apps/
│   └── web/                  # React + Vite frontend (Hero, Login, Team & Tickets, Prompt IDE, AI Canvas)
├── packages/
│   ├── crdt-core/            # Flat Yjs schema, fractional indexing & deterministic resolveTree()
│   └── shared/               # Shared Zod schemas, room ID parsers & TypeScript contracts
├── services/
│   ├── backend-api/          # Fastify REST API, JWT auth, Team/Ticket governance, LLM Proxy & Postgres RLS
│   ├── sync-gateway/         # Authenticated Yjs WebSocket Gateway + Snapshot/Delta store + Redis Pub/Sub
│   └── sync-server/          # Local Yjs WebSocket sync server
├── docs/
│   └── terms_and_conditions_v0.1.md
├── tests/                    # Vitest suites (CRDT convergence, sync gateway, AI fencing, team hierarchy, RLS)
└── lisence.md                # Project license specification & tier options
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** `>= 20.0.0`
- **PostgreSQL 16** (with `pgvector` optional; automatic fallback domain is included) and **Redis 7** (optional for local single-node dev; in-memory adapters included)

### 2. Install & Configure
```bash
npm install
cp .env.example .env
```

*(Optional)* Start PostgreSQL & Redis via Docker:
```bash
docker compose up -d
```

### 3. Run the Full Stack
```bash
npx concurrently --names "api,sync,gateway,web" "npm:dev:api" "npm:dev:sync" "npm:dev:gateway" "npm:dev:web"
```

| Service | Local URL | Description |
| :--- | :--- | :--- |
| **Web App** | `http://localhost:5173` | Hero Page, Login, Team & Tickets, Prompt IDE, AI Canvas |
| **Backend API** | `http://localhost:3000` | REST API, JWT Auth, Team Hierarchy, Fenced AI Generation & LLM Proxy |
| **Sync Gateway** | `ws://localhost:4001` | Fail-closed JWT/Project-Key Yjs WebSocket Gateway |
| **Sync Server** | `ws://localhost:4000` | Local Yjs WebSocket Server |

---

## Verification & Testing

```bash
# TypeScript strict typecheck across all workspaces
npm run lint

# Production build across all 6 workspaces
npm run build

# Run full Vitest test suite (8 test suites, 56 tests)
npm test
```

---

## License

See [lisence.md](./lisence.md) for the brief project license terms and deployment options (**Community Open-Core MIT**, **Team Hierarchy License**, and **Enterprise Compliance License**), and [docs/terms_and_conditions_v0.1.md](./docs/terms_and_conditions_v0.1.md) for full platform terms.
