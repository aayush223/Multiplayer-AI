import React, { useState } from 'react';
import { Play, Sparkles, Sliders, Trash2, Cpu, GripVertical, Ticket } from 'lucide-react';
import { CanvasNodeData } from '../../hooks/useCrdtSync';

interface PromptNodeProps {
  node: CanvasNodeData;
  onUpdate: (partial: Partial<CanvasNodeData>) => void;
  onDelete: () => void;
  onRun: (node: CanvasNodeData) => void;
  onRaiseTicket?: (node: CanvasNodeData) => void;
  isSelected?: boolean;
}

export const PromptNode: React.FC<PromptNodeProps> = ({
  node,
  onUpdate,
  onDelete,
  onRun,
  onRaiseTicket,
  isSelected,
}) => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div
      className="adobe-card"
      style={{
        width: 360,
        padding: 16,
        backgroundColor: 'var(--color-surface)',
        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-neutral)',
        borderTop: '3px solid var(--color-primary)',
      }}
    >
      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: '1px solid var(--color-neutral)',
          cursor: 'grab',
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GripVertical size={14} color="var(--color-primary-40)" />
          <Sparkles size={15} color="var(--color-primary)" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-on-surface)',
              fontWeight: 700,
              fontSize: 14,
              outline: 'none',
              width: 190,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            title="Configure Model Parameters"
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: showConfig ? 'var(--color-surface-10)' : 'transparent',
              border: 'none',
              color: 'var(--color-primary-70)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sliders size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Delete Node"
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
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
            padding: 12,
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-10)',
            border: '1px solid var(--color-neutral)',
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <label style={{ color: 'var(--color-primary-70)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Model Provider
            </label>
            <select
              value={node.model || 'gemini-2.5-flash'}
              onChange={(e) => onUpdate({ model: e.target.value })}
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-neutral)',
                color: 'var(--color-on-surface)',
                fontSize: 12,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="groq/llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
              <option value="openai/gpt-4o">OpenAI GPT-4o</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-primary-70)', fontWeight: 700 }}>
            <span>Temp: {node.temperature ?? 0.7}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={node.temperature ?? 0.7}
              onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
              style={{ width: 130, accentColor: 'var(--color-secondary)' }}
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
          backgroundColor: 'var(--color-surface-10)',
          border: '1px solid var(--color-neutral)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          color: 'var(--color-on-surface)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.55,
          resize: 'none',
          outline: 'none',
          marginBottom: 12,
        }}
      />

      {/* Node Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="adobe-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
          <Cpu size={11} /> {node.model || 'gemini-2.5-flash'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onRaiseTicket && (
            <button
              onClick={() => onRaiseTicket(node)}
              title="Raise approval ticket for manager review"
              className="adobe-btn-outline"
              style={{ height: 32, padding: '0 10px', fontSize: 12 }}
            >
              <Ticket size={12} />
              <span>Ticket</span>
            </button>
          )}
          <button
            onClick={() => onRun(node)}
            disabled={node.status === 'running'}
            className="adobe-btn-red"
            style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
          >
            <Play size={12} fill="#FFFFFF" />
            <span>{node.status === 'running' ? 'Streaming...' : 'Run'}</span>
          </button>
        </div>
      </div>

      {/* Right Port Indicator (Output) */}
      <div
        style={{
          position: 'absolute',
          right: -7,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-primary)',
          border: '2px solid var(--color-surface)',
        }}
      />
    </div>
  );
};
