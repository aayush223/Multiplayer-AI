import React, { useState } from 'react';
import {
  GitBranch,
  GitPullRequest,
  GitCommit,
  TrendingUp,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PromptPullRequest } from '../../services/apiClient';

interface PromptBranchExplorerProps {
  currentBranch: string;
  onSelectBranch: (branch: string) => void;
  onSelectPr: (pr: PromptPullRequest) => void;
  onNewBranch: () => void;
  activePrs: PromptPullRequest[];
  memoryCount: number;
}

export const PromptBranchExplorer: React.FC<PromptBranchExplorerProps> = ({
  currentBranch,
  onSelectBranch,
  onSelectPr,
  onNewBranch,
  activePrs,
  memoryCount,
}) => {
  const [isPrSectionOpen, setIsPrSectionOpen] = useState(true);
  const [isTreeSectionOpen, setIsTreeSectionOpen] = useState(true);

  const branches = [
    { name: 'main', commit: 'e7a1b2', author: 'Alex (Lead)', accuracy: '92.4%', status: 'production' },
    { name: 'exp/chain-of-thought', commit: 'c4f81a', author: 'Alice (Dev)', accuracy: '+4.2% (96.6%)', costDelta: '-$0.003/1k', status: 'active' },
    { name: 'feature/structured-json', commit: '8b3d09', author: 'Bob (ML)', accuracy: '+1.8% (94.2%)', costDelta: '+$0.001/1k', status: 'testing' },
  ];

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={15} color="var(--neon-cyan)" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Prompt Branches
          </span>
        </div>
        <button
          onClick={onNewBranch}
          title="Create New Prompt Branch"
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

      {/* Active Branch Capsule */}
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

      {/* Section 1: Prompt Pull Requests (PPR) */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          onClick={() => setIsPrSectionOpen(!isPrSectionOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPrSectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <GitPullRequest size={13} color="var(--neon-purple)" />
            <span>Prompt PRs ({activePrs.length})</span>
          </div>
        </div>

        {isPrSectionOpen && (
          <div style={{ padding: '0 10px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activePrs.map((pr) => (
              <div
                key={pr.id}
                onClick={() => onSelectPr(pr)}
                style={{
                  padding: '8px 10px',
                  background: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--neon-purple)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    #{pr.id.slice(-2)} {pr.title}
                  </span>
                  <span
                    className={pr.status === 'merged' ? 'badge-neon-emerald' : 'badge-neon-purple'}
                    style={{ fontSize: 9, padding: '1px 5px' }}
                  >
                    {pr.status === 'merged' ? 'Merged' : 'In Review'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{pr.sourceBranch}</span>
                  <span>➔</span>
                  <span>{pr.targetBranch}</span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: 'var(--neon-emerald)',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <TrendingUp size={11} /> {pr.benchmarkDelta.accuracy}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{pr.author}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Branch Commit Tree */}
      <div style={{ flex: 1 }}>
        <div
          onClick={() => setIsTreeSectionOpen(!isTreeSectionOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isTreeSectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <GitCommit size={13} color="var(--neon-cyan)" />
            <span>Branch Lineage</span>
          </div>
        </div>

        {isTreeSectionOpen && (
          <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {branches.map((b) => {
              const isSelected = currentBranch === b.name;
              return (
                <div
                  key={b.name}
                  onClick={() => onSelectBranch(b.name)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: isSelected ? '#f0f9ff' : 'transparent',
                    border: `1px solid ${isSelected ? '#bae6fd' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isSelected ? 'var(--neon-cyan)' : 'var(--text-muted)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? 'var(--neon-cyan)' : 'var(--text-primary)',
                        }}
                      >
                        {b.name}
                      </span>
                    </div>
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {b.commit}
                    </span>
                  </div>
                  <div
                    style={{
                      paddingLeft: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>{b.author}</span>
                    <span style={{ color: b.accuracy.startsWith('+') ? 'var(--neon-emerald)' : 'var(--text-secondary)' }}>
                      {b.accuracy}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grounded Memory Context Footer */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
          <ShieldCheck size={14} color="var(--neon-emerald)" />
          <span>Grounded Memories</span>
        </div>
        <span className="badge-neon-emerald" style={{ fontSize: 10, padding: '1px 6px' }}>
          {memoryCount} Active
        </span>
      </div>
    </aside>
  );
};
