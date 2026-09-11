import React, { useState } from 'react';
import { FileUp, Database, CheckCircle2, Trash2, GripVertical, FileText } from 'lucide-react';
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
      className="glass-panel"
      style={{
        width: 350,
        padding: 16,
        backgroundColor: '#ffffff',
        border: isSelected ? '2px solid var(--neon-cyan)' : '1px solid var(--border-subtle)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    >
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
          <FileText size={16} color="var(--neon-cyan)" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: 13,
              outline: 'none',
              width: 180,
            }}
          />
        </div>
        <button
          onClick={onDelete}
          title="Delete Node"
          style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Drag & Drop Target Area */}
      <div
        onClick={handleDropSimulation}
        style={{
          border: '2px dashed var(--neon-cyan)',
          borderRadius: 6,
          padding: '16px 12px',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          cursor: 'pointer',
          marginBottom: 12,
          transition: 'all 0.15s ease',
        }}
      >
        <FileUp size={24} color="var(--neon-cyan)" style={{ marginBottom: 6 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {ingested ? 'Document Ingested to pgvector' : 'Drop Reference File or Click to Ingest'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {ingested ? '12 chunks embedded • 1536-dim vectors' : 'PDF, Markdown, JSON, Code (Max 25MB)'}
        </div>
      </div>

      {/* Footer / Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={ingested ? 'badge-neon-emerald' : 'badge-neon-cyan'} style={{ fontSize: 10 }}>
          {isIngesting ? 'Chunking & Embedding...' : ingested ? 'Grounded in Memory' : 'Ready'}
        </span>

        {ingested && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--neon-emerald)' }}>
            <CheckCircle2 size={12} /> Synced
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
          borderRadius: '50%',
          backgroundColor: 'var(--neon-emerald)',
          border: '2px solid #ffffff',
        }}
      />
    </div>
  );
};
