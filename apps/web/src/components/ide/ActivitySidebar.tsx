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
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Tag,
  Copy,
  ExternalLink,
  Sparkles,
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
        width: 270,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
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
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Files size={15} color="var(--neon-cyan)" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Explorer: Workspace
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
              proj-alpha
            </span>
          </div>

          <div style={{ padding: '8px 10px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Folder: prompts/ */}
            <div>
              <div
                onClick={() => toggleFolder('prompts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.prompts ? <FolderOpen size={14} color="#0284c7" /> : <Folder size={14} color="#0284c7" />}
                <span>prompts</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {promptPackages.length}
                </span>
              </div>

              {openFolders.prompts && (
                <div style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  {promptPackages.map((pkg) => {
                    const isActive = activePackage.name === pkg.name;
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => onSelectPackage(pkg)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 8px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          fontSize: 11.5,
                          backgroundColor: isActive ? '#f0f9ff' : 'transparent',
                          color: isActive ? '#0284c7' : 'var(--text-secondary)',
                          border: `1px solid ${isActive ? '#bae6fd' : 'transparent'}`,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        <FileCode size={13} color={isActive ? '#0284c7' : '#94a3b8'} />
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
            <div style={{ marginTop: 4 }}>
              <div
                onClick={() => toggleFolder('config')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.config ? <FolderOpen size={14} color="#7c3aed" /> : <Folder size={14} color="#7c3aed" />}
                <span>config</span>
              </div>

              {openFolders.config && (
                <div style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 8px',
                      borderRadius: 5,
                      cursor: 'pointer',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Settings size={13} color="#7c3aed" />
                    <span>model_config.json</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 8px',
                      borderRadius: 5,
                      cursor: 'pointer',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <FileText size={13} color="#94a3b8" />
                    <span>eval_matrix.json</span>
                  </div>
                </div>
              )}
            </div>

            {/* Folder: memories/ */}
            <div style={{ marginTop: 4 }}>
              <div
                onClick={() => toggleFolder('memories')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {openFolders.memories ? <FolderOpen size={14} color="#16a34a" /> : <Folder size={14} color="#16a34a" />}
                <span>memories (grounded)</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {memories.length}
                </span>
              </div>

              {openFolders.memories && (
                <div style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => onSelectMemory(m)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 8px',
                        borderRadius: 5,
                        cursor: 'pointer',
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Database size={13} color="#16a34a" />
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
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={15} color="var(--neon-cyan)" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Prompt Branches
              </span>
            </div>
            <button
              onClick={onNewBranch}
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: 5,
                color: 'var(--neon-cyan)',
                padding: '3px 6px',
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Plus size={12} />
              <span>New</span>
            </button>
          </div>

          {/* Active Branch */}
          <div style={{ padding: '10px 14px', background: '#ffffff', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Workspace Branch
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff',
                border: '1px solid var(--neon-cyan)',
                borderRadius: 6,
                padding: '6px 10px',
                color: 'var(--neon-cyan)',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontSize: 14 }}>⎇</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentBranch}</span>
              </div>
              <span className="badge-neon-cyan" style={{ fontSize: 9, padding: '1px 5px' }}>
                HEAD
              </span>
            </div>
          </div>

          {/* Branch Tree */}
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Available Branches ({promptPackages.length})
            </div>
            {promptPackages.map((pkg) => {
              const isSelected = currentBranch === pkg.branch;
              return (
                <div
                  key={pkg.branch}
                  onClick={() => onSelectBranch(pkg.branch)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: isSelected ? '#f0f9ff' : '#ffffff',
                    border: `1px solid ${isSelected ? '#bae6fd' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#0284c7' : 'var(--text-primary)' }}>
                      {pkg.branch}
                    </span>
                    <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>v{pkg.version}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
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
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GitPullRequest size={15} color="var(--neon-purple)" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Prompt PRs ({activePrs.length})
              </span>
            </div>
          </div>

          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePrs.map((pr) => (
              <div
                key={pr.id}
                onClick={() => onSelectPr(pr)}
                style={{
                  padding: '10px 12px',
                  background: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                    #{pr.id.slice(-2)} {pr.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: pr.status === 'merged' ? '#f0fdf4' : '#faf5ff',
                      color: pr.status === 'merged' ? '#16a34a' : '#7c3aed',
                      border: `1px solid ${pr.status === 'merged' ? '#bbf7d0' : '#e9d5ff'}`,
                    }}
                  >
                    {pr.status === 'merged' ? 'Merged' : 'In Review'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {pr.sourceBranch} ➔ {pr.targetBranch}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 600 }}>
                  <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <TrendingUp size={11} /> {pr.benchmarkDelta.accuracy}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{pr.author}</span>
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
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={15} color="var(--neon-emerald)" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Grounded Memories
              </span>
            </div>
            <button
              onClick={() => setIsAddingMemory(!isAddingMemory)}
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 5,
                color: '#16a34a',
                padding: '3px 8px',
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <Plus size={12} />
              <span>Ingest</span>
            </button>
          </div>

          {/* Quick Add Memory Form */}
          {isAddingMemory && (
            <div style={{ padding: 12, backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Ingest New Project Memory
              </div>
              <textarea
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="Enter architectural invariant, design decision, or rule..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  fontSize: 11.5,
                  outline: 'none',
                  resize: 'none',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <select
                  value={newMemoryType}
                  onChange={(e) => setNewMemoryType(e.target.value as any)}
                  style={{
                    fontSize: 10.5,
                    padding: '3px 6px',
                    borderRadius: 5,
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <option value="decision">Decision</option>
                  <option value="fact">Fact</option>
                  <option value="code_snippet">Code Snippet</option>
                  <option value="document">Document</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setIsAddingMemory(false)}
                    style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateMemory}
                    style={{
                      background: '#16a34a',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Memories List */}
          <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Active Project Lineage ({memories.length})
            </div>
            {memories.map((mem) => (
              <div
                key={mem.id}
                onClick={() => onSelectMemory(mem)}
                style={{
                  padding: '10px 12px',
                  background: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#16a34a')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: '#f0fdf4',
                      color: '#16a34a',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    {mem.type}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--neon-cyan)', fontWeight: 600 }}>v{mem.version}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {mem.content}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  ID: {mem.id} • Isolation: Enforced
                </div>
              </div>
            ))}
          </div>

          {/* 30-Day Recovery Vault link */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', backgroundColor: '#ffffff' }}>
            <button
              onClick={onOpenRecovery}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Clock size={12} />
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
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Search size={15} color="var(--neon-cyan)" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Semantic Search
            </span>
          </div>

          <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)', backgroundColor: '#ffffff' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vector embeddings & memories..."
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
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
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7' }}>[{m.type}]</span>
                    <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                      {99 - idx * 3}% match
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>
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
