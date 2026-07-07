/**
 * [INPUT]: src/persistence/yjs-store(Y.Map + doc), src/core/edge(helpers)
 * [OUTPUT]: audit(ctx) → Promise<{ orphanEdges, duplicateIds, missingIds, repaired }>;
 *          repair(ctx) → Promise<{ fixed, deletedOrphans, rebuilt }>
 * [POS]: src/persistence 下 — 长期可用性防线:扫断链 / 重 id / 强 self-heal
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const ORIGIN_REPAIR = 'integrity-repair';

export async function audit(ctx) {
  const { thoughtsMap, edgesMap } = ctx;
  const thoughtIds = new Set();
  const duplicateIds = [];
  if (thoughtsMap) {
    thoughtsMap.forEach((value, id) => {
      if (thoughtIds.has(id)) duplicateIds.push(id);
      else thoughtIds.add(id);
    });
  }

  const orphanEdges = [];
  const selfLoops = [];
  if (edgesMap) {
    edgesMap.forEach((edge, id) => {
      if (!edge || !edge.id || !edge.fromId || !edge.toId) {
        orphanEdges.push({ id, reason: 'malformed' });
        return;
      }
      if (edge.fromId === edge.toId) {
        selfLoops.push({ id, reason: 'self-loop' });
        return;
      }
      if (!thoughtsMap || !thoughtsMap.has(edge.fromId) || !thoughtsMap.has(edge.toId)) {
        orphanEdges.push({ id, reason: 'dangling-target', edge });
      }
    });
  }

  return {
    thoughtCount: thoughtIds.size,
    edgeCount: edgesMap ? edgesMap.size : 0,
    duplicateIds,
    orphanEdges,
    selfLoops
  };
}

export async function repair(ctx, opts = {}) {
  const report = await audit(ctx);
  const { doc, thoughtsMap, edgesMap } = ctx;
  if (!doc || !edgesMap) return { ...report, repaired: { fixed: 0 } };

  let removedOrphans = 0;
  let removedLoops = 0;
  let renamedDuplicates = 0;

  function transactIfPossible(fn) {
    if (doc && typeof doc.transact === 'function') doc.transact(fn, ORIGIN_REPAIR);
    else fn();
  }

  transactIfPossible(() => {
    if (opts.removeOrphanEdges !== false) {
      for (const e of report.orphanEdges) {
        if (edgesMap.has(e.id)) {
          edgesMap.delete(e.id);
          removedOrphans++;
        }
      }
      for (const e of report.selfLoops) {
        if (edgesMap.has(e.id)) {
          edgesMap.delete(e.id);
          removedLoops++;
        }
      }
    }
    if (opts.dedupeThoughtIds !== false && report.duplicateIds.length && thoughtsMap) {
      const seen = new Set();
      const toRemove = [];
      thoughtsMap.forEach((value, id) => {
        if (seen.has(id)) toRemove.push(id);
        else seen.add(id);
      });
      for (const id of toRemove) {
        thoughtsMap.delete(id);
        renamedDuplicates++;
      }
    }
  });

  return {
    ...report,
    repaired: {
      removedOrphans,
      removedLoops,
      renamedDuplicates,
      total: removedOrphans + removedLoops + renamedDuplicates
    }
  };
}

export const __test__ = { ORIGIN_REPAIR };

export const ALLOWED_OPTIONS = {
  removeOrphanEdges: true,
  dedupeThoughtIds: true
};
