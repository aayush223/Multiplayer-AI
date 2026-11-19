import React from 'react';
import { ArchiveRestore, Clock, RefreshCw } from 'lucide-react';
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
        backgroundColor: 'var(--color-hero-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
      }}
    >
      <div
        style={{
          width: 540,
          maxHeight: '80vh',
          padding: 28,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-neutral)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-10)',
                border: '1px solid var(--color-neutral)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ArchiveRestore size={18} color="var(--color-secondary)" />
            </div>
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 900,
                  lineHeight: '28px',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                }}
              >
                30-Day Recovery Vault
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 2 }}>
                Terms v0.1 & Invariant 6: Soft-deleted memories are preserved for 30 calendar days.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Vault"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-surface-10)',
              border: '1px solid var(--color-neutral)',
              color: 'var(--color-primary)',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {softDeletedMemories.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                backgroundColor: 'var(--color-surface-10)',
                border: '1px solid var(--color-neutral)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-primary-70)',
                fontSize: 14,
              }}
            >
              No soft-deleted memories pending recovery.
            </div>
          ) : (
            softDeletedMemories.map((mem) => (
              <div
                key={mem.id}
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-10)',
                  border: '1px solid var(--color-neutral)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-mono)',
                      marginBottom: 6,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {mem.content}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-secondary)' }}>
                    <Clock size={12} />
                    <span>Purge in ~29 days</span>
                    <span style={{ color: 'var(--color-primary-70)', fontWeight: 400 }}>• Type: {mem.type}</span>
                  </div>
                </div>

                <button
                  onClick={() => onRestoreMemory(mem.id)}
                  className="adobe-btn-red"
                  style={{ height: 34, padding: '0 14px', fontSize: 12 }}
                >
                  <RefreshCw size={12} />
                  <span>Restore</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--color-neutral)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="adobe-btn-outline" style={{ height: 38, padding: '0 20px' }}>
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
};
