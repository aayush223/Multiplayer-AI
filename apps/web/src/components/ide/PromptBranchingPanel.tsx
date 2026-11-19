import React, { useState } from 'react';
import {
  GitPullRequest,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle,
  Database,
  Bot,
  Zap,
  Clock,
  Coins,
  Send,
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
        colors: ['#EB1000', '#000000', '#1A1A1A', '#999999'],
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
        width: 376,
        height: '100%',
        backgroundColor: 'var(--color-surface-10)',
        borderLeft: '1px solid var(--color-neutral)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header Segmented Control */}
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-neutral)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--color-surface-10)',
            borderRadius: 'var(--radius-full)',
            padding: 3,
            border: '1px solid var(--color-neutral)',
          }}
        >
          <button
            onClick={() => setActiveTab('ppr')}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: activeTab === 'ppr' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'ppr' ? 'var(--color-tertiary)' : 'var(--color-primary-70)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
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
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: activeTab === 'chat' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'chat' ? 'var(--color-tertiary)' : 'var(--color-primary-70)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
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
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: activeTab === 'benchmark' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'benchmark' ? 'var(--color-tertiary)' : 'var(--color-primary-70)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Zap size={12} />
            <span>Matrix</span>
          </button>
        </div>
      </header>

      {/* Main Panel Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {activeTab === 'ppr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Grounded Memory References */}
            <div className="adobe-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  Grounded Project Memories
                </span>
                <span className="adobe-chip-dark" style={{ fontSize: 11, padding: '2px 8px' }}>
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
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isGrounded ? 'var(--color-surface-10)' : 'var(--color-surface)',
                        border: isGrounded ? '1.5px solid var(--color-primary)' : '1px solid var(--color-neutral)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <Database size={12} color={isGrounded ? 'var(--color-secondary)' : 'var(--color-primary-40)'} />
                        <span style={{ fontSize: 12, color: isGrounded ? 'var(--color-on-surface)' : 'var(--color-primary-70)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {mem.content}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-secondary)', fontWeight: 700 }}>v{mem.version}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Evaluation Suite */}
            <div className="adobe-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  Live Benchmark Evaluation
                </span>
                <Sliders size={14} color="var(--color-secondary)" />
              </div>

              {/* Model Dropdown */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)', display: 'block', marginBottom: 6 }}>
                  Upstream LLM Provider & Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-surface-10)',
                    border: '1px solid var(--color-neutral)',
                    color: 'var(--color-on-surface)',
                    fontSize: 12.5,
                    fontWeight: 600,
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
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)', marginBottom: 4 }}>
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
                    style={{ width: '100%', accentColor: 'var(--color-secondary)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--color-primary-70)', marginBottom: 4 }}>
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
                    style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                  />
                </div>
              </div>

              {/* Run Button */}
              <button
                onClick={handleRunEvaluation}
                disabled={isRunningEval}
                className="adobe-btn-dark"
                style={{ width: '100%', height: 38, fontSize: 13 }}
              >
                {isRunningEval ? <RotateCcw size={14} className="cable-flowing" /> : <Play size={14} />}
                <span>{isRunningEval ? 'Executing Evaluation...' : 'Test Run with Mock Context'}</span>
              </button>

              {/* Streaming Output Box */}
              {streamingOutput && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-10)',
                    border: '1px solid var(--color-neutral)',
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--color-on-surface)',
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
                    marginTop: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--color-on-surface)',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={12} color="var(--color-secondary)" /> {evalMetrics.tokens} Tokens
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> {evalMetrics.latencyMs}ms
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Coins size={12} /> $0.0001
                  </span>
                </div>
              )}
            </div>

            {/* Create Prompt Pull Request (PPR) Action Button */}
            <button
              onClick={() => setShowPrModal(true)}
              className="adobe-btn-red"
              style={{
                width: '100%',
                height: 42,
                fontSize: 14,
              }}
            >
              <GitPullRequest size={15} />
              <span>Create Prompt Pull Request (PPR)</span>
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
                    padding: msg.role === 'user' ? '10px 14px' : '12px 14px',
                    borderRadius: msg.role === 'user' ? 'var(--radius-lg)' : 'var(--radius-md)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    backgroundColor: msg.role === 'user' ? 'var(--color-primary-90)' : 'var(--color-surface)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--color-neutral)',
                    color: msg.role === 'user' ? 'var(--color-tertiary)' : 'var(--color-on-surface)',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                  }}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-neutral)' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Ask agent about memories or prompts..."
                className="adobe-input"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button onClick={handleSendChat} className="adobe-btn-dark" style={{ width: 40, padding: 0 }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Benchmark Matrix Tab */}
        {activeTab === 'benchmark' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="adobe-card">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                Automated Eval Matrix
              </span>
              <table style={{ width: '100%', marginTop: 12, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--color-primary-70)', borderBottom: '1px solid var(--color-neutral)' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Branch</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Win Rate</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--color-neutral)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--color-on-surface)' }}>main</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-primary-70)' }}>92.4%</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-primary-70)' }}>940ms</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--color-neutral)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--color-on-surface)', fontWeight: 700 }}>exp/chain-of-thought</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-secondary)', fontWeight: 700 }}>96.6% (+4.2%)</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-on-surface)', fontWeight: 700 }}>820ms</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px 0', color: 'var(--color-primary-70)' }}>feature/json-mode</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-primary-70)' }}>94.2% (+1.8%)</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-primary-40)' }}>1120ms</td>
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
            backgroundColor: 'var(--color-hero-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: 460,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-neutral)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GitPullRequest size={18} color="var(--color-secondary)" />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  Prompt Pull Request (PPR)
                </span>
              </div>
              <button
                onClick={() => setShowPrModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface-10)',
                  border: '1px solid var(--color-neutral)',
                  color: 'var(--color-primary)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)', display: 'block', marginBottom: 6 }}>
                PR Title
              </label>
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="adobe-input"
              />
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-10)',
                border: '1px solid var(--color-neutral)',
                display: 'flex',
                justifyContent: 'space-around',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--color-primary-70)', fontSize: 11 }}>Accuracy</div>
                <div style={{ color: 'var(--color-secondary)', marginTop: 2 }}>+4.2% Win</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--color-primary-70)', fontSize: 11 }}>Cost Delta</div>
                <div style={{ color: 'var(--color-on-surface)', marginTop: 2 }}>-$0.003 / 1k</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--color-primary-70)', fontSize: 11 }}>Latency</div>
                <div style={{ color: 'var(--color-on-surface)', marginTop: 2 }}>-120ms</div>
              </div>
            </div>

            {prStatus === 'merged' ? (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--color-on-surface)', fontWeight: 700, fontSize: 14 }}>
                ✓ Merged into main branch successfully!
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setShowPrModal(false)}
                  className="adobe-btn-outline"
                  style={{ flex: 1, height: 40 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMerge}
                  disabled={prStatus === 'submitting'}
                  className="adobe-btn-red"
                  style={{ flex: 2, height: 40 }}
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
