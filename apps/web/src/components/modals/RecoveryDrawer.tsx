import React from 'react';
import { ArchiveRestore, Trash2, Clock, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { MemoryItem } from '../../services/apiClient';

interface RecoveryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  softDeletedMemories: MemoryItem[];
  onRestoreMemory: (memoryId: string) => void;
}

export const RecoveryDrawer: React.FC<RecoveryDrawerProps> = ({
  isOpen,
  onClose,
  softDeletedMemories,
  onRestoreMemory,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
      }}
    >
      <div
        style={{
          width: 520,
          maxHeight: '80vh',
          padding: 24,
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ArchiveRestore size={20} color="var(--neon-amber)" />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                30-Day Recovery Vault
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Terms v0.1 & Invariant 6: Soft-deleted memories are preserved for 30 calendar days.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {softDeletedMemories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No soft-deleted memories pending recovery.
            </div>
          ) : (
            softDeletedMemories.map((mem) => (
              <div
                key={mem.id}
                style={{
                  padding: 12,
                  borderRadius: 6,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-code)', fontFamily: 'var(--font-mono)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mem.content}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--neon-amber)' }}>
                    <Clock size={11} />
                    <span>Purge in ~29 days</span>
                    <span style={{ color: 'var(--text-muted)' }}>• Type: {mem.type}</span>
                  </div>
                </div>

                <button
                  onClick={() => onRestoreMemory(mem.id)}
                  className="btn-cyber-primary"
                  style={{ padding: '6px 12px', fontSize: 11 }}
                >
                  <RefreshCw size={11} />
                  <span>Restore</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-cyber-glass" style={{ padding: '8px 16px' }}>
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
};
