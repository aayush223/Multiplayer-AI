import React, { useState, useEffect } from 'react';
import { ActivityBar } from './components/ide/ActivityBar';
import { ActivitySidebar } from './components/ide/ActivitySidebar';
import { PromptBranchExplorer } from './components/ide/PromptBranchExplorer';
import { PromptEditor } from './components/ide/PromptEditor';
import { AgentChatPanel } from './components/ide/AgentChatPanel';
import { StatusBar } from './components/ide/StatusBar';
import { SpatialCanvas } from './components/canvas/SpatialCanvas';
import { RecoveryDrawer } from './components/modals/RecoveryDrawer';
import { useCrdtSync, CanvasNodeData } from './hooks/useCrdtSync';
import {
  defaultApiClient,
  MemoryItem,
  PromptPackage,
  PromptPullRequest,
} from './services/apiClient';

export function App() {
  const [projectId] = useState('proj-alpha-multiplayer');
  const [documentId] = useState('canvas-doc-01');

  // Active User State (Multiplayer simulation)
  const [currentUser, setCurrentUser] = useState({
    id: 'user_alice',
    name: 'Alice (Lead)',
    color: '#00F2FE',
  });

  // Surface view mode: true = AI Canvas (Roobinium), false = Prompt IDE (Antigravity)
  const [isCanvasMode, setIsCanvasMode] = useState(false);

  // IDE State
  const [activeActivityTab, setActiveActivityTab] = useState<'explorer' | 'branches' | 'search' | 'prs' | 'memories'>('branches');
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
      projectId: 'proj-alpha-multiplayer',
      title: 'Ground system prompt with CoT reasoning',
      sourceBranch: 'exp/chain-of-thought',
      targetBranch: 'main',
      author: 'Alice (Lead)',
      status: 'in_review',
      benchmarkDelta: {
        accuracy: '+4.2% (96.6%)',
        costDelta: '-$0.003/1k',
        latencyDelta: '-120ms',
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pr-12',
      projectId: 'proj-alpha-multiplayer',
      title: 'Format output as validated JSON schema',
      sourceBranch: 'feature/structured-json',
      targetBranch: 'main',
      author: 'Bob (ML Eng)',
      status: 'merged',
      benchmarkDelta: {
        accuracy: '+1.8% (94.2%)',
        costDelta: '+$0.001/1k',
        latencyDelta: '+40ms',
      },
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    },
  ]);

  // Yjs CRDT Hook
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
  } = useCrdtSync(projectId, documentId, currentUser);

  // Load memories and prompt packages
  useEffect(() => {
    defaultApiClient.setUserId(currentUser.id);

    async function loadData() {
      const active = await defaultApiClient.getMemories(projectId, false);
      setMemories(active);

      const deleted = await defaultApiClient.getMemories(projectId, true);
      setSoftDeletedMemories(deleted.filter((m) => m.deleted_at !== null));

      const prompts = await defaultApiClient.getPromptPackages(projectId);
      setPromptPackages(prompts);
    }

    loadData();
  }, [projectId, currentUser.id]);

  // Current package based on active branch
  const activePackage: PromptPackage = promptPackages.find((p) => p.branch === currentBranch) || {
    id: `pkg-${currentBranch}`,
    project_id: projectId,
    name: 'clarify-summary',
    branch: currentBranch,
    system_prompt: 'You are an expert software architect in the Minge Multiplayer Platform. Ground your answers strictly in the provided project memories.',
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
    setPromptPackages((prev) => prev.map((p) => (p.branch === updated.branch ? updated : p)));
    defaultApiClient.savePromptPackage(projectId, updated);
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
    setIsCanvasMode(false); // Seamless switch to Prompt IDE!
  };

  const handlePinMemory = async (content: string) => {
    const newMem: MemoryItem = {
      id: `mem_pinned_${Date.now()}`,
      project_id: projectId,
      type: 'decision',
      content,
      metadata: { author: currentUser.name, source: 'AI Canvas Pin' },
      version: 1,
      superseded_by_id: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    setMemories((prev) => [newMem, ...prev]);
    try {
      await defaultApiClient.ingestMemory(projectId, 'decision', content, { author: currentUser.name });
    } catch {
      // Local state already updated
    }
  };

  const handleRestoreMemory = async (memoryId: string) => {
    await defaultApiClient.restoreMemory(projectId, memoryId);
    const restored = softDeletedMemories.find((m) => m.id === memoryId);
    if (restored) {
      setSoftDeletedMemories((prev) => prev.filter((m) => m.id !== memoryId));
      setMemories((prev) => [{ ...restored, deleted_at: null }, ...prev]);
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Main Workspace Surface */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {isCanvasMode ? (
          /* ==========================================================
             SURFACE 2: AI Canvas (Roobinium Cyberpunk Spatial Board)
             ========================================================== */
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
            onSwitchToIde={() => setIsCanvasMode(false)}
            onBranchToIde={handleBranchToIdeFromCanvas}
            onPinMemory={handlePinMemory}
            projectId={projectId}
            currentUser={currentUser}
            onSwitchUser={setCurrentUser}
          />
        ) : (
          /* ==========================================================
             SURFACE 1: Prompt IDE (Antigravity Shell + Prompt Branching)
             ========================================================== */
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* 1. Activity Bar (Far Left - 50px) */}
            <ActivityBar
              activeTab={activeActivityTab}
              onSelectTab={setActiveActivityTab}
              onToggleCanvas={() => setIsCanvasMode(true)}
              isCanvasMode={false}
              user={currentUser}
            />

            {/* 2. Side Panel: Activity Sidebar (Switches on clicking Activity Bar tabs) */}
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
                const b = prompt('Enter new branch name (e.g. exp/new-eval):');
                if (b) setCurrentBranch(b);
              }}
              memories={memories}
              onSelectMemory={(m) => {
                alert(`Grounded Memory [${m.id}]:\n\n"${m.content}"\n\nLineage: Version ${m.version}, Tenant: ${m.project_id}`);
              }}
              onAddMemory={(content) => {
                handlePinMemory(content);
              }}
              promptPackages={promptPackages}
              activePackage={activePackage}
              onSelectPackage={(pkg) => {
                setCurrentBranch(pkg.branch);
              }}
              onOpenRecovery={() => setIsRecoveryOpen(true)}
            />

            {/* 3. Central Prompt Editor with Side-by-Side Diff */}
            <PromptEditor
              currentPackage={activePackage}
              basePackage={basePackage}
              onSavePackage={handleSavePackage}
              isDiffMode={isDiffMode}
              onToggleDiffMode={() => setIsDiffMode(!isDiffMode)}
            />

            {/* 4. Dedicated Antigravity Agent Chat Sidebar (Right - 360px) */}
            <AgentChatPanel
              currentPackage={activePackage}
              memories={memories}
              currentBranch={currentBranch}
              projectId={projectId}
              currentUser={currentUser}
              onUpdatePackage={(updated) => {
                handleSavePackage({
                  ...activePackage,
                  ...updated,
                  version: activePackage.version + 1,
                });
              }}
              onSelectMemory={(m: MemoryItem) => {
                alert(`Inspecting Memory [${m.id}]:\n\n"${m.content}"\n\nLineage: Version ${m.version}, Superseded: ${m.superseded_by_id || 'None (Active)'}`);
              }}
              onCreatePr={(pr: Partial<PromptPullRequest>) => {
                const newPr: PromptPullRequest = {
                  id: `pr-${Date.now().toString().slice(-2)}`,
                  projectId,
                  title: pr.title || `Promote ${currentBranch}`,
                  sourceBranch: currentBranch,
                  targetBranch: 'main',
                  author: currentUser.name,
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

      {/* Persistent Status Bar (Bottom 24px) */}
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
