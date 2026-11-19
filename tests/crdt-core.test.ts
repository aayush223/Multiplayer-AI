/**
 * @minge/crdt-core Tests — Invariants 3, 4, 5, 7
 *
 * Verifies deterministic multiplayer CRDT convergence across offline concurrent Y.Docs:
 *  (a) Concurrent parent moves forming a cycle (A -> B vs B -> A)
 *  (b) Concurrent sibling insertions at the exact same index
 *  (c) Concurrent parent soft-delete vs child creation (tombstone-wins & 30-day recovery)
 *  (d) Attributed AI peer writes ('ai-peer:<jobId>') preserving human Y.UndoManager isolation
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  SOFT_DELETE_RECOVERY_MS,
  appendAiChunkToNode,
  compareCodePoints,
  createNode,
  generateSortKeyBetween,
  getNodeContentText,
  getNodesMap,
  moveNode,
  resolveTree,
  restoreNode,
  softDeleteNode,
} from '@minge/crdt-core';

function syncDocs(doc1: Y.Doc, doc2: Y.Doc): void {
  const sv1 = Y.encodeStateVector(doc1);
  const sv2 = Y.encodeStateVector(doc2);
  const diff1 = Y.encodeStateAsUpdate(doc1, sv2);
  const diff2 = Y.encodeStateAsUpdate(doc2, sv1);
  Y.applyUpdate(doc1, diff2);
  Y.applyUpdate(doc2, diff1);
}

describe('CRDT Core — Cycle Prevention & Mutable Tree Projection', () => {
  it('converges deterministically on offline concurrent A->B vs B->A cycle collision without mutating Y.Doc', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Shared initial state: node-a and node-b at root
    createNode(doc1, { id: 'node-a', content: 'Node A', clientId: 1 });
    createNode(doc1, { id: 'node-b', content: 'Node B', clientId: 1 });
    syncDocs(doc1, doc2);

    // Offline concurrent moves creating a cycle:
    // Peer 1 moves node-a under node-b (counter = 2)
    // Peer 2 moves node-b under node-a (counter = 2)
    moveNode(doc1, 'node-a', 'node-b', null, null, 101);
    moveNode(doc2, 'node-b', 'node-a', null, null, 202);

    // Sync in opposite orders into two independent replicas to prove order-independence
    const replicaA = new Y.Doc();
    const replicaB = new Y.Doc();
    const u1 = Y.encodeStateAsUpdate(doc1);
    const u2 = Y.encodeStateAsUpdate(doc2);

    Y.applyUpdate(replicaA, u1);
    Y.applyUpdate(replicaA, u2);

    Y.applyUpdate(replicaB, u2);
    Y.applyUpdate(replicaB, u1);

    // Ensure resolveTree is strictly read-only (zero Y.Doc update events fired)
    let mutationsDuringResolve = 0;
    replicaA.on('update', () => {
      mutationsDuringResolve++;
    });

    const treeA = resolveTree(getNodesMap(replicaA));
    const treeB = resolveTree(getNodesMap(replicaB));

    expect(mutationsDuringResolve).toBe(0);
    expect(JSON.stringify(treeA)).toBe(JSON.stringify(treeB));

    // Both moves had counter=2; 'node-a' < 'node-b', so node-a -> node-b yields to node-a's prior parent (root)
    expect(treeA.brokenCycles).toHaveLength(1);
    expect(treeA.brokenCycles[0]).toEqual({
      nodeId: 'node-a',
      ignoredParentId: 'node-b',
      counter: 2,
    });
    expect(treeA.roots.map((n) => n.id)).toEqual(['node-a']);
    expect(treeA.roots[0].children.map((n) => n.id)).toEqual(['node-b']);
  });

  it('breaks cycles using higher counter before falling back to nodeId tie-breaker', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    createNode(doc1, { id: 'node-a', clientId: 1 });
    createNode(doc1, { id: 'node-b', clientId: 1 });
    createNode(doc1, { id: 'node-c', clientId: 1 });
    syncDocs(doc1, doc2);

    // Peer 1 moves node-a twice (counter 2 -> node-c, then counter 3 -> node-b)
    moveNode(doc1, 'node-a', 'node-c', null, null, 101);
    moveNode(doc1, 'node-a', 'node-b', null, null, 101);

    // Peer 2 moves node-b under node-a once (counter 2)
    moveNode(doc2, 'node-b', 'node-a', null, null, 202);

    syncDocs(doc1, doc2);

    const tree1 = resolveTree(getNodesMap(doc1));
    const tree2 = resolveTree(getNodesMap(doc2));

    expect(JSON.stringify(tree1)).toBe(JSON.stringify(tree2));
    // node-b's edge has counter=2 < node-a's counter=3, so node-b's cycle edge is ignored
    expect(tree1.brokenCycles[0]).toEqual({
      nodeId: 'node-b',
      ignoredParentId: 'node-a',
      counter: 2,
    });
    expect(tree1.nodesById['node-b'].parentId).toBeNull();
    expect(tree1.nodesById['node-a'].parentId).toBe('node-b');
  });
});

describe('CRDT Core — Concurrent Sibling Ordering (Fractional Indexing)', () => {
  it('orders concurrent inserts at the exact same position deterministically and allows subsequent midpoint inserts', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const first = createNode(doc1, { id: 'first', clientId: 1 });
    const firstKey = first.get('sortKey') as string;
    const last = createNode(doc1, { id: 'last', prevSortKey: firstKey, clientId: 1 });
    const lastKey = last.get('sortKey') as string;
    syncDocs(doc1, doc2);

    // Both peers offline-insert between `first` and `last` at the exact same bounds
    const left = createNode(doc1, {
      id: 'concurrent-1',
      prevSortKey: firstKey,
      nextSortKey: lastKey,
      clientId: 10,
    });
    const right = createNode(doc2, {
      id: 'concurrent-2',
      prevSortKey: firstKey,
      nextSortKey: lastKey,
      clientId: 25,
    });

    const key1 = left.get('sortKey') as string;
    const key2 = right.get('sortKey') as string;

    expect(key1).not.toBe(key2);
    expect(key1.endsWith('0')).toBe(false);
    expect(key2.endsWith('0')).toBe(false);
    expect(compareCodePoints(firstKey, key1)).toBeLessThan(0);
    expect(compareCodePoints(key1, lastKey)).toBeLessThan(0);
    expect(compareCodePoints(firstKey, key2)).toBeLessThan(0);
    expect(compareCodePoints(key2, lastKey)).toBeLessThan(0);

    syncDocs(doc1, doc2);

    const tree1 = resolveTree(getNodesMap(doc1));
    const tree2 = resolveTree(getNodesMap(doc2));

    expect(JSON.stringify(tree1)).toBe(JSON.stringify(tree2));
    const orderedIds = tree1.roots.map((n) => n.id);
    expect(orderedIds[0]).toBe('first');
    expect(orderedIds[3]).toBe('last');

    // Verify we can still insert strictly between the two concurrently generated sibling keys
    const [lowKey, highKey] =
      compareCodePoints(key1, key2) < 0 ? [key1, key2] : [key2, key1];
    const between = generateSortKeyBetween(lowKey, highKey, 99);
    expect(compareCodePoints(lowKey, between)).toBeLessThan(0);
    expect(compareCodePoints(between, highKey)).toBeLessThan(0);
    expect(between.endsWith('0')).toBe(false);
  });
});

describe('CRDT Core — Soft Delete (Tombstone-Wins) & 30-Day Recovery', () => {
  it('hides concurrently added children when parent is soft-deleted, and restores intact within 30 days', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    createNode(doc1, { id: 'parent', content: 'Parent Spec', clientId: 1 });
    syncDocs(doc1, doc2);

    const deletedAt = 1_700_000_000_000;

    // Peer 1 offline soft-deletes parent (never nodes.delete())
    expect(softDeleteNode(doc1, 'parent', 'user-alice', deletedAt)).toBe(true);

    // Peer 2 offline adds a child under parent
    createNode(doc2, {
      id: 'child',
      parentId: 'parent',
      content: 'Offline Child Note',
      clientId: 2,
    });

    syncDocs(doc1, doc2);

    // Nodes must remain present in Y.Map for 30-day recovery & audit compliance
    expect(getNodesMap(doc1).has('parent')).toBe(true);
    expect(getNodesMap(doc1).has('child')).toBe(true);
    expect(getNodesMap(doc1).get('parent')?.get('deletedBy')).toBe('user-alice');

    const tree1 = resolveTree(getNodesMap(doc1));
    const tree2 = resolveTree(getNodesMap(doc2));
    expect(JSON.stringify(tree1)).toBe(JSON.stringify(tree2));

    // Tombstone-wins: both parent and child are hidden
    expect(tree1.roots).toHaveLength(0);
    expect(tree1.hiddenNodeIds).toEqual(['child', 'parent']);
    expect(tree1.nodesById['child'].effectivelyDeleted).toBe(true);

    // Cannot restore past 30-day recovery window
    expect(restoreNode(doc1, 'parent', deletedAt + SOFT_DELETE_RECOVERY_MS + 1)).toBe(false);

    // Restore within 30-day window brings parent and child back intact
    expect(restoreNode(doc1, 'parent', deletedAt + 10_000)).toBe(true);
    syncDocs(doc1, doc2);

    const restored1 = resolveTree(getNodesMap(doc1));
    const restored2 = resolveTree(getNodesMap(doc2));
    expect(JSON.stringify(restored1)).toBe(JSON.stringify(restored2));
    expect(restored1.roots.map((n) => n.id)).toEqual(['parent']);
    expect(restored1.roots[0].children.map((n) => n.id)).toEqual(['child']);
    expect(restored1.hiddenNodeIds).toHaveLength(0);
  });
});

describe('CRDT Core — AI Peer Origin Isolation with Human Y.UndoManager', () => {
  it('merges ai-peer streamed writes without hijacking human local undo stack', () => {
    const doc = new Y.Doc();
    const node = createNode(doc, { id: 'prompt-1', content: '', clientId: 1 });
    const text = getNodeContentText(node);

    const humanOrigin = 'human-local';
    const undoManager = new Y.UndoManager(text, {
      trackedOrigins: new Set([humanOrigin]),
    });

    // Human types initial text
    doc.transact(() => {
      text.insert(0, 'Human: ');
    }, humanOrigin);

    // AI peer streams chunks under attributed origin `'ai-peer:<jobId>'`
    expect(appendAiChunkToNode(doc, 'prompt-1', 'AI ', 'job-42')).toBe(true);
    expect(appendAiChunkToNode(doc, 'prompt-1', 'Response', 'job-42')).toBe(true);

    expect(text.toString()).toBe('Human: AI Response');

    // Undoing human edit removes ONLY the human text, preserving AI peer output
    undoManager.undo();
    expect(text.toString()).toBe('AI Response');

    undoManager.destroy();
  });
});
