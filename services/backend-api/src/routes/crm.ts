/**
 * CRM Organizational Hierarchy & Ticket-to-Main Approval Routes
 *
 * Invariant 1: Hard project_id scoping via withProjectScope (fail closed, RLS active).
 * Invariant 2: Approved tickets materialize immutable versioned prompt_packages on `main`.
 * Invariant 6: Per-user attribution via JWT + X-User-Id.
 * Invariant 7: Soft-deletes via deleted_at TIMESTAMPTZ (30-day recovery).
 * Invariant 8: Mandatory JWT authentication on all protected routes.
 */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query, withProjectScope } from '../db/client.js';
import type { JwtPayload, OrgRole } from '../auth/jwt.js';

export interface MemberPermissions {
  canEditMain: boolean;
  canApproveTickets: boolean;
  canManageTeam: boolean;
  canRunAi: boolean;
  dailyTokenCap: number;
}

export interface OrgMember {
  projectId: string;
  userId: string;
  role: OrgRole;
  displayName: string;
  email: string;
  title: string;
  department: string;
  managerId: string | null;
  permissions: MemberPermissions;
  status: 'active' | 'paused';
  createdAt: string;
}

export type TicketCategory =
  | 'prompt_change'
  | 'canvas_work'
  | 'memory_addition'
  | 'task_assignment';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TicketStatus =
  | 'open'
  | 'in_review'
  | 'changes_requested'
  | 'approved_merged'
  | 'rejected';

export interface TicketWorkPayload {
  name?: string;
  system_prompt?: string;
  user_template?: string;
  model_config?: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  };
  latest_output?: string | null;
  grounded_memory_ids?: string[];
  node_title?: string;
}

export interface WorkTicket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  sourceBranch: string;
  targetBranch: string;
  raisedByUserId: string;
  assignedManagerId: string | null;
  workPayload: TicketWorkPayload;
  reviewNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  mergedPackageId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MergedMainWorkRecord {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  system_prompt: string;
  user_template: string;
  model_config: Record<string, unknown>;
  latest_output: string | null;
  version: number;
  status: string;
  created_by_user_id: string;
  created_at: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  sourceBranch: string;
  targetBranch: string;
  raisedByUserId: string;
  assignedManagerId: string | null;
  workPayload: TicketWorkPayload;
}

export interface TicketDecisionInput {
  action: 'approve_merge' | 'request_changes' | 'reject' | 'in_review';
  reviewerId: string;
  reviewNote?: string;
  overridePayload?: TicketWorkPayload;
  reassignManagerId?: string | null;
}

export interface PublishMainWorkInput {
  name: string;
  system_prompt: string;
  user_template: string;
  model_config: Record<string, unknown>;
  latest_output?: string | null;
  createdByUserId: string;
}

export interface CrmStore {
  resolveProjectId(projectIdOrSlug: string): Promise<string>;
  listMembers(projectId: string): Promise<OrgMember[]>;
  getMember(projectId: string, userId: string): Promise<OrgMember | null>;
  upsertMember(projectId: string, member: Omit<OrgMember, 'projectId' | 'createdAt'>): Promise<OrgMember>;
  updateMember(
    projectId: string,
    userId: string,
    patch: Partial<Pick<OrgMember, 'role' | 'displayName' | 'title' | 'department' | 'managerId' | 'permissions' | 'status'>>
  ): Promise<OrgMember | null>;
  listTickets(projectId: string, includeDeleted?: boolean): Promise<WorkTicket[]>;
  getTicket(projectId: string, ticketId: string): Promise<WorkTicket | null>;
  createTicket(projectId: string, input: CreateTicketInput): Promise<WorkTicket>;
  resubmitTicket(
    projectId: string,
    ticketId: string,
    patch: { title?: string; description?: string; workPayload?: TicketWorkPayload }
  ): Promise<WorkTicket | null>;
  decideTicket(
    projectId: string,
    ticketId: string,
    decision: TicketDecisionInput
  ): Promise<{ ticket: WorkTicket; mergedPackage: MergedMainWorkRecord | null } | null>;
  softDeleteTicket(projectId: string, ticketId: string): Promise<boolean>;
  listMainWork(projectId: string): Promise<MergedMainWorkRecord[]>;
  publishMainWork(projectId: string, input: PublishMainWorkInput): Promise<MergedMainWorkRecord>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeRole(raw?: string | null): OrgRole {
  if (raw === 'admin') return 'admin';
  if (raw === 'manager') return 'manager';
  return 'employee';
}

export function defaultPermissionsForRole(role: OrgRole): MemberPermissions {
  if (role === 'admin') {
    return {
      canEditMain: true,
      canApproveTickets: true,
      canManageTeam: true,
      canRunAi: true,
      dailyTokenCap: 500_000,
    };
  }
  if (role === 'manager') {
    return {
      canEditMain: true,
      canApproveTickets: true,
      canManageTeam: true,
      canRunAi: true,
      dailyTokenCap: 250_000,
    };
  }
  return {
    canEditMain: false,
    canApproveTickets: false,
    canManageTeam: false,
    canRunAi: true,
    dailyTokenCap: 50_000,
  };
}

function isInReportingSubtree(
  managerId: string,
  target: OrgMember,
  byId: Map<string, OrgMember>
): boolean {
  const visited = new Set<string>();
  let curr: string | null = target.managerId;
  while (curr && !visited.has(curr)) {
    if (curr === managerId) return true;
    visited.add(curr);
    curr = byId.get(curr)?.managerId ?? null;
  }
  return false;
}

/**
 * Hierarchy authority check:
 * - Admin controls everyone in the project.
 * - Manager has full freedom to control any employee (and any sub-manager in their reporting tree),
 *   but cannot alter an admin or an unrelated peer manager.
 * - Employees cannot manage other members.
 */
export function canManageMember(
  actor: OrgMember,
  target: OrgMember,
  allMembers: OrgMember[]
): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'manager' && !actor.permissions.canManageTeam) return false;
  if (target.role === 'admin') return false;
  if (target.userId === actor.userId) return false;
  if (target.role === 'employee') return true;

  const byId = new Map(allMembers.map((m) => [m.userId, m]));
  return isInReportingSubtree(actor.userId, target, byId);
}

