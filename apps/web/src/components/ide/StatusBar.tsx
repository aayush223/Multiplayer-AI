import React from 'react';
import {
  GitBranch,
  Database,
  Cpu,
  ArchiveRestore,
  ShieldCheck,
} from 'lucide-react';

interface StatusBarProps {
  currentBranch: string;
  isCrdtConnected: boolean;
  activeProvider: string;
  memoryCount: number;
  softDeletedCount: number;
  onOpenRecovery: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  currentBranch,
  isCrdtConnected,
  activeProvider,
  memoryCount,
  softDeletedCount,
  onOpenRecovery,
}) => {
  return (
    <footer
      style={{
        height: 28,
        backgroundColor: 'var(--color-primary)',
        borderTop: '1px solid var(--color-primary-90)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 12,
        lineHeight: '16px',
        color: 'var(--color-primary-40)',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      {/* Left items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Branch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--color-tertiary)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <GitBranch size={12} color="var(--color-secondary)" />
          <span>{currentBranch}*</span>
        </div>

        {/* CRDT Sync Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 'var(--radius-full)',
              backgroundColor: isCrdtConnected ? 'var(--color-tertiary)' : 'var(--color-secondary)',
            }}
          />
          <span style={{ color: isCrdtConnected ? 'var(--color-tertiary)' : 'var(--color-secondary)', fontWeight: 600 }}>
            CRDT: {isCrdtConnected ? 'Synced (Yjs Scoped)' : 'Connecting...'}
          </span>
        </div>

        {/* Provider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={12} color="var(--color-primary-40)" />
          <span>{activeProvider}: Ready</span>
        </div>
      </div>

      {/* Right items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Memory Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-tertiary)' }}>
          <Database size={12} color="var(--color-primary-40)" />
          <span>Memories: {memoryCount} active</span>
        </div>

        {/* 30-Day Recovery Invariant */}
        {softDeletedCount > 0 && (
          <button
            onClick={onOpenRecovery}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'var(--color-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: 'var(--color-tertiary)',
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 10px',
              cursor: 'pointer',
            }}
          >
            <ArchiveRestore size={11} />
            <span>{softDeletedCount} in 30-Day Recovery</span>
          </button>
        )}

        {/* RLS Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-90)',
            color: 'var(--color-tertiary)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <ShieldCheck size={12} color="var(--color-secondary)" />
          <span>RLS Enforced (minge)</span>
        </div>

        {/* Encoding */}
        <span style={{ color: 'var(--color-primary-40)' }}>UTF-8</span>
      </div>
    </footer>
  );
};
