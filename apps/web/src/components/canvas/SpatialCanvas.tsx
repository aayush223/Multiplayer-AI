import React, { useState, useRef, useEffect } from 'react';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Share2,
  Code2,
  Users,
  Sparkles,
  Database,
  FileText,
} from 'lucide-react';
import { CanvasNodeData, CanvasEdgeData, PeerCursor } from '../../hooks/useCrdtSync';
import { ConnectionCables } from './ConnectionCables';
import { PromptNode } from './PromptNode';
import { AIOutputNode } from './AIOutputNode';
import { DocumentDropNode } from './DocumentDropNode';
import { MemoryCapsuleNode } from './MemoryCapsuleNode';
import { MultiplayerPresence } from './MultiplayerPresence';
import { defaultApiClient } from '../../services/apiClient';

interface SpatialCanvasProps {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
  peers: PeerCursor[];
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void;
  onUpdateNodeData: (nodeId: string, partial: Partial<CanvasNodeData>) => void;
  onAddNode: (node: CanvasNodeData) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddEdge: (fromId: string, toId: string) => void;
  onBroadcastCursor: (x: number, y: number, isTyping?: boolean, selectedNodeId?: string | null) => void;
  onSwitchToIde: () => void;
  onBranchToIde: (node: CanvasNodeData) => void;
  onRaiseTicket?: (node: CanvasNodeData) => void;
  onPinMemory: (content: string) => void;
  projectId: string;
  currentUser: { id: string; name: string; color: string };
  onSwitchUser: (user: { id: string; name: string; color: string }) => void;
}

