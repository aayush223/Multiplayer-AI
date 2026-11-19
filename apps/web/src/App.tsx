import { useState, useEffect, useCallback } from 'react';
import { ArchiveRestore, Code2, LayoutGrid, LogOut, ShieldCheck, Ticket } from 'lucide-react';
import { ActivityBar } from './components/ide/ActivityBar';
import { ActivitySidebar } from './components/ide/ActivitySidebar';
import { PromptEditor } from './components/ide/PromptEditor';
import { AgentChatPanel } from './components/ide/AgentChatPanel';
import { StatusBar } from './components/ide/StatusBar';
import { SpatialCanvas } from './components/canvas/SpatialCanvas';
import { RecoveryDrawer } from './components/modals/RecoveryDrawer';
import { HeroPage } from './components/auth/HeroPage';
import { LoginPage } from './components/auth/LoginPage';
import { CrmWorkspace, TicketPrefill } from './components/crm/CrmWorkspace';
import { useCrdtSync, CanvasNodeData } from './hooks/useCrdtSync';
import {
  AuthUser,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_SLUG,
  defaultApiClient,
  MemoryItem,
  MergedMainWorkRecord,
  OrgMember,
  PromptPackage,
  PromptPullRequest,
  WorkTicket,
} from './services/apiClient';

const SESSION_STORAGE_KEY = 'minge_auth_session_v1';

interface StoredSession {
  token: string;
  user: AuthUser;
  projectId: string;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.token && parsed.user?.id && parsed.user?.email) {
      return {
        token: parsed.token,
        user: parsed.user,
        projectId: DEFAULT_PROJECT_ID,
      };
    }
  } catch {
    // Ignore corrupted storage
  }
  return null;
}

