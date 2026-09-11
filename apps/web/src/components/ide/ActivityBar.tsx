import React from 'react';
import {
  Files,
  GitBranch,
  Search,
  GitPullRequest,
  LayoutGrid,
  Settings,
  Sparkles,
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
        width: 50,
        height: '100%',
        backgroundColor: '#f8fafc',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        zIndex: 20,
      }}
    >
      {/* Top Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
        {/* Antigravity / Minge Emblem (Solid Clean) */}
        <div
          title="Minge Multiplayer AI Platform"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 6,
          }}
        >
          M
        </div>

        {/* Navigation Items */}
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
                width: 38,
                height: 38,
                borderRadius: 6,
                background: isActive ? '#e2e8f0' : 'transparent',
                border: 'none',
                color: isActive ? '#0284c7' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={19} strokeWidth={isActive ? 2.2 : 1.7} />
              {item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 3px',
                    borderRadius: 4,
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                  }}
                >
                  {item.badge}
                </span>
              )}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 3px 3px 0',
                    backgroundColor: '#0284c7',
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
          title={isCanvasMode ? 'Switch to Prompt IDE (Antigravity)' : 'Switch to AI Canvas (Roobinium)'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 6,
            backgroundColor: isCanvasMode ? '#0284c7' : '#ffffff',
            border: `1px solid ${isCanvasMode ? '#0284c7' : '#e2e8f0'}`,
            color: isCanvasMode ? '#ffffff' : '#0284c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <LayoutGrid size={18} />
        </button>

        {/* User Presence Avatar */}
        <div
          title={`Active User: ${user.name}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: user.color,
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #ffffff',
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
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
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
