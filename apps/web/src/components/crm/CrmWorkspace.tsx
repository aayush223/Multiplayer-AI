import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  GitMerge,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuthUser,
  defaultApiClient,
  MemberPermissions,
  MergedMainWorkRecord,
  OrgMember,
  OrgRole,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketWorkPayload,
  WorkTicket,
} from '../../services/apiClient';

export interface TicketPrefill {
  title: string;
  description: string;
  category: TicketCategory;
  sourceBranch: string;
  workPayload: TicketWorkPayload;
}

interface CrmWorkspaceProps {
  projectId: string;
  currentUser: AuthUser;
  members: OrgMember[];
  tickets: WorkTicket[];
  mainWork: MergedMainWorkRecord[];
  onRefresh: () => Promise<void>;
  onMainWorkMerged: (pkg: MergedMainWorkRecord) => void;
  onOpenMainInIde: () => void;
  prefillTicket: TicketPrefill | null;
  onConsumePrefill: () => void;
}

type CrmTab = 'tickets' | 'hierarchy' | 'main_work';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  changes_requested: 'Changes Requested',
  approved_merged: 'Approved & Merged',
  rejected: 'Rejected',
};

function canActorManage(actor: OrgMember | undefined, target: OrgMember): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (actor.role !== 'manager' && !actor.permissions.canManageTeam) return false;
  if (target.role === 'admin' || target.userId === actor.userId) return false;
  if (target.role === 'employee') return true;
  return target.managerId === actor.userId;
}

