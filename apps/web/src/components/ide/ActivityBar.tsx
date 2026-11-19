import React from 'react';
import {
  Files,
  GitBranch,
  Search,
  GitPullRequest,
  LayoutGrid,
  Settings,
  Database,
} from 'lucide-react';

interface ActivityBarProps {
  activeTab: 'explorer' | 'branches' | 'search' | 'prs' | 'memories';
  onSelectTab: (tab: 'explorer' | 'branches' | 'search' | 'prs' | 'memories') => void;
  onToggleCanvas: () => void;
  isCanvasMode: boolean;
  user: { name: string; color: string };
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onSelectTab,
  onToggleCanvas,
  isCanvasMode,
  user,
}) => {
  const navItems = [
    { id: 'explorer' as const, icon: Files, label: 'Explorer' },
    {
      id: 'branches' as const,
      icon: GitBranch,
      label: 'Prompt Branches & Lineage',
      badge: 'AI',
    },
    { id: 'prs' as const, icon: GitPullRequest, label: 'Prompt PRs (PPR)' },
    { id: 'memories' as const, icon: Database, label: 'Grounded Memories' },
    { id: 'search' as const, icon: Search, label: 'Semantic Memory Search' },
  ];

  return (
    <aside
      style={{
        width: 56,
        height: '100%',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-neutral)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        zIndex: 20,
      }}
    >
      {/* Top Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = !isCanvasMode && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isCanvasMode) onToggleCanvas();
                onSelectTab(item.id);
              }}
              title={item.label}
              style={{
                position: 'relative',
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--color-primary)' : 'transparent',
                border: 'none',
                color: isActive ? 'var(--color-tertiary)' : 'var(--color-primary-70)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-10)';
                  e.currentTarget.style.color = 'var(--color-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-primary-70)';
                }
              }}
            >
              <Icon size={19} strokeWidth={isActive ? 2.2 : 1.75} />
              {item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-secondary)',
                    color: 'var(--color-tertiary)',
                    lineHeight: '11px',
                  }}
                >
                  {item.badge}
                </span>
              )}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: -8,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 3px 3px 0',
                    backgroundColor: 'var(--color-secondary)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* Toggle Canvas Button */}
        <button
          onClick={onToggleCanvas}
          title={isCanvasMode ? 'Switch to Prompt IDE' : 'Switch to AI Canvas'}
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-full)',
            backgroundColor: isCanvasMode ? 'var(--color-primary)' : 'var(--color-surface)',
            border: '1.5px solid var(--color-primary)',
            color: isCanvasMode ? 'var(--color-tertiary)' : 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <LayoutGrid size={18} />
        </button>

        {/* User Presence Avatar */}
        <div
          title={`Active User: ${user.name}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--radius-full)',
            backgroundColor: user.color,
            color: 'var(--color-tertiary)',
            fontWeight: 700,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid var(--color-neutral)',
            cursor: 'pointer',
          }}
        >
          {user.name.charAt(0)}
        </div>

        {/* Settings */}
        <button
          title="Project Settings & RLS"
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-full)',
            background: 'transparent',
            border: 'none',
            color: 'var(--color-primary-70)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
};
