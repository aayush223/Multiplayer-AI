-- ============================================================
-- Migration 002: Multiplayer CRDT Metadata, Membership & Quotas
-- ============================================================
-- Invariant 8: Dedicated minge schema (never public); mandatory RLS on all tables.
-- Invariant 3 & 4: Snapshot delta watermark + attributed CRDT update logs.
-- Invariant 6 & 7: Project membership + quota enforcement + AI fencing audit trail.
-- ============================================================

-- 1. Extend minge.crdt_snapshots with last_update_id watermark for delta replay
ALTER TABLE minge.crdt_snapshots
    ADD COLUMN IF NOT EXISTS last_update_id BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Extend minge.crdt_updates with actor attribution, origin_type, and AI fencing token
ALTER TABLE minge.crdt_updates
    ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255) NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS origin_type VARCHAR(20) NOT NULL DEFAULT 'human',
    ADD COLUMN IF NOT EXISTS fencing_token BIGINT DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_crdt_updates_origin_type'
          AND conrelid = 'minge.crdt_updates'::regclass
    ) THEN
        ALTER TABLE minge.crdt_updates
            ADD CONSTRAINT chk_crdt_updates_origin_type
            CHECK (origin_type IN ('human', 'ai-peer'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crdt_updates_doc_after
    ON minge.crdt_updates(project_id, document_id, id);

-- 3. Extend minge.proxy_audit_logs with AI node generation & fencing attribution
ALTER TABLE minge.proxy_audit_logs
    ADD COLUMN IF NOT EXISTS node_id VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS job_id VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS fencing_token BIGINT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_proxy_audit_project_created
    ON minge.proxy_audit_logs(project_id, created_at DESC);

-- 4. Project Members (Fail-closed WebSocket handshake & route membership checks)
CREATE TABLE IF NOT EXISTS minge.project_members (
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'editor',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_active
    ON minge.project_members(project_id, user_id)
    WHERE deleted_at IS NULL;

-- 5. Project Quotas (Tier rate limits, daily token budgets, upload & collaborator caps)
CREATE TABLE IF NOT EXISTS minge.project_quotas (
    project_id UUID PRIMARY KEY REFERENCES minge.projects(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL DEFAULT 'individual',
    rpm_limit INTEGER NOT NULL DEFAULT 60,
    daily_token_limit INTEGER NOT NULL DEFAULT 250000,
    max_upload_mb INTEGER NOT NULL DEFAULT 25,
    max_collaborators INTEGER NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — MANDATORY ON ALL NEW TABLES
-- ============================================================
ALTER TABLE minge.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE minge.project_quotas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'project_isolation_members'
          AND tablename = 'project_members'
          AND schemaname = 'minge'
    ) THEN
        CREATE POLICY project_isolation_members ON minge.project_members
            FOR ALL USING (
                project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid
                AND (
                    NULLIF(current_setting('app.current_user_id', true), '') IS NULL
                    OR user_id = current_setting('app.current_user_id', true)
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'project_isolation_quotas'
          AND tablename = 'project_quotas'
          AND schemaname = 'minge'
    ) THEN
        CREATE POLICY project_isolation_quotas ON minge.project_quotas
            FOR ALL USING (
                project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid
            );
    END IF;
END $$;
