/**
 * Mutable Tree Projection & Concurrent Move Handler (Invariant 4)
 *
 * - `moveNode`: Updates `parentEdges` with a monotonically increasing local counter
 *   and assigns a fractional-indexed `sortKey` with deterministic `clientId` tie-breaker.
 * - `resolveTree`: Pure, read-only projection over the synced `nodes` Y.Map.
 *   Breaks concurrent cycles by ignoring the edge with the lower `(counter, nodeId)`
 *   and falling back to the next-highest valid parent in `parentEdges`.
 *   Hides any subtree whose ancestor has `deletedAt !== null` (tombstone-wins).
 */
import * as Y from 'yjs';
import { compareCodePoints, generateSortKeyBetween } from './fractional-index.js';
import {
  ROOT_PARENT_ID,
  getNodeParentEdges,
  getNodesMap,
  type NodeMap,
} from './schema.js';

export interface ParentEdgeCandidate {
  parentId: string;
  counter: number;
}

export interface BrokenCycleEdge {
  nodeId: string;
  ignoredParentId: string;
  counter: number;
}

export interface ProjectedNode {
  id: string;
  parentId: string | null;
  sortKey: string;
  content: string;
  props: Record<string, unknown>;
  deletedAt: number | null;
  deletedBy: string | null;
  effectivelyDeleted: boolean;
  children: ProjectedNode[];
}

export interface ResolvedTree {
  roots: ProjectedNode[];
  nodesById: Record<string, ProjectedNode>;
  hiddenNodeIds: string[];
  brokenCycles: BrokenCycleEdge[];
}

/** Return the highest counter currently stored in a node's parentEdges map. */
export function getMaxParentCounter(nodeMap: NodeMap): number {
  const parentEdges = nodeMap.get('parentEdges');
  if (!(parentEdges instanceof Y.Map)) return 0;

  let max = 0;
  parentEdges.forEach((value) => {
    if (typeof value === 'number' && value > max) {
      max = value;
    }
  });
  return max;
}

/**
 * Move a node to a new parent and fractional-indexed sibling position.
 */
export function moveNode(
  doc: Y.Doc,
  nodeId: string,
  newParentId: string | null,
  prevSortKey: string | null,
  nextSortKey: string | null,
  clientId: number | string,
  origin?: unknown
): { counter: number; sortKey: string } {
  const nodes = getNodesMap(doc);
  const nodeMap = nodes.get(nodeId);
  if (!nodeMap) {
    throw new Error(`Node "${nodeId}" not found in Y.Doc`);
  }
  if (newParentId === nodeId) {
    throw new Error(`Cannot move node "${nodeId}" under itself`);
  }

  const nextCounter = getMaxParentCounter(nodeMap) + 1;
  const sortKey = generateSortKeyBetween(prevSortKey, nextSortKey, clientId);
  const targetParent = newParentId ?? ROOT_PARENT_ID;

  doc.transact(() => {
    const parentEdges = getNodeParentEdges(nodeMap);
    parentEdges.set(targetParent, nextCounter);
    nodeMap.set('sortKey', sortKey);
  }, origin);

  return { counter: nextCounter, sortKey };
}

interface RawNodeState {
  id: string;
  candidates: ParentEdgeCandidate[];
  candidateIdx: number;
  sortKey: string;
  content: string;
  props: Record<string, unknown>;
  deletedAt: number | null;
  deletedBy: string | null;
}

function getActiveEdge(node: RawNodeState): ParentEdgeCandidate {
  if (node.candidateIdx < node.candidates.length) {
    return node.candidates[node.candidateIdx];
  }
  return { parentId: ROOT_PARENT_ID, counter: 0 };
}

/**
 * Pure, deterministic read-only projection from a flat `nodes` Y.Map into a valid tree.
 * Never writes back into Yjs.
 */
