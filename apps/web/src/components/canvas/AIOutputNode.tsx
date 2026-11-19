import React from 'react';
import {
  Sparkles,
  GitBranch,
  Database,
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
  onUpdate: _onUpdate,
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
      className="adobe-card"
      style={{
        width: 400,
        padding: 16,
        backgroundColor: 'var(--color-surface)',
        border: isSelected ? '2px solid var(--color-secondary)' : '1px solid var(--color-neutral)',
        borderTop: '3px solid var(--color-secondary)',
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
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-secondary)',
          border: '2px solid var(--color-surface)',
        }}
      />

      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: '1px solid var(--color-neutral)',
          cursor: 'grab',
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripVertical size={14} color="var(--color-primary-40)" />
          <Sparkles size={15} color="var(--color-secondary)" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-on-surface)' }}>
            {node.title || 'AI Generated Output'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={handleCopy}
            title="Copy Output"
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-primary-70)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {copied ? <Check size={14} color="var(--color-primary)" /> : <Copy size={14} />}
          </button>
          <button
            onClick={onDelete}
            title="Delete Node"
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Output Content */}
      <div
        style={{
          backgroundColor: 'var(--color-surface-10)',
          border: '1px solid var(--color-neutral)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          maxHeight: 220,
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.6,
          color: 'var(--color-on-surface)',
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
          fontSize: 12,
          color: 'var(--color-primary-70)',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Zap size={12} color="var(--color-secondary)" /> {node.tokens || 340} tokens
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Clock size={12} color="var(--color-primary-70)" /> {node.latency || '0.82s'}
          </span>
        </div>
        <span className="adobe-chip" style={{ fontSize: 11, padding: '2px 10px' }}>
          Audited
        </span>
      </div>

      {/* Dual Primitive Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onBranchToIde(node)}
          className="adobe-btn-dark"
          style={{ flex: 1, height: 34, fontSize: 12, padding: '0 12px' }}
          title="Convert this prompt & output into a versioned IDE branch"
        >
          <GitBranch size={13} />
          <span>Branch to IDE</span>
        </button>

        <button
          onClick={handlePin}
          className={pinned ? 'adobe-btn-red' : 'adobe-btn-outline'}
          style={{ flex: 1, height: 34, fontSize: 12, padding: '0 12px' }}
          title="Elevate this output to permanent project memory"
        >
          <Database size={13} />
          <span>{pinned ? 'Memory Ingested' : 'Pin as Memory'}</span>
        </button>
      </div>
    </div>
  );
};
