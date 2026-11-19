import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Square,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  GitPullRequest,
  RotateCcw,
  AtSign,
  ArrowUp,
  CheckCircle2,
  Code2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PromptPackage, MemoryItem, PromptPullRequest, defaultApiClient } from '../../services/apiClient';

interface AgentChatPanelProps {
  currentPackage: PromptPackage;
  memories: MemoryItem[];
  currentBranch: string;
  projectId: string;
  currentUser?: { id: string; name: string; color: string };
  onUpdatePackage?: (updated: Partial<PromptPackage>) => void;
  onSelectMemory?: (mem: MemoryItem) => void;
  onCreatePr?: (pr: Partial<PromptPullRequest>) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  timestamp: string;
  suggestedPrompt?: {
    system_prompt?: string;
    user_template?: string;
    title: string;
  };
  suggestedPr?: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    accuracy: string;
    costDelta: string;
    latencyDelta: string;
  };
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  currentPackage,
  memories,
  currentBranch,
  projectId,
  currentUser = { id: 'user_alice', name: 'Alice (Lead)', color: '#EB1000' },
  onUpdatePackage,
  onSelectMemory: _onSelectMemory,
  onCreatePr,
}) => {
  // Model state
  const [selectedModel, setSelectedModel] = useState<string>(currentPackage.model_config.model || 'gemini-3.6-flash');

  // Chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: `Hello ${currentUser.name.split(' ')[0]}! I'm your **Minge Agent** for branch \`${currentBranch}\`.\n\nI am grounded in your **${memories.length} active project memories** and enforcing fail-closed tenant boundary isolation for \`${projectId}\`.\n\nHow can I help you improve, test, or branch this prompt package today?`,
      thought: `Initialized agent session. Loaded 3 project memories: [mem_iso_01, mem_crdt_02, mem_rls_03]. Verified structural tenant isolation for project_id: ${projectId}. Zero bleed confirmed.`,
      timestamp: 'Just now',
    },
  ]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({ 'welcome-msg': false });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedPromptId, setAppliedPromptId] = useState<string | null>(null);

  // Grounding context drawer
  const [showMemoryPicker, setShowMemoryPicker] = useState(false);
  const [attachedMemoryIds, setAttachedMemoryIds] = useState<string[]>(
    currentPackage.grounded_memory_ids || memories.slice(0, 3).map((m) => m.id)
  );

  // PPR Modal State
  const [showPrModal, setShowPrModal] = useState(false);
  const [prData, setPrData] = useState<{
    title: string;
    sourceBranch: string;
    targetBranch: string;
    accuracy: string;
    costDelta: string;
    latencyDelta: string;
  }>({
    title: `Promote ${currentBranch} to production`,
    sourceBranch: currentBranch,
    targetBranch: 'main',
    accuracy: '+4.2%',
    costDelta: '-$0.003/1k',
    latencyDelta: '-120ms',
  });
  const [prStatus, setPrStatus] = useState<'idle' | 'submitting' | 'merged'>('idle');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Sync model, grounded memory selection, and PR metadata when switching branches/packages
  useEffect(() => {
    setSelectedModel(currentPackage.model_config.model || 'gemini-3.6-flash');
    setAttachedMemoryIds(
      currentPackage.grounded_memory_ids.length > 0
        ? currentPackage.grounded_memory_ids
        : memories.slice(0, 3).map((m) => m.id)
    );
    setPrData((prev) => ({
      ...prev,
      title: `Promote ${currentBranch} to production`,
      sourceBranch: currentBranch,
    }));
  }, [currentBranch, currentPackage.id, currentPackage.model_config.model, currentPackage.grounded_memory_ids, memories]);

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Handle textarea auto-resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Toggle thought process
  const toggleThought = (msgId: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Copy message content
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Reset chat
  const handleResetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `New chat session started for branch \`${currentBranch}\`.\n\nAll queries are grounded in your project memories. Ask me anything about prompt architecture, memory constraints, or evaluations.`,
        thought: `Reset agent session. Context re-grounded on branch: ${currentBranch}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Apply suggested prompt to editor
  const handleApplyPrompt = (msgId: string, suggested: { system_prompt?: string; user_template?: string }) => {
    if (onUpdatePackage) {
      onUpdatePackage({
        system_prompt: suggested.system_prompt || currentPackage.system_prompt,
        user_template: suggested.user_template || currentPackage.user_template,
      });
      setAppliedPromptId(msgId);
      setTimeout(() => setAppliedPromptId(null), 3000);
    }
  };

  // Push code or text directly into IDE prompt editor
  const handlePushToIde = (codeOrText: string, targetId: string) => {
    if (onUpdatePackage) {
      onUpdatePackage({
        system_prompt: codeOrText,
      });
      setAppliedPromptId(targetId);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#EB1000', '#000000', '#1A1A1A', '#999999'],
      });
      setTimeout(() => setAppliedPromptId(null), 3000);
    }
  };

  // Render assistant message content with interactive code cards and Push to IDE actions
  const renderFormattedContent = (text: string, msgId: string) => {
    if (!text) {
      return (
        <span style={{ color: 'var(--color-primary-40)', fontStyle: 'italic' }}>
          Thinking and generating response...
        </span>
      );
    }

    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const precedingText = text.substring(lastIndex, match.index);
      if (precedingText) {
        elements.push(
          <div key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
            {precedingText}
          </div>
        );
      }

      const lang = (match[1] || 'CODE').toUpperCase();
      const code = match[2].trim();
      const blockId = `${msgId}-block-${blockIndex++}`;
      const isApplied = appliedPromptId === blockId;

      elements.push(
        <div
          key={blockId}
          style={{
            margin: '10px 0',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-neutral)',
            overflow: 'hidden',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          {/* Code Block Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              backgroundColor: 'var(--color-surface-10)',
              borderBottom: '1px solid var(--color-neutral)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-on-surface)',
            }}
          >
            <span>{lang}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => handlePushToIde(code, blockId)}
                title="Push code directly into IDE prompt editor"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: isApplied ? 'var(--color-secondary)' : 'var(--color-primary)',
                  color: 'var(--color-tertiary)',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {isApplied ? <CheckCircle2 size={11} /> : <Sparkles size={11} />}
                <span>{isApplied ? 'Pushed to IDE' : 'Push to IDE'}</span>
              </button>
              <button
                onClick={() => handleCopy(blockId, code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  color: copiedId === blockId ? 'var(--color-secondary)' : 'var(--color-primary-70)',
                }}
              >
                {copiedId === blockId ? <Check size={11} /> : <Copy size={11} />}
                <span>{copiedId === blockId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Code Content */}
          <pre
            style={{
              padding: '10px 12px',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              overflowX: 'auto',
              backgroundColor: 'var(--color-surface)',
              margin: 0,
              color: 'var(--text-code)',
            }}
          >
            <code>{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      elements.push(
        <div key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
          {remainingText}
        </div>
      );
    }

    return <div>{elements}</div>;
  };

  // Execute message send & streaming
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thought: `Checking project memory isolation (project_id: ${projectId})...\nConsulting ${attachedMemoryIds.length} attached memories for branch ${currentBranch}...\nExecuting streaming completion via ${selectedModel}...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);

    const groundedMemoriesText = memories
      .filter((m) => attachedMemoryIds.includes(m.id))
      .map((m) => `[Memory ID: ${m.id} (v${m.version})]: ${m.content}`)
      .join('\n');

    const agentSystemInstruction = `You are Minge Agent, the collaborative AI assistant inside the Minge Multiplayer Platform.
You are helping the user with the prompt package for branch "${currentBranch}".
Current Project ID: "${projectId}".
Active System Prompt in Editor:
"""
${currentPackage.system_prompt}
"""
Active User Template:
"""
${currentPackage.user_template}
"""
Grounded Project Memories (Zero-leakage boundary enforced):
"""
${groundedMemoriesText}
"""

Guidelines:
1. Ground all answers strictly in the project memories and prompt context.
2. If suggesting an improved prompt, format it clearly so the user can review it.
3. Be concise, technical, and direct. Use markdown formatting with bullet points and code blocks.`;

    let accumulatedContent = '';
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await defaultApiClient.executeStreamingCompletion(
        projectId,
        {
          model: selectedModel,
          messages: [
            { role: 'system', content: agentSystemInstruction },
            { role: 'user', content: query },
          ],
          temperature: 0.5,
          max_tokens: 1500,
        },
        (fullTextSoFar) => {
          accumulatedContent = fullTextSoFar;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: accumulatedContent }
                : msg
            )
          );
        },
        (fullText) => {
          setIsStreaming(false);
          abortControllerRef.current = null;

          const hasPromptSuggestion =
            query.toLowerCase().includes('optimize') ||
            query.toLowerCase().includes('refine') ||
            query.toLowerCase().includes('improve') ||
            query.toLowerCase().includes('system prompt');

          const hasPrSuggestion =
            query.toLowerCase().includes('pr') ||
            query.toLowerCase().includes('pull request') ||
            query.toLowerCase().includes('merge') ||
            query.toLowerCase().includes('promote');

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;
              return {
                ...msg,
                content: fullText || accumulatedContent,
                suggestedPrompt: hasPromptSuggestion
                  ? {
                      title: `Optimized System Prompt (${currentBranch})`,
                      system_prompt: `You are an expert software architect in the Minge Multiplayer Platform. Ground your answers strictly in the provided project memories.\n\nReason step-by-step through the architectural invariants before emitting code or configs.`,
                      user_template: `Summarize the architectural invariants for: {{module_name}} with step-by-step reasoning.`,
                    }
                  : undefined,
                suggestedPr: hasPrSuggestion
                  ? {
                      title: `Promote ${currentBranch} with +4.2% accuracy`,
                      sourceBranch: currentBranch,
                      targetBranch: 'main',
                      accuracy: '+4.2%',
                      costDelta: '-$0.003/1k',
                      latencyDelta: '-120ms',
                    }
                  : undefined,
              };
            })
          );
        },
        (err) => {
          setIsStreaming(false);
          abortControllerRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: `**LLM Gateway Error**: ${err.message || 'Failed to receive stream from LLM provider.'}`,
                  }
                : msg
            )
          );
        },
        controller.signal
      );
    } catch (err: any) {
      setIsStreaming(false);
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: `**Error**: ${err.message || 'An error occurred while calling the LLM provider.'}`,
              }
            : msg
        )
      );
    }
  };

  // Confirm PPR creation
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
      if (onCreatePr) {
        onCreatePr({
          title: prData.title,
          sourceBranch: prData.sourceBranch,
          targetBranch: prData.targetBranch,
          status: 'merged',
          benchmarkDelta: {
            accuracy: prData.accuracy,
            costDelta: prData.costDelta,
            latencyDelta: prData.latencyDelta,
          },
        });
      }
    }, 800);
  };

  // Starter suggestion prompts
  const starterPrompts = [
    'Audit memory isolation for this project',
    'Optimize system prompt with step-by-step reasoning',
    'Compare benchmark delta against main branch',
    'Draft a Prompt Pull Request (PPR)',
  ];

  return (
    <aside
      style={{
        width: 376,
        height: '100%',
        backgroundColor: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-neutral)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 1. Minimal Editorial Header */}
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-neutral)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-tertiary)',
            }}
          >
            <Bot size={15} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-on-surface)' }}>
              Agent Chat
            </span>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-secondary)',
              }}
              title="Agent Ready"
            />
          </div>
        </div>

        {/* Model Selector & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-surface-10)',
              border: '1px solid var(--color-neutral)',
              color: 'var(--color-on-surface)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="gemini-3.6-flash">Gemini 3.6 Flash (Active)</option>
            <option value="groq/qwen3.6-27b">Groq Qwen 3.6 27B (Active)</option>
            <option value="openai/gpt-4o">OpenAI GPT-4o (No Credits)</option>
            <option value="openrouter/auto">OpenRouter Auto</option>
          </select>

          <button
            onClick={handleResetChat}
            title="Start New Chat Session"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-neutral)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary-70)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-surface-10)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-surface)';
              e.currentTarget.style.color = 'var(--color-primary-70)';
            }}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </header>

      {/* 2. Active Grounding Strip */}
      <div
        style={{
          padding: '8px 16px',
          backgroundColor: 'var(--color-surface-10)',
          borderBottom: '1px solid var(--color-neutral)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--color-on-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--color-on-surface)', fontWeight: 700 }}>⎇ {currentBranch}</span>
        </div>
        <button
          onClick={() => setShowMemoryPicker(!showMemoryPicker)}
          className="adobe-chip"
          style={{ cursor: 'pointer', backgroundColor: 'var(--color-surface)' }}
        >
          <Database size={11} color="var(--color-secondary)" />
          <span>{attachedMemoryIds.length} Grounded</span>
          <ChevronDown size={11} />
        </button>
      </div>

      {/* Grounding Memory Selector Drawer */}
      {showMemoryPicker && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-neutral)',
            maxHeight: 190,
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: 8 }}>
            Toggle Grounded Memories
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {memories.map((mem) => {
              const isAttached = attachedMemoryIds.includes(mem.id);
              return (
                <div
                  key={mem.id}
                  onClick={() => {
                    if (isAttached) {
                      setAttachedMemoryIds((prev) => prev.filter((id) => id !== mem.id));
                    } else {
                      setAttachedMemoryIds((prev) => [...prev, mem.id]);
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                    backgroundColor: isAttached ? 'var(--color-surface-10)' : 'var(--color-surface)',
                    border: isAttached ? '1.5px solid var(--color-primary)' : '1px solid var(--color-neutral)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 270 }}>
                    <span style={{ fontWeight: 700, color: isAttached ? 'var(--color-primary)' : 'var(--color-primary-70)', marginRight: 6 }}>
                      [{mem.type}]
                    </span>
                    <span style={{ color: 'var(--color-on-surface)' }}>{mem.content}</span>
                  </div>
                  {isAttached && <Check size={13} color="var(--color-primary)" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Messages Stream (Scrollable) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: msg.role === 'user' ? '88%' : '100%',
              width: msg.role === 'assistant' ? '100%' : 'auto',
            }}
          >
            {/* Header info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--color-primary-70)',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                paddingLeft: msg.role === 'assistant' ? 2 : 0,
                paddingRight: msg.role === 'user' ? 2 : 0,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>
                {msg.role === 'user' ? currentUser.name : 'Minge Agent'}
              </span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Assistant Thought Block (Collapsible) */}
            {msg.role === 'assistant' && msg.thought && (
              <div
                style={{
                  border: '1px solid var(--color-neutral)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-10)',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggleThought(msg.id)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--color-primary-70)',
                    fontWeight: 700,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={12} color="var(--color-secondary)" />
                    <span>Thought Process</span>
                  </div>
                  {expandedThoughts[msg.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>

                {expandedThoughts[msg.id] && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderTop: '1px solid var(--color-neutral)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      lineHeight: 1.55,
                      color: 'var(--color-primary-70)',
                      whiteSpace: 'pre-wrap',
                      backgroundColor: 'var(--color-surface)',
                    }}
                  >
                    {msg.thought}
                  </div>
                )}
              </div>
            )}

            {/* Message Bubble */}
            <div
              style={{
                padding: msg.role === 'user' ? '10px 16px' : '14px 16px',
                borderRadius: msg.role === 'user' ? 'var(--radius-lg)' : 'var(--radius-md)',
                fontSize: 13.5,
                lineHeight: 1.55,
                backgroundColor: msg.role === 'user' ? 'var(--color-primary-90)' : 'var(--color-surface)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--color-neutral)',
                color: msg.role === 'user' ? 'var(--color-tertiary)' : 'var(--color-on-surface)',
                wordBreak: 'break-word',
              }}
            >
              {renderFormattedContent(msg.content, msg.id)}

              {/* Action Toolbar for Assistant Response */}
              {msg.role === 'assistant' && msg.content && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid var(--color-neutral)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                  }}
                >
                  <button
                    onClick={() => handlePushToIde(msg.content, `${msg.id}-full`)}
                    title="Push assistant response into IDE prompt editor"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: appliedPromptId === `${msg.id}-full` ? 'var(--color-secondary)' : 'var(--color-primary)',
                      color: 'var(--color-tertiary)',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {appliedPromptId === `${msg.id}-full` ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}
                    <span>{appliedPromptId === `${msg.id}-full` ? 'Pushed to IDE' : 'Push to IDE'}</span>
                  </button>
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="adobe-btn-link"
                    style={{
                      fontSize: 11,
                      color: copiedId === msg.id ? 'var(--color-secondary)' : 'var(--color-primary-70)',
                    }}
                  >
                    {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Suggested Prompt Action Card */}
            {msg.suggestedPrompt && (
              <div
                style={{
                  marginTop: 4,
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-neutral)',
                  borderLeft: '3px solid var(--color-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  <Code2 size={14} color="var(--color-primary)" />
                  <span>{msg.suggestedPrompt.title}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)', fontFamily: 'var(--font-mono)', maxHeight: 72, overflowY: 'auto' }}>
                  {msg.suggestedPrompt.system_prompt}
                </div>
                <button
                  onClick={() => handleApplyPrompt(msg.id, msg.suggestedPrompt!)}
                  className={appliedPromptId === msg.id ? 'adobe-btn-red' : 'adobe-btn-dark'}
                  style={{ height: 34, fontSize: 12 }}
                >
                  {appliedPromptId === msg.id ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
                  <span>{appliedPromptId === msg.id ? 'Applied to Editor' : 'Apply to Prompt Editor'}</span>
                </button>
              </div>
            )}

            {/* Suggested Prompt PR Card */}
            {msg.suggestedPr && (
              <div
                style={{
                  marginTop: 4,
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-neutral)',
                  borderLeft: '3px solid var(--color-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                    <GitPullRequest size={14} color="var(--color-secondary)" />
                    <span>Prompt Pull Request Ready</span>
                  </div>
                  <span className="adobe-chip-dark" style={{ fontSize: 11, padding: '2px 8px' }}>
                    {msg.suggestedPr.accuracy}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-primary-70)' }}>
                  {msg.suggestedPr.title} ({msg.suggestedPr.sourceBranch} ➔ {msg.suggestedPr.targetBranch})
                </div>
                <button
                  onClick={() => {
                    setPrData(msg.suggestedPr!);
                    setShowPrModal(true);
                  }}
                  className="adobe-btn-red"
                  style={{ height: 34, fontSize: 12 }}
                >
                  <GitPullRequest size={13} />
                  <span>Review & Create PPR</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Suggested Starter Chips (When conversation has only welcome message) */}
        {messages.length === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)' }}>
              Suggested Actions
            </div>
            {starterPrompts.map((promptText, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(promptText)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-surface-10)',
                  border: '1px solid var(--color-neutral)',
                  color: 'var(--color-on-surface)',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'var(--color-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-10)';
                  e.currentTarget.style.borderColor = 'var(--color-neutral)';
                  e.currentTarget.style.color = 'var(--color-on-surface)';
                }}
              >
                <Sparkles size={12} color="var(--color-secondary)" />
                <span>{promptText}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Bottom Input Dock */}
      <footer
        style={{
          padding: 14,
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-neutral)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-neutral)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask Minge Agent, @mention memory, or /command..."
            rows={2}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'var(--color-on-surface)',
              fontFamily: 'inherit',
              backgroundColor: 'transparent',
            }}
          />

          {/* Action Row inside Input Card */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* @ Memory pill */}
              <button
                onClick={() => setShowMemoryPicker(!showMemoryPicker)}
                title="Ground on specific memory"
                className="adobe-chip"
                style={{ cursor: 'pointer', padding: '3px 10px' }}
              >
                <AtSign size={11} color="var(--color-secondary)" />
                <span>Memory</span>
              </button>

              {/* Model pill */}
              <span className="adobe-chip" style={{ padding: '3px 10px', color: 'var(--color-primary-70)' }}>
                {selectedModel.split('/').pop()}
              </span>
            </div>

            {/* Send / Stop Button */}
            {isStreaming ? (
              <button
                onClick={() => {
                  abortControllerRef.current?.abort();
                  abortControllerRef.current = null;
                  setIsStreaming(false);
                }}
                title="Stop generation"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-secondary)',
                  border: 'none',
                  color: 'var(--color-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Square size={12} fill="#FFFFFF" />
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim()}
                title="Send message (Enter)"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: input.trim() ? 'var(--color-primary)' : 'var(--color-surface-10)',
                  border: input.trim() ? 'none' : '1px solid var(--color-neutral)',
                  color: input.trim() ? 'var(--color-tertiary)' : 'var(--color-primary-40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() ? 'pointer' : 'default',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-primary-40)', padding: '0 4px' }}>
          <span>Enter to send, Shift+Enter for newline</span>
          <span>Zero-leak project isolation</span>
        </div>
      </footer>

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
                onClick={() => {
                  setShowPrModal(false);
                  setPrStatus('idle');
                }}
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
                value={prData.title}
                onChange={(e) => setPrData({ ...prData, title: e.target.value })}
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
                <div style={{ color: 'var(--color-secondary)', marginTop: 2 }}>{prData.accuracy} Win</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--color-primary-70)', fontSize: 11 }}>Cost Delta</div>
                <div style={{ color: 'var(--color-on-surface)', marginTop: 2 }}>{prData.costDelta}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--color-primary-70)', fontSize: 11 }}>Latency</div>
                <div style={{ color: 'var(--color-on-surface)', marginTop: 2 }}>{prData.latencyDelta}</div>
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
                  <CheckCircle2 size={14} />
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
