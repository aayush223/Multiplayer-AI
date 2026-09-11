import React from 'react';
import {
  Sparkles,
  GitBranch,
  Database,
  RotateCcw,
  Copy,
  Check,
  Zap,
  Clock,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface AIOutputNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  onBranchToIde: (node: CanvasNodeData) => void;
  onPinAsMemory: (node: CanvasNodeData) => void;
  isSelected?: boolean;
}

export const AIOutputNode: React.FC<AIOutputNodeProps> = ({
  node,
  onUpdate,
  onDelete,
  onBranchToIde,
  onPinAsMemory,
  isSelected,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(node.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePin = () => {
    onPinAsMemory(node);
    setPinned(true);
    setTimeout(() => setPinned(false), 2500);
  };

  return (
    <div
      className="glass-panel"
      style={{
        width: 400,
        padding: 16,
        backgroundColor: '#ffffff',
        border: isSelected ? '2px solid var(--neon-purple)' : '1px solid var(--border-subtle)',
        boxShadow: isSelected ? '0 2px 8px rgba(124, 58, 237, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Left Port Indicator (Input from PromptNode) */}
      <div
        style={{
          position: 'absolute',
          left: -7,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: 'var(--neon-purple)',
          border: '2px solid #ffffff',
        }}
      />

      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'grab',
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripVertical size={14} color="var(--text-muted)" />
          <Sparkles size={16} color="var(--neon-purple)" />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            {node.title || 'AI Generated Output'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleCopy}
            title="Copy Output"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            {copied ? <Check size={14} color="var(--neon-emerald)" /> : <Copy size={14} />}
          </button>
          <button
            onClick={onDelete}
            title="Delete Node"
            style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Output Content */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '12px 14px',
          maxHeight: 220,
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}
      >
        {node.content || (node.status === 'running' ? 'Synthesizing output with grounded memories...' : 'No output yet.')}
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Zap size={11} color="var(--neon-cyan)" /> {node.tokens || 340} tokens
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={11} color="var(--neon-purple)" /> {node.latency || '0.82s'}
          </span>
        </div>
        <span className="badge-neon-emerald" style={{ fontSize: 9 }}>
          Audited
        </span>
      </div>

      {/* Dual Primitive Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onBranchToIde(node)}
          className="btn-cyber-glass"
          style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
          title="Convert this prompt & output into a versioned IDE branch"
        >
          <GitBranch size={12} color="var(--neon-cyan)" />
          <span>Branch to IDE</span>
        </button>

        <button
          onClick={handlePin}
          className="btn-cyber-glass"
          style={{
            flex: 1,
            fontSize: 11,
            padding: '6px 8px',
            borderColor: pinned ? 'var(--neon-emerald)' : undefined,
            color: pinned ? 'var(--neon-emerald)' : undefined,
          }}
          title="Elevate this output to permanent project memory"
        >
          <Database size={12} color={pinned ? 'var(--neon-emerald)' : 'var(--neon-amber)'} />
          <span>{pinned ? 'Memory Ingested' : 'Pin as Memory'}</span>
        </button>
      </div>
    </div>
  );
};