export const CrmWorkspace: React.FC<CrmWorkspaceProps> = ({
  projectId,
  currentUser,
  members,
  tickets,
  mainWork,
  onRefresh,
  onMainWorkMerged,
  onOpenMainInIde,
  prefillTicket,
  onConsumePrefill,
}) => {
  const [activeTab, setActiveTab] = useState<CrmTab>('tickets');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Toast / feedback banner
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Ticket Review / Manager Override state
  const [reviewNote, setReviewNote] = useState('');
  const [overrideSystemPrompt, setOverrideSystemPrompt] = useState('');
  const [overrideUserTemplate, setOverrideUserTemplate] = useState('');
  const [reassignManagerId, setReassignManagerId] = useState<string>('');

  // Raise Ticket Modal state
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [newTicketDesc, setNewTicketDesc] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState<TicketCategory>('prompt_change');
  const [newTicketPriority, setNewTicketPriority] = useState<TicketPriority>('high');
  const [newTicketBranch, setNewTicketBranch] = useState('exp/chain-of-thought');
  const [newTicketName, setNewTicketName] = useState('clarify-summary');
  const [newTicketSystemPrompt, setNewTicketSystemPrompt] = useState('');
  const [newTicketUserTemplate, setNewTicketUserTemplate] = useState('');
  const [newTicketManager, setNewTicketManager] = useState<string>('');

  // Add Member Modal state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberTitle, setNewMemberTitle] = useState('Prompt Engineer');
  const [newMemberDept, setNewMemberDept] = useState('Prompt Systems');
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>('employee');
  const [newMemberManagerId, setNewMemberManagerId] = useState<string>('');

  // Direct Publish Main Work Modal (Managers / Admins)
  const [isDirectPublishOpen, setIsDirectPublishOpen] = useState(false);
  const [directName, setDirectName] = useState('clarify-summary');
  const [directSystemPrompt, setDirectSystemPrompt] = useState('');
  const [directUserTemplate, setDirectUserTemplate] = useState('');

  // Member control edit state
  const [editRole, setEditRole] = useState<OrgRole>('employee');
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'active' | 'paused'>('active');
  const [editPerms, setEditPerms] = useState<MemberPermissions>({
    canEditMain: false,
    canApproveTickets: false,
    canManageTeam: false,
    canRunAi: true,
    dailyTokenCap: 50000,
  });

  const actorMember = useMemo(
    () => members.find((m) => m.userId === currentUser.id),
    [members, currentUser.id]
  );

  const isManagerOrAdmin =
    currentUser.role === 'admin' ||
    currentUser.role === 'manager' ||
    Boolean(actorMember?.permissions.canApproveTickets);

  const canPublishMainDirectly =
    currentUser.role === 'admin' ||
    currentUser.role === 'manager' ||
    Boolean(actorMember?.permissions.canEditMain);

  const managers = useMemo(
    () => members.filter((m) => m.role === 'admin' || m.role === 'manager'),
    [members]
  );

  const memberNameById = useMemo(() => {
    const map = new Map<string, OrgMember>();
    for (const m of members) map.set(m.userId, m);
    return map;
  }, [members]);

  // Open Raise Ticket modal when triggered from Prompt IDE or Canvas
  useEffect(() => {
    if (!prefillTicket) return;
    setActiveTab('tickets');
    setNewTicketTitle(prefillTicket.title);
    setNewTicketDesc(prefillTicket.description);
    setNewTicketCategory(prefillTicket.category);
    setNewTicketPriority('high');
    setNewTicketBranch(prefillTicket.sourceBranch);
    setNewTicketName(prefillTicket.workPayload.name || 'workspace-prompt');
    setNewTicketSystemPrompt(prefillTicket.workPayload.system_prompt || '');
    setNewTicketUserTemplate(prefillTicket.workPayload.user_template || '');
    setNewTicketManager(actorMember?.managerId || managers[0]?.userId || '');
    setIsRaiseOpen(true);
    onConsumePrefill();
  }, [prefillTicket, actorMember, managers, onConsumePrefill]);

  const filteredTickets = useMemo(
    () =>
      statusFilter === 'all'
        ? tickets
        : tickets.filter((t) => t.status === statusFilter),
    [tickets, statusFilter]
  );

  const selectedTicket = useMemo(
    () =>
      filteredTickets.find((t) => t.id === selectedTicketId) ??
      filteredTickets[0] ??
      null,
    [filteredTickets, selectedTicketId]
  );

  // Sync ticket inspector fields when selection changes
  useEffect(() => {
    if (!selectedTicket) return;
    setReviewNote(selectedTicket.reviewNote || '');
    setOverrideSystemPrompt(selectedTicket.workPayload.system_prompt || '');
    setOverrideUserTemplate(selectedTicket.workPayload.user_template || '');
    setReassignManagerId(selectedTicket.assignedManagerId || '');
  }, [selectedTicket?.id, selectedTicket?.updatedAt]);

  const selectedMember = useMemo(
    () =>
      members.find((m) => m.userId === selectedMemberId) ??
      members.find((m) => m.role === 'employee') ??
      members[0] ??
      null,
    [members, selectedMemberId]
  );

  // Sync member control fields when selected member changes
  useEffect(() => {
    if (!selectedMember) return;
    setEditRole(selectedMember.role);
    setEditManagerId(selectedMember.managerId || '');
    setEditStatus(selectedMember.status);
    setEditPerms({ ...selectedMember.permissions });
  }, [selectedMember?.userId, selectedMember?.role, selectedMember?.status, selectedMember?.managerId, selectedMember?.permissions]);

  const showBanner = (kind: 'success' | 'error', text: string) => {
    setBanner({ kind, text });
    setTimeout(() => {
      setBanner((curr) => (curr?.text === text ? null : curr));
    }, 5000);
  };

  // Actions
  const handleRaiseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketTitle.trim()) return;
    setBusyAction(true);
    try {
      const created = await defaultApiClient.raiseTicket(projectId, {
        title: newTicketTitle.trim(),
        description: newTicketDesc.trim(),
        category: newTicketCategory,
        priority: newTicketPriority,
        sourceBranch: newTicketBranch.trim() || 'exp/draft',
        targetBranch: 'main',
        assignedManagerId: newTicketManager || undefined,
        workPayload: {
          name: newTicketName.trim() || 'main-work',
          system_prompt: newTicketSystemPrompt.trim(),
          user_template: newTicketUserTemplate.trim(),
          model_config: { model: 'gemini-2.5-flash', temperature: 0.5, max_tokens: 2048 },
        },
      });
      await onRefresh();
      setSelectedTicketId(created.id);
      setIsRaiseOpen(false);
      setNewTicketTitle('');
      setNewTicketDesc('');
      showBanner('success', `Ticket "${created.title}" raised and routed for manager approval.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to raise ticket.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDecision = async (
    action: 'approve_merge' | 'request_changes' | 'reject' | 'in_review'
  ) => {
    if (!selectedTicket) return;
    setBusyAction(true);
    try {
      const res = await defaultApiClient.decideTicket(projectId, selectedTicket.id, {
        action,
        reviewNote: reviewNote.trim() || undefined,
        reassignManagerId: reassignManagerId || null,
        overridePayload: {
          ...selectedTicket.workPayload,
          system_prompt: overrideSystemPrompt,
          user_template: overrideUserTemplate,
        },
      });
      await onRefresh();
      if (res.mergedPackage) {
        onMainWorkMerged(res.mergedPackage);
        showBanner(
          'success',
          `Approved & added "${res.mergedPackage.name}" (v${res.mergedPackage.version}) directly into Main Work.`
        );
      } else {
        showBanner('success', `Ticket updated to "${STATUS_LABEL[res.ticket.status]}".`);
      }
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleEmployeeResubmit = async () => {
    if (!selectedTicket) return;
    setBusyAction(true);
    try {
      await defaultApiClient.resubmitTicket(projectId, selectedTicket.id, {
        workPayload: {
          ...selectedTicket.workPayload,
          system_prompt: overrideSystemPrompt,
          user_template: overrideUserTemplate,
        },
      });
      await onRefresh();
      showBanner('success', 'Ticket updated and resubmitted to your manager for approval.');
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to resubmit ticket.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleArchiveTicket = async (ticketId: string) => {
    setBusyAction(true);
    try {
      await defaultApiClient.softDeleteTicket(projectId, ticketId);
      await onRefresh();
      showBanner('success', 'Ticket soft-deleted (recoverable for 30 days).');
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to archive ticket.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveMemberControls = async () => {
    if (!selectedMember) return;
    setBusyAction(true);
    try {
      await defaultApiClient.updateCrmMember(projectId, selectedMember.userId, {
        role: editRole,
        managerId: editManagerId || null,
        status: editStatus,
        permissions: editPerms,
      });
      await onRefresh();
      showBanner('success', `Updated hierarchy & workspace controls for ${selectedMember.displayName}.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to update member.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    setBusyAction(true);
    try {
      const slugId = `user_${newMemberEmail
        .trim()
        .toLowerCase()
        .split('@')[0]
        .replace(/[^a-z0-9]/g, '_')}`;
      const created = await defaultApiClient.addCrmMember(projectId, {
        userId: slugId,
        displayName: newMemberName.trim(),
        email: newMemberEmail.trim().toLowerCase(),
        role: newMemberRole,
        title: newMemberTitle.trim() || 'Contributor',
        department: newMemberDept.trim() || 'Engineering',
        managerId: newMemberManagerId || currentUser.id,
      });
      await onRefresh();
      setSelectedMemberId(created.userId);
      setIsAddMemberOpen(false);
      setNewMemberName('');
      setNewMemberEmail('');
      showBanner('success', `Added ${created.displayName} (${created.role}) to the organization hierarchy.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to add team member.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDirectPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directName.trim() || !directSystemPrompt.trim()) return;
    setBusyAction(true);
    try {
      const published = await defaultApiClient.publishMainWork(projectId, {
        name: directName.trim(),
        system_prompt: directSystemPrompt.trim(),
        user_template: directUserTemplate.trim(),
      });
      await onRefresh();
      onMainWorkMerged(published);
      setIsDirectPublishOpen(false);
      setDirectSystemPrompt('');
      setDirectUserTemplate('');
      showBanner('success', `Published "${published.name}" v${published.version} directly into Main Work.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to publish Main Work.');
    } finally {
      setBusyAction(false);
    }
  };

  // Build hierarchical org tree rows recursively
  const orgTreeRows = useMemo(() => {
    const byManager = new Map<string, OrgMember[]>();
    const roots: OrgMember[] = [];
    const memberIds = new Set(members.map((m) => m.userId));

    for (const m of members) {
      if (!m.managerId || !memberIds.has(m.managerId) || m.managerId === m.userId) {
        roots.push(m);
      } else {
        const list = byManager.get(m.managerId) ?? [];
        list.push(m);
        byManager.set(m.managerId, list);
      }
    }

    const ordered: Array<{ member: OrgMember; depth: number }> = [];
    const visited = new Set<string>();
    const walk = (node: OrgMember, depth: number) => {
      if (visited.has(node.userId)) return;
      visited.add(node.userId);
      ordered.push({ member: node, depth });
      for (const child of byManager.get(node.userId) ?? []) {
        walk(child, depth + 1);
      }
    };
    for (const root of roots) walk(root, 0);
    for (const m of members) walk(m, 0);
    return ordered;
  }, [members]);

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_review').length;
  const changesCount = tickets.filter((t) => t.status === 'changes_requested').length;
  const mergedCount = tickets.filter((t) => t.status === 'approved_merged').length;

  const statusChipClass = (status: TicketStatus) => {
    if (status === 'approved_merged') return 'adobe-chip-dark';
    if (status === 'open' || status === 'changes_requested') return 'adobe-chip-red';
    return 'adobe-chip';
  };

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Top CRM Editorial Header & Tabs */}
      <div
        style={{
          padding: '20px 28px 0 28px',
          borderBottom: '1px solid var(--color-neutral)',
          backgroundColor: 'var(--color-surface)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                }}
              >
                Team Hierarchy & Ticket Approvals
              </h1>
              <span className={isManagerOrAdmin ? 'adobe-chip-red' : 'adobe-chip'}>
                {currentUser.role.toUpperCase()} ACCESS
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--color-primary-70)', marginTop: 4 }}>
              {isManagerOrAdmin
                ? 'Manager Authority Active — Control employee permissions, steer drafts, and approve tickets straight into Main Work.'
                : 'Employee Contributor Mode — Raise work tickets for your manager to review and merge into Main Work.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => void onRefresh()}
              className="adobe-btn-subtle"
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
              title="Refresh Workspace Data"
            >
              <RefreshCw size={14} />
              <span>Sync</span>
            </button>

            <button
              onClick={() => {
                setNewTicketManager(actorMember?.managerId || managers[0]?.userId || '');
                setIsRaiseOpen(true);
              }}
              className="adobe-btn-red"
              style={{ height: 36, padding: '0 18px', fontSize: 13 }}
            >
              <Plus size={15} />
              <span>Raise Work Ticket</span>
            </button>

            {isManagerOrAdmin && (
              <button
                onClick={() => {
                  setNewMemberManagerId(currentUser.id);
                  setIsAddMemberOpen(true);
                }}
                className="adobe-btn-dark"
                style={{ height: 36, padding: '0 16px', fontSize: 13 }}
              >
                <UserPlus size={14} />
                <span>Add Team Member</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI Metrics Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div className="adobe-card" style={{ padding: '12px 16px', backgroundColor: 'var(--color-surface-10)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)' }}>PENDING APPROVAL</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--color-secondary)' }}>
              {openCount}
            </div>
          </div>
          <div className="adobe-card" style={{ padding: '12px 16px', backgroundColor: 'var(--color-surface-10)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)' }}>CHANGES REQUESTED</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900 }}>
              {changesCount}
            </div>
          </div>
          <div className="adobe-card" style={{ padding: '12px 16px', backgroundColor: 'var(--color-surface-10)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)' }}>MERGED TO MAIN WORK</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900 }}>
              {mergedCount}
            </div>
          </div>
          <div className="adobe-card" style={{ padding: '12px 16px', backgroundColor: 'var(--color-surface-10)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)' }}>ORG HIERARCHY MEMBERS</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900 }}>
              {members.length}
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { id: 'tickets' as const, label: `Approval Tickets (${tickets.length})`, icon: Ticket },
            { id: 'hierarchy' as const, label: `Org Hierarchy & Manager Controls (${members.length})`, icon: Users },
            { id: 'main_work' as const, label: `Main Work Ledger (${mainWork.length})`, icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  color: active ? 'var(--color-on-surface)' : 'var(--color-primary-70)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--color-secondary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <Icon size={15} color={active ? 'var(--color-secondary)' : 'var(--color-primary-40)'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          style={{
            padding: '10px 28px',
            backgroundColor: banner.kind === 'success' ? '#1A1A1A' : 'rgba(235, 16, 0, 0.08)',
            color: banner.kind === 'success' ? '#FFFFFF' : 'var(--color-secondary)',
            borderBottom: '1px solid var(--color-neutral)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {banner.kind === 'success' ? <CheckCircle2 size={15} color="#EB1000" /> : <AlertCircle size={15} />}
            {banner.text}
          </span>
          <button
            onClick={() => setBanner(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* ============================================================
            TAB 1: TICKETS & MANAGER APPROVAL QUEUE
            ============================================================ */}
        {activeTab === 'tickets' && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '410px minmax(0, 1fr)', height: '100%' }}>
            {/* Ticket List Column */}
            <div
              style={{
                borderRight: '1px solid var(--color-neutral)',
                backgroundColor: 'var(--color-surface-10)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--color-neutral)',
                  backgroundColor: 'var(--color-surface)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {(['all', 'open', 'in_review', 'changes_requested', 'approved_merged', 'rejected'] as const).map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={statusFilter === st ? 'adobe-chip-dark' : 'adobe-chip'}
                      style={{ cursor: 'pointer', fontSize: 11, padding: '3px 10px' }}
                    >
                      {st === 'all' ? 'All' : STATUS_LABEL[st]}
                    </button>
                  )
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredTickets.length === 0 ? (
                  <div className="adobe-card" style={{ textAlign: 'center', padding: 28, color: 'var(--color-primary-70)' }}>
                    No tickets match this filter. Click <strong>Raise Work Ticket</strong> to submit work for Main Work review.
                  </div>
                ) : (
                  filteredTickets.map((ticket) => {
                    const isSelected = selectedTicket?.id === ticket.id;
                    const author = memberNameById.get(ticket.raisedByUserId);
                    const reviewer = ticket.assignedManagerId
                      ? memberNameById.get(ticket.assignedManagerId)
                      : null;
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className="adobe-card-interactive"
                        style={{
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderColor: isSelected ? 'var(--color-primary)' : undefined,
                          borderLeft: isSelected
                            ? '4px solid var(--color-secondary)'
                            : '4px solid var(--color-neutral)',
                          padding: 14,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <span className={statusChipClass(ticket.status)} style={{ fontSize: 10, padding: '2px 8px' }}>
                            {STATUS_LABEL[ticket.status]}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: ticket.priority === 'urgent' || ticket.priority === 'high' ? 'var(--color-secondary)' : 'var(--color-primary-70)' }}>
                            {ticket.priority.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{ticket.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginBottom: 8 }}>
                          {ticket.sourceBranch} → <strong>{ticket.targetBranch}</strong>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-primary-40)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>By {author?.displayName || ticket.raisedByUserId}</span>
                          <span>Mgr: {reviewer?.displayName || 'Unassigned'}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Ticket Detail & Manager Approval Column */}
            <div style={{ overflowY: 'auto', padding: 24 }}>
              {!selectedTicket ? (
                <div style={{ color: 'var(--color-primary-70)', padding: 24 }}>Select a ticket to inspect its work payload and approval controls.</div>
              ) : (
                <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className={statusChipClass(selectedTicket.status)}>
                          {STATUS_LABEL[selectedTicket.status]}
                        </span>
                        <span className="adobe-chip">{selectedTicket.category.replace('_', ' ')}</span>
                        <span className="adobe-chip">
                          {selectedTicket.sourceBranch} → {selectedTicket.targetBranch}
                        </span>
                      </div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900 }}>
                        {selectedTicket.title}
                      </h2>
                      <p style={{ fontSize: 14, color: 'var(--color-primary-70)', marginTop: 6 }}>
                        {selectedTicket.description || 'No description provided.'}
                      </p>
                      <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 8 }}>
                        Raised by{' '}
                        <strong>
                          {memberNameById.get(selectedTicket.raisedByUserId)?.displayName ||
                            selectedTicket.raisedByUserId}
                        </strong>{' '}
                        · Routed to Manager{' '}
                        <strong>
                          {selectedTicket.assignedManagerId
                            ? memberNameById.get(selectedTicket.assignedManagerId)?.displayName ||
                              selectedTicket.assignedManagerId
                            : 'Any Manager'}
                        </strong>
                      </div>
                    </div>

                    {(isManagerOrAdmin || selectedTicket.raisedByUserId === currentUser.id) && (
                      <button
                        onClick={() => void handleArchiveTicket(selectedTicket.id)}
                        disabled={busyAction}
                        className="adobe-btn-subtle"
                        style={{ height: 34, padding: '0 12px', fontSize: 12, color: 'var(--color-secondary)' }}
                        title="Soft-delete ticket (30-day recovery)"
                      >
                        <Trash2 size={13} />
                        <span>Archive</span>
                      </button>
                    )}
                  </div>

                  {/* Work Payload Box (Editable by Manager before approval OR by Author when open/changes_requested) */}
                  <div className="adobe-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, fontSize: 13 }}>
                        PROPOSED WORK PAYLOAD ({selectedTicket.workPayload.name || 'main-work'})
                      </span>
                      {isManagerOrAdmin && selectedTicket.status !== 'approved_merged' && (
                        <span className="adobe-chip-red" style={{ fontSize: 11 }}>
                          Manager Override Editable
                        </span>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                        System Prompt / Core Spec
                      </label>
                      <textarea
                        rows={5}
                        value={overrideSystemPrompt}
                        onChange={(e) => setOverrideSystemPrompt(e.target.value)}
                        readOnly={
                          selectedTicket.status === 'approved_merged' ||
                          (!isManagerOrAdmin && selectedTicket.raisedByUserId !== currentUser.id)
                        }
                        style={{
                          width: '100%',
                          padding: 12,
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-neutral)',
                          backgroundColor: 'var(--color-surface-10)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          lineHeight: 1.55,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                        User Template / Output Summary
                      </label>
                      <textarea
                        rows={3}
                        value={overrideUserTemplate}
                        onChange={(e) => setOverrideUserTemplate(e.target.value)}
                        readOnly={
                          selectedTicket.status === 'approved_merged' ||
                          (!isManagerOrAdmin && selectedTicket.raisedByUserId !== currentUser.id)
                        }
                        style={{
                          width: '100%',
                          padding: 12,
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-neutral)',
                          backgroundColor: 'var(--color-surface-10)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          lineHeight: 1.55,
                        }}
                      />
                    </div>
                  </div>

                  {/* Decision Section: Manager Approval vs Employee Read-Only / Resubmit */}
                  {selectedTicket.status === 'approved_merged' ? (
                    <div
                      className="adobe-card"
                      style={{
                        borderColor: 'var(--color-primary)',
                        backgroundColor: 'var(--color-surface-10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
                          <GitMerge size={16} color="var(--color-secondary)" />
                          <span>Approved & Merged into Main Work</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 4 }}>
                          Approved by{' '}
                          <strong>
                            {selectedTicket.reviewedByUserId
                              ? memberNameById.get(selectedTicket.reviewedByUserId)?.displayName ||
                                selectedTicket.reviewedByUserId
                              : 'Manager'}
                          </strong>
                          {selectedTicket.reviewNote ? ` · "${selectedTicket.reviewNote}"` : ''}
                        </div>
                      </div>
                      <button onClick={onOpenMainInIde} className="adobe-btn-dark" style={{ height: 36, fontSize: 13 }}>
                        Open Main Work in IDE
                      </button>
                    </div>
                  ) : isManagerOrAdmin ? (
                    <div
                      className="adobe-card"
                      style={{
                        borderTop: '3px solid var(--color-secondary)',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ShieldCheck size={16} color="var(--color-secondary)" />
                          Manager Approval Decision
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>Reviewer:</span>
                          <select
                            value={reassignManagerId}
                            onChange={(e) => setReassignManagerId(e.target.value)}
                            className="adobe-input"
                            style={{ height: 32, width: 190, fontSize: 12, padding: '0 10px' }}
                          >
                            {managers.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.displayName} ({m.role})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Add approval note or requested changes for the employee..."
                        className="adobe-input"
                      />

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <button
                          onClick={() => void handleDecision('approve_merge')}
                          disabled={busyAction}
                          className="adobe-btn-red"
                          style={{ height: 40 }}
                        >
                          <GitMerge size={15} />
                          <span>Approve & Add to Main Work</span>
                        </button>
                        <button
                          onClick={() => void handleDecision('request_changes')}
                          disabled={busyAction}
                          className="adobe-btn-outline"
                          style={{ height: 40 }}
                        >
                          <AlertCircle size={15} />
                          <span>Request Changes</span>
                        </button>
                        <button
                          onClick={() => void handleDecision('in_review')}
                          disabled={busyAction}
                          className="adobe-btn-subtle"
                          style={{ height: 40 }}
                        >
                          <span>Mark In Review</span>
                        </button>
                        <button
                          onClick={() => void handleDecision('reject')}
                          disabled={busyAction}
                          className="adobe-btn-subtle"
                          style={{ height: 40, color: 'var(--color-secondary)' }}
                        >
                          <XCircle size={15} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="adobe-card"
                      style={{
                        backgroundColor: 'var(--color-surface-10)',
                        padding: 18,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Lock size={14} color="var(--color-primary)" />
                          <span>Manager Approval Required to Merge into Main Work</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 4 }}>
                          {selectedTicket.reviewNote
                            ? `Manager feedback: "${selectedTicket.reviewNote}"`
                            : 'Your manager can review, edit, and approve this ticket into production Main Work.'}
                        </div>
                      </div>
                      {selectedTicket.raisedByUserId === currentUser.id && (
                        <button
                          onClick={() => void handleEmployeeResubmit()}
                          disabled={busyAction}
                          className="adobe-btn-dark"
                          style={{ height: 36, fontSize: 13 }}
                        >
                          <Send size={13} />
                          <span>Save & Resubmit</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 2: CRM ORG HIERARCHY & MANAGER FREEDOM CONTROLS
            ============================================================ */}
        {activeTab === 'hierarchy' && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '460px minmax(0, 1fr)', height: '100%' }}>
            {/* Org Tree Column */}
            <div
              style={{
                borderRight: '1px solid var(--color-neutral)',
                backgroundColor: 'var(--color-surface-10)',
                overflowY: 'auto',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--color-primary-70)', marginBottom: 4 }}>
                REPORTING HIERARCHY TREE
              </div>
              {orgTreeRows.map(({ member, depth }) => {
                const isSelected = selectedMember?.userId === member.userId;
                const memberTickets = tickets.filter((t) => t.raisedByUserId === member.userId).length;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => setSelectedMemberId(member.userId)}
                    className="adobe-card-interactive"
                    style={{
                      marginLeft: Math.min(depth * 24, 72),
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--color-primary)' : undefined,
                      borderLeft:
                        member.role === 'admin'
                          ? '4px solid var(--color-primary)'
                          : member.role === 'manager'
                          ? '4px solid var(--color-secondary)'
                          : '4px solid var(--color-primary-40)',
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>
                        {member.displayName}
                        {member.userId === currentUser.id ? ' (You)' : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {member.status === 'paused' && (
                          <span className="adobe-chip" style={{ fontSize: 10, color: 'var(--color-secondary)' }}>
                            PAUSED
                          </span>
                        )}
                        <span
                          className={
                            member.role === 'admin'
                              ? 'adobe-chip-dark'
                              : member.role === 'manager'
                              ? 'adobe-chip-red'
                              : 'adobe-chip'
                          }
                          style={{ fontSize: 10, padding: '2px 8px' }}
                        >
                          {member.role.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 4 }}>
                      {member.title} · {member.department}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-primary-40)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>AI Cap: {member.permissions.dailyTokenCap.toLocaleString()} tok/day</span>
                      <span>{memberTickets} ticket{memberTickets === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Member Control Inspector */}
            <div style={{ overflowY: 'auto', padding: 24 }}>
              {selectedMember && (
                <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900 }}>
                        {selectedMember.displayName}
                      </h2>
                      <span className={selectedMember.role === 'manager' ? 'adobe-chip-red' : selectedMember.role === 'admin' ? 'adobe-chip-dark' : 'adobe-chip'}>
                        {selectedMember.role.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: 13.5, color: 'var(--color-primary-70)', marginTop: 4 }}>
                      {selectedMember.title} · {selectedMember.department} · {selectedMember.email}
                    </p>
                  </div>

                  {canActorManage(actorMember, selectedMember) ? (
                    <div className="adobe-card" style={{ borderTop: '3px solid var(--color-secondary)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        Manager Hierarchy & Permission Controls
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                            Role Tier
                          </label>
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as OrgRole)}
                            className="adobe-input"
                          >
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            {currentUser.role === 'admin' && <option value="admin">Admin</option>}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                            Reports To (Manager)
                          </label>
                          <select
                            value={editManagerId}
                            onChange={(e) => setEditManagerId(e.target.value)}
                            className="adobe-input"
                          >
                            <option value="">Top of Hierarchy</option>
                            {managers
                              .filter((m) => m.userId !== selectedMember.userId)
                              .map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.displayName} ({m.role})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                            Workspace Status
                          </label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as 'active' | 'paused')}
                            className="adobe-input"
                          >
                            <option value="active">Active</option>
                            <option value="paused">Paused (Lock Submissions)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                          { key: 'canEditMain' as const, label: 'Allow Direct Main Work Edits' },
                          { key: 'canApproveTickets' as const, label: 'Delegate Ticket Approval Rights' },
                          { key: 'canManageTeam' as const, label: 'Allow Managing Subordinates' },
                          { key: 'canRunAi' as const, label: 'Allow AI Model Execution' },
                        ].map((perm) => (
                          <label
                            key={perm.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--color-neutral)',
                              backgroundColor: 'var(--color-surface-10)',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editPerms[perm.key]}
                              onChange={(e) =>
                                setEditPerms((p) => ({ ...p, [perm.key]: e.target.checked }))
                              }
                              style={{ accentColor: 'var(--color-secondary)' }}
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                          Daily AI Token Quota Cap
                        </label>
                        <input
                          type="number"
                          min={1000}
                          max={5000000}
                          step={5000}
                          value={editPerms.dailyTokenCap}
                          onChange={(e) =>
                            setEditPerms((p) => ({
                              ...p,
                              dailyTokenCap: Math.max(1000, Number(e.target.value) || 1000),
                            }))
                          }
                          className="adobe-input"
                          style={{ maxWidth: 240 }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => void handleSaveMemberControls()}
                          disabled={busyAction}
                          className="adobe-btn-red"
                        >
                          <ShieldCheck size={15} />
                          <span>Save Manager Controls</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="adobe-card" style={{ backgroundColor: 'var(--color-surface-10)', padding: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                        Hierarchy Read-Only View
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-primary-70)' }}>
                        {selectedMember.userId === currentUser.id
                          ? 'This is your own profile. Managers above you govern your reporting line and workspace permissions.'
                          : 'You do not outrank this member in the team hierarchy to modify their permissions.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 3: MAIN WORK LEDGER (APPROVED PRODUCTION PACKAGES)
            ============================================================ */}
        {activeTab === 'main_work' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
            <div style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900 }}>
                    Approved Main Work (`main` Branch)
                  </h2>
                  <p style={{ fontSize: 13.5, color: 'var(--color-primary-70)' }}>
                    Immutable versioned work promoted through manager ticket approvals or direct manager publishing.
                  </p>
                </div>

                {canPublishMainDirectly ? (
                  <button
                    onClick={() => setIsDirectPublishOpen(true)}
                    className="adobe-btn-dark"
                    style={{ height: 38 }}
                  >
                    <Plus size={15} />
                    <span>Direct Publish to Main Work</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsRaiseOpen(true)}
                    className="adobe-btn-red"
                    style={{ height: 38 }}
                  >
                    <Ticket size={15} />
                    <span>Raise Ticket to Propose Main Work</span>
                  </button>
                )}
              </div>

              {mainWork.length === 0 ? (
                <div className="adobe-card" style={{ padding: 28, textAlign: 'center', color: 'var(--color-primary-70)' }}>
                  No tickets have been merged into Main Work yet. Approve an open ticket to materialize version 1 in PostgreSQL!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  {mainWork.map((pkg) => (
                    <div key={pkg.id} className="adobe-card" style={{ borderTop: '3px solid var(--color-primary)', padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{pkg.name}</span>
                        <span className="adobe-chip-red">v{pkg.version} · MAIN</span>
                      </div>
                      <p
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--color-primary-70)',
                          backgroundColor: 'var(--color-surface-10)',
                          padding: 10,
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: 12,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {pkg.system_prompt}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--color-primary-70)' }}>
                          Approved by{' '}
                          <strong>
                            {memberNameById.get(pkg.created_by_user_id)?.displayName ||
                              pkg.created_by_user_id}
                          </strong>
                        </span>
                        <button onClick={onOpenMainInIde} className="adobe-btn-link" style={{ fontSize: 12 }}>
                          Open in Prompt IDE →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          MODAL: RAISE WORK TICKET
          ============================================================ */}
      {isRaiseOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-hero-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <form
            onSubmit={handleRaiseTicket}
            className="adobe-card"
            style={{ width: '100%', maxWidth: 620, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900 }}>
                Raise Approval Ticket for Main Work
              </h3>
              <button
                type="button"
                onClick={() => setIsRaiseOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Ticket Title</label>
              <input
                type="text"
                value={newTicketTitle}
                onChange={(e) => setNewTicketTitle(e.target.value)}
                placeholder="e.g. Add structured JSON citation guardrails to main prompt"
                className="adobe-input"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Category</label>
                <select
                  value={newTicketCategory}
                  onChange={(e) => setNewTicketCategory(e.target.value as TicketCategory)}
                  className="adobe-input"
                >
                  <option value="prompt_change">Prompt Change</option>
                  <option value="canvas_work">Canvas Work</option>
                  <option value="memory_addition">Memory Addition</option>
                  <option value="task_assignment">Task Assignment</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Priority</label>
                <select
                  value={newTicketPriority}
                  onChange={(e) => setNewTicketPriority(e.target.value as TicketPriority)}
                  className="adobe-input"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Route to Manager</label>
                <select
                  value={newTicketManager}
                  onChange={(e) => setNewTicketManager(e.target.value)}
                  className="adobe-input"
                >
                  {managers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Source Branch</label>
                <input
                  type="text"
                  value={newTicketBranch}
                  onChange={(e) => setNewTicketBranch(e.target.value)}
                  className="adobe-input"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Target Package Name</label>
                <input
                  type="text"
                  value={newTicketName}
                  onChange={(e) => setNewTicketName(e.target.value)}
                  className="adobe-input"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Summary / Rationale</label>
              <textarea
                rows={2}
                value={newTicketDesc}
                onChange={(e) => setNewTicketDesc(e.target.value)}
                placeholder="Explain why this work should be approved and merged into Main Work..."
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-neutral)',
                  fontFamily: 'var(--font-ui)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Proposed System Prompt / Main Work Content
              </label>
              <textarea
                rows={4}
                value={newTicketSystemPrompt}
                onChange={(e) => setNewTicketSystemPrompt(e.target.value)}
                placeholder="Paste or draft the work to be added to Main Work upon manager approval..."
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-neutral)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                User Template (Optional)
              </label>
              <textarea
                rows={2}
                value={newTicketUserTemplate}
                onChange={(e) => setNewTicketUserTemplate(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-neutral)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setIsRaiseOpen(false)} className="adobe-btn-subtle">
                Cancel
              </button>
              <button type="submit" disabled={busyAction} className="adobe-btn-red">
                <Send size={14} />
                <span>{busyAction ? 'Submitting...' : 'Submit Ticket to Manager'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================
          MODAL: ADD TEAM MEMBER (MANAGERS / ADMINS)
          ============================================================ */}
      {isAddMemberOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-hero-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <form
            onSubmit={handleAddMember}
            className="adobe-card"
            style={{ width: '100%', maxWidth: 500, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900 }}>
                Add Member to Org Hierarchy
              </h3>
              <button type="button" onClick={() => setIsAddMemberOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Full Name (e.g. Priya Nair)"
              className="adobe-input"
              required
            />
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Work Email (e.g. priya@minge.ai)"
              className="adobe-input"
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                type="text"
                value={newMemberTitle}
                onChange={(e) => setNewMemberTitle(e.target.value)}
                placeholder="Job Title"
                className="adobe-input"
              />
              <input
                type="text"
                value={newMemberDept}
                onChange={(e) => setNewMemberDept(e.target.value)}
                placeholder="Department"
                className="adobe-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as OrgRole)}
                className="adobe-input"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                {currentUser.role === 'admin' && <option value="admin">Admin</option>}
              </select>
              <select
                value={newMemberManagerId}
                onChange={(e) => setNewMemberManagerId(e.target.value)}
                className="adobe-input"
              >
                {managers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    Reports to: {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setIsAddMemberOpen(false)} className="adobe-btn-subtle">
                Cancel
              </button>
              <button type="submit" disabled={busyAction} className="adobe-btn-dark">
                <UserPlus size={14} />
                <span>Add to Hierarchy</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================
          MODAL: DIRECT PUBLISH TO MAIN WORK (MANAGER FREEDOM)
          ============================================================ */}
      {isDirectPublishOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-hero-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <form
            onSubmit={handleDirectPublish}
            className="adobe-card"
            style={{ width: '100%', maxWidth: 560, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900 }}>
                Direct Publish to Main Work
              </h3>
              <button type="button" onClick={() => setIsDirectPublishOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={directName}
              onChange={(e) => setDirectName(e.target.value)}
              placeholder="Package Name (e.g. clarify-summary)"
              className="adobe-input"
              required
            />
            <textarea
              rows={5}
              value={directSystemPrompt}
              onChange={(e) => setDirectSystemPrompt(e.target.value)}
              placeholder="Production system prompt directive..."
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
              }}
              required
            />
            <textarea
              rows={3}
              value={directUserTemplate}
              onChange={(e) => setDirectUserTemplate(e.target.value)}
              placeholder="User template (optional)..."
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setIsDirectPublishOpen(false)} className="adobe-btn-subtle">
                Cancel
              </button>
              <button type="submit" disabled={busyAction} className="adobe-btn-red">
                <GitMerge size={14} />
                <span>Publish to Main</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
