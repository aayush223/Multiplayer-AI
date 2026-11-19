# MinGE AI — Multiplayer AI Platform

**MinGE AI** is a real-time multiplayer AI workspace that unites a Git-shaped **Prompt IDE**, an infinite **Spatial AI Canvas**, and **Role-Based Team Hierarchy & Ticket Approvals** on a shared Yjs CRDT and PostgreSQL Row Level Security (RLS) foundation.

It is designed for teams and organizations that want to build, test, and collaborate with AI in shared real-time workspaces without context bleed across projects or uncontrolled changes to production work.

---

## What the Project Is

MinGE solves two core challenges in team AI workflows: **fragmented single-player prompting** and **lack of organizational governance**. Instead of isolated chat threads, MinGE provides structured, versioned, and role-governed workspaces where humans and AI collaborate as real-time peers.

### 1. Dual Collaborative Workspaces
- **Prompt IDE**: A structured engineering environment for creating, testing, and versioning AI prompts as immutable **Prompt Packages** (`system_prompt`, `user_template`, `model_config`, `grounded_memory_ids`, and output lineage). Users can create experimental branches (`exp/*`), compare changes in a side-by-side diff view against `main`, and test responses grounded strictly in project memory.
- **Spatial AI Canvas**: A synchronous multiplayer infinite canvas with live peer cursors, connected Prompt Nodes, AI Output Nodes, Document Drops, and Memory Capsules. Multiple teammates can steer AI generations simultaneously while ideas flow seamlessly between the Canvas and the Prompt IDE.

### 2. Role-Based Team Hierarchy & Ticket Approval Gate
- **Organizational Hierarchy (`Admin → Manager → Employee`)**: Workspaces model real reporting lines where managers have full operational freedom over their team—assigning tasks, configuring employee permissions, setting daily AI token caps, reassigning direct reports, and pausing or resuming access.
- **Ticket-to-Main Governance**: Employees experiment freely on branches and canvas nodes and **raise approval tickets** to propose adding their work to production. Tickets route automatically to the employee's manager, who can inspect diffs, refine the payload, request changes, or click **Approve & Add to Main Work** to atomically publish a new version onto `main`.

### 3. Multiplayer CRDT & Fenced AI Peer Engine
- **Conflict-Free Hierarchy & Ordering**: Built on Yjs CRDTs using a flat `Y.Map` document schema, deterministic cycle-breaking tree projection (`resolveTree`), and Base-62 fractional sibling indexing so concurrent moves or edits across peers always converge to an identical valid state.
- **AI as a Collaborative Peer**: A 3-tier concurrency lock (Yjs Awareness UI lock, Redis lease with monotonic fencing tokens, and attributed `'ai-peer:<jobId>'` transactions) prevents duplicate LLM calls and ensures streamed AI outputs never corrupt human undo stacks.

### 4. Zero-Bleed Memory Isolation & 30-Day Recovery
- **Strict Tenant & Project Isolation**: Every memory item, prompt package, CRDT snapshot, and work ticket is scoped by a mandatory `project_id` enforced at the database layer via PostgreSQL Row Level Security (RLS) inside a dedicated `minge` schema. Queries fail closed if project context is missing.
- **Append-Only Lineage & Soft-Delete Vault**: Updates never overwrite prior memory or prompt rows in place (`superseded_by_id`), and all deletions use soft-delete tombstones (`deleted_at`) with a **30-day recovery window**.
- **Server-Side Model Gateway**: Provider credentials (`OpenAI`, `Gemini`, `OpenRouter`, `Groq`, `Ollama`) remain strictly on the backend with per-user attribution and quota auditing.

---

## License

See [lisence.md](./lisence.md) for the brief project license terms and deployment options, and [docs/terms_and_conditions_v0.1.md](./docs/terms_and_conditions_v0.1.md) for platform terms and conditions.
