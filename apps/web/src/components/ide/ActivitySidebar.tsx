import React, { useState } from 'react';
import {
  Files,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Settings,
  GitBranch,
  GitPullRequest,
  Database,
  Search,
  Plus,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { PromptPackage, MemoryItem, PromptPullRequest } from '../../services/apiClient';

interface ActivitySidebarProps {
  activeTab: 'explorer' | 'branches' | 'search' | 'prs' | 'memories';
  currentBranch: string;
  onSelectBranch: (branch: string) => void;
  activePrs: PromptPullRequest[];
  onSelectPr: (pr: PromptPullRequest) => void;
  onNewBranch: () => void;
  memories: MemoryItem[];
  onSelectMemory: (mem: MemoryItem) => void;
  onAddMemory: (content: string, type: 'decision' | 'fact' | 'code_snippet' | 'document') => void;
  promptPackages: PromptPackage[];
  activePackage: PromptPackage;
  onSelectPackage: (pkg: PromptPackage) => void;
  onOpenRecovery: () => void;
}

export const ActivitySidebar: React.FC<ActivitySidebarProps> = ({
  activeTab,
  currentBranch,
  onSelectBranch,
  activePrs,
  onSelectPr,
  onNewBranch,
  memories,
  onSelectMemory,
  onAddMemory,
  promptPackages,
  activePackage,
  onSelectPackage,
  onOpenRecovery,
}) => {
  // Explorer state
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    prompts: true,
    config: true,
    memories: false,
  });

  // Memories view state
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryType, setNewMemoryType] = useState<'decision' | 'fact' | 'code_snippet' | 'document'>('decision');
  const [isAddingMemory, setIsAddingMemory] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const toggleFolder = (f: string) => {
    setOpenFolders((prev) => ({ ...prev, [f]: !prev[f] }));
  };

  const handleCreateMemory = () => {
    if (!newMemoryText.trim()) return;
    onAddMemory(newMemoryText.trim(), newMemoryType);
    setNewMemoryText('');
    setIsAddingMemory(false);
  };

  return (
    <aside
      style={{
        width: 280,
        height: '100%',
        backgroundColor: 'var(--color-surface-10)',
        borderRight: '1px solid var(--color-neutral)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      {/* =========================================================================
          TAB 1: FILE EXPLORER
          ========================================================================= */}
      {activeTab === 'explorer' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-neutral)',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Files size={15} color="var(--color-primary)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Workspace Explorer
              </span>
            </div>
            <span className="adobe-chip" style={{ fontSize: 11, padding: '2px 8px' }}>
              proj-alpha
            </span>
          </div>

          <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Folder: prompts/ */}
            <div>
              <div
                onClick={() => toggleFolder('prompts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EFEFEF')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.prompts ? <FolderOpen size={15} color="var(--color-primary)" /> : <Folder size={15} color="var(--color-primary)" />}
                <span>prompts</span>
                <span style={{ fontSize: 11, color: 'var(--color-primary-70)', marginLeft: 'auto' }}>
                  {promptPackages.length}
                </span>
              </div>

              {openFolders.prompts && (
                <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {promptPackages.map((pkg) => {
                    const isActive = activePackage.name === pkg.name && activePackage.branch === pkg.branch;
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => onSelectPackage(pkg)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 10px',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          fontSize: 12,
                          backgroundColor: isActive ? 'var(--color-surface)' : 'transparent',
                          color: isActive ? 'var(--color-primary)' : 'var(--color-primary-70)',
                          border: isActive ? '1.5px solid var(--color-primary)' : '1px solid transparent',
                          fontWeight: isActive ? 700 : 400,
                        }}
                      >
                        <FileCode size={14} color={isActive ? 'var(--color-secondary)' : 'var(--color-primary-40)'} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pkg.name}.prompt.json
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Folder: config/ */}
            <div style={{ marginTop: 6 }}>
              <div
                onClick={() => toggleFolder('config')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EFEFEF')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.config ? <FolderOpen size={15} color="var(--color-primary-70)" /> : <Folder size={15} color="var(--color-primary-70)" />}
                <span>config</span>
              </div>

              {openFolders.config && (
                <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--color-primary-70)',
                    }}
                  >
                    <Settings size={13} color="var(--color-primary-70)" />
                    <span>model_config.json</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--color-primary-70)',
                    }}
                  >
                    <FileText size={13} color="var(--color-primary-40)" />
                    <span>eval_matrix.json</span>
                  </div>
                </div>
              )}
            </div>

            {/* Folder: memories/ */}
            <div style={{ marginTop: 6 }}>
              <div
                onClick={() => toggleFolder('memories')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EFEFEF')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.memories ? <FolderOpen size={15} color="var(--color-primary)" /> : <Folder size={15} color="var(--color-primary)" />}
                <span>memories (grounded)</span>
                <span style={{ fontSize: 11, color: 'var(--color-primary-70)', marginLeft: 'auto' }}>
                  {memories.length}
                </span>
              </div>

              {openFolders.memories && (
                <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => onSelectMemory(m)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--color-primary-70)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Database size={13} color="var(--color-primary)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.id}.md
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: PROMPT BRANCHES & LINEAGE
          ========================================================================= */}
      {activeTab === 'branches' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-neutral)',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={15} color="var(--color-primary)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Prompt Branches
              </span>
            </div>
            <button
              onClick={onNewBranch}
              className="adobe-btn-dark"
              style={{ height: 28, padding: '0 12px', fontSize: 12 }}
            >
              <Plus size={12} />
              <span>New</span>
            </button>
          </div>

          {/* Active Branch */}
          <div style={{ padding: '14px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-neutral)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)', marginBottom: 8 }}>
              Current Workspace Branch
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontSize: 14 }}>⎇</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentBranch}</span>
              </div>
              <span className="adobe-chip-red" style={{ fontSize: 10, padding: '2px 8px' }}>
                HEAD
              </span>
            </div>
          </div>

          {/* Branch Tree */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)' }}>
              Available Branches ({promptPackages.length})
            </div>
            {promptPackages.map((pkg) => {
              const isSelected = currentBranch === pkg.branch;
              return (
                <div
                  key={pkg.branch}
                  onClick={() => onSelectBranch(pkg.branch)}
                  className="adobe-card-interactive"
                  style={{
                    padding: '12px',
                    background: 'var(--color-surface)',
                    border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-neutral)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      {pkg.branch}
                    </span>
                    <span
                      className={isSelected ? 'adobe-chip-dark' : 'adobe-chip'}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                    >
                      v{pkg.version}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                    {pkg.name} • {pkg.model_config.model}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: PROMPT PRS (PPR)
          ========================================================================= */}
      {activeTab === 'prs' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-neutral)',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitPullRequest size={15} color="var(--color-primary)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Prompt PRs ({activePrs.length})
              </span>
            </div>
          </div>

          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activePrs.map((pr) => (
              <div
                key={pr.id}
                onClick={() => onSelectPr(pr)}
                className="adobe-card-interactive"
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: '18px' }}>
                    #{pr.id.slice(-2)} {pr.title}
                  </span>
                  <span
                    className={pr.status === 'merged' ? 'adobe-chip-dark' : 'adobe-chip-red'}
                    style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                  >
                    {pr.status === 'merged' ? 'Merged' : 'In Review'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginBottom: 8 }}>
                  {pr.sourceBranch} ➔ {pr.targetBranch}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <TrendingUp size={12} color="var(--color-secondary)" /> {pr.benchmarkDelta.accuracy}
                  </span>
                  <span style={{ color: 'var(--color-primary-40)', fontWeight: 400 }}>{pr.author}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: GROUNDED MEMORIES EXPLORER
          ========================================================================= */}
      {activeTab === 'memories' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-neutral)',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={15} color="var(--color-primary)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Grounded Memories
              </span>
            </div>
            <button
              onClick={() => setIsAddingMemory(!isAddingMemory)}
              className="adobe-btn-dark"
              style={{ height: 28, padding: '0 12px', fontSize: 12 }}
            >
              <Plus size={12} />
              <span>Ingest</span>
            </button>
          </div>

          {/* Quick Add Memory Form */}
          {isAddingMemory && (
            <div
              style={{
                padding: 16,
                backgroundColor: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-neutral)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Ingest New Project Memory
              </div>
              <textarea
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="Enter architectural invariant, design decision, or rule..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-neutral)',
                  fontSize: 13,
                  color: 'var(--color-on-surface)',
                  backgroundColor: 'var(--color-surface)',
                  outline: 'none',
                  resize: 'none',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <select
                  value={newMemoryType}
                  onChange={(e) => setNewMemoryType(e.target.value as any)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-neutral)',
                    backgroundColor: 'var(--color-surface-10)',
                    color: 'var(--color-on-surface)',
                    outline: 'none',
                  }}
                >
                  <option value="decision">Decision</option>
                  <option value="fact">Fact</option>
                  <option value="code_snippet">Code Snippet</option>
                  <option value="document">Document</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => setIsAddingMemory(false)}
                    className="adobe-btn-link"
                    style={{ fontSize: 12, color: 'var(--color-primary-70)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateMemory}
                    className="adobe-btn-red"
                    style={{ height: 30, padding: '0 14px', fontSize: 12 }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Memories List */}
          <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)' }}>
              Active Project Lineage ({memories.length})
            </div>
            {memories.map((mem) => (
              <div
                key={mem.id}
                onClick={() => onSelectMemory(mem)}
                className="adobe-card-interactive"
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="adobe-chip" style={{ fontSize: 11, padding: '2px 8px', textTransform: 'capitalize' }}>
                    {mem.type.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-secondary)', fontWeight: 700 }}>v{mem.version}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-on-surface)', lineHeight: '18px' }}>
                  {mem.content}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-primary-40)', marginTop: 2 }}>
                  ID: {mem.id} • Isolation: Enforced
                </div>
              </div>
            ))}
          </div>

          {/* 30-Day Recovery Vault link */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-neutral)', backgroundColor: 'var(--color-surface)' }}>
            <button
              onClick={onOpenRecovery}
              className="adobe-btn-outline"
              style={{ width: '100%', height: 36, fontSize: 12 }}
            >
              <Clock size={13} />
              <span>30-Day Recovery Vault</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: SEMANTIC MEMORY SEARCH
          ========================================================================= */}
      {activeTab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-neutral)',
              backgroundColor: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Search size={15} color="var(--color-primary)" />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
              Semantic Search
            </span>
          </div>

          <div style={{ padding: 14, borderBottom: '1px solid var(--color-neutral)', backgroundColor: 'var(--color-surface)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={15}
                color="var(--color-primary-40)"
                style={{ position: 'absolute', left: 14, pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vector embeddings..."
                className="adobe-input"
                style={{ paddingLeft: 38, fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)' }}>
              {searchQuery ? 'Ranked Vector Results' : 'Recent Project Context'}
            </div>

            {memories
              .filter((m) =>
                searchQuery
                  ? m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.type.toLowerCase().includes(searchQuery.toLowerCase())
                  : true
              )
              .map((m, idx) => (
                <div
                  key={m.id}
                  onClick={() => onSelectMemory(m)}
                  className="adobe-card-interactive"
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="adobe-chip" style={{ fontSize: 11, padding: '2px 8px', textTransform: 'capitalize' }}>
                      {m.type.replace('_', ' ')}
                    </span>
                    <span className="adobe-chip-dark" style={{ fontSize: 10, padding: '2px 8px' }}>
                      {99 - idx * 3}% match
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-on-surface)', lineHeight: '18px' }}>
                    {m.content}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
};
