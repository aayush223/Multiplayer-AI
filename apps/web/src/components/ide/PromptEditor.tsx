import React, { useState } from 'react';
import {
  FileCode,
  GitCompare,
  Save,
  Check,
  Undo2,
  Maximize2,
  Copy,
  Sparkles,
  Columns,
} from 'lucide-react';
import { PromptPackage } from '../../services/apiClient';

interface PromptEditorProps {
  currentPackage: PromptPackage;
  basePackage?: PromptPackage;
  onSavePackage: (pkg: PromptPackage) => void;
  isDiffMode: boolean;
  onToggleDiffMode: () => void;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  currentPackage,
  basePackage,
  onSavePackage,
  isDiffMode,
  onToggleDiffMode,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'config' | 'eval'>('prompt');
  const [systemPrompt, setSystemPrompt] = useState(currentPackage.system_prompt);
  const [userTemplate, setUserTemplate] = useState(currentPackage.user_template);
  const [isDirty, setIsDirty] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const [flashUpdated, setFlashUpdated] = useState(false);

  // Sync state if package changes from props (including push from chat)
  React.useEffect(() => {
    setSystemPrompt(currentPackage.system_prompt);
    setUserTemplate(currentPackage.user_template);
    setIsDirty(false);
    setFlashUpdated(true);
    const timer = setTimeout(() => setFlashUpdated(false), 2500);
    return () => clearTimeout(timer);
  }, [
    currentPackage.id,
    currentPackage.branch,
    currentPackage.version,
    currentPackage.system_prompt,
    currentPackage.user_template,
  ]);

  const handleSave = () => {
    onSavePackage({
      ...currentPackage,
      system_prompt: systemPrompt,
      user_template: userTemplate,
      version: currentPackage.version + 1,
    });
    setIsDirty(false);
    setHasSaved(true);
    setTimeout(() => setHasSaved(false), 2000);
  };

  const estimatedTokens = Math.round((systemPrompt.length + userTemplate.length) / 4);

  return (
    <main
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Editor Tab Bar */}
      <header
        style={{
          height: 38,
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {/* Main Prompt Tab */}
          <div
            onClick={() => setActiveTab('prompt')}
            style={{
              height: '100%',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              color: activeTab === 'prompt' ? 'var(--text-primary)' : 'var(--text-muted)',
              backgroundColor: activeTab === 'prompt' ? '#ffffff' : 'transparent',
              borderTop: activeTab === 'prompt' ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              borderRight: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <FileCode size={14} color="var(--neon-cyan)" />
            <span>{currentPackage.name}.prompt.json</span>
            {isDirty && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--neon-amber)',
                }}
              />
            )}
          </div>

