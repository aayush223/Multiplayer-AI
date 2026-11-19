-- ============================================================
-- Migration 003: CRM Organizational Hierarchy & Work Approval Tickets
-- ============================================================
-- Invariant 1: Hard project_id UUID FK on all tenant tables.
-- Invariant 2: Approved tickets materialize versioned prompt_packages on main.
-- Invariant 7: Soft-delete via deleted_at TIMESTAMPTZ (30-day recovery).
-- Invariant 8: Dedicated minge schema; mandatory RLS enabled on all tables.
-- ============================================================

-- 1. Extend minge.project_members with CRM hierarchy, role power & manager controls
ALTER TABLE minge.project_members
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title VARCHAR(150) NOT NULL DEFAULT 'Contributor',
    ADD COLUMN IF NOT EXISTS department VARCHAR(100) NOT NULL DEFAULT 'Engineering',
    ADD COLUMN IF NOT EXISTS manager_id VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{"canEditMain":false,"canApproveTickets":false,"canManageTeam":false,"canRunAi":true,"dailyTokenCap":50000}'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_project_members_role'
          AND conrelid = 'minge.project_members'::regclass
    ) THEN
        ALTER TABLE minge.project_members
            ADD CONSTRAINT chk_project_members_role
            CHECK (role IN ('admin', 'manager', 'employee', 'editor'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_project_members_status'
          AND conrelid = 'minge.project_members'::regclass
    ) THEN
        ALTER TABLE minge.project_members
            ADD CONSTRAINT chk_project_members_status
            CHECK (status IN ('active', 'paused'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_members_manager
    ON minge.project_members(project_id, manager_id)
    WHERE deleted_at IS NULL;

-- 2. Work Approval Tickets (Employee raise -> Manager review -> Approve into Main Work)
CREATE TABLE IF NOT EXISTS minge.work_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES minge.projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category VARCHAR(50) NOT NULL DEFAULT 'prompt_change',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    source_branch VARCHAR(100) NOT NULL DEFAULT 'exp/draft',
    target_branch VARCHAR(100) NOT NULL DEFAULT 'main',
    raised_by_user_id VARCHAR(255) NOT NULL,
    assigned_manager_id VARCHAR(255) DEFAULT NULL,
    work_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_note TEXT DEFAULT NULL,
    reviewed_by_user_id VARCHAR(255) DEFAULT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    merged_package_id UUID REFERENCES minge.prompt_packages(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_work_tickets_category
        CHECK (category IN ('prompt_change', 'canvas_work', 'memory_addition', 'task_assignment')),
    CONSTRAINT chk_work_tickets_priority
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT chk_work_tickets_status
        CHECK (status IN ('open', 'in_review', 'changes_requested', 'approved_merged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_work_tickets_project_status
    ON minge.work_tickets(project_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_tickets_manager
    ON minge.work_tickets(project_id, assigned_manager_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — MANDATORY ON ALL NEW TABLES
-- ============================================================
ALTER TABLE minge.work_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'project_isolation_work_tickets'
          AND tablename = 'work_tickets'
          AND schemaname = 'minge'
    ) THEN
        CREATE POLICY project_isolation_work_tickets ON minge.work_tickets
            FOR ALL USING (
                project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid
            );
    END IF;
END $$;

-- ============================================================
-- IDEMPOTENT DEFAULT WORKSPACE SEED (Alpha Multiplayer CRM)
-- ============================================================
DO $$
DECLARE
    default_pid UUID;
BEGIN
    INSERT INTO minge.projects (id, name, slug, account_type)
    VALUES (
        '11111111-1111-4111-8111-111111111111',
        'Alpha Multiplayer Workspace',
        'proj-alpha-multiplayer',
        'team'
    )
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO default_pid FROM minge.projects WHERE slug = 'proj-alpha-multiplayer' LIMIT 1;

    IF default_pid IS NOT NULL THEN
        PERFORM set_config('app.current_project_id', default_pid::text, true);

        INSERT INTO minge.project_members
            (project_id, user_id, role, display_name, email, title, department, manager_id, permissions, status)
        VALUES
            (default_pid, 'user_victoria', 'admin', 'Victoria Vance', 'victoria@minge.ai', 'VP of AI Engineering', 'Executive', NULL,
             '{"canEditMain":true,"canApproveTickets":true,"canManageTeam":true,"canRunAi":true,"dailyTokenCap":500000}'::jsonb, 'active'),
            (default_pid, 'user_alice', 'manager', 'Alice Chen', 'alice@minge.ai', 'Engineering Manager', 'Prompt Systems', 'user_victoria',
             '{"canEditMain":true,"canApproveTickets":true,"canManageTeam":true,"canRunAi":true,"dailyTokenCap":250000}'::jsonb, 'active'),
            (default_pid, 'user_marcus', 'manager', 'Marcus Reid', 'marcus@minge.ai', 'Canvas Operations Manager', 'AI Canvas', 'user_victoria',
             '{"canEditMain":true,"canApproveTickets":true,"canManageTeam":true,"canRunAi":true,"dailyTokenCap":200000}'::jsonb, 'active'),
            (default_pid, 'user_bob', 'employee', 'Bob Patel', 'bob@minge.ai', 'Senior Prompt Engineer', 'Prompt Systems', 'user_alice',
             '{"canEditMain":false,"canApproveTickets":false,"canManageTeam":false,"canRunAi":true,"dailyTokenCap":75000}'::jsonb, 'active'),
            (default_pid, 'user_carol', 'employee', 'Carol Lin', 'carol@minge.ai', 'AI Canvas Specialist', 'Prompt Systems', 'user_alice',
             '{"canEditMain":false,"canApproveTickets":false,"canManageTeam":false,"canRunAi":true,"dailyTokenCap":50000}'::jsonb, 'active'),
            (default_pid, 'user_dana', 'employee', 'Dana Kim', 'dana@minge.ai', 'Evaluation Analyst', 'AI Canvas', 'user_marcus',
             '{"canEditMain":false,"canApproveTickets":false,"canManageTeam":false,"canRunAi":true,"dailyTokenCap":50000}'::jsonb, 'active')
        ON CONFLICT (project_id, user_id) DO NOTHING;

        IF NOT EXISTS (SELECT 1 FROM minge.work_tickets WHERE project_id = default_pid) THEN
            INSERT INTO minge.work_tickets
                (project_id, title, description, category, priority, status, source_branch, target_branch, raised_by_user_id, assigned_manager_id, work_payload)
            VALUES
                (default_pid,
                 'Merge CoT Reasoning Guardrails into Main Prompt',
                 'Adds step-by-step memory citation verification to clarify-summary. Benchmark shows +4.2% accuracy with zero cross-project bleed.',
                 'prompt_change',
                 'high',
                 'open',
                 'exp/chain-of-thought',
                 'main',
                 'user_bob',
                 'user_alice',
                 '{"name":"clarify-summary","system_prompt":"You are an expert software architect in Minge. Think step-by-step and cite exact project memory IDs before every architectural claim.","user_template":"Audit and summarize module constraints for: {{module_name}}","model_config":{"model":"gemini-2.5-flash","temperature":0.4,"max_tokens":2048},"latest_output":"Verified 100% project_id isolation across 12 test cases."}'::jsonb),
                (default_pid,
                 'Add Customer Escalation Canvas Workflow to Main',
                 'Multi-node canvas chain for classifying enterprise tickets with grounded SLA rules.',
                 'canvas_work',
                 'medium',
                 'in_review',
                 'exp/canvas-escalation',
                 'main',
                 'user_carol',
                 'user_alice',
                 '{"name":"enterprise-escalation-flow","system_prompt":"Classify incoming enterprise requests strictly by grounded SLA rules and route urgent items to managers.","user_template":"Triage customer report: {{ticket_summary}}","model_config":{"model":"groq/llama-3.3-70b-versatile","temperature":0.3,"max_tokens":1536},"latest_output":"Routed P0 outage alert with 98.4% precision."}'::jsonb);
        END IF;
    END IF;
END $$;