export function canApproveTicket(actor: OrgMember): boolean {
  return actor.role === 'admin' || actor.role === 'manager' || actor.permissions.canApproveTickets;
}

function mapMemberRow(row: Record<string, unknown>): OrgMember {
  const role = normalizeRole(row['role'] as string);
  const rawPerms = (row['permissions'] as Partial<MemberPermissions> | null) ?? {};
  const defaults = defaultPermissionsForRole(role);
  return {
    projectId: String(row['project_id']),
    userId: String(row['user_id']),
    role,
    displayName: String(row['display_name'] || row['user_id']),
    email: String(row['email'] || ''),
    title: String(row['title'] || 'Contributor'),
    department: String(row['department'] || 'Engineering'),
    managerId: (row['manager_id'] as string | null) ?? null,
    permissions: {
      canEditMain: rawPerms.canEditMain ?? defaults.canEditMain,
      canApproveTickets: rawPerms.canApproveTickets ?? defaults.canApproveTickets,
      canManageTeam: rawPerms.canManageTeam ?? defaults.canManageTeam,
      canRunAi: rawPerms.canRunAi ?? defaults.canRunAi,
      dailyTokenCap:
        typeof rawPerms.dailyTokenCap === 'number' ? rawPerms.dailyTokenCap : defaults.dailyTokenCap,
    },
    status: row['status'] === 'paused' ? 'paused' : 'active',
    createdAt:
      row['created_at'] instanceof Date
        ? row['created_at'].toISOString()
        : String(row['created_at'] ?? new Date().toISOString()),
  };
}

function mapTicketRow(row: Record<string, unknown>): WorkTicket {
  return {
    id: String(row['id']),
    projectId: String(row['project_id']),
    title: String(row['title']),
    description: String(row['description'] ?? ''),
    category: row['category'] as TicketCategory,
    priority: row['priority'] as TicketPriority,
    status: row['status'] as TicketStatus,
    sourceBranch: String(row['source_branch'] ?? 'exp/draft'),
    targetBranch: String(row['target_branch'] ?? 'main'),
    raisedByUserId: String(row['raised_by_user_id']),
    assignedManagerId: (row['assigned_manager_id'] as string | null) ?? null,
    workPayload: (row['work_payload'] as TicketWorkPayload) ?? {},
    reviewNote: (row['review_note'] as string | null) ?? null,
    reviewedByUserId: (row['reviewed_by_user_id'] as string | null) ?? null,
    reviewedAt:
      row['reviewed_at'] instanceof Date
        ? row['reviewed_at'].toISOString()
        : (row['reviewed_at'] as string | null) ?? null,
    mergedPackageId: (row['merged_package_id'] as string | null) ?? null,
    deletedAt:
      row['deleted_at'] instanceof Date
        ? row['deleted_at'].toISOString()
        : (row['deleted_at'] as string | null) ?? null,
    createdAt:
      row['created_at'] instanceof Date
        ? row['created_at'].toISOString()
        : String(row['created_at'] ?? new Date().toISOString()),
    updatedAt:
      row['updated_at'] instanceof Date
        ? row['updated_at'].toISOString()
        : String(row['updated_at'] ?? new Date().toISOString()),
  };
}

function mapMainWorkRow(row: Record<string, unknown>): MergedMainWorkRecord {
  return {
    id: String(row['id']),
    projectId: String(row['project_id']),
    name: String(row['name']),
    branch: String(row['branch']),
    system_prompt: String(row['system_prompt']),
    user_template: String(row['user_template'] ?? ''),
    model_config: (row['model_config'] as Record<string, unknown>) ?? {},
    latest_output: (row['latest_output'] as string | null) ?? null,
    version: Number(row['version'] ?? 1),
    status: String(row['status'] ?? 'merged'),
    created_by_user_id: String(row['created_by_user_id']),
    created_at:
      row['created_at'] instanceof Date
        ? row['created_at'].toISOString()
        : String(row['created_at'] ?? new Date().toISOString()),
  };
}

