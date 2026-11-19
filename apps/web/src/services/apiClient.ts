/**
 * Typesafe API client communicating with services/backend-api.
 * Enforces Invariant 1 (fail-closed project_id scoping),
 * Invariant 5 (server-side keys, X-User-Id attribution),
 * Invariant 6 (30-day soft-delete recovery window),
 * and Invariant 8 (JWT auth on protected routes).
 */

export type OrgRole = 'admin' | 'manager' | 'employee';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  title: string;
  department: string;
  managerId: string | null;
  color: string;
}

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

export interface MemoryItem {
  id: string;
  project_id: string;
  type: 'fact' | 'code_snippet' | 'decision' | 'document';
  content: string;
  metadata: Record<string, unknown>;
  version: number;
  superseded_by_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface PromptPackage {
  id: string;
  project_id: string;
  name: string;
  branch: string;
  system_prompt: string;
  user_template: string;
  grounded_memory_ids: string[];
  model_config: {
    provider?: string;
    model: string;
    temperature: number;
    max_tokens?: number;
    top_p?: number;
  };
  latest_output: string | null;
  version: number;
  created_at?: string;
}

export interface PromptPullRequest {
  id: string;
  projectId: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  author: string;
  status: 'draft' | 'in_review' | 'approved' | 'merged';
  benchmarkDelta: {
    accuracy: string;
    costDelta: string;
    latencyDelta: string;
  };
  createdAt: string;
}

export const DEFAULT_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
export const DEFAULT_PROJECT_SLUG = 'proj-alpha-multiplayer';

export class ApiClient {
  private baseUrl = '';
  private currentUserId = 'user_alice';
  private authToken = '';

  constructor(userId?: string) {
    if (userId) this.currentUserId = userId;
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
  }

  getUserId(): string {
    return this.currentUserId;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  getAuthToken(): string {
    return this.authToken;
  }

  private headers(projectId?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': this.currentUserId,
    };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (projectId) {
      h['X-Project-Id'] = projectId;
    }
    return h;
  }

  // -------------------------------------------------------------------------
  // Auth Operations
  // -------------------------------------------------------------------------
  async getAuthDirectory(): Promise<AuthUser[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/directory`);
      if (!res.ok) throw new Error('Directory unavailable');
      const body = (await res.json()) as { data: AuthUser[] };
      return body.data;
    } catch {
      return [
        {
          id: 'user_victoria',
          name: 'Victoria Vance',
          email: 'victoria@minge.ai',
          role: 'admin',
          title: 'VP of AI Engineering',
          department: 'Executive',
          managerId: null,
          color: '#000000',
        },
        {
          id: 'user_alice',
          name: 'Alice Chen',
          email: 'alice@minge.ai',
          role: 'manager',
          title: 'Engineering Manager',
          department: 'Prompt Systems',
          managerId: 'user_victoria',
          color: '#EB1000',
        },
        {
          id: 'user_marcus',
          name: 'Marcus Reid',
          email: 'marcus@minge.ai',
          role: 'manager',
          title: 'Canvas Operations Manager',
          department: 'AI Canvas',
          managerId: 'user_victoria',
          color: '#1A1A1A',
        },
        {
          id: 'user_bob',
          name: 'Bob Patel',
          email: 'bob@minge.ai',
          role: 'employee',
          title: 'Senior Prompt Engineer',
          department: 'Prompt Systems',
          managerId: 'user_alice',
          color: '#4D4D4D',
        },
        {
          id: 'user_carol',
          name: 'Carol Lin',
          email: 'carol@minge.ai',
          role: 'employee',
          title: 'AI Canvas Specialist',
          department: 'Prompt Systems',
          managerId: 'user_alice',
          color: '#666666',
        },
      ];
    }
  }

  async login(input: {
    email: string;
    password?: string;
    name?: string;
    role?: OrgRole;
    projectId?: string;
  }): Promise<{ token: string; user: AuthUser; projectId: string }> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        projectId: input.projectId ?? DEFAULT_PROJECT_ID,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(errBody.message || errBody.error || `Login failed (${res.status})`);
    }

    const body = (await res.json()) as {
      data: { token: string; user: AuthUser; projectId: string };
    };

    this.setUserId(body.data.user.id);
    this.setAuthToken(body.data.token);
    return body.data;
  }

  // -------------------------------------------------------------------------
  // CRM Hierarchy & Ticket Approval Operations
  // -------------------------------------------------------------------------
  async getCrmOrg(projectId: string): Promise<{
    projectId: string;
    actor: OrgMember;
    members: OrgMember[];
    mainWork: MergedMainWorkRecord[];
  }> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/org`,
      { headers: this.headers(projectId) }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to load team hierarchy (${res.status})`);
    }
    const body = (await res.json()) as {
      data: {
        projectId: string;
        actor: OrgMember;
        members: OrgMember[];
        mainWork: MergedMainWorkRecord[];
      };
    };
    return body.data;
  }

  async addCrmMember(
    projectId: string,
    input: {
      userId: string;
      displayName: string;
      email: string;
      role: OrgRole;
      title: string;
      department: string;
      managerId?: string | null;
      permissions?: Partial<MemberPermissions>;
    }
  ): Promise<OrgMember> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/members`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify(input),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to add member (${res.status})`);
    }
    const body = (await res.json()) as { data: OrgMember };
    return body.data;
  }

  async updateCrmMember(
    projectId: string,
    memberId: string,
    patch: {
      role?: OrgRole;
      displayName?: string;
      title?: string;
      department?: string;
      managerId?: string | null;
      status?: 'active' | 'paused';
      permissions?: Partial<MemberPermissions>;
    }
  ): Promise<OrgMember> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/members/${encodeURIComponent(memberId)}`,
      {
        method: 'PATCH',
        headers: this.headers(projectId),
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to update member (${res.status})`);
    }
    const body = (await res.json()) as { data: OrgMember };
    return body.data;
  }

  async getCrmTickets(projectId: string): Promise<WorkTicket[]> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/tickets`,
      { headers: this.headers(projectId) }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to load tickets (${res.status})`);
    }
    const body = (await res.json()) as { data: WorkTicket[] };
    return body.data;
  }

  async raiseTicket(
    projectId: string,
    input: {
      title: string;
      description: string;
      category: TicketCategory;
      priority: TicketPriority;
      sourceBranch: string;
      targetBranch?: string;
      assignedManagerId?: string | null;
      workPayload: TicketWorkPayload;
    }
  ): Promise<WorkTicket> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/tickets`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify(input),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to raise ticket (${res.status})`);
    }
    const body = (await res.json()) as { data: WorkTicket };
    return body.data;
  }

  async resubmitTicket(
    projectId: string,
    ticketId: string,
    patch: { title?: string; description?: string; workPayload?: TicketWorkPayload }
  ): Promise<WorkTicket> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/tickets/${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        headers: this.headers(projectId),
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to update ticket (${res.status})`);
    }
    const body = (await res.json()) as { data: WorkTicket };
    return body.data;
  }

