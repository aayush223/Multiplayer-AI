import React from 'react';
import { Database, ShieldCheck, Trash2, GripVertical, GitFork } from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface MemoryCapsuleNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  isSelected?: boolean;
}

export const MemoryCapsuleNode: React.FC<MemoryCapsuleNodeProps> = ({
  node,
  onUpdate,
  onDelete,
  isSelected,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        width: 340,
        padding: 16,
        background: '#ffffff',
        border: isSelected ? '2px solid var(--neon-emerald)' : '1px solid var(--border-subtle)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Left Port (Input from Document) */}
      <div
        style={{
          position: 'absolute',
          left: -7,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: 'var(--neon-emerald)',
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
          <Database size={15} color="var(--neon-emerald)" />
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>
            {node.title || 'Memory Capsule'}
          </span>
        </div>
        <button
          onClick={onDelete}
          title="Soft Delete Memory (30-Day Recovery)"
          style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Memory Snippet */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '10px 12px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.5,
          color: 'var(--text-primary)',
          marginBottom: 10,
        }}
      >
        {node.content}
      </div>

      {/* Footer / Lineage */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GitFork size={12} color="var(--neon-emerald)" />
          <span>Lineage: Append-only</span>
        </div>
        <span className="badge-neon-emerald" style={{ fontSize: 9 }}>
          Cosine Sim: 0.94
        </span>
      </div>
    </div>
  );
};
