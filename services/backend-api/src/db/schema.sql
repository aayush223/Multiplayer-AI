-- ============================================================
-- Minge Database Schema — PostgreSQL 16 + pgvector
-- ============================================================
-- Invariant 7: Dedicated private schema, never public.
-- Invariant 7: RLS enabled on ALL tables.
-- Invariant 6: 30-day soft-delete (deleted_at) on all content tables.
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dedicated private application schema (Never use public schema)
CREATE SCHEMA IF NOT EXISTS minge;
REVOKE ALL ON SCHEMA public FROM public;

-- ==========================================================
-- 1. Projects (Tenant / Workspace boundary)
-- ==========================================================
CREATE TABLE minge.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'individual',
    api_key_hash VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 2. Memories (Strictly project-scoped, append-only, 30-day recoverable)
-- ==========================================================
CREATE TABLE minge.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    source_uri VARCHAR(2048),
    version INTEGER NOT NULL DEFAULT 1,
    superseded_by_id UUID REFERENCES minge.memories(id) ON DELETE SET NULL,
    ingested_by_user_id VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_project_id ON minge.memories(project_id);
CREATE INDEX idx_memories_embedding ON minge.memories USING hnsw (embedding vector_cosine_ops)
    WHERE superseded_by_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_memories_active ON minge.memories(project_id)
    WHERE superseded_by_id IS NULL AND deleted_at IS NULL;

-- ==========================================================
-- 3. Prompt Packages (Versioned prompt artifacts, 30-day recoverable)
-- ==========================================================
CREATE TABLE minge.prompt_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    branch VARCHAR(100) NOT NULL DEFAULT 'main',
    system_prompt TEXT NOT NULL,
    user_template TEXT NOT NULL DEFAULT '',
    grounded_memory_ids UUID[] DEFAULT '{}',
    model_config JSONB NOT NULL DEFAULT '{"model": "gpt-4o", "temperature": 0.7, "top_p": 0.95, "max_tokens": 4096}'::jsonb,
    latest_output TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES minge.prompt_packages(id),
    superseded_by_id UUID REFERENCES minge.prompt_packages(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'draft',
    created_by_user_id VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompts_project_branch ON minge.prompt_packages(project_id, branch)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_prompts_active ON minge.prompt_packages(project_id)
    WHERE superseded_by_id IS NULL AND deleted_at IS NULL;

-- ==========================================================
-- 4. CRDT Binary Snapshots (Yjs state persistence, 30-day recoverable)
-- ==========================================================
CREATE TABLE minge.crdt_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL,
    snapshot BYTEA NOT NULL,
    update_count_at_snapshot INTEGER NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_crdt_latest_snapshot ON minge.crdt_snapshots(project_id, document_id);

-- ==========================================================
-- 5. CRDT Append-Only Update Log (Replay, time-travel, undo/redo)
-- ==========================================================
CREATE TABLE minge.crdt_updates (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    document_id VARCHAR(255) NOT NULL,
    update_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crdt_updates_doc ON minge.crdt_updates(project_id, document_id, id);

-- ==========================================================
-- 6. Proxy Audit Logs (Attribution, rate limiting, cost tracking)
-- ==========================================================
CREATE TABLE minge.proxy_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER NOT NULL DEFAULT 200,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_audit_project_user ON minge.proxy_audit_logs(project_id, user_id);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) — MANDATORY ON ALL TABLES
-- Invariant 7: Tenant isolation via app.current_project_id session var
-- ==========================================================
ALTER TABLE minge.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.prompt_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.crdt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.crdt_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.proxy_audit_logs ENABLE ROW LEVEL SECURITY;

-- Projects: users can only see projects they belong to (full access for now)
CREATE POLICY projects_all_access ON minge.projects
    FOR ALL USING (true);

-- Memories: strict project isolation
CREATE POLICY project_isolation_memories ON minge.memories
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

-- Prompt Packages: strict project isolation
CREATE POLICY project_isolation_prompts ON minge.prompt_packages
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

-- CRDT Snapshots: strict project isolation
CREATE POLICY project_isolation_snapshots ON minge.crdt_snapshots
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

-- CRDT Updates: strict project isolation
CREATE POLICY project_isolation_updates ON minge.crdt_updates
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);

-- Proxy Audit Logs: strict project isolation
CREATE POLICY project_isolation_audit ON minge.proxy_audit_logs
    FOR ALL USING (project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid);