          {/* Config Tab */}
          <div
            onClick={() => setActiveTab('config')}
            style={{
              height: '100%',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              color: activeTab === 'config' ? 'var(--text-primary)' : 'var(--text-muted)',
              backgroundColor: activeTab === 'config' ? '#ffffff' : 'transparent',
              borderTop: activeTab === 'config' ? '2px solid var(--neon-purple)' : '2px solid transparent',
              borderRight: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} color="var(--neon-purple)" />
            <span>model_config.json</span>
          </div>
        </div>

        {/* Editor Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {flashUpdated && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#16a34a',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '3px 8px',
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={12} color="#16a34a" />
              <span>✓ Pushed from Chat</span>
            </span>
          )}

          {/* Diff Mode Switcher */}
          <button
            onClick={onToggleDiffMode}
            title={isDiffMode ? 'Exit Diff Mode' : 'Compare with main branch'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              background: isDiffMode ? '#f0f9ff' : '#ffffff',
              border: `1px solid ${isDiffMode ? 'var(--neon-cyan)' : 'var(--border-subtle)'}`,
              color: isDiffMode ? 'var(--neon-cyan)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Columns size={13} />
            <span>{isDiffMode ? 'Diff Active (vs main)' : 'Split Diff View'}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isDirty && !hasSaved}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              background: hasSaved
                ? '#f0fdf4'
                : isDirty
                ? 'var(--neon-cyan)'
                : '#ffffff',
              border: `1px solid ${hasSaved ? '#bbf7d0' : isDirty ? 'var(--neon-cyan)' : 'var(--border-subtle)'}`,
              color: hasSaved ? '#16a34a' : isDirty ? '#ffffff' : 'var(--text-muted)',
              cursor: isDirty ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
          >
            {hasSaved ? <Check size={12} /> : <Save size={12} />}
            <span>{hasSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* Editor Main Surface */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* If Diff Mode is active, show Side-by-Side Comparison */}
        {isDiffMode ? (
          <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%' }}>
            {/* Left: Base branch (main) */}
            <div
              style={{
                flex: 1,
                borderRight: '1px solid var(--border-subtle)',
                backgroundColor: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#fef2f2',
                  borderBottom: '1px solid #fecaca',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--neon-red)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>BASE: main (v{basePackage?.version || 1})</span>
                <span className="badge-neon-amber">Production</span>
              </div>
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>// System Prompt</div>
                <div className="diff-removed" style={{ padding: '8px 12px', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {basePackage?.system_prompt || 'You are an expert software architect in the Minge Multiplayer Platform. Ground your answers in the provided project memories.'}
                </div>
                <div style={{ color: 'var(--text-muted)', margin: '16px 0 8px 0' }}>// User Template</div>
                <div style={{ padding: '8px 12px', background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
                  {basePackage?.user_template || 'Summarize the architectural invariants for: {{module_name}}'}
                </div>
              </div>
            </div>

            {/* Right: Branch (exp/chain-of-thought) */}
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#f0fdf4',
                  borderBottom: '1px solid #bbf7d0',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--neon-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>BRANCH: {currentPackage.branch} (v{currentPackage.version})</span>
                <span className="badge-neon-emerald">+4.2% Eval Win</span>
              </div>
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>// System Prompt (Modified with CoT)</div>
                <div className="diff-added" style={{ padding: '8px 12px', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {systemPrompt}
                </div>
                <div style={{ color: 'var(--text-muted)', margin: '16px 0 8px 0' }}>// User Template</div>
                <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
                  {userTemplate}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Standard Editor Mode */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto' }}>
            {activeTab === 'prompt' ? (
              <>
                {/* System Prompt Section */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--neon-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      System Prompt Directive
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Tokens: ~{Math.round(systemPrompt.length / 4)}
                    </span>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => {
                      setSystemPrompt(e.target.value);
                      setIsDirty(true);
                    }}
                    rows={8}
                    style={{
                      width: '100%',
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      padding: '12px 14px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--neon-cyan)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>

                {/* User Template Section */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--neon-purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      User Template & Dynamic Variables
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Variables: <code style={{ color: 'var(--neon-cyan)' }}>{'{{module_name}}'}</code>
                    </span>
                  </div>
                  <textarea
                    value={userTemplate}
                    onChange={(e) => {
                      setUserTemplate(e.target.value);
                      setIsDirty(true);
                    }}
                    rows={4}
                    style={{
                      width: '100%',
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      padding: '12px 14px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--neon-purple)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>

                {/* Live Grounding Summary */}
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    backgroundColor: '#f8fafc',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={16} color="var(--neon-cyan)" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Package Version: v{currentPackage.version} • Grounded in {currentPackage.grounded_memory_ids.length} project memories
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Model: {currentPackage.model_config.model} • Temp: {currentPackage.model_config.temperature}
                      </div>
                    </div>
                  </div>
                  <span className="badge-neon-emerald">Ready for Benchmark</span>
                </div>
              </>
            ) : (
              /* Config View */
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-code)' }}>
                <pre style={{ backgroundColor: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                  {JSON.stringify(currentPackage.model_config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
