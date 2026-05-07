/**
 * similarity.js — Layer-pair similarity matrices.
 *
 * Jaccard index between sets of nodes or edges, computed pairwise across
 * all layers. Returns square matrices (NaN on the diagonal when both
 * sets are empty, 1.0 on the diagonal otherwise).
 */

/**
 * Jaccard index between two Sets. NaN when both are empty so the
 * heatmap renderer can blank that cell instead of showing a fake 0.
 */
export function jaccard(a, b) {
  if (!a.size && !b.size) return NaN;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Build pairwise Jaccard matrices for a multilayer model. Returns:
 *   { layerNames, edge, node, setA, setB }
 *
 * - `edge` is the layer × layer Jaccard over deduplicated edge-key Sets
 *   (caller passes them in as `edgeKeySets`).
 * - `node` is the layer × layer Jaccard over node-name Sets (always
 *   present; computed from `model.nodesPerLayer`).
 * - `setA` / `setB` are bipartite-only — the same Jaccard restricted to
 *   each set's node names. Both `null` for unipartite networks.
 */
export function computeLayerSimilarity(model, edgeKeySets, { setANodes, setBNodes } = {}) {
  const layerNames = model.layers.map(l => l.layer_name);
  const n = layerNames.length;

  const nodeSets = layerNames.map(ln => model.nodesPerLayer.get(ln) ?? new Set());
  const edgeSets = layerNames.map(ln => edgeKeySets.get(ln) ?? new Set());

  const matrix = (sets) => Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => jaccard(sets[i], sets[j]))
  );

  const out = {
    layerNames,
    edge: matrix(edgeSets),
    node: matrix(nodeSets),
    setA: null,
    setB: null,
  };

  if (setANodes && setBNodes) {
    const layerA = nodeSets.map(s => new Set([...s].filter(x => setANodes.has(x))));
    const layerB = nodeSets.map(s => new Set([...s].filter(x => setBNodes.has(x))));
    out.setA = matrix(layerA);
    out.setB = matrix(layerB);
  }
  return out;
}