export function App() {
  const [projectId] = useState(DEFAULT_PROJECT_ID);
  const [documentId] = useState('canvas-doc-01');

  const [session, setSession] = useState<StoredSession | null>(() => {
    const restored = loadStoredSession();
    if (restored) {
      defaultApiClient.setAuthToken(restored.token);
      defaultApiClient.setUserId(restored.user.id);
    }
    return restored;
  });

  const [appView, setAppView] = useState<'hero' | 'login' | 'workspace'>(() =>
    session ? 'workspace' : 'hero'
  );
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);

  // Active Workspace Surface: Prompt IDE | AI Canvas | CRM & Tickets
  const [surface, setSurface] = useState<'ide' | 'canvas' | 'crm'>('crm');

  // IDE State
  const [activeActivityTab, setActiveActivityTab] = useState<
    'explorer' | 'branches' | 'search' | 'prs' | 'memories'
  >('branches');
  const [currentBranch, setCurrentBranch] = useState('exp/chain-of-thought');
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  // Data states
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [softDeletedMemories, setSoftDeletedMemories] = useState<MemoryItem[]>([]);
  const [promptPackages, setPromptPackages] = useState<PromptPackage[]>([]);
  const [activePrs, setActivePrs] = useState<PromptPullRequest[]>([
    {
      id: 'pr-14',
      projectId: DEFAULT_PROJECT_ID,
      title: 'Ground system prompt with CoT reasoning',
      sourceBranch: 'exp/chain-of-thought',
      targetBranch: 'main',
      author: 'Bob Patel',
      status: 'in_review',
      benchmarkDelta: {
        accuracy: '+4.2% (96.6%)',
        costDelta: '-$0.003/1k',
        latencyDelta: '-120ms',
      },
      createdAt: new Date().toISOString(),
    },
  ]);

  // CRM Hierarchy & Tickets State
  const [orgDirectory, setOrgDirectory] = useState<AuthUser[]>([]);
  const [crmMembers, setCrmMembers] = useState<OrgMember[]>([]);
  const [crmTickets, setCrmTickets] = useState<WorkTicket[]>([]);
  const [crmMainWork, setCrmMainWork] = useState<MergedMainWorkRecord[]>([]);
  const [ticketPrefill, setTicketPrefill] = useState<TicketPrefill | null>(null);

  const activeUser: AuthUser = session?.user ?? {
    id: 'user_alice',
    name: 'Alice Chen',
    email: 'alice@minge.ai',
    role: 'manager',
    title: 'Engineering Manager',
    department: 'Prompt Systems',
    managerId: 'user_victoria',
    color: '#EB1000',
  };

  // Yjs CRDT Hook (only connects with valid UUID projectId)
  const {
    nodes,
    edges,
    peers,
    isConnected,
    updateNodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    addEdge,
    broadcastCursor,
  } = useCrdtSync(projectId, documentId, {
    id: activeUser.id,
    name: activeUser.name,
    color: activeUser.color,
  });

  const handleAuthenticated = useCallback(
    (next: { token: string; user: AuthUser; projectId: string }) => {
      const normalized: StoredSession = {
        token: next.token,
        user: next.user,
        projectId: DEFAULT_PROJECT_ID,
      };
      defaultApiClient.setAuthToken(normalized.token);
      defaultApiClient.setUserId(normalized.user.id);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
      setSession(normalized);
      setAppView('workspace');
    },
    []
  );

  const handleQuickDemoLogin = async (email: string) => {
    setIsLaunchingDemo(true);
    try {
      const authRes = await defaultApiClient.login({
        email,
        password: 'minge-demo',
        projectId: DEFAULT_PROJECT_ID,
      });
      handleAuthenticated(authRes);
    } catch {
      setAppView('login');
    } finally {
      setIsLaunchingDemo(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    defaultApiClient.setAuthToken('');
    setSession(null);
    setAppView('hero');
  };

  const handleSwitchIdentityByEmail = async (email: string) => {
    try {
      const authRes = await defaultApiClient.login({
        email,
        password: 'minge-demo',
        projectId: DEFAULT_PROJECT_ID,
      });
      handleAuthenticated(authRes);
    } catch (err) {
      console.error('Failed to switch identity:', err);
    }
  };

  const refreshCrmData = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [orgRes, ticketList] = await Promise.all([
        defaultApiClient.getCrmOrg(projectId),
        defaultApiClient.getCrmTickets(projectId),
      ]);
      setCrmMembers(orgRes.members);
      setCrmMainWork(orgRes.mainWork);
      setCrmTickets(ticketList);
    } catch (err) {
      // If stored token expired, return to login cleanly
      if (err instanceof Error && err.message.includes('401')) {
        handleLogout();
      }
    }
  }, [projectId, session?.token]);

  // Load directory once for quick role switcher
  useEffect(() => {
    void defaultApiClient.getAuthDirectory().then(setOrgDirectory);
  }, []);

  // Load workspace memories, prompts, and CRM state when authenticated
  useEffect(() => {
    if (!session?.token) return;
    defaultApiClient.setAuthToken(session.token);
    defaultApiClient.setUserId(session.user.id);

    async function loadWorkspace() {
      const [active, deleted, prompts] = await Promise.all([
        defaultApiClient.getMemories(projectId, false),
        defaultApiClient.getMemories(projectId, true),
        defaultApiClient.getPromptPackages(projectId),
      ]);
      setMemories(active);
      setSoftDeletedMemories(deleted.filter((m) => m.deleted_at !== null));
      setPromptPackages(prompts);
      await refreshCrmData();
    }

    void loadWorkspace();
  }, [projectId, session?.token, session?.user.id, refreshCrmData]);

  // Pre-workspace Views: Hero Landing Page & Login Page
  if (appView === 'hero') {
    return (
      <HeroPage
        onGoToLogin={() => setAppView('login')}
        onQuickDemoLogin={(email) => void handleQuickDemoLogin(email)}
        isLoadingDemo={isLaunchingDemo}
      />
    );
  }

  if (appView === 'login' || !session) {
    return (
      <LoginPage
        onAuthenticated={handleAuthenticated}
        onBackToHero={() => setAppView('hero')}
      />
    );
  }

  // Current package based on active branch
  const activePackage: PromptPackage = promptPackages.find((p) => p.branch === currentBranch) || {
    id: `pkg-${currentBranch}`,
    project_id: projectId,
    name: 'clarify-summary',
    branch: currentBranch,
    system_prompt:
      'You are an expert software architect in the Minge Multiplayer Platform. Ground your answers strictly in the provided project memories.',
    user_template: 'Summarize the architectural invariants for: {{module_name}}',
    grounded_memory_ids: memories.slice(0, 3).map((m) => m.id),
    model_config: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      max_tokens: 2048,
    },
    latest_output: 'Verified project memory isolation and fail-closed query enforcement.',
    version: 1,
  };

  const basePackage: PromptPackage | undefined = promptPackages.find((p) => p.branch === 'main');

  // Handlers
  const handleSavePackage = (updated: PromptPackage) => {
    setPromptPackages((prev) => {
      const exists = prev.some((p) => p.branch === updated.branch);
      return exists
        ? prev.map((p) => (p.branch === updated.branch ? updated : p))
        : [...prev, updated];
    });
    void defaultApiClient.savePromptPackage(projectId, updated).catch(() => {
      // Local state already updated
    });
  };

  const handleMainWorkMerged = (merged: MergedMainWorkRecord) => {
    const asPromptPkg: PromptPackage = {
      id: merged.id,
      project_id: merged.projectId,
      name: merged.name,
      branch: 'main',
      system_prompt: merged.system_prompt,
      user_template: merged.user_template,
      grounded_memory_ids: [],
      model_config: {
        model:
          typeof merged.model_config['model'] === 'string'
            ? merged.model_config['model']
            : 'gemini-2.5-flash',
        temperature:
          typeof merged.model_config['temperature'] === 'number'
            ? merged.model_config['temperature']
            : 0.5,
        max_tokens:
          typeof merged.model_config['max_tokens'] === 'number'
            ? merged.model_config['max_tokens']
            : 2048,
      },
      latest_output: merged.latest_output,
      version: merged.version,
      created_at: merged.created_at,
    };

    setPromptPackages((prev) => {
      const hasMain = prev.some((p) => p.branch === 'main');
      return hasMain
        ? prev.map((p) => (p.branch === 'main' ? asPromptPkg : p))
        : [asPromptPkg, ...prev];
    });
  };

  const handleRaiseTicketFromIde = (pkg: PromptPackage) => {
    setTicketPrefill({
      title: `Merge ${pkg.name} (${pkg.branch}) into Main Work`,
      description: `Proposed prompt update from Prompt IDE branch "${pkg.branch}" (v${pkg.version}).`,
      category: 'prompt_change',
      sourceBranch: pkg.branch,
      workPayload: {
        name: pkg.name,
        system_prompt: pkg.system_prompt,
        user_template: pkg.user_template,
        model_config: pkg.model_config,
        latest_output: pkg.latest_output,
      },
    });
    setSurface('crm');
  };

  const handleRaiseTicketFromCanvas = (node: CanvasNodeData) => {
    setTicketPrefill({
      title: `Promote Canvas Node "${node.title}" to Main Work`,
      description: `Submitted from AI Canvas spatial workspace by ${activeUser.name}.`,
      category: 'canvas_work',
      sourceBranch: 'exp/canvas-draft',
      workPayload: {
        name: node.title.toLowerCase().replace(/\s+/g, '-'),
        system_prompt: node.content,
        user_template: '',
        model_config: {
          model: node.model || 'gemini-2.5-flash',
          temperature: node.temperature ?? 0.7,
          max_tokens: 2048,
        },
        node_title: node.title,
      },
    });
    setSurface('crm');
  };

  const handleBranchToIdeFromCanvas = (node: CanvasNodeData) => {
    const newBranchName = `exp/canvas-${Date.now().toString().slice(-4)}`;
    const newPkg: PromptPackage = {
      id: `pkg-${Date.now()}`,
      project_id: projectId,
      name: node.title.toLowerCase().replace(/\s+/g, '-'),
      branch: newBranchName,
      system_prompt: 'Grounded prompt derived from AI Canvas exploration.',
      user_template: node.content,
      grounded_memory_ids: memories.slice(0, 2).map((m) => m.id),
      model_config: {
        model: node.model || 'gemini-2.5-flash',
        temperature: node.temperature ?? 0.7,
        max_tokens: 2048,
      },
      latest_output: node.content,
      version: 1,
    };

    setPromptPackages((prev) => [...prev, newPkg]);
    setCurrentBranch(newBranchName);
    setSurface('ide');
  };

  const handlePinMemory = async (content: string, type: MemoryItem['type'] = 'decision') => {
    const newMem: MemoryItem = {
      id: `mem_pinned_${Date.now()}`,
      project_id: projectId,
      type,
      content,
      metadata: { author: activeUser.name, source: 'Workspace Ingest' },
      version: 1,
      superseded_by_id: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    setMemories((prev) => [newMem, ...prev]);
    try {
      await defaultApiClient.ingestMemory(projectId, type, content, { author: activeUser.name });
    } catch {
      // Local state already updated
    }
  };

  const handleRestoreMemory = async (memoryId: string) => {
    try {
      await defaultApiClient.restoreMemory(projectId, memoryId);
    } catch {
      // Allow local recovery state update if backend is offline
    }
    const restored = softDeletedMemories.find((m) => m.id === memoryId);
    if (restored) {
      setSoftDeletedMemories((prev) => prev.filter((m) => m.id !== memoryId));
      setMemories((prev) => [{ ...restored, deleted_at: null }, ...prev]);
    }
  };

  const pendingTicketCount = crmTickets.filter(
    (t) => t.status === 'open' || t.status === 'in_review'
  ).length;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Global Adobe Clean Utility Navigation Bar (56px, #000000) */}
      <header
        style={{
          height: 56,
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-tertiary)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
          borderBottom: '1px solid var(--color-primary-90)',
          zIndex: 80,
        }}
      >
        {/* Left: Adobe Red Brand Mark + Horizontal Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, height: '100%' }}>
          <button
            onClick={() => setAppView('hero')}
            title="View Minge Hero Overview"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-secondary)',
                color: 'var(--color-tertiary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '-0.04em',
              }}
            >
              M
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '-0.03em',
                color: 'var(--color-tertiary)',
              }}
            >
              Minge
            </span>
          </button>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 18, height: '100%' }}>
            <button
              onClick={() => setSurface('crm')}
              className={`adobe-nav-link ${surface === 'crm' ? 'active' : ''}`}
            >
              <Ticket size={15} />
              <span>Team & Tickets</span>
              {pendingTicketCount > 0 && (
                <span
                  style={{
                    backgroundColor: 'var(--color-secondary)',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-full)',
                    padding: '0 7px',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: '18px',
                  }}
                >
                  {pendingTicketCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setSurface('ide')}
              className={`adobe-nav-link ${surface === 'ide' ? 'active' : ''}`}
            >
              <Code2 size={15} />
              <span>Prompt IDE</span>
            </button>
            <button
              onClick={() => setSurface('canvas')}
              className={`adobe-nav-link ${surface === 'canvas' ? 'active' : ''}`}
            >
              <LayoutGrid size={15} />
              <span>AI Canvas</span>
            </button>
          </nav>
        </div>

        {/* Center: Scoped Project & Branch Context Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-90)',
            border: '1px solid #333333',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-tertiary)',
          }}
        >
          <span style={{ color: 'var(--color-primary-40)' }}>{DEFAULT_PROJECT_SLUG}</span>
          <span style={{ color: '#4D4D4D' }}>•</span>
          <span>⎇ {currentBranch}</span>
        </div>

        {/* Right: Role Switcher + Recovery Vault + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={
                activeUser.role === 'manager'
                  ? 'adobe-chip-red'
                  : activeUser.role === 'admin'
                  ? 'adobe-chip-dark'
                  : 'adobe-chip'
              }
              style={{
                fontSize: 10,
                padding: '3px 9px',
                border: activeUser.role === 'admin' ? '1px solid #FFFFFF' : undefined,
              }}
            >
              <ShieldCheck size={11} />
              <span>{activeUser.role.toUpperCase()}</span>
            </span>

            <select
              aria-label="Switch active organization account"
              value={activeUser.email}
              onChange={(e) => void handleSwitchIdentityByEmail(e.target.value)}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-90)',
                color: '#FFFFFF',
                border: '1px solid #333333',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {!orgDirectory.some((u) => u.email === activeUser.email) && (
                <option value={activeUser.email}>
                  {activeUser.name} ({activeUser.role})
                </option>
              )}
              {orgDirectory.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsRecoveryOpen(true)}
            className="adobe-btn-secondary"
            style={{ height: 34, padding: '0 12px', fontSize: 12.5 }}
          >
            <ArchiveRestore size={14} />
            <span>Vault</span>
            {softDeletedMemories.length > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--color-secondary)',
                  color: 'var(--color-tertiary)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {softDeletedMemories.length}
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            title="Sign out to Hero / Login"
            className="adobe-btn-primary"
            style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Surface */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {surface === 'crm' ? (
          <CrmWorkspace
            projectId={projectId}
            currentUser={activeUser}
            members={crmMembers}
            tickets={crmTickets}
            mainWork={crmMainWork}
            onRefresh={refreshCrmData}
            onMainWorkMerged={handleMainWorkMerged}
            onOpenMainInIde={() => {
              setCurrentBranch('main');
              setSurface('ide');
            }}
            prefillTicket={ticketPrefill}
            onConsumePrefill={() => setTicketPrefill(null)}
          />
        ) : surface === 'canvas' ? (
          <SpatialCanvas
            nodes={nodes}
            edges={edges}
            peers={peers}
            onUpdateNodePosition={updateNodePosition}
            onUpdateNodeData={updateNodeData}
            onAddNode={addNode}
            onDeleteNode={deleteNode}
            onAddEdge={addEdge}
            onBroadcastCursor={broadcastCursor}
            onSwitchToIde={() => setSurface('ide')}
            onBranchToIde={handleBranchToIdeFromCanvas}
            onRaiseTicket={handleRaiseTicketFromCanvas}
            onPinMemory={handlePinMemory}
            projectId={projectId}
            currentUser={{ id: activeUser.id, name: activeUser.name, color: activeUser.color }}
            onSwitchUser={(u) => {
              const found = orgDirectory.find((d) => d.id === u.id);
              if (found) void handleSwitchIdentityByEmail(found.email);
            }}
          />
        ) : (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            <ActivityBar
              activeTab={activeActivityTab}
              onSelectTab={setActiveActivityTab}
              onToggleCanvas={() => setSurface('canvas')}
              isCanvasMode={false}
              user={{ name: activeUser.name, color: activeUser.color }}
            />

            <ActivitySidebar
              activeTab={activeActivityTab}
              currentBranch={currentBranch}
              onSelectBranch={setCurrentBranch}
              activePrs={activePrs}
              onSelectPr={(pr) => {
                setCurrentBranch(pr.sourceBranch);
                setIsDiffMode(true);
              }}
              onNewBranch={() => {
                const raw = prompt('Enter new branch name (e.g. exp/new-eval):');
                const branchName = raw?.trim();
                if (!branchName) return;
                setPromptPackages((prev) => {
                  if (prev.some((p) => p.branch === branchName)) return prev;
                  return [
                    ...prev,
                    {
                      ...activePackage,
                      id: `pkg-${Date.now()}`,
                      branch: branchName,
                      version: 1,
                      created_at: new Date().toISOString(),
                    },
                  ];
                });
                setCurrentBranch(branchName);
              }}
              memories={memories}
              onSelectMemory={(m) => {
                alert(
                  `Grounded Memory [${m.id}]:\n\n"${m.content}"\n\nLineage: Version ${m.version}, Tenant: ${m.project_id}`
                );
              }}
              onAddMemory={(content, type) => {
                void handlePinMemory(content, type);
              }}
              promptPackages={promptPackages}
              activePackage={activePackage}
              onSelectPackage={(pkg) => {
                setCurrentBranch(pkg.branch);
              }}
              onOpenRecovery={() => setIsRecoveryOpen(true)}
            />

            <PromptEditor
              currentPackage={activePackage}
              basePackage={basePackage}
              onSavePackage={handleSavePackage}
              onRaiseTicket={handleRaiseTicketFromIde}
              isDiffMode={isDiffMode}
              onToggleDiffMode={() => setIsDiffMode(!isDiffMode)}
            />

            <AgentChatPanel
              currentPackage={activePackage}
              memories={memories}
              currentBranch={currentBranch}
              projectId={projectId}
              currentUser={{ id: activeUser.id, name: activeUser.name, color: activeUser.color }}
              onUpdatePackage={(updated) => {
                handleSavePackage({
                  ...activePackage,
                  ...updated,
                  version: activePackage.version + 1,
                });
              }}
              onSelectMemory={(m: MemoryItem) => {
                alert(
                  `Inspecting Memory [${m.id}]:\n\n"${m.content}"\n\nLineage: Version ${m.version}, Superseded: ${m.superseded_by_id || 'None (Active)'}`
                );
              }}
              onCreatePr={(pr: Partial<PromptPullRequest>) => {
                const newPr: PromptPullRequest = {
                  id: `pr-${Date.now().toString().slice(-2)}`,
                  projectId,
                  title: pr.title || `Promote ${currentBranch}`,
                  sourceBranch: currentBranch,
                  targetBranch: 'main',
                  author: activeUser.name,
                  status: pr.status || 'in_review',
                  benchmarkDelta: pr.benchmarkDelta || {
                    accuracy: '+4.2%',
                    costDelta: '-$0.003/1k',
                    latencyDelta: '-120ms',
                  },
                  createdAt: new Date().toISOString(),
                };
                setActivePrs((prev) => [newPr, ...prev]);
              }}
            />
          </div>
        )}
      </div>

      {/* Persistent Status Bar (Bottom 28px) */}
      <StatusBar
        currentBranch={currentBranch}
        isCrdtConnected={isConnected}
        activeProvider="Gemini 2.5 Flash / Groq"
        memoryCount={memories.length}
        softDeletedCount={softDeletedMemories.length}
        onOpenRecovery={() => setIsRecoveryOpen(true)}
      />

      {/* 30-Day Recovery Vault Modal */}
      <RecoveryDrawer
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        softDeletedMemories={softDeletedMemories}
        onRestoreMemory={handleRestoreMemory}
      />
    </div>
  );
}
