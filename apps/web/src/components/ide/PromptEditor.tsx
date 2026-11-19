import React, { useState } from 'react';
import {
  FileCode,
  Save,
  Check,
  Sparkles,
  Columns,
  Ticket,
} from 'lucide-react';
import { PromptPackage } from '../../services/apiClient';

interface PromptEditorProps {
  currentPackage: PromptPackage;
  basePackage?: PromptPackage;
  onSavePackage: (pkg: PromptPackage) => void;
  onRaiseTicket?: (pkg: PromptPackage) => void;
  isDiffMode: boolean;
  onToggleDiffMode: () => void;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  currentPackage,
  basePackage,
  onSavePackage,
  onRaiseTicket,
  isDiffMode,
  onToggleDiffMode,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'config' | 'eval'>('prompt');
  const [systemPrompt, setSystemPrompt] = useState(currentPackage.system_prompt);
  const [userTemplate, setUserTemplate] = useState(currentPackage.user_template);
  const [isDirty, setIsDirty] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const [flashUpdated, setFlashUpdated] = useState(false);
  const prevPkgRef = React.useRef<{ id: string; branch: string; version: number } | null>(null);

  // Sync state if package changes from props; only flash badge on in-place external updates (e.g. pushed from chat)
  React.useEffect(() => {
    setSystemPrompt(currentPackage.system_prompt);
    setUserTemplate(currentPackage.user_template);
    setIsDirty(false);

    const prev = prevPkgRef.current;
    prevPkgRef.current = {
      id: currentPackage.id,
      branch: currentPackage.branch,
      version: currentPackage.version,
    };

    if (prev && prev.id === currentPackage.id && prev.branch === currentPackage.branch && prev.version !== currentPackage.version) {
      setFlashUpdated(true);
      const timer = setTimeout(() => setFlashUpdated(false), 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
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

  return (
    <main
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Editorial Workspace Header */}
      <header
        style={{
          padding: '20px 28px 0 28px',
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-neutral)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          {/* Left: High-contrast Adobe Clean Display Headline + Metadata */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 900,
                  lineHeight: '34px',
                  letterSpacing: '-0.03em',
                  color: 'var(--color-on-surface)',
                }}
              >
                {currentPackage.name}.prompt.json
              </h1>
              <span className="adobe-chip-red" style={{ fontSize: 11, padding: '3px 10px' }}>
                v{currentPackage.version}
              </span>
              {isDirty && (
                <span className="adobe-chip" style={{ fontSize: 11, padding: '3px 10px', borderColor: 'var(--color-primary)' }}>
                  Unsaved
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-primary-70)', marginTop: 4 }}>
              Branch: <strong style={{ color: 'var(--color-on-surface)' }}>{currentPackage.branch}</strong> • {currentPackage.model_config.model} • {currentPackage.grounded_memory_ids.length} grounded memories
            </p>
          </div>

          {/* Right: Pill Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {flashUpdated && (
              <span className="adobe-chip-dark" style={{ padding: '6px 12px' }}>
                <Sparkles size={12} color="var(--color-secondary)" />
                <span>Pushed from Chat</span>
              </span>
            )}

            <button
              onClick={onToggleDiffMode}
              title={isDiffMode ? 'Exit Diff Mode' : 'Compare with main branch'}
              className={isDiffMode ? 'adobe-btn-dark' : 'adobe-btn-outline'}
              style={{ height: 36, padding: '0 16px', fontSize: 13 }}
            >
              <Columns size={14} />
              <span>{isDiffMode ? 'Diff Active (vs main)' : 'Split Diff View'}</span>
            </button>

            {onRaiseTicket && (
              <button
                onClick={() =>
                  onRaiseTicket({
                    ...currentPackage,
                    system_prompt: systemPrompt,
                    user_template: userTemplate,
                  })
                }
                title="Raise approval ticket for manager review into Main Work"
                className="adobe-btn-red"
                style={{ height: 36, padding: '0 16px', fontSize: 13 }}
              >
                <Ticket size={14} />
                <span>Raise Ticket</span>
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={!isDirty && !hasSaved}
              className={hasSaved ? 'adobe-btn-red' : isDirty ? 'adobe-btn-dark' : 'adobe-btn-subtle'}
              style={{
                height: 36,
                padding: '0 18px',
                fontSize: 13,
                color: !isDirty && !hasSaved ? 'var(--color-primary-40)' : undefined,
                cursor: isDirty ? 'pointer' : 'default',
              }}
            >
              {hasSaved ? <Check size={14} /> : <Save size={14} />}
              <span>{hasSaved ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        </div>

        {/* Minimal Underline Tab Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button
            onClick={() => setActiveTab('prompt')}
            style={{
              padding: '10px 2px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: activeTab === 'prompt' ? 'var(--color-on-surface)' : 'var(--color-primary-70)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'prompt' ? '2px solid var(--color-secondary)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <FileCode size={15} color={activeTab === 'prompt' ? 'var(--color-secondary)' : 'var(--color-primary-40)'} />
            <span>Prompt Package</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            style={{
              padding: '10px 2px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: activeTab === 'config' ? 'var(--color-on-surface)' : 'var(--color-primary-70)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'config' ? '2px solid var(--color-secondary)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            <Sparkles size={15} color={activeTab === 'config' ? 'var(--color-secondary)' : 'var(--color-primary-40)'} />
            <span>model_config.json</span>
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
                borderRight: '1px solid var(--color-neutral)',
                backgroundColor: 'var(--color-surface-10)',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '12px 20px',
                  backgroundColor: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-neutral)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Base: main (v{basePackage?.version || 1})</span>
                <span className="adobe-chip-red">Production</span>
              </div>
              <div style={{ padding: 20, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65, color: 'var(--color-primary-70)' }}>
                <div style={{ color: 'var(--color-primary-40)', marginBottom: 8 }}>// System Prompt</div>
                <div className="diff-removed" style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap' }}>
                  {basePackage?.system_prompt || 'You are an expert software architect in the Minge Multiplayer Platform. Ground your answers in the provided project memories.'}
                </div>
                <div style={{ color: 'var(--color-primary-40)', margin: '20px 0 8px 0' }}>// User Template</div>
                <div style={{ padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-neutral)', borderRadius: 'var(--radius-md)', color: 'var(--color-on-surface)' }}>
                  {basePackage?.user_template || 'Summarize the architectural invariants for: {{module_name}}'}
                </div>
              </div>
            </div>

            {/* Right: Branch (exp/chain-of-thought) */}
            <div
              style={{
                flex: 1,
                backgroundColor: 'var(--color-surface)',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '12px 20px',
                  backgroundColor: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-neutral)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Branch: {currentPackage.branch} (v{currentPackage.version})</span>
                <span className="adobe-chip-dark">+4.2% Eval Win</span>
              </div>
              <div style={{ padding: 20, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65, color: 'var(--color-on-surface)' }}>
                <div style={{ color: 'var(--color-primary-40)', marginBottom: 8 }}>// System Prompt (Modified with CoT)</div>
                <div className="diff-added" style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap' }}>
                  {systemPrompt}
                </div>
                <div style={{ color: 'var(--color-primary-40)', margin: '20px 0 8px 0' }}>// User Template</div>
                <div style={{ padding: '12px 14px', background: 'var(--color-surface-10)', border: '1px solid var(--color-neutral)', borderRadius: 'var(--radius-md)' }}>
                  {userTemplate}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Standard Editor Mode */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 28, padding: '24px 28px', overflowY: 'auto' }}>
            {activeTab === 'prompt' ? (
              <>
                {/* System Prompt Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      System Prompt Directive
                    </label>
                    <span style={{ fontSize: 12, color: 'var(--color-primary-70)', fontFamily: 'var(--font-mono)' }}>
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
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-neutral)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 16px',
                      color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.border = '1px solid var(--color-neutral)')}
                  />
                </div>

                {/* User Template Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      User Template & Dynamic Variables
                    </label>
                    <span style={{ fontSize: 12, color: 'var(--color-primary-70)', fontFamily: 'var(--font-mono)' }}>
                      Variables: <code style={{ color: 'var(--color-secondary)', fontWeight: 700 }}>{'{{module_name}}'}</code>
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
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-neutral)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 16px',
                      color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid var(--color-primary)')}
                    onBlur={(e) => (e.currentTarget.style.border = '1px solid var(--color-neutral)')}
                  />
                </div>

                {/* Live Grounding Summary */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-10)',
                    border: '1px solid var(--color-neutral)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Sparkles size={18} color="var(--color-secondary)" />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                        Package Version v{currentPackage.version} • Grounded in {currentPackage.grounded_memory_ids.length} project memories
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-primary-70)', marginTop: 2 }}>
                        Model: {currentPackage.model_config.model} • Temperature: {currentPackage.model_config.temperature}
                      </div>
                    </div>
                  </div>
                  <span className="adobe-chip-dark">Ready for Benchmark</span>
                </div>
              </>
            ) : (
              /* Config View */
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-code)' }}>
                <pre
                  style={{
                    backgroundColor: 'var(--color-surface-10)',
                    padding: 20,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-neutral)',
                    color: 'var(--color-on-surface)',
                  }}
                >
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
