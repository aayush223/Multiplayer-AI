import React, { useState } from 'react';
import { Play, Sparkles, Sliders, Trash2, Cpu, GripVertical } from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface PromptNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  onRun: (node: CanvasNodeData) => void;
  isSelected?: boolean;
}

export const PromptNode: React.FC<PromptNodeProps> = ({
  node,
  onUpdate,
  onDelete,
  onRun,
  isSelected,
}) => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div
      className="glass-panel"
      style={{
        width: 360,
        padding: 16,
        backgroundColor: '#ffffff',
        border: isSelected ? '2px solid var(--neon-cyan)' : '1px solid var(--border-subtle)',
        boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'grab',
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripVertical size={14} color="var(--text-muted)" />
          <Sparkles size={16} color="var(--neon-indigo)" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: 13,
              outline: 'none',
              width: 180,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            title="Configure Model Parameters"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <Sliders size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Delete Node"
            style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Model Selection & Parameters (collapsible) */}
      {showConfig && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 6,
            backgroundColor: '#f8fafc',
            border: '1px solid var(--border-subtle)',
            fontSize: 11,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Model Provider</label>
            <select
              value={node.model || 'gemini-2.5-flash'}
              onChange={(e) => onUpdate({ model: e.target.value })}
              style={{
                width: '100%',
                padding: '4px 8px',
                borderRadius: 4,
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: 11,
              }}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="groq/llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
              <option value="openai/gpt-4o">OpenAI GPT-4o</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Temp: {node.temperature ?? 0.7}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={node.temperature ?? 0.7}
              onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
              style={{ width: 120, accentColor: 'var(--neon-indigo)' }}
            />
          </div>
        </div>
      )}

      {/* Prompt Body Textarea */}
      <textarea
        value={node.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        rows={4}
        placeholder="Enter prompt template with {{variables}}..."
        style={{
          width: '100%',
          backgroundColor: '#f8fafc',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '10px 12px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          resize: 'none',
          outline: 'none',
          marginBottom: 12,
        }}
      />

      {/* Node Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="badge-neon-purple" style={{ fontSize: 10 }}>
          <Cpu size={10} /> {node.model || 'gemini-2.5-flash'}
        </span>

        <button
          onClick={() => onRun(node)}
          disabled={node.status === 'running'}
          className="btn-cyber-primary"
          style={{ padding: '6px 14px', fontSize: 12 }}
        >
          <Play size={12} fill="#ffffff" />
          <span>{node.status === 'running' ? 'Streaming...' : 'Run ▷'}</span>
        </button>
      </div>

      {/* Right Port Indicator (Output) */}
      <div
        style={{
          position: 'absolute',
          right: -7,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: 'var(--neon-cyan)',
          border: '2px solid #ffffff',
        }}
      />
    </div>
  );
};
