/**
 * CRM Organizational Hierarchy & Ticket-to-Main Approval Tests
 *
 * Verifies:
 *  - JWT login issuance with organizational role claims (Admin > Manager > Employee)
 *  - Fail-closed 401 on unauthenticated CRM requests
 *  - Role hierarchy enforcement (Employees cannot approve tickets, edit team permissions, or bypass Main Work gate)
 *  - Manager freedom (modify subordinate permissions, pause/resume employees, reassign reporting lines, edit ticket payloads)
 *  - Ticket lifecycle: raise -> request changes -> employee resubmit -> manager approve_merge into versioned Main Work
 *  - 30-day soft-delete compliance (`deletedAt` set instead of hard delete)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuth } from '../services/backend-api/src/auth/jwt.js';
import {
  authRoutes,
  DEFAULT_PROJECT_UUID as DEFAULT_PROJECT_ID,
} from '../services/backend-api/src/routes/auth.js';
import {
  defaultPermissionsForRole,
  InMemoryCrmStore,
  registerCrmRoutes,
} from '../services/backend-api/src/routes/crm.js';

const TEST_JWT_SECRET = 'test_crm_hierarchy_jwt_secret_at_least_32_chars';

async function buildCrmTestApp(): Promise<{ app: FastifyInstance; store: InMemoryCrmStore }> {
  process.env['JWT_SECRET'] = TEST_JWT_SECRET;
  const store = new InMemoryCrmStore();

  // Seed default org hierarchy into in-memory store
  await store.upsertMember(DEFAULT_PROJECT_ID, {
    userId: 'user_victoria',
    role: 'admin',
    displayName: 'Victoria Vance',
    email: 'victoria@minge.ai',
    title: 'VP of AI Engineering',
    department: 'Executive',
    managerId: null,
    permissions: defaultPermissionsForRole('admin'),
    status: 'active',
  });
  await store.upsertMember(DEFAULT_PROJECT_ID, {
    userId: 'user_alice',
    role: 'manager',
    displayName: 'Alice Chen',
    email: 'alice@minge.ai',
    title: 'Engineering Manager',
    department: 'Prompt Systems',
    managerId: 'user_victoria',
    permissions: defaultPermissionsForRole('manager'),
    status: 'active',
  });
  await store.upsertMember(DEFAULT_PROJECT_ID, {
    userId: 'user_bob',
    role: 'employee',
    displayName: 'Bob Patel',
    email: 'bob@minge.ai',
    title: 'Senior Prompt Engineer',
    department: 'Prompt Systems',
    managerId: 'user_alice',
    permissions: defaultPermissionsForRole('employee'),
    status: 'active',
  });

  const app = Fastify({ logger: false });
  await registerAuth(app);
  await app.register(authRoutes);
  await registerCrmRoutes(app, { store });
  await app.ready();
  return { app, store };
}

async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'test-password', projectId: DEFAULT_PROJECT_ID },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { token: string } };
  return body.data.token;
}

describe('CRM Hierarchy, Manager Controls & Ticket-to-Main Approval Pipeline', () => {
  let app: FastifyInstance;
  let store: InMemoryCrmStore;

  beforeEach(async () => {
    const setup = await buildCrmTestApp();
    app = setup.app;
    store = setup.store;
  });

  it('requires JWT authentication (401) and prevents employees from approving tickets or altering hierarchy (403)', async () => {
    // 1. Unauthenticated request fails closed with 401
    const unauth = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/org`,
    });
    expect(unauth.statusCode).toBe(401);

    const bobToken = await loginAs(app, 'bob@minge.ai');

    // 2. Employee raises a work ticket -> 201 and auto-routes to Bob's manager (Alice)
    const raiseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: {
        title: 'Add strict grounding prompt',
        description: 'Requires citation of memory IDs',
        category: 'prompt_change',
        priority: 'high',
        sourceBranch: 'exp/grounding',
        workPayload: {
          name: 'clarify-summary',
          system_prompt: 'Cite memory IDs on every claim.',
          user_template: 'Audit: {{module}}',
        },
      },
    });
    expect(raiseRes.statusCode).toBe(201);
    const ticket = (raiseRes.json() as { data: { id: string; assignedManagerId: string } }).data;
    expect(ticket.assignedManagerId).toBe('user_alice');

    // 3. Employee CANNOT approve their own ticket -> 403
    const selfApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets/${ticket.id}/decision`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: { action: 'approve_merge' },
    });
    expect(selfApprove.statusCode).toBe(403);

    // 4. Employee CANNOT publish directly to Main Work -> 403
    const directMain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/main-work`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: {
        name: 'clarify-summary',
        system_prompt: 'Unauthorized main push',
      },
    });
    expect(directMain.statusCode).toBe(403);

    // 5. Employee CANNOT alter another team member's permissions -> 403
    const modTeam = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/members/user_alice`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: { status: 'paused' },
    });
    expect(modTeam.statusCode).toBe(403);

    await app.close();
  });

  it('gives managers full control over employee permissions/status and blocks paused employees from submitting', async () => {
    const aliceToken = await loginAs(app, 'alice@minge.ai');
    const bobToken = await loginAs(app, 'bob@minge.ai');

    // Manager Alice cannot alter VP Admin Victoria -> 403
    const alterAdmin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/members/user_victoria`,
      headers: { authorization: `Bearer ${aliceToken}`, 'x-user-id': 'user_alice' },
      payload: { status: 'paused' },
    });
    expect(alterAdmin.statusCode).toBe(403);

    // Manager Alice pauses Bob and tunes his daily token cap -> 200
    const pauseBob = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/members/user_bob`,
      headers: { authorization: `Bearer ${aliceToken}`, 'x-user-id': 'user_alice' },
      payload: {
        status: 'paused',
        permissions: { dailyTokenCap: 120_000, canEditMain: true },
      },
    });
    expect(pauseBob.statusCode).toBe(200);
    const updatedBob = (
      pauseBob.json() as {
        data: { status: string; permissions: { dailyTokenCap: number; canEditMain: boolean } };
      }
    ).data;
    expect(updatedBob.status).toBe('paused');
    expect(updatedBob.permissions.dailyTokenCap).toBe(120_000);
    expect(updatedBob.permissions.canEditMain).toBe(true);

    // Paused employee cannot submit tickets -> 403
    const blockedTicket = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: {
        title: 'Blocked submission',
        workPayload: { system_prompt: 'Test' },
      },
    });
    expect(blockedTicket.statusCode).toBe(403);

    await app.close();
  });

  it('supports request_changes -> resubmit -> manager override & approve_merge into versioned Main Work + soft-delete', async () => {
    const bobToken = await loginAs(app, 'bob@minge.ai');
    const aliceToken = await loginAs(app, 'alice@minge.ai');

    // 1. Bob raises a ticket
    const raiseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: {
        title: 'Upgrade Main Prompt v1',
        description: 'Draft v1 for main branch',
        category: 'prompt_change',
        priority: 'urgent',
        sourceBranch: 'exp/v1',
        workPayload: {
          name: 'clarify-summary',
          system_prompt: 'Initial draft prompt',
          user_template: 'Summarize: {{input}}',
        },
      },
    });
    expect(raiseRes.statusCode).toBe(201);
    const ticketId = (raiseRes.json() as { data: { id: string } }).data.id;

    // 2. Manager Alice requests changes
    const reqChanges = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets/${ticketId}/decision`,
      headers: { authorization: `Bearer ${aliceToken}`, 'x-user-id': 'user_alice' },
      payload: {
        action: 'request_changes',
        reviewNote: 'Please add explicit RLS safety guardrail.',
      },
    });
    expect(reqChanges.statusCode).toBe(200);
    expect((reqChanges.json() as { data: { ticket: { status: string } } }).data.ticket.status).toBe(
      'changes_requested'
    );

    // 3. Employee Bob updates and resubmits
    const resubmit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${bobToken}`, 'x-user-id': 'user_bob' },
      payload: {
        workPayload: {
          name: 'clarify-summary',
          system_prompt: 'Enforce strict project_id RLS isolation on all responses.',
          user_template: 'Summarize: {{input}}',
        },
      },
    });
    expect(resubmit.statusCode).toBe(200);
    expect((resubmit.json() as { data: { status: string } }).data.status).toBe('open');

    // 4. Manager Alice polishes payload and clicks Approve & Add to Main Work
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets/${ticketId}/decision`,
      headers: { authorization: `Bearer ${aliceToken}`, 'x-user-id': 'user_alice' },
      payload: {
        action: 'approve_merge',
        reviewNote: 'Approved for production main branch.',
        overridePayload: {
          name: 'clarify-summary',
          system_prompt: 'APPROVED MAIN: Enforce strict project_id RLS isolation.',
          user_template: 'Summarize: {{input}}',
        },
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const decisionData = (
      approveRes.json() as {
        data: {
          ticket: { status: string; mergedPackageId: string; reviewedByUserId: string };
          mergedPackage: { id: string; branch: string; version: number; system_prompt: string };
        };
      }
    ).data;
    expect(decisionData.ticket.status).toBe('approved_merged');
    expect(decisionData.ticket.reviewedByUserId).toBe('user_alice');
    expect(decisionData.mergedPackage.branch).toBe('main');
    expect(decisionData.mergedPackage.version).toBe(1);
    expect(decisionData.mergedPackage.system_prompt).toBe(
      'APPROVED MAIN: Enforce strict project_id RLS isolation.'
    );
    expect(decisionData.ticket.mergedPackageId).toBe(decisionData.mergedPackage.id);

    // 5. Soft-delete removes ticket from active queries while retaining deletedAt tombstone
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${DEFAULT_PROJECT_ID}/crm/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${aliceToken}`, 'x-user-id': 'user_alice' },
    });
    expect(delRes.statusCode).toBe(200);
    expect(await store.listTickets(DEFAULT_PROJECT_ID, false)).toHaveLength(0);
    const allIncludingDeleted = await store.listTickets(DEFAULT_PROJECT_ID, true);
    expect(allIncludingDeleted).toHaveLength(1);
    expect(allIncludingDeleted[0].deletedAt).not.toBeNull();

    await app.close();
  });
});
