import React, { useState } from 'react';
import {
  Sparkles,
  GitPullRequest,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle,
  Database,
  ExternalLink,
  Bot,
  Zap,
  Clock,
  Coins,
  Send,
  ShieldAlert,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PromptPackage, MemoryItem, PromptPullRequest, defaultApiClient } from '../../services/apiClient';
import { AgentChatPanel } from './AgentChatPanel';

export { AgentChatPanel };

interface PromptBranchingPanelProps {
  currentPackage: PromptPackage;
  memories: MemoryItem[];
  currentBranch: string;
  onSelectMemory: (mem: MemoryItem) => void;
  onCreatePr: (pr: Partial<PromptPullRequest>) => void;
}

export const PromptBranchingPanel: React.FC<PromptBranchingPanelProps> = ({
  currentPackage,
  memories,
  currentBranch,
  onSelectMemory,
  onCreatePr,
}) => {
  const [activeTab, setActiveTab] = useState<'ppr' | 'chat' | 'benchmark'>('ppr');

  // Evaluation state
  const [selectedModel, setSelectedModel] = useState(currentPackage.model_config.model || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(currentPackage.model_config.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(currentPackage.model_config.max_tokens ?? 2048);
  const [isRunningEval, setIsRunningEval] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState(currentPackage.latest_output || '');
  const [evalMetrics, setEvalMetrics] = useState<{ tokens: number; latencyMs: number } | null>(null);

  // PPR Modal State
  const [showPrModal, setShowPrModal] = useState(false);
  const [prTitle, setPrTitle] = useState(`Promote ${currentBranch} to production`);
  const [prStatus, setPrStatus] = useState<'idle' | 'submitting' | 'merged'>('idle');

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: `Hello! I'm your Minge Agent for branch **${currentBranch}**. How can I assist you with grounding or evaluating this prompt package?`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Run live evaluation using API client
  const handleRunEvaluation = async () => {
    setIsRunningEval(true);
    setStreamingOutput('');
    setEvalMetrics(null);

    const testInput = currentPackage.user_template.replace('{{module_name}}', 'CRDT Sync Engine');

    await defaultApiClient.executeStreamingCompletion(
      currentPackage.project_id,
      {
        model: selectedModel,
        messages: [
          { role: 'system', content: currentPackage.system_prompt },
          { role: 'user', content: testInput },
        ],
        temperature,
        max_tokens: maxTokens,
      },
      (chunk) => {
        setStreamingOutput(chunk);
      },
      (fullText, metrics) => {
        setIsRunningEval(false);
        setStreamingOutput(fullText);
        setEvalMetrics(metrics);
      },
      (err) => {
        setIsRunningEval(false);
        setStreamingOutput(`[Error running evaluation: ${err.message}]`);
      }
    );
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Analyzed memory grounding for: "${userMsg}". Project isolation verified. All 3 active memory items are tightly aligned with branch **${currentBranch}**. Benchmark win rate is at +4.2%.`,
        },
      ]);
    }, 600);
  };

  const handleConfirmMerge = () => {
    setPrStatus('submitting');
    setTimeout(() => {
      setPrStatus('merged');
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00F2FE', '#A855F7', '#10B981'],
      });
      onCreatePr({
        title: prTitle,
        sourceBranch: currentBranch,
        targetBranch: 'main',
        status: 'merged',
        benchmarkDelta: {
          accuracy: '+4.2%',
          costDelta: '-$0.003/1k',
          latencyDelta: '-120ms',
        },
      });
    }, 800);
  };

  return (
    <aside
      style={{
        width: 360,
        height: '100%',
        backgroundColor: '#f8fafc',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header Segmented Control */}
      <header
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            borderRadius: 6,
            padding: 3,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            onClick={() => setActiveTab('ppr')}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 5,
              border: 'none',
              background: activeTab === 'ppr' ? '#ffffff' : 'transparent',
              color: activeTab === 'ppr' ? 'var(--neon-cyan)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'ppr' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <GitPullRequest size={12} />
            <span>PPR & Eval</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 5,
              border: 'none',
              background: activeTab === 'chat' ? '#ffffff' : 'transparent',
              color: activeTab === 'chat' ? 'var(--neon-purple)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'chat' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Bot size={12} />
            <span>Agent Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('benchmark')}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 5,
              border: 'none',
              background: activeTab === 'benchmark' ? '#ffffff' : 'transparent',
              color: activeTab === 'benchmark' ? 'var(--neon-emerald)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'benchmark' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Zap size={12} />
            <span>Matrix</span>
          </button>
        </div>
      </header>

      {/* Main Panel Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {activeTab === 'ppr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Grounded Memory References */}
            <div className="glass-panel" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Grounded Project Memories
                </span>
                <span className="badge-neon-cyan" style={{ fontSize: 10 }}>
                  {currentPackage.grounded_memory_ids.length} Linked
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {memories.map((mem) => {
                  const isGrounded = currentPackage.grounded_memory_ids.includes(mem.id);
                  return (
                    <div
                      key={mem.id}
                      onClick={() => onSelectMemory(mem)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        backgroundColor: isGrounded ? '#f0f9ff' : '#ffffff',
                        border: `1px solid ${isGrounded ? '#bae6fd' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <Database size={12} color={isGrounded ? 'var(--neon-cyan)' : 'var(--text-muted)'} />
                        <span style={{ fontSize: 11, color: isGrounded ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {mem.content}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--neon-cyan)', fontWeight: 600 }}>v{mem.version}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Evaluation Suite */}
            <div className="glass-panel" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon-purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Live Benchmark Evaluation
                </span>
                <Sliders size={13} color="var(--neon-purple)" />
              </div>

              {/* Model Dropdown */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Upstream LLM Provider & Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  <option value="gemini-2.5-flash">Google Gemini 2.5 Flash (Free Tier)</option>
                  <option value="groq/llama-3.3-70b-versatile">Groq Llama 3.3 70B (Ultra-fast)</option>
                  <option value="openrouter/auto">OpenRouter Auto-Route</option>
                  <option value="openai/gpt-4o">OpenAI GPT-4o (High-Precision)</option>
                </select>
              </div>

              {/* Sliders */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span>Temperature</span>
                    <span>{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--neon-cyan)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span>Max Tokens</span>
                    <span>{maxTokens}</span>
                  </div>
                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--neon-purple)' }}
                  />
                </div>
              </div>

              {/* Run Button */}
              <button
                onClick={handleRunEvaluation}
                disabled={isRunningEval}
                className="btn-cyber-primary"
                style={{ width: '100%', padding: '9px 0', fontSize: 12 }}
              >
                {isRunningEval ? <RotateCcw size={14} className="cable-flowing" /> : <Play size={14} />}
                <span>{isRunningEval ? 'Executing Evaluation...' : 'Test Run with Mock Context'}</span>
              </button>

              {/* Streaming Output Box */}
              {streamingOutput && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 6,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--text-code)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {streamingOutput}
                </div>
              )}

              {/* Evaluation Metrics */}
              {evalMetrics && (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: 'var(--neon-emerald)',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={11} /> {evalMetrics.tokens} Tokens
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> {evalMetrics.latencyMs}ms
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Coins size={11} /> $0.0001
                  </span>
                </div>
              )}
            </div>

            {/* Create Prompt Pull Request (PPR) Action Button */}
            <button
              onClick={() => setShowPrModal(true)}
              className="btn-cyber-purple"
              style={{
                width: '100%',
                padding: '12px 0',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              <GitPullRequest size={15} />
              <span>Create Prompt Pull Request (PPR) ➔</span>
            </button>
          </div>
        )}

        {/* Agent Chat Tab */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingBottom: 10 }}>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    lineHeight: 1.5,
                    backgroundColor: msg.role === 'user' ? '#f0f9ff' : '#ffffff',
                    border: `1px solid ${msg.role === 'user' ? '#bae6fd' : 'var(--border-subtle)'}`,
                    color: 'var(--text-primary)',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                  }}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Ask agent about memories or prompts..."
                style={{
                  flex: 1,
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button onClick={handleSendChat} className="btn-cyber-primary" style={{ padding: '0 12px' }}>
                <Send size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Benchmark Matrix Tab */}
        {activeTab === 'benchmark' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="glass-panel" style={{ padding: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon-emerald)', textTransform: 'uppercase' }}>
                Automated Eval Matrix
              </span>
              <table style={{ width: '100%', marginTop: 10, fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 6 }}>Branch</th>
                    <th style={{ textAlign: 'right', paddingBottom: 6 }}>Win Rate</th>
                    <th style={{ textAlign: 'right', paddingBottom: 6 }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-primary)' }}>main</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>92.4%</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>940ms</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--neon-cyan)', fontWeight: 600 }}>exp/chain-of-thought</td>
                    <td style={{ textAlign: 'right', color: 'var(--neon-emerald)', fontWeight: 700 }}>96.6% (+4.2%)</td>
                    <td style={{ textAlign: 'right', color: 'var(--neon-emerald)' }}>820ms</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>feature/json-mode</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>94.2% (+1.8%)</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>1120ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Interactive PPR Creation Modal */}
      {showPrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: 440,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitPullRequest size={18} color="var(--neon-purple)" />
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Prompt Pull Request (PPR)
                </span>
              </div>
              <button
                onClick={() => setShowPrModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                PR Title
              </label>
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 6,
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                justifyContent: 'space-around',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>ACCURACY</div>
                <div style={{ color: 'var(--neon-emerald)' }}>+4.2% Win</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>COST DELTA</div>
                <div style={{ color: 'var(--neon-emerald)' }}>-$0.003 / 1k</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>LATENCY</div>
                <div style={{ color: 'var(--neon-emerald)' }}>-120ms</div>
              </div>
            </div>

            {prStatus === 'merged' ? (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--neon-emerald)', fontWeight: 700, fontSize: 14 }}>
                ✓ Merged into main branch successfully!
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  onClick={() => setShowPrModal(false)}
                  className="btn-cyber-glass"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMerge}
                  disabled={prStatus === 'submitting'}
                  className="btn-cyber-purple"
                  style={{ flex: 2 }}
                >
                  <CheckCircle size={14} />
                  <span>{prStatus === 'submitting' ? 'Merging...' : 'Merge PPR into Production'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
