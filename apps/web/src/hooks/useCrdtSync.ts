import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CanvasNodeData {
  id: string;
  type: 'prompt' | 'output' | 'document' | 'memory';
  x: number;
  y: number;
  width?: number;
  height?: number;
  title: string;
  content: string;
  model?: string;
  temperature?: number;
  tokens?: number;
  latency?: string;
  memoryId?: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
  sourceNodeId?: string;
}

export interface CanvasEdgeData {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  isActive?: boolean;
}

export interface PeerCursor {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  isTyping?: boolean;
  selectedNodeId?: string | null;
  lastActive: number;
}

export const PEER_PALETTES = [
  { name: 'Alice (Lead)', color: '#EB1000' },
  { name: 'Bob (ML Eng)', color: '#000000' },
  { name: 'Carol (Design)', color: '#4D4D4D' },
  { name: 'Dave (Backend)', color: '#1A1A1A' },
];

export function useCrdtSync(projectId: string, documentId: string, currentUser: { id: string; name: string; color: string }) {
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [edges, setEdges] = useState<CanvasEdgeData[]>([]);
  const [peers, setPeers] = useState<PeerCursor[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const roomId = `${projectId}:${documentId}`;

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;

    const yNodes = doc.getMap<CanvasNodeData>('nodes');
    const yEdges = doc.getMap<CanvasEdgeData>('edges');

    // Initial default layout if map is empty
    if (yNodes.size === 0) {
      const defaultNodes: CanvasNodeData[] = [
        {
          id: 'node-prompt-1',
          type: 'prompt',
          x: 80,
          y: 120,
          title: 'System Architecture Prompt',
          content: 'You are the Minge platform assistant. Summarize architectural invariants for: {{module_name}}',
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          status: 'idle',
        },
        {
          id: 'node-output-1',
          type: 'output',
          x: 520,
          y: 100,
          title: 'AI Output (Evaluated)',
          content: 'Invariant 1 verified: zero-bleed memory isolation with fail-closed queries.\nInvariant 2: append-only prompt package versioning enabled.',
          tokens: 384,
          latency: '0.94s',
          status: 'completed',
        },
        {
          id: 'node-doc-1',
          type: 'document',
          x: 80,
          y: 440,
          title: 'PRD_v1.0_Architecture.md',
          content: 'Extracted 12 memory chunks. All vectors 1536-dim synced with pgvector store.',
          status: 'completed',
        },
        {
          id: 'node-mem-1',
          type: 'memory',
          x: 520,
          y: 450,
          title: 'Grounded Memory Capsule #914',
          content: 'Hard project_id scoping constraint at query builder layer. Fails closed when missing.',
          memoryId: 'mem_arch_001',
          status: 'completed',
        },
      ];

      doc.transact(() => {
        defaultNodes.forEach((n) => yNodes.set(n.id, n));
        yEdges.set('edge-1', { id: 'edge-1', fromNodeId: 'node-prompt-1', toNodeId: 'node-output-1', isActive: true });
        yEdges.set('edge-2', { id: 'edge-2', fromNodeId: 'node-doc-1', toNodeId: 'node-mem-1', isActive: false });
      });
    }

    const syncState = () => {
      setNodes(Array.from(yNodes.values()));
      setEdges(Array.from(yEdges.values()));
    };

    yNodes.observe(syncState);
    yEdges.observe(syncState);
    syncState();

    // Try WebSocket connection to sync-server
    try {
      const wsUrl = 'ws://localhost:4000';
      const provider = new WebsocketProvider(wsUrl, roomId, doc, { connect: true });
      providerRef.current = provider;

      provider.on('status', (event: { status: string }) => {
        setIsConnected(event.status === 'connected');
      });

      // Awareness / Presence
      const awareness = provider.awareness;
      awareness.setLocalStateField('user', {
        id: currentUserRef.current.id,
        name: currentUserRef.current.name,
        color: currentUserRef.current.color,
      });

      awareness.on('change', () => {
        const states = awareness.getStates();
        const peerList: PeerCursor[] = [];
        states.forEach((state: any, clientID: number) => {
          if (clientID !== doc.clientID && state.user && state.cursor) {
            peerList.push({
              id: String(clientID),
              name: state.user.name,
              color: state.user.color,
              x: state.cursor.x,
              y: state.cursor.y,
              isTyping: state.isTyping,
              selectedNodeId: state.selectedNodeId,
              lastActive: Date.now(),
            });
          }
        });
        setPeers(peerList);
      });
    } catch {
      setIsConnected(false);
    }

    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
      doc.destroy();
      docRef.current = null;
    };
  }, [roomId]);

  // Update multiplayer presence metadata without resetting the Y.Doc or canvas state
  useEffect(() => {
    providerRef.current?.awareness.setLocalStateField('user', {
      id: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
    });
  }, [currentUser.id, currentUser.name, currentUser.color]);

  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    if (!docRef.current) return;
    const yNodes = docRef.current.getMap<CanvasNodeData>('nodes');
    const existing = yNodes.get(nodeId);
    if (existing) {
      yNodes.set(nodeId, { ...existing, x, y });
    }
  }, []);

  const updateNodeData = useCallback((nodeId: string, partial: Partial<CanvasNodeData>) => {
    if (!docRef.current) return;
    const yNodes = docRef.current.getMap<CanvasNodeData>('nodes');
    const existing = yNodes.get(nodeId);
    if (existing) {
      yNodes.set(nodeId, { ...existing, ...partial });
    }
  }, []);

  const addNode = useCallback((node: CanvasNodeData) => {
    if (!docRef.current) return;
    const yNodes = docRef.current.getMap<CanvasNodeData>('nodes');
    yNodes.set(node.id, node);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    if (!docRef.current) return;
    const yNodes = docRef.current.getMap<CanvasNodeData>('nodes');
    const yEdges = docRef.current.getMap<CanvasEdgeData>('edges');
    yNodes.delete(nodeId);
    // Also remove connected edges
    Array.from(yEdges.entries()).forEach(([k, edge]) => {
      if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
        yEdges.delete(k);
      }
    });
  }, []);

  const addEdge = useCallback((fromNodeId: string, toNodeId: string) => {
    if (!docRef.current) return;
    const yEdges = docRef.current.getMap<CanvasEdgeData>('edges');
    const edgeId = `edge-${Date.now()}`;
    yEdges.set(edgeId, { id: edgeId, fromNodeId, toNodeId, isActive: true });
  }, []);

  const broadcastCursor = useCallback((x: number, y: number, isTyping = false, selectedNodeId: string | null = null) => {
    if (providerRef.current?.awareness) {
      providerRef.current.awareness.setLocalStateField('cursor', { x, y });
      providerRef.current.awareness.setLocalStateField('isTyping', isTyping);
      providerRef.current.awareness.setLocalStateField('selectedNodeId', selectedNodeId);
    }
  }, []);

  return {
    nodes,
    edges,
    peers,
    isConnected,
    updateNodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    addEdge,
    broadcastCursor,
  };
}