/**
 * PostgreSQL RLS-enforced CRM Store in dedicated `minge` schema.
 */
export class PostgresCrmStore implements CrmStore {
  async resolveProjectId(projectIdOrSlug: string): Promise<string> {
    const trimmed = projectIdOrSlug.trim();
    if (!trimmed) {
      throw new Error('FAIL_CLOSED: projectId is required.');
    }
    if (UUID_REGEX.test(trimmed)) {
      return trimmed;
    }
    const res = await query(`SELECT id FROM minge.projects WHERE slug = $1 LIMIT 1`, [trimmed]);
    const id = res.rows[0]?.id as string | undefined;
    if (!id) {
      throw new Error(`Project not found for slug "${trimmed}".`);
    }
    return id;
  }

  async listMembers(projectId: string): Promise<OrgMember[]> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `SELECT * FROM minge.project_members
         WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY
           CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
           display_name ASC`,
        [projectId]
      );
      return res.rows.map((r) => mapMemberRow(r as Record<string, unknown>));
    });
  }

  async getMember(projectId: string, userId: string): Promise<OrgMember | null> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `SELECT * FROM minge.project_members
         WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, userId]
      );
      return res.rows[0] ? mapMemberRow(res.rows[0] as Record<string, unknown>) : null;
    });
  }

  async upsertMember(
    projectId: string,
    member: Omit<OrgMember, 'projectId' | 'createdAt'>
  ): Promise<OrgMember> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `INSERT INTO minge.project_members
           (project_id, user_id, role, display_name, email, title, department, manager_id, permissions, status, deleted_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NOW())
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET
           role = EXCLUDED.role,
           display_name = EXCLUDED.display_name,
           email = EXCLUDED.email,
           title = EXCLUDED.title,
           department = EXCLUDED.department,
           manager_id = EXCLUDED.manager_id,
           permissions = EXCLUDED.permissions,
           status = EXCLUDED.status,
           deleted_at = NULL,
           updated_at = NOW()
         RETURNING *`,
        [
          projectId,
          member.userId,
          member.role,
          member.displayName,
          member.email,
          member.title,
          member.department,
          member.managerId,
          JSON.stringify(member.permissions),
          member.status,
        ]
      );
      return mapMemberRow(res.rows[0] as Record<string, unknown>);
    });
  }

  async updateMember(
    projectId: string,
    userId: string,
    patch: Partial<Pick<OrgMember, 'role' | 'displayName' | 'title' | 'department' | 'managerId' | 'permissions' | 'status'>>
  ): Promise<OrgMember | null> {
    return withProjectScope(projectId, async (client) => {
      const currentRes = await client.query(
        `SELECT * FROM minge.project_members
         WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, userId]
      );
      if (!currentRes.rows[0]) return null;
      const existing = mapMemberRow(currentRes.rows[0] as Record<string, unknown>);

      const nextRole = patch.role ?? existing.role;
      const nextPermissions: MemberPermissions = {
        ...existing.permissions,
        ...(patch.permissions ?? {}),
      };

      const res = await client.query(
        `UPDATE minge.project_members
         SET role = $3,
             display_name = $4,
             title = $5,
             department = $6,
             manager_id = $7,
             permissions = $8,
             status = $9,
             updated_at = NOW()
         WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [
          projectId,
          userId,
          nextRole,
          patch.displayName ?? existing.displayName,
          patch.title ?? existing.title,
          patch.department ?? existing.department,
          patch.managerId !== undefined ? patch.managerId : existing.managerId,
          JSON.stringify(nextPermissions),
          patch.status ?? existing.status,
        ]
      );
      return res.rows[0] ? mapMemberRow(res.rows[0] as Record<string, unknown>) : null;
    });
  }

  async listTickets(projectId: string, includeDeleted = false): Promise<WorkTicket[]> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `SELECT * FROM minge.work_tickets
         WHERE project_id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
         ORDER BY created_at DESC`,
        [projectId]
      );
      return res.rows.map((r) => mapTicketRow(r as Record<string, unknown>));
    });
  }

  async getTicket(projectId: string, ticketId: string): Promise<WorkTicket | null> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `SELECT * FROM minge.work_tickets
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, ticketId]
      );
      return res.rows[0] ? mapTicketRow(res.rows[0] as Record<string, unknown>) : null;
    });
  }

  async createTicket(projectId: string, input: CreateTicketInput): Promise<WorkTicket> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `INSERT INTO minge.work_tickets
           (project_id, title, description, category, priority, status, source_branch, target_branch,
            raised_by_user_id, assigned_manager_id, work_payload)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          projectId,
          input.title,
          input.description,
          input.category,
          input.priority,
          input.sourceBranch,
          input.targetBranch,
          input.raisedByUserId,
          input.assignedManagerId,
          JSON.stringify(input.workPayload),
        ]
      );
      return mapTicketRow(res.rows[0] as Record<string, unknown>);
    });
  }

  async resubmitTicket(
    projectId: string,
    ticketId: string,
    patch: { title?: string; description?: string; workPayload?: TicketWorkPayload }
  ): Promise<WorkTicket | null> {
    return withProjectScope(projectId, async (client) => {
      const currentRes = await client.query(
        `SELECT * FROM minge.work_tickets
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, ticketId]
      );
      if (!currentRes.rows[0]) return null;
      const existing = mapTicketRow(currentRes.rows[0] as Record<string, unknown>);

      const nextPayload = patch.workPayload
        ? { ...existing.workPayload, ...patch.workPayload }
        : existing.workPayload;

      const res = await client.query(
        `UPDATE minge.work_tickets
         SET title = $3,
             description = $4,
             work_payload = $5,
             status = 'open',
             updated_at = NOW()
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [
          projectId,
          ticketId,
          patch.title ?? existing.title,
          patch.description ?? existing.description,
          JSON.stringify(nextPayload),
        ]
      );
      return res.rows[0] ? mapTicketRow(res.rows[0] as Record<string, unknown>) : null;
    });
  }

  async decideTicket(
    projectId: string,
    ticketId: string,
    decision: TicketDecisionInput
  ): Promise<{ ticket: WorkTicket; mergedPackage: MergedMainWorkRecord | null } | null> {
    return withProjectScope(projectId, async (client) => {
      const currentRes = await client.query(
        `SELECT * FROM minge.work_tickets
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, ticketId]
      );
      if (!currentRes.rows[0]) return null;
      const existing = mapTicketRow(currentRes.rows[0] as Record<string, unknown>);

      const effectivePayload: TicketWorkPayload = decision.overridePayload
        ? { ...existing.workPayload, ...decision.overridePayload }
        : existing.workPayload;

      const nextStatus: TicketStatus =
        decision.action === 'approve_merge'
          ? 'approved_merged'
          : decision.action === 'request_changes'
          ? 'changes_requested'
          : decision.action === 'reject'
          ? 'rejected'
          : 'in_review';

      let mergedPackage: MergedMainWorkRecord | null = null;

      if (decision.action === 'approve_merge') {
        const pkgName = (effectivePayload.name || existing.title)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 120) || 'main-work-package';

        const priorRes = await client.query(
          `SELECT id, version FROM minge.prompt_packages
           WHERE project_id = $1 AND branch = $2 AND name = $3
             AND superseded_by_id IS NULL AND deleted_at IS NULL
           ORDER BY version DESC
           LIMIT 1`,
          [projectId, existing.targetBranch || 'main', pkgName]
        );

        const priorId = (priorRes.rows[0]?.id as string | undefined) ?? null;
        const nextVersion = priorRes.rows[0] ? Number(priorRes.rows[0].version) + 1 : 1;

        const systemPrompt =
          effectivePayload.system_prompt?.trim() ||
          `Approved Main Work from Ticket "${existing.title}": ${existing.description}`;
        const userTemplate = effectivePayload.user_template ?? '';
        const modelConfig = effectivePayload.model_config ?? {
          model: 'gemini-2.5-flash',
          temperature: 0.5,
          max_tokens: 2048,
        };

        const insertPkg = await client.query(
          `INSERT INTO minge.prompt_packages
             (project_id, name, branch, system_prompt, user_template, grounded_memory_ids,
              model_config, latest_output, version, parent_id, status, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'merged', $11)
           RETURNING *`,
          [
            projectId,
            pkgName,
            existing.targetBranch || 'main',
            systemPrompt,
            userTemplate,
            [],
            JSON.stringify(modelConfig),
            effectivePayload.latest_output ?? null,
            nextVersion,
            priorId,
            decision.reviewerId,
          ]
        );

        mergedPackage = mapMainWorkRow(insertPkg.rows[0] as Record<string, unknown>);

        // Invariant 2: Append-only superseding of previous version on target branch
        if (priorId) {
          await client.query(
            `UPDATE minge.prompt_packages
             SET superseded_by_id = $1, updated_at = NOW()
             WHERE id = $2 AND project_id = $3`,
            [mergedPackage.id, priorId, projectId]
          );
        }
      }

      const updatedRes = await client.query(
        `UPDATE minge.work_tickets
         SET status = $3,
             work_payload = $4,
             review_note = $5,
             reviewed_by_user_id = $6,
             reviewed_at = NOW(),
             assigned_manager_id = $7,
             merged_package_id = COALESCE($8, merged_package_id),
             updated_at = NOW()
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [
          projectId,
          ticketId,
          nextStatus,
          JSON.stringify(effectivePayload),
          decision.reviewNote ?? existing.reviewNote,
          decision.reviewerId,
          decision.reassignManagerId !== undefined
            ? decision.reassignManagerId
            : existing.assignedManagerId,
          mergedPackage?.id ?? null,
        ]
      );

      return {
        ticket: mapTicketRow(updatedRes.rows[0] as Record<string, unknown>),
        mergedPackage,
      };
    });
  }

  async softDeleteTicket(projectId: string, ticketId: string): Promise<boolean> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `UPDATE minge.work_tickets
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [projectId, ticketId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }

  async listMainWork(projectId: string): Promise<MergedMainWorkRecord[]> {
    return withProjectScope(projectId, async (client) => {
      const res = await client.query(
        `SELECT * FROM minge.prompt_packages
         WHERE project_id = $1
           AND branch = 'main'
           AND superseded_by_id IS NULL
           AND deleted_at IS NULL
         ORDER BY updated_at DESC`,
        [projectId]
      );
      return res.rows.map((r) => mapMainWorkRow(r as Record<string, unknown>));
    });
  }

  async publishMainWork(
    projectId: string,
    input: PublishMainWorkInput
  ): Promise<MergedMainWorkRecord> {
    return withProjectScope(projectId, async (client) => {
      const priorRes = await client.query(
        `SELECT id, version FROM minge.prompt_packages
         WHERE project_id = $1 AND branch = 'main' AND name = $2
           AND superseded_by_id IS NULL AND deleted_at IS NULL
         ORDER BY version DESC
         LIMIT 1`,
        [projectId, input.name]
      );
      const priorId = (priorRes.rows[0]?.id as string | undefined) ?? null;
      const nextVersion = priorRes.rows[0] ? Number(priorRes.rows[0].version) + 1 : 1;

      const res = await client.query(
        `INSERT INTO minge.prompt_packages
           (project_id, name, branch, system_prompt, user_template, grounded_memory_ids,
            model_config, latest_output, version, parent_id, status, created_by_user_id)
         VALUES ($1, $2, 'main', $3, $4, $5, $6, $7, $8, $9, 'merged', $10)
         RETURNING *`,
        [
          projectId,
          input.name,
          input.system_prompt,
          input.user_template,
          [],
          JSON.stringify(input.model_config),
          input.latest_output ?? null,
          nextVersion,
          priorId,
          input.createdByUserId,
        ]
      );

      const created = mapMainWorkRow(res.rows[0] as Record<string, unknown>);
      if (priorId) {
        await client.query(
          `UPDATE minge.prompt_packages SET superseded_by_id = $1, updated_at = NOW()
           WHERE id = $2 AND project_id = $3`,
          [created.id, priorId, projectId]
        );
      }
      return created;
    });
  }
}

