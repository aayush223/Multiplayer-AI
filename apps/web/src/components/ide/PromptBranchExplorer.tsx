import React, { useState } from 'react';
import {
  GitBranch,
  GitPullRequest,
  GitCommit,
  TrendingUp,
  Plus,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
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
          <GitBranch size={15} color="var(--color-primary)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Prompt Branches
          </span>
        </div>
        <button
          onClick={onNewBranch}
          title="Create New Prompt Branch"
          className="adobe-btn-dark"
          style={{ height: 28, padding: '0 12px', fontSize: 12 }}
        >
          <Plus size={12} />
          <span>New</span>
        </button>
      </div>

      {/* Active Branch Capsule */}
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

      {/* Section 1: Prompt Pull Requests (PPR) */}
      <div style={{ borderBottom: '1px solid var(--color-neutral)' }}>
        <div
          onClick={() => setIsPrSectionOpen(!isPrSectionOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPrSectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <GitPullRequest size={13} color="var(--color-secondary)" />
            <span>Prompt PRs ({activePrs.length})</span>
          </div>
        </div>

        {isPrSectionOpen && (
          <div style={{ padding: '0 14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePrs.map((pr) => (
              <div
                key={pr.id}
                onClick={() => onSelectPr(pr)}
                className="adobe-card-interactive"
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                    #{pr.id.slice(-2)} {pr.title}
                  </span>
                  <span
                    className={pr.status === 'merged' ? 'adobe-chip-dark' : 'adobe-chip-red'}
                    style={{ fontSize: 10, padding: '2px 8px' }}
                  >
                    {pr.status === 'merged' ? 'Merged' : 'In Review'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-primary-70)', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    fontSize: 11,
                    color: 'var(--color-primary)',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <TrendingUp size={11} color="var(--color-secondary)" /> {pr.benchmarkDelta.accuracy}
                  </span>
                  <span style={{ color: 'var(--color-primary-40)', fontWeight: 400 }}>{pr.author}</span>
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
            padding: '10px 16px',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isTreeSectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <GitCommit size={13} color="var(--color-primary)" />
            <span>Branch Lineage</span>
          </div>
        </div>

        {isTreeSectionOpen && (
          <div style={{ padding: '0 14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {branches.map((b) => {
              const isSelected = currentBranch === b.name;
              return (
                <div
                  key={b.name}
                  onClick={() => onSelectBranch(b.name)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'var(--color-surface)' : 'transparent',
                    border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: isSelected ? 'var(--color-secondary)' : 'var(--color-primary-40)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'var(--color-on-surface)',
                        }}
                      >
                        {b.name}
                      </span>
                    </div>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-primary-70)' }}>
                      {b.commit}
                    </span>
                  </div>
                  <div
                    style={{
                      paddingLeft: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--color-primary-70)',
                    }}
                  >
                    <span>{b.author}</span>
                    <span style={{ color: b.accuracy.startsWith('+') ? 'var(--color-secondary)' : 'var(--color-primary-70)', fontWeight: 700 }}>
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
          padding: '12px 16px',
          borderTop: '1px solid var(--color-neutral)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-on-surface)', fontWeight: 700 }}>
          <ShieldCheck size={14} color="var(--color-secondary)" />
          <span>Grounded Memories</span>
        </div>
        <span className="adobe-chip-dark" style={{ fontSize: 11, padding: '2px 8px' }}>
          {memoryCount} Active
        </span>
      </div>
    </aside>
  );
};
