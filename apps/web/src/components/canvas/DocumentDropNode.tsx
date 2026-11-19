import React, { useState, useEffect } from 'react';
import { FileUp, CheckCircle2, Trash2, GripVertical, FileText } from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface DocumentDropNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  onIngest: (content: string) => void;
  isSelected?: boolean;
}

export const DocumentDropNode: React.FC<DocumentDropNodeProps> = ({
  node,
  onUpdate,
  onDelete,
  onIngest,
  isSelected,
}) => {
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingested, setIngested] = useState(node.status === 'completed');

  useEffect(() => {
    setIngested(node.status === 'completed');
  }, [node.status]);

  const handleDropSimulation = () => {
    setIsIngesting(true);
    setTimeout(() => {
      setIsIngesting(false);
      setIngested(true);
      onIngest(node.content || 'Extracted document context for multiplayer project grounding.');
      onUpdate({ status: 'completed' });
    }, 900);
  };

  return (
    <div
      className="adobe-card"
      style={{
        width: 350,
        padding: 16,
        backgroundColor: 'var(--color-surface)',
        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-neutral)',
        borderTop: '3px solid var(--color-primary-70)',
      }}
    >
      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: '1px solid var(--color-neutral)',
          cursor: 'grab',
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripVertical size={14} color="var(--color-primary-40)" />
          <FileText size={15} color="var(--color-primary)" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-on-surface)',
              fontWeight: 700,
              fontSize: 14,
              outline: 'none',
              width: 190,
            }}
          />
        </div>
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

      {/* Drag & Drop Target Area */}
      <div
        onClick={handleDropSimulation}
        style={{
          border: `1.5px dashed ${ingested ? 'var(--color-primary)' : 'var(--color-primary-40)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '18px 14px',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface-10)',
          cursor: 'pointer',
          marginBottom: 12,
          transition: 'border-color 0.15s ease',
        }}
      >
        <FileUp size={24} color="var(--color-primary)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
          {ingested ? 'Document Ingested to pgvector' : 'Drop Reference File or Click to Ingest'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-primary-70)', marginTop: 4 }}>
          {ingested ? '12 chunks embedded • 1536-dim vectors' : 'PDF, Markdown, JSON, Code (Max 25MB)'}
        </div>
      </div>

      {/* Footer / Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={ingested ? 'adobe-chip-dark' : 'adobe-chip'} style={{ fontSize: 11, padding: '3px 10px' }}>
          {isIngesting ? 'Chunking & Embedding...' : ingested ? 'Grounded in Memory' : 'Ready'}
        </span>

        {ingested && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--color-on-surface)' }}>
            <CheckCircle2 size={13} color="var(--color-secondary)" /> Synced
          </span>
        )}
      </div>

      {/* Right Port (Output to Memory Capsule) */}
      <div
        style={{
          position: 'absolute',
          right: -7,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-primary-70)',
          border: '2px solid var(--color-surface)',
        }}
      />
    </div>
  );
};
