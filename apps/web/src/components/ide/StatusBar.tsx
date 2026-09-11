import React from 'react';
import {
  GitBranch,
  Wifi,
  Database,
  Cpu,
  RefreshCw,
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
        height: 24,
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: 'var(--text-secondary)',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      {/* Left items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Branch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: 'var(--neon-cyan)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <GitBranch size={12} />
          <span>{currentBranch}*</span>
        </div>

        {/* CRDT Sync Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: isCrdtConnected ? 'var(--neon-emerald)' : 'var(--neon-amber)',
            }}
          />
          <span style={{ color: isCrdtConnected ? 'var(--text-primary)' : 'var(--neon-amber)' }}>
            CRDT: {isCrdtConnected ? 'Synced (Yjs Scoped)' : 'Connecting...'}
          </span>
        </div>

        {/* Provider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Cpu size={12} color="var(--neon-purple)" />
          <span>{activeProvider}: Ready</span>
        </div>
      </div>

      {/* Right items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Memory Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Database size={12} color="var(--neon-cyan)" />
          <span>Memories: {memoryCount} active</span>
        </div>

        {/* 30-Day Recovery Invariant */}
        {softDeletedCount > 0 && (
          <button
            onClick={onOpenRecovery}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 4,
              color: 'var(--neon-amber)',
              fontSize: 10,
              padding: '1px 6px',
              cursor: 'pointer',
            }}
          >
            <ArchiveRestore size={11} />
            <span>{softDeletedCount} in 30-Day Recovery</span>
          </button>
        )}

        {/* RLS Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--neon-emerald)' }}>
          <ShieldCheck size={12} />
          <span>RLS Enforced (minge)</span>
        </div>

        {/* Encoding */}
        <span style={{ color: 'var(--text-muted)' }}>UTF-8</span>
      </div>
    </footer>
  );
};