export const SpatialCanvas: React.FC<SpatialCanvasProps> = ({
  nodes,
  edges,
  peers,
  onUpdateNodePosition,
  onUpdateNodeData,
  onAddNode,
  onDeleteNode,
  onAddEdge,
  onBroadcastCursor,
  onSwitchToIde,
  onBranchToIde,
  onRaiseTicket,
  onPinMemory,
  projectId,
  currentUser,
  onSwitchUser,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Non-passive wheel listener to zoom smoothly without browser passive-listener console errors
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * -0.001;
      setZoom((prev) => parseFloat(Math.min(Math.max(prev + zoomDelta, 0.4), 2.0).toFixed(2)));
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  const handleShareRoom = () => {
    const shareUrl = `${window.location.origin}/?project=${encodeURIComponent(projectId)}&surface=canvas`;
    void navigator.clipboard?.writeText(shareUrl);
    setCopiedRoomLink(true);
    setTimeout(() => setCopiedRoomLink(false), 2000);
  };

  // Pan canvas on empty space drag
  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicked on a drag-handle of a card, handle in node drag
    const target = e.target as HTMLElement;
    const handle = target.closest('.drag-handle');
    if (handle) {
      const card = target.closest('[data-node-id]');
      if (card) {
        const id = card.getAttribute('data-node-id');
        if (id) {
          const node = nodes.find((n) => n.id === id);
          if (node) {
            setDraggingNodeId(id);
            setSelectedNodeId(id);
            setNodeDragOffset({
              x: (e.clientX - pan.x) / zoom - node.x,
              y: (e.clientY - pan.y) / zoom - node.y,
            });
            return;
          }
        }
      }
    }

    if (e.button === 0 && !target.closest('.adobe-card, button, select, input, textarea')) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvasX = (e.clientX - pan.x) / zoom;
    const canvasY = (e.clientY - pan.y) / zoom;
    onBroadcastCursor(canvasX, canvasY, false, selectedNodeId);

    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggingNodeId) {
      const newX = canvasX - nodeDragOffset.x;
      const newY = canvasY - nodeDragOffset.y;
      onUpdateNodePosition(draggingNodeId, Math.round(newX), Math.round(newY));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Node Actions
  const handleRunPrompt = async (node: CanvasNodeData) => {
    onUpdateNodeData(node.id, { status: 'running' });

    let outputNode = nodes.find((n) => n.type === 'output' && n.sourceNodeId === node.id);
    if (!outputNode) {
      const newOutputId = `node-output-${Date.now()}`;
      outputNode = {
        id: newOutputId,
        type: 'output',
        x: node.x + 420,
        y: node.y,
        title: `Output (${node.model || 'gemini-2.5-flash'})`,
        content: '',
        tokens: 0,
        status: 'running',
        sourceNodeId: node.id,
      };
      onAddNode(outputNode);
      onAddEdge(node.id, newOutputId);
    }

    const targetOutputId = outputNode.id;

    await defaultApiClient.executeStreamingCompletion(
      projectId,
      {
        model: node.model || 'gemini-2.5-flash',
        messages: [{ role: 'user', content: node.content }],
        temperature: node.temperature ?? 0.7,
      },
      (chunk) => {
        onUpdateNodeData(targetOutputId, { content: chunk, status: 'running' });
      },
      (fullText, metrics) => {
        onUpdateNodeData(node.id, { status: 'completed' });
        onUpdateNodeData(targetOutputId, {
          content: fullText,
          status: 'completed',
          tokens: metrics.tokens,
          latency: `${(metrics.latencyMs / 1000).toFixed(2)}s`,
        });
      },
      (err) => {
        onUpdateNodeData(node.id, { status: 'error' });
        onUpdateNodeData(targetOutputId, {
          content: `Execution failed: ${err.message}`,
          status: 'error',
        });
      }
    );
  };

  const handleAddPromptNode = () => {
    const id = `node-prompt-${Date.now()}`;
    onAddNode({
      id,
      type: 'prompt',
      x: (-pan.x + 200) / zoom,
      y: (-pan.y + 200) / zoom,
      title: 'New Prompt Node',
      content: 'Summarize key requirements for: {{feature}}',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      status: 'idle',
    });
  };

  const handleAddDocumentNode = () => {
    const id = `node-doc-${Date.now()}`;
    onAddNode({
      id,
      type: 'document',
      x: (-pan.x + 200) / zoom,
      y: (-pan.y + 450) / zoom,
      title: 'Project_Specification.md',
      content: 'Architecture rules: Fail-closed memory scoping, Yjs room isolation.',
      status: 'completed',
    });
  };

  const handleAddMemoryCapsule = () => {
    const id = `node-mem-${Date.now()}`;
    onAddNode({
      id,
      type: 'memory',
      x: (-pan.x + 600) / zoom,
      y: (-pan.y + 450) / zoom,
      title: 'Grounded Memory Capsule',
      content: 'Database security: Row Level Security enabled on minge schema.',
      status: 'completed',
    });
  };

  return (
    <div
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="adobe-canvas-grid"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: isPanning ? 'grabbing' : 'default',
      }}
    >
      {/* Top Floating Canvas Utility Strip */}
      <header
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          height: 52,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-neutral)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          zIndex: 60,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Left: Title & Project */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
            }}
          >
            AI Canvas
          </span>
          <span className="adobe-chip" style={{ fontSize: 11 }}>
            Project: {projectId}
          </span>
        </div>

        {/* Center: Multiplayer Collaborators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-primary-70)' }}>
            <Users size={14} color="var(--color-secondary)" />
            <span>Multiplayer Presence:</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { id: 'user_alice', name: 'Alice', color: '#EB1000' },
              { id: 'user_bob', name: 'Bob', color: '#000000' },
              { id: 'user_carol', name: 'Carol', color: '#4D4D4D' },
            ].map((u) => {
              const isSelected = currentUser.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => onSwitchUser(u)}
                  title={`Switch Identity to ${u.name}`}
                  style={{
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: isSelected ? u.color : 'var(--color-surface-10)',
                    color: isSelected ? 'var(--color-tertiary)' : 'var(--color-on-surface)',
                    border: `1px solid ${isSelected ? u.color : 'var(--color-neutral)'}`,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Actions & Switch to Prompt IDE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleShareRoom}
            className={copiedRoomLink ? 'adobe-btn-red' : 'adobe-btn-outline'}
            style={{ height: 34, padding: '0 16px', fontSize: 13 }}
          >
            <Share2 size={13} />
            <span>{copiedRoomLink ? 'Link Copied' : 'Share Room'}</span>
          </button>

          <button
            onClick={onSwitchToIde}
            className="adobe-btn-dark"
            style={{ height: 34, padding: '0 16px', fontSize: 13 }}
          >
            <Code2 size={14} />
            <span>Open in Prompt IDE</span>
          </button>
        </div>
      </header>

      {/* Spatial Transformed Viewport */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          transition: isPanning ? 'none' : 'transform 0.05s ease-out',
        }}
      >
        {/* Render Connection Cables */}
        <ConnectionCables edges={edges} nodes={nodes} zoom={zoom} />

        {/* Render Canvas Nodes */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                cursor: 'default',
                zIndex: isSelected ? 20 : 10,
              }}
            >
              {node.type === 'prompt' && (
                <PromptNode
                  node={node}
                  onUpdate={(p) => onUpdateNodeData(node.id, p)}
                  onDelete={() => onDeleteNode(node.id)}
                  onRun={handleRunPrompt}
                  onRaiseTicket={onRaiseTicket}
                  isSelected={isSelected}
                />
              )}
              {node.type === 'output' && (
                <AIOutputNode
                  node={node}
                  onUpdate={(p) => onUpdateNodeData(node.id, p)}
                  onDelete={() => onDeleteNode(node.id)}
                  onBranchToIde={onBranchToIde}
                  onPinAsMemory={(n) => onPinMemory(n.content)}
                  isSelected={isSelected}
                />
              )}
              {node.type === 'document' && (
                <DocumentDropNode
                  node={node}
                  onUpdate={(p) => onUpdateNodeData(node.id, p)}
                  onDelete={() => onDeleteNode(node.id)}
                  onIngest={(c) => onPinMemory(c)}
                  isSelected={isSelected}
                />
              )}
              {node.type === 'memory' && (
                <MemoryCapsuleNode
                  node={node}
                  onUpdate={(p) => onUpdateNodeData(node.id, p)}
                  onDelete={() => onDeleteNode(node.id)}
                  isSelected={isSelected}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Multiplayer Live Cursors */}
      <MultiplayerPresence peers={peers} zoom={zoom} pan={pan} />

      {/* Stark Black Floating Pill Canvas Toolbar */}
      <footer
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          height: 52,
          backgroundColor: 'var(--color-primary)',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          zIndex: 60,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.16)',
        }}
      >
        {/* Add Nodes */}
        <button onClick={handleAddPromptNode} className="adobe-btn-primary" style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}>
          <Sparkles size={13} color="var(--color-secondary)" />
          <span>+ Prompt Node</span>
        </button>
        <button onClick={handleAddDocumentNode} className="adobe-btn-secondary" style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}>
          <FileText size={13} />
          <span>+ Document Drop</span>
        </button>
        <button onClick={handleAddMemoryCapsule} className="adobe-btn-secondary" style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}>
          <Database size={13} />
          <span>+ Memory Capsule</span>
        </button>

        <div style={{ width: 1, height: 22, backgroundColor: 'var(--color-primary-70)' }} />

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-tertiary)', padding: '0 4px' }}>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.4))}
            title="Zoom Out"
            style={{ background: 'none', border: 'none', color: 'var(--color-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ZoomOut size={15} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 42, textAlign: 'center', color: 'var(--color-tertiary)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.1, 2.0))}
            title="Zoom In"
            style={{ background: 'none', border: 'none', color: 'var(--color-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ZoomIn size={15} />
          </button>
        </div>

        <div style={{ width: 1, height: 22, backgroundColor: 'var(--color-primary-70)' }} />

        {/* Reset View */}
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          title="Reset Viewport"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-tertiary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
          }}
        >
          <RotateCcw size={15} />
        </button>
      </footer>
    </div>
  );
};