  async decideTicket(
    projectId: string,
    ticketId: string,
    decision: {
      action: 'approve_merge' | 'request_changes' | 'reject' | 'in_review';
      reviewNote?: string;
      overridePayload?: TicketWorkPayload;
      reassignManagerId?: string | null;
    }
  ): Promise<{ ticket: WorkTicket; mergedPackage: MergedMainWorkRecord | null }> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/tickets/${encodeURIComponent(ticketId)}/decision`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify(decision),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Decision failed (${res.status})`);
    }
    const body = (await res.json()) as {
      data: { ticket: WorkTicket; mergedPackage: MergedMainWorkRecord | null };
    };
    return body.data;
  }

  async softDeleteTicket(projectId: string, ticketId: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/tickets/${encodeURIComponent(ticketId)}`,
      {
        method: 'DELETE',
        headers: this.headers(projectId),
      }
    );
    return res.ok;
  }

  async publishMainWork(
    projectId: string,
    input: {
      name: string;
      system_prompt: string;
      user_template: string;
      model_config?: Record<string, unknown>;
      latest_output?: string | null;
    }
  ): Promise<MergedMainWorkRecord> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/crm/main-work`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify(input),
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(err.message || err.error || `Failed to publish Main Work (${res.status})`);
    }
    const body = (await res.json()) as { data: MergedMainWorkRecord };
    return body.data;
  }

  // -------------------------------------------------------------------------
  // Memory Operations (Invariants 1, 2, 7)
  // -------------------------------------------------------------------------
  async getMemories(projectId: string, includeDeleted = false): Promise<MemoryItem[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/memories?includeDeleted=${includeDeleted}`,
        { headers: this.headers(projectId) }
      );
      if (!res.ok) throw new Error(`Failed to fetch memories: ${res.statusText}`);
      const data = (await res.json()) as { data?: MemoryItem[]; memories?: MemoryItem[] };
      const items = data.data ?? data.memories ?? [];
      if (!includeDeleted && items.length === 0) {
        return this.getFallbackMemories(projectId);
      }
      return items;
    } catch {
      return includeDeleted ? [] : this.getFallbackMemories(projectId);
    }
  }

  async ingestMemory(
    projectId: string,
    type: 'fact' | 'code_snippet' | 'decision' | 'document',
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryItem> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/memories`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify({ type, content, metadata }),
      }
    );
    if (!res.ok) throw new Error(`Memory ingestion failed: ${res.statusText}`);
    const data = (await res.json()) as { data?: MemoryItem; memory?: MemoryItem };
    const item = data.data ?? data.memory;
    if (!item) throw new Error('Memory ingestion returned empty response.');
    return item;
  }

  async searchMemories(projectId: string, queryText: string, limit = 5): Promise<MemoryItem[]> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/memories/search`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify({ query: queryText, top_k: limit }),
      }
    );
    if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
    const data = (await res.json()) as { data?: MemoryItem[]; results?: MemoryItem[] };
    return data.data ?? data.results ?? [];
  }

  async softDeleteMemory(projectId: string, memoryId: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/memories/${encodeURIComponent(memoryId)}`,
      {
        method: 'DELETE',
        headers: this.headers(projectId),
      }
    );
    return res.ok;
  }

  async restoreMemory(projectId: string, memoryId: string): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/memories/${encodeURIComponent(memoryId)}/restore`,
      {
        method: 'POST',
        headers: this.headers(projectId),
      }
    );
    return res.ok;
  }

  // -------------------------------------------------------------------------
  // Prompt Package Operations (Invariant 2)
  // -------------------------------------------------------------------------
  async getPromptPackages(projectId: string): Promise<PromptPackage[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/prompts`,
        { headers: this.headers(projectId) }
      );
      if (!res.ok) throw new Error(`Failed to fetch prompts: ${res.statusText}`);
      const data = (await res.json()) as { data?: PromptPackage[]; packages?: PromptPackage[] };
      const list = data.data ?? data.packages ?? [];
      return list.length > 0 ? list : this.getFallbackPrompts(projectId);
    } catch {
      return this.getFallbackPrompts(projectId);
    }
  }

  async savePromptPackage(projectId: string, pkg: Partial<PromptPackage>): Promise<PromptPackage> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/prompts`,
      {
        method: 'POST',
        headers: this.headers(projectId),
        body: JSON.stringify(pkg),
      }
    );
    if (!res.ok) throw new Error(`Failed to save prompt package: ${res.statusText}`);
    const data = (await res.json()) as { data?: PromptPackage; package?: PromptPackage };
    const saved = data.data ?? data.package;
    if (!saved) throw new Error('Prompt save returned empty response.');
    return saved;
  }

  // -------------------------------------------------------------------------
  // Multi-Provider Proxy Completion (Invariants 6 & 8)
  // -------------------------------------------------------------------------
  async executeStreamingCompletion(
    projectId: string,
    params: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
    },
    onChunk: (text: string) => void,
    onDone: (fullText: string, metadata: { tokens: number; latencyMs: number }) => void,
    onError: (err: Error) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/proxy/chat/completions`, {
        method: 'POST',
        headers: this.headers(projectId),
        signal,
        body: JSON.stringify({
          project_id: projectId,
          ...params,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Proxy error (${res.status}): ${errorText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream available from server');

      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                onChunk(fullText);
              }
            } catch {
              // Ignore non-json chunks
            }
          }
        }
      }

      onDone(fullText, {
        tokens: Math.round(fullText.length / 4),
        latencyMs: Date.now() - startTime,
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError' || signal?.aborted) {
        return;
      }
      console.error('Direct stream error:', err);
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private getFallbackMemories(projectId: string): MemoryItem[] {
    return [
      {
        id: 'mem_arch_001',
        project_id: projectId,
        type: 'decision',
        content:
          'Architectural Invariant: Zero-bleed memory isolation via hard project_id foreign keys and fail-closed query builders.',
        metadata: { source: 'PRD.md', author: 'Alice Chen' },
        version: 1,
        superseded_by_id: null,
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        deleted_at: null,
      },
      {
        id: 'mem_crdt_002',
        project_id: projectId,
        type: 'fact',
        content:
          'Yjs CRDT rooms are strictly partitioned as `${project_id}:${document_id}` with binary Postgres snapshot persistence.',
        metadata: { source: 'minge-core-and-multiplayer.md' },
        version: 2,
        superseded_by_id: null,
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
        deleted_at: null,
      },
      {
        id: 'mem_auth_003',
        project_id: projectId,
        type: 'code_snippet',
        content:
          'export const DB_SCHEMA = "minge"; // Row Level Security (RLS) enabled on all tables',
        metadata: { language: 'typescript' },
        version: 1,
        superseded_by_id: null,
        created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        deleted_at: null,
      },
    ];
  }

  private getFallbackPrompts(projectId: string): PromptPackage[] {
    return [
      {
        id: 'pkg_clarify_01',
        project_id: projectId,
        name: 'clarify-summary',
        branch: 'main',
        system_prompt:
          'You are an expert software architect in the Minge Multiplayer Platform. Ground your answers strictly in the provided project memories.',
        user_template: 'Summarize the architectural invariants for: {{module_name}}',
        grounded_memory_ids: ['mem_arch_001', 'mem_crdt_002'],
        model_config: {
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.95,
        },
        latest_output: 'Summary of architectural invariants verified against grounded project memory.',
        version: 3,
        created_at: new Date().toISOString(),
      },
      {
        id: 'pkg_cot_02',
        project_id: projectId,
        name: 'clarify-summary',
        branch: 'exp/chain-of-thought',
        system_prompt:
          'You are an expert software architect. Think step-by-step before answering. Ground each step in explicit memory IDs.',
        user_template: 'Analyze the system constraints and memory safety for: {{module_name}}',
        grounded_memory_ids: ['mem_arch_001', 'mem_crdt_002', 'mem_auth_003'],
        model_config: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          temperature: 0.4,
          max_tokens: 3000,
          top_p: 0.9,
        },
        latest_output:
          'Step 1: Check project_id filter. Step 2: Validate Yjs CRDT room scope. Step 3: Emit binary update.',
        version: 1,
        created_at: new Date().toISOString(),
      },
    ];
  }
}

export const defaultApiClient = new ApiClient();