/**
 * In-memory CRM Store for deterministic unit tests (exact same invariants & semantics).
 */
export class InMemoryCrmStore implements CrmStore {
  readonly members = new Map<string, OrgMember>();
  readonly tickets = new Map<string, WorkTicket>();
  readonly mainWork = new Map<string, MergedMainWorkRecord>();

  private mKey(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }

  async resolveProjectId(projectIdOrSlug: string): Promise<string> {
    const trimmed = projectIdOrSlug.trim();
    if (!trimmed) throw new Error('FAIL_CLOSED: projectId is required.');
    return trimmed;
  }

  async listMembers(projectId: string): Promise<OrgMember[]> {
    return Array.from(this.members.values()).filter((m) => m.projectId === projectId);
  }

  async getMember(projectId: string, userId: string): Promise<OrgMember | null> {
    return this.members.get(this.mKey(projectId, userId)) ?? null;
  }

  async upsertMember(
    projectId: string,
    member: Omit<OrgMember, 'projectId' | 'createdAt'>
  ): Promise<OrgMember> {
    const record: OrgMember = {
      ...member,
      projectId,
      createdAt: new Date().toISOString(),
    };
    this.members.set(this.mKey(projectId, member.userId), record);
    return record;
  }

  async updateMember(
    projectId: string,
    userId: string,
    patch: Partial<Pick<OrgMember, 'role' | 'displayName' | 'title' | 'department' | 'managerId' | 'permissions' | 'status'>>
  ): Promise<OrgMember | null> {
    const existing = this.members.get(this.mKey(projectId, userId));
    if (!existing) return null;
    const updated: OrgMember = {
      ...existing,
      ...patch,
      permissions: { ...existing.permissions, ...(patch.permissions ?? {}) },
    };
    this.members.set(this.mKey(projectId, userId), updated);
    return updated;
  }

