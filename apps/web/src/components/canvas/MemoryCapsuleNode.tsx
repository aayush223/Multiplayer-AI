import React from 'react';
import { Database, Trash2, GripVertical, GitFork } from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface MemoryCapsuleNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  isSelected?: boolean;
}

export const MemoryCapsuleNode: React.FC<MemoryCapsuleNodeProps> = ({
  node,
  onUpdate: _onUpdate,
  onDelete,
  isSelected,
}) => {
  return (
    <div
      className="adobe-card"
      style={{
        width: 340,
        padding: 16,
        background: 'var(--color-surface)',
        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-neutral)',
        borderTop: '3px solid var(--color-primary-90)',
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
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-primary)',
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
          <Database size={15} color="var(--color-primary)" />
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--color-on-surface)' }}>
            {node.title || 'Memory Capsule'}
          </span>
        </div>
        <button
          onClick={onDelete}
          title="Soft Delete Memory (30-Day Recovery)"
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
          <Trash2 size={13} />
        </button>
      </div>

      {/* Memory Snippet */}
      <div
        style={{
          backgroundColor: 'var(--color-surface-10)',
          border: '1px solid var(--color-neutral)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.55,
          color: 'var(--color-on-surface)',
          marginBottom: 12,
        }}
      >
        {node.content}
      </div>

      {/* Footer / Lineage */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-primary-70)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
          <GitFork size={12} color="var(--color-primary)" />
          <span>Lineage: Append-only</span>
        </div>
        <span className="adobe-chip-dark" style={{ fontSize: 10, padding: '2px 8px' }}>
          Cosine Sim: 0.94
        </span>
      </div>
    </div>
  );
};
