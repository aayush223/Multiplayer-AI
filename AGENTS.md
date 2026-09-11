# Minge — Core Architecture & Repository Guidelines

Welcome to the **Minge** codebase — a multiplayer AI platform uniting the **Prompt IDE** (desktop Void fork) and the **AI Canvas** (browser spatial canvas with Roobinium cyberpunk aesthetic) via a shared real-time CRDT & memory backend.

## Inviolable Architectural Invariants

All development in this repository is governed by the rules in [usp_architectural_invariants.md](file:///.agents/rules/usp_architectural_invariants.md) and [PRD.md](file:///PRD.md):

1. **Structural Memory Isolation**: Hard `project_id` foreign keys; query builders **fail closed** on missing project IDs. Never rely on prompting for tenant boundaries.
2. **Append-Only Memory & Prompt Packages**: Non-destructive updates via `superseded_by_id`. Prompts are versioned packages with grounded memory IDs, model configs, and outputs.
3. **Yjs CRDT Synchronization**: Scoped rooms (`${project_id}:${document_id}`) with binary snapshots & update logs in Postgres `bytea` columns. AI edits as a collaborative peer via Yjs updates.
4. **Dual Primitives**: Git-shaped Prompt IDE + spatial real-time AI Canvas.
5. **Server-Side Keys & Attribution**: Provider API keys live exclusively on the backend; all requests require `X-User-Id` for audit logging and quota enforcement.
6. **Data Lifecycle & 30-Day Recovery**: Terms v0.1 compliance — soft-deletions (`deleted_at`) retain data for 30 days before permanent purging; individual account deletion preserves organization/team workspace content.
7. **Database Hardening & Security**: Row Level Security (RLS) enabled on all tables; dedicated `minge` schema (never `public`); zero frontend API keys; mandatory JWT authentication on protected routes; zero secret commits (`.env` strictly gitignored).

For complete specifications, data schemas, milestones, and legal terms, see [PRD.md](file:///PRD.md) and [terms_and_conditions_v0.1.md](file:///docs/terms_and_conditions_v0.1.md).