  async listTickets(projectId: string, includeDeleted = false): Promise<WorkTicket[]> {
    return Array.from(this.tickets.values()).filter(
      (t) => t.projectId === projectId && (includeDeleted || t.deletedAt === null)
    );
  }

  async getTicket(projectId: string, ticketId: string): Promise<WorkTicket | null> {
    const t = this.tickets.get(ticketId);
    if (!t || t.projectId !== projectId || t.deletedAt !== null) return null;
    return t;
  }

  async createTicket(projectId: string, input: CreateTicketInput): Promise<WorkTicket> {
    const now = new Date().toISOString();
    const ticket: WorkTicket = {
      id: crypto.randomUUID(),
      projectId,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      status: 'open',
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      raisedByUserId: input.raisedByUserId,
      assignedManagerId: input.assignedManagerId,
      workPayload: input.workPayload,
      reviewNote: null,
      reviewedByUserId: null,
      reviewedAt: null,
      mergedPackageId: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async resubmitTicket(
    projectId: string,
    ticketId: string,
    patch: { title?: string; description?: string; workPayload?: TicketWorkPayload }
  ): Promise<WorkTicket | null> {
    const existing = await this.getTicket(projectId, ticketId);
    if (!existing) return null;
    const updated: WorkTicket = {
      ...existing,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      workPayload: patch.workPayload
        ? { ...existing.workPayload, ...patch.workPayload }
        : existing.workPayload,
      status: 'open',
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(ticketId, updated);
    return updated;
  }

  async decideTicket(
    projectId: string,
    ticketId: string,
    decision: TicketDecisionInput
  ): Promise<{ ticket: WorkTicket; mergedPackage: MergedMainWorkRecord | null } | null> {
    const existing = await this.getTicket(projectId, ticketId);
    if (!existing) return null;

    const effectivePayload = decision.overridePayload
      ? { ...existing.workPayload, ...decision.overridePayload }
      : existing.workPayload;

    const nextStatus: TicketStatus =
      decision.action === 'approve_merge'
        ? 'approved_merged'
        : decision.action === 'request_changes'
        ? 'changes_requested'
        : decision.action === 'reject'
        ? 'rejected'
        : 'in_review';

    let mergedPackage: MergedMainWorkRecord | null = null;
    if (decision.action === 'approve_merge') {
      const pkgName =
        (effectivePayload.name || existing.title)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '') || 'main-work-package';
      mergedPackage = await this.publishMainWork(projectId, {
        name: pkgName,
        system_prompt:
          effectivePayload.system_prompt?.trim() ||
          `Approved Main Work from Ticket "${existing.title}"`,
        user_template: effectivePayload.user_template ?? '',
        model_config: effectivePayload.model_config ?? { model: 'gemini-2.5-flash' },
        latest_output: effectivePayload.latest_output ?? null,
        createdByUserId: decision.reviewerId,
      });
    }

    const updated: WorkTicket = {
      ...existing,
      status: nextStatus,
      workPayload: effectivePayload,
      reviewNote: decision.reviewNote ?? existing.reviewNote,
      reviewedByUserId: decision.reviewerId,
      reviewedAt: new Date().toISOString(),
      assignedManagerId:
        decision.reassignManagerId !== undefined
          ? decision.reassignManagerId
          : existing.assignedManagerId,
      mergedPackageId: mergedPackage?.id ?? existing.mergedPackageId,
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(ticketId, updated);
    return { ticket: updated, mergedPackage };
  }

  async softDeleteTicket(projectId: string, ticketId: string): Promise<boolean> {
    const existing = await this.getTicket(projectId, ticketId);
    if (!existing) return false;
    this.tickets.set(ticketId, {
      ...existing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async listMainWork(projectId: string): Promise<MergedMainWorkRecord[]> {
    return Array.from(this.mainWork.values()).filter((p) => p.projectId === projectId);
  }

  async publishMainWork(
    projectId: string,
    input: PublishMainWorkInput
  ): Promise<MergedMainWorkRecord> {
    const existingSameName = Array.from(this.mainWork.values())
      .filter((p) => p.projectId === projectId && p.name === input.name)
      .sort((a, b) => b.version - a.version);
    const nextVersion = existingSameName[0] ? existingSameName[0].version + 1 : 1;

    const record: MergedMainWorkRecord = {
      id: crypto.randomUUID(),
      projectId,
      name: input.name,
      branch: 'main',
      system_prompt: input.system_prompt,
      user_template: input.user_template,
      model_config: input.model_config,
      latest_output: input.latest_output ?? null,
      version: nextVersion,
      status: 'merged',
      created_by_user_id: input.createdByUserId,
      created_at: new Date().toISOString(),
    };
    this.mainWork.set(record.id, record);
    return record;
  }
}

const permissionsPatchSchema = z
  .object({
    canEditMain: z.boolean().optional(),
    canApproveTickets: z.boolean().optional(),
    canManageTeam: z.boolean().optional(),
    canRunAi: z.boolean().optional(),
    dailyTokenCap: z.number().int().min(1000).max(5_000_000).optional(),
  })
  .optional();

const createMemberSchema = z.object({
  userId: z.string().min(2).max(120),
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'employee']).default('employee'),
  title: z.string().min(1).max(150).default('Contributor'),
  department: z.string().min(1).max(100).default('Engineering'),
  managerId: z.string().nullable().optional(),
  permissions: permissionsPatchSchema,
});

const updateMemberSchema = z.object({
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  displayName: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(150).optional(),
  department: z.string().min(1).max(100).optional(),
  managerId: z.string().nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
  permissions: permissionsPatchSchema,
});

const workPayloadSchema = z
  .object({
    name: z.string().max(150).optional(),
    system_prompt: z.string().max(100_000).optional(),
    user_template: z.string().max(100_000).optional(),
    model_config: z
      .object({
        model: z.string().min(1),
        temperature: z.number().min(0).max(2).optional(),
        max_tokens: z.number().int().min(1).max(200_000).optional(),
        top_p: z.number().min(0).max(1).optional(),
      })
      .optional(),
    latest_output: z.string().nullable().optional(),
    grounded_memory_ids: z.array(z.string()).optional(),
    node_title: z.string().max(200).optional(),
  })
  .default({});

const createTicketSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(10_000).default(''),
  category: z
    .enum(['prompt_change', 'canvas_work', 'memory_addition', 'task_assignment'])
    .default('prompt_change'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  sourceBranch: z.string().min(1).max(100).default('exp/draft'),
  targetBranch: z.string().min(1).max(100).default('main'),
  assignedManagerId: z.string().nullable().optional(),
  workPayload: workPayloadSchema,
});

const resubmitTicketSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(10_000).optional(),
  workPayload: workPayloadSchema.optional(),
});

const decideTicketSchema = z.object({
  action: z.enum(['approve_merge', 'request_changes', 'reject', 'in_review']),
  reviewNote: z.string().max(5000).optional(),
  overridePayload: workPayloadSchema.optional(),
  reassignManagerId: z.string().nullable().optional(),
});

const publishMainWorkSchema = z.object({
  name: z.string().min(1).max(150),
  system_prompt: z.string().min(1).max(100_000),
  user_template: z.string().max(100_000).default(''),
  model_config: z.record(z.unknown()).default({ model: 'gemini-2.5-flash', temperature: 0.5 }),
  latest_output: z.string().nullable().optional(),
});

async function resolveActor(
  request: FastifyRequest,
  store: CrmStore,
  projectId: string
): Promise<OrgMember> {
  const jwt = request.user as JwtPayload;
  const userId = jwt.sub;

  const existing = await store.getMember(projectId, userId);
  if (existing) return existing;

  // Provision JWT-authenticated user into the project member directory cleanly
  const role = normalizeRole(jwt.role);
  return store.upsertMember(projectId, {
    userId,
    role,
    displayName: jwt.name || userId,
    email: jwt.email || `${userId}@minge.ai`,
    title: role === 'admin' ? 'Executive Admin' : role === 'manager' ? 'Team Manager' : 'Contributor',
    department: 'Engineering',
    managerId: jwt.managerId ?? null,
    permissions: defaultPermissionsForRole(role),
    status: 'active',
  });
}

export async function registerCrmRoutes(
  app: FastifyInstance,
  deps: { store?: CrmStore } = {}
): Promise<void> {
  const store: CrmStore = deps.store ?? new PostgresCrmStore();

  // 1. Get organizational hierarchy & approved Main Work ledger
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/crm/org',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);
      const [members, mainWork] = await Promise.all([
        store.listMembers(projectId),
        store.listMainWork(projectId),
      ]);
      return reply.send({ data: { projectId, actor, members, mainWork } });
    }
  );

  // 2. Add a team member into the org hierarchy (Managers & Admins only)
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/crm/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);

      if (actor.role !== 'admin' && actor.role !== 'manager' && !actor.permissions.canManageTeam) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Only managers or admins can add team members to the hierarchy.',
        });
      }

      const body = createMemberSchema.parse(request.body);
      if (body.role === 'admin' && actor.role !== 'admin') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Only an admin can provision another admin.',
        });
      }

      const defaults = defaultPermissionsForRole(body.role);
      const created = await store.upsertMember(projectId, {
        userId: body.userId,
        displayName: body.displayName,
        email: body.email,
        role: body.role,
        title: body.title,
        department: body.department,
        managerId: body.managerId !== undefined ? body.managerId : actor.userId,
        permissions: { ...defaults, ...(body.permissions ?? {}) },
        status: 'active',
      });

      return reply.status(201).send({ data: created });
    }
  );

  // 3. Manager control over subordinate permissions, role, reporting line & active status
  app.patch<{ Params: { projectId: string; memberId: string } }>(
    '/api/v1/projects/:projectId/crm/members/:memberId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);
      const allMembers = await store.listMembers(projectId);
      const target = allMembers.find((m) => m.userId === request.params.memberId);

      if (!target) {
        return reply.status(404).send({ error: 'Member not found in this project.' });
      }

      if (!canManageMember(actor, target, allMembers)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Insufficient hierarchy authority to modify this team member.',
        });
      }

      const body = updateMemberSchema.parse(request.body);
      if (body.role === 'admin' && actor.role !== 'admin') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Only an admin can promote a member to admin.',
        });
      }
      if (body.managerId === target.userId) {
        return reply.status(400).send({ error: 'A member cannot report to themselves.' });
      }

      const updated = await store.updateMember(projectId, target.userId, {
        role: body.role,
        displayName: body.displayName,
        title: body.title,
        department: body.department,
        managerId: body.managerId,
        status: body.status,
        permissions: body.permissions
          ? { ...target.permissions, ...body.permissions }
          : undefined,
      });

      return reply.send({ data: updated });
    }
  );

  // 4. List work approval tickets
  app.get<{ Params: { projectId: string }; Querystring: { status?: string } }>(
    '/api/v1/projects/:projectId/crm/tickets',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      await resolveActor(request, store, projectId);
      let tickets = await store.listTickets(projectId, false);
      if (request.query.status) {
        tickets = tickets.filter((t) => t.status === request.query.status);
      }
      return reply.send({ data: tickets, count: tickets.length });
    }
  );

  // 5. Raise a work ticket (Employee proposes work for Manager approval into Main Work)
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/crm/tickets',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);

      if (actor.status === 'paused') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Your workspace access is currently paused by your manager.',
        });
      }

      const body = createTicketSchema.parse(request.body);
      const members = await store.listMembers(projectId);

      // Auto-route to the submitter's direct manager, or fallback to first active manager/admin
      let assignedManagerId = body.assignedManagerId ?? actor.managerId;
      if (!assignedManagerId) {
        const fallbackReviewer =
          members.find((m) => m.role === 'manager' && m.userId !== actor.userId) ??
          members.find((m) => m.role === 'admin');
        assignedManagerId = fallbackReviewer?.userId ?? null;
      }

      const ticket = await store.createTicket(projectId, {
        title: body.title,
        description: body.description,
        category: body.category,
        priority: body.priority,
        sourceBranch: body.sourceBranch,
        targetBranch: body.targetBranch,
        raisedByUserId: actor.userId,
        assignedManagerId,
        workPayload: body.workPayload,
      });

      return reply.status(201).send({ data: ticket });
    }
  );

  // 6. Edit / Resubmit an open or changes_requested ticket
  app.patch<{ Params: { projectId: string; ticketId: string } }>(
    '/api/v1/projects/:projectId/crm/tickets/:ticketId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);
      const ticket = await store.getTicket(projectId, request.params.ticketId);

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found.' });
      }
      if (ticket.status === 'approved_merged') {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Approved and merged tickets are immutable.',
        });
      }

      const isOwner = ticket.raisedByUserId === actor.userId;
      if (!isOwner && !canApproveTicket(actor)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Only the ticket author or a manager can update this ticket.',
        });
      }

      const body = resubmitTicketSchema.parse(request.body);
      const updated = await store.resubmitTicket(projectId, ticket.id, body);
      return reply.send({ data: updated });
    }
  );

  // 7. Manager Approval Decision -> Approve & Add to Main Work / Request Changes / Reject
  app.post<{ Params: { projectId: string; ticketId: string } }>(
    '/api/v1/projects/:projectId/crm/tickets/:ticketId/decision',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);

      if (!canApproveTicket(actor)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Only managers or admins can approve, request changes on, or reject work tickets.',
        });
      }

      const body = decideTicketSchema.parse(request.body);
      const result = await store.decideTicket(projectId, request.params.ticketId, {
        action: body.action,
        reviewerId: actor.userId,
        reviewNote: body.reviewNote,
        overridePayload: body.overridePayload,
        reassignManagerId: body.reassignManagerId,
      });

      if (!result) {
        return reply.status(404).send({ error: 'Ticket not found.' });
      }

      return reply.send({ data: result });
    }
  );

  // 8. Soft-delete ticket (30-day recovery compliant, never hard DELETE)
  app.delete<{ Params: { projectId: string; ticketId: string } }>(
    '/api/v1/projects/:projectId/crm/tickets/:ticketId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);
      const ticket = await store.getTicket(projectId, request.params.ticketId);

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found.' });
      }

      if (!canApproveTicket(actor) && ticket.raisedByUserId !== actor.userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'You do not have permission to archive this ticket.',
        });
      }

      await store.softDeleteTicket(projectId, ticket.id);
      return reply.send({ message: 'Ticket soft-deleted. Recoverable for 30 days.' });
    }
  );

  // 9. Direct Publish to Main Work (Manager/Admin freedom, or delegated canEditMain permission)
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/crm/main-work',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = await store.resolveProjectId(request.params.projectId);
      const actor = await resolveActor(request, store, projectId);

      if (actor.role !== 'admin' && actor.role !== 'manager' && !actor.permissions.canEditMain) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Employees must raise a work ticket for manager approval before adding to Main Work.',
        });
      }

      const body = publishMainWorkSchema.parse(request.body);
      const published = await store.publishMainWork(projectId, {
        name: body.name,
        system_prompt: body.system_prompt,
        user_template: body.user_template,
        model_config: body.model_config,
        latest_output: body.latest_output ?? null,
        createdByUserId: actor.userId,
      });

      return reply.status(201).send({ data: published });
    }
  );
}
