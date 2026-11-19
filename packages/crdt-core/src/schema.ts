/**
 * Flat Yjs Document Schema for Minge AI (Invariants 3, 4, 7)
 *
 * - Flat `nodes: Y.Map<Y.Map>` keyed by nodeId (never nested Y.Array trees)
 * - Flat `edges: Y.Map<Y.Map>` keyed by edgeId
 * - Explicit soft-delete fields (`deletedAt`, `deletedBy`) — NEVER call nodes.delete()
 * - Character-level `Y.Text` for prompt/document content
 */
import * as Y from 'yjs';
import { generateSortKeyBetween } from './fractional-index.js';

export const NODES_MAP_KEY = 'nodes';
export const EDGES_MAP_KEY = 'edges';
export const ROOT_PARENT_ID = '__ROOT__';
export const SOFT_DELETE_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;

export type NodeMap = Y.Map<unknown>;
export type EdgeMap = Y.Map<unknown>;

export interface CreateNodeInput {
  id: string;
  parentId?: string | null;
  sortKey?: string;
  prevSortKey?: string | null;
  nextSortKey?: string | null;
  clientId?: number | string;
  content?: string;
  props?: Record<string, unknown>;
}

export interface CreateEdgeInput {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  props?: Record<string, unknown>;
}

export function getNodesMap(doc: Y.Doc): Y.Map<NodeMap> {
  return doc.getMap<NodeMap>(NODES_MAP_KEY);
}

export function getEdgesMap(doc: Y.Doc): Y.Map<EdgeMap> {
  return doc.getMap<EdgeMap>(EDGES_MAP_KEY);
}

export function getNodeParentEdges(nodeMap: NodeMap): Y.Map<number> {
  const edges = nodeMap.get('parentEdges');
  if (edges instanceof Y.Map) {
    return edges as Y.Map<number>;
  }
  const fresh = new Y.Map<number>();
  nodeMap.set('parentEdges', fresh);
  return fresh;
}

export function getNodeContentText(nodeMap: NodeMap): Y.Text {
  const content = nodeMap.get('content');
  if (content instanceof Y.Text) {
    return content;
  }
  const fresh = new Y.Text();
  if (typeof content === 'string' && content.length > 0) {
    fresh.insert(0, content);
  }
  nodeMap.set('content', fresh);
  return fresh;
}

export function getNodePropsMap(nodeMap: NodeMap): Y.Map<unknown> {
  const props = nodeMap.get('props');
  if (props instanceof Y.Map) {
    return props;
  }
  const fresh = new Y.Map<unknown>();
  nodeMap.set('props', fresh);
  return fresh;
}

/**
 * Create a new node inside the flat `nodes` Y.Map.
 */
export function createNode(
  doc: Y.Doc,
  input: CreateNodeInput,
  origin?: unknown
): NodeMap {
  const nodes = getNodesMap(doc);
  const sortKey =
    input.sortKey ??
    generateSortKeyBetween(
      input.prevSortKey ?? null,
      input.nextSortKey ?? null,
      input.clientId ?? doc.clientID
    );

  let created!: NodeMap;

  doc.transact(() => {
    const nodeMap: NodeMap = new Y.Map<unknown>();
    const parentEdges = new Y.Map<number>();
    parentEdges.set(input.parentId ?? ROOT_PARENT_ID, 1);

    const content = new Y.Text();
    if (input.content) {
      content.insert(0, input.content);
    }

    const props = new Y.Map<unknown>();
    if (input.props) {
      for (const [k, v] of Object.entries(input.props)) {
        props.set(k, v);
      }
    }

    nodeMap.set('id', input.id);
    nodeMap.set('parentEdges', parentEdges);
    nodeMap.set('sortKey', sortKey);
    nodeMap.set('content', content);
    nodeMap.set('props', props);
    nodeMap.set('deletedAt', null);
    nodeMap.set('deletedBy', null);

    nodes.set(input.id, nodeMap);
    created = nodeMap;
  }, origin);

  return created;
}

/**
 * Soft-delete a node (Invariant 4 & 7).
 * NEVER calls `nodes.delete(nodeId)` so 30-day recovery & actor metadata are preserved.
 */
export function softDeleteNode(
  doc: Y.Doc,
  nodeId: string,
  actorId: string,
  now = Date.now(),
  origin?: unknown
): boolean {
  const nodeMap = getNodesMap(doc).get(nodeId);
  if (!nodeMap) return false;

  doc.transact(() => {
    nodeMap.set('deletedAt', now);
    nodeMap.set('deletedBy', actorId);
  }, origin);

  return true;
}

export function isWithinRecoveryWindow(deletedAt: number | null, now = Date.now()): boolean {
  if (deletedAt === null) return false;
  return now - deletedAt <= SOFT_DELETE_RECOVERY_MS;
}

/**
 * Restore a soft-deleted node within the 30-day recovery window.
 */
export function restoreNode(
  doc: Y.Doc,
  nodeId: string,
  now = Date.now(),
  origin?: unknown
): boolean {
  const nodeMap = getNodesMap(doc).get(nodeId);
  if (!nodeMap) return false;

  const deletedAt = nodeMap.get('deletedAt');
  if (typeof deletedAt !== 'number' || !isWithinRecoveryWindow(deletedAt, now)) {
    return false;
  }

  doc.transact(() => {
    nodeMap.set('deletedAt', null);
    nodeMap.set('deletedBy', null);
  }, origin);

  return true;
}

/**
 * Append a streamed AI chunk to a node's Y.Text under attributed origin `'ai-peer:<jobId>'`.
 */
export function appendAiChunkToNode(
  doc: Y.Doc,
  nodeId: string,
  chunk: string,
  jobId: string
): boolean {
  const nodeMap = getNodesMap(doc).get(nodeId);
  if (!nodeMap) return false;

  doc.transact(() => {
    const content = getNodeContentText(nodeMap);
    content.insert(content.length, chunk);
  }, `ai-peer:${jobId}`);

  return true;
}

export function createEdge(
  doc: Y.Doc,
  input: CreateEdgeInput,
  origin?: unknown
): EdgeMap {
  const edges = getEdgesMap(doc);
  let created!: EdgeMap;

  doc.transact(() => {
    const edgeMap: EdgeMap = new Y.Map<unknown>();
    const props = new Y.Map<unknown>();
    if (input.props) {
      for (const [k, v] of Object.entries(input.props)) {
        props.set(k, v);
      }
    }

    edgeMap.set('id', input.id);
    edgeMap.set('fromNodeId', input.fromNodeId);
    edgeMap.set('toNodeId', input.toNodeId);
    edgeMap.set('props', props);
    edgeMap.set('deletedAt', null);
    edgeMap.set('deletedBy', null);

    edges.set(input.id, edgeMap);
    created = edgeMap;
  }, origin);

  return created;
}

export function softDeleteEdge(
  doc: Y.Doc,
  edgeId: string,
  actorId: string,
  now = Date.now(),
  origin?: unknown
): boolean {
  const edgeMap = getEdgesMap(doc).get(edgeId);
  if (!edgeMap) return false;

  doc.transact(() => {
    edgeMap.set('deletedAt', now);
    edgeMap.set('deletedBy', actorId);
  }, origin);

  return true;
}