export function resolveTree(nodesMap: Y.Map<NodeMap>): ResolvedTree {
  const rawNodes = new Map<string, RawNodeState>();

  // 1. Collect immutable snapshot of all nodes
  nodesMap.forEach((nodeMap, mapKey) => {
    if (!(nodeMap instanceof Y.Map)) return;
    const idVal = nodeMap.get('id');
    const id = typeof idVal === 'string' && idVal.length > 0 ? idVal : mapKey;

    const rawCandidates: ParentEdgeCandidate[] = [];
    const parentEdges = nodeMap.get('parentEdges');
    if (parentEdges instanceof Y.Map) {
      parentEdges.forEach((counter, parentId) => {
        if (typeof counter === 'number' && typeof parentId === 'string' && parentId !== id) {
          rawCandidates.push({ parentId, counter });
        }
      });
    }

    // Highest (counter, parentId) first for deterministic tie-breaking
    rawCandidates.sort((a, b) => {
      if (b.counter !== a.counter) return b.counter - a.counter;
      return compareCodePoints(b.parentId, a.parentId);
    });

    const contentVal = nodeMap.get('content');
    const content =
      contentVal instanceof Y.Text
        ? contentVal.toString()
        : typeof contentVal === 'string'
        ? contentVal
        : '';

    const propsObj: Record<string, unknown> = {};
    const propsVal = nodeMap.get('props');
    if (propsVal instanceof Y.Map) {
      propsVal.forEach((val, key) => {
        propsObj[key] = val;
      });
    }

    const sortKeyVal = nodeMap.get('sortKey');
    const deletedAtVal = nodeMap.get('deletedAt');
    const deletedByVal = nodeMap.get('deletedBy');

    rawNodes.set(id, {
      id,
      candidates: rawCandidates,
      candidateIdx: 0,
      sortKey: typeof sortKeyVal === 'string' ? sortKeyVal : '',
      content,
      props: propsObj,
      deletedAt: typeof deletedAtVal === 'number' ? deletedAtVal : null,
      deletedBy: typeof deletedByVal === 'string' ? deletedByVal : null,
    });
  });

  // Filter out candidates pointing to non-existent parents (keep ROOT_PARENT_ID)
  for (const node of rawNodes.values()) {
    node.candidates = node.candidates.filter(
      (c) => c.parentId === ROOT_PARENT_ID || rawNodes.has(c.parentId)
    );
  }

  const sortedIds = Array.from(rawNodes.keys()).sort(compareCodePoints);
  const brokenCycles: BrokenCycleEdge[] = [];

  // 2. Deterministic cycle elimination: lower (counter, nodeId) edge yields first
  while (true) {
    let foundCycle: string[] | null = null;
    const visitState = new Map<string, number>(); // 0 = unvisited, 1 = visiting, 2 = done

    for (const startId of sortedIds) {
      if ((visitState.get(startId) ?? 0) !== 0) continue;

      const path: string[] = [];
      const pathIndex = new Map<string, number>();
      let curr: string | null = startId;

      while (curr !== null && curr !== ROOT_PARENT_ID) {
        const state = visitState.get(curr) ?? 0;
        if (state === 2) break;
        if (state === 1) {
          const cycleStart = pathIndex.get(curr)!;
          foundCycle = path.slice(cycleStart);
          break;
        }

        visitState.set(curr, 1);
        pathIndex.set(curr, path.length);
        path.push(curr);

        const node = rawNodes.get(curr);
        if (!node) break;
        const active = getActiveEdge(node);
        curr = active.parentId === ROOT_PARENT_ID ? null : active.parentId;
      }

      if (foundCycle) break;

      for (const visitedId of path) {
        visitState.set(visitedId, 2);
      }
    }

    if (!foundCycle) break;

    // Pick the edge with the lowest (counter, nodeId) to ignore
    let weakestNodeId = foundCycle[0];
    let weakestEdge = getActiveEdge(rawNodes.get(weakestNodeId)!);

    for (let i = 1; i < foundCycle.length; i++) {
      const candidateNodeId = foundCycle[i];
      const candidateEdge = getActiveEdge(rawNodes.get(candidateNodeId)!);
      if (
        candidateEdge.counter < weakestEdge.counter ||
        (candidateEdge.counter === weakestEdge.counter &&
          compareCodePoints(candidateNodeId, weakestNodeId) < 0)
      ) {
        weakestNodeId = candidateNodeId;
        weakestEdge = candidateEdge;
      }
    }

    brokenCycles.push({
      nodeId: weakestNodeId,
      ignoredParentId: weakestEdge.parentId,
      counter: weakestEdge.counter,
    });

    const weakestNode = rawNodes.get(weakestNodeId)!;
    weakestNode.candidateIdx++;
  }

  // 3. Tombstone-wins propagation (walk resolved acyclic ancestors)
  const deletedMemo = new Map<string, boolean>();
  const isEffectivelyDeleted = (id: string): boolean => {
    const cached = deletedMemo.get(id);
    if (cached !== undefined) return cached;

    const node = rawNodes.get(id);
    if (!node) return false;
    if (node.deletedAt !== null) {
      deletedMemo.set(id, true);
      return true;
    }

    const active = getActiveEdge(node);
    const hidden =
      active.parentId !== ROOT_PARENT_ID && isEffectivelyDeleted(active.parentId);
    deletedMemo.set(id, hidden);
    return hidden;
  };

  const nodesById: Record<string, ProjectedNode> = {};
  const hiddenNodeIds: string[] = [];

  for (const id of sortedIds) {
    const node = rawNodes.get(id)!;
    const active = getActiveEdge(node);
    const effectivelyDeleted = isEffectivelyDeleted(id);
    if (effectivelyDeleted) {
      hiddenNodeIds.push(id);
    }

    nodesById[id] = {
      id: node.id,
      parentId: active.parentId === ROOT_PARENT_ID ? null : active.parentId,
      sortKey: node.sortKey,
      content: node.content,
      props: node.props,
      deletedAt: node.deletedAt,
      deletedBy: node.deletedBy,
      effectivelyDeleted,
      children: [],
    };
  }

  // 4. Assemble active tree with deterministic (sortKey, id) sibling ordering
  const roots: ProjectedNode[] = [];
  for (const id of sortedIds) {
    const projected = nodesById[id];
    if (projected.effectivelyDeleted) continue;

    if (projected.parentId === null) {
      roots.push(projected);
    } else {
      const parent = nodesById[projected.parentId];
      if (parent && !parent.effectivelyDeleted) {
        parent.children.push(projected);
      } else {
        roots.push(projected);
      }
    }
  }

  const compareSiblings = (a: ProjectedNode, b: ProjectedNode): number => {
    const keyCmp = compareCodePoints(a.sortKey, b.sortKey);
    return keyCmp !== 0 ? keyCmp : compareCodePoints(a.id, b.id);
  };

  roots.sort(compareSiblings);
  for (const node of Object.values(nodesById)) {
    if (node.children.length > 1) {
      node.children.sort(compareSiblings);
    }
  }

  return {
    roots,
    nodesById,
    hiddenNodeIds,
    brokenCycles,
  };
}
