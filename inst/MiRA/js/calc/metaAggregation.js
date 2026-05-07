/**
 * metaAggregation.js — Project a multilayer model onto a single
 * meta-graph (one node per physical node, edges aggregated across
 * layers).
 *
 * Three weighting modes:
 *   - 'union'         — w = 1 whenever at least one layer has the edge
 *   - 'sumOccurrence' — w = number of layers in which the edge appears
 *   - 'sumWeights'    — w = Σ_ℓ w_ℓ(u, v) (per-layer weights summed)
 *
 * Edge canonicalisation: directed networks keep `(a, b)` as listed;
 * undirected networks sort `(a, b)` so that `(min, max)` is the
 * canonical key. Prevents `(A,B)` and `(B,A)` from being two edges.
 */

const KEY_SEP = '\x00';

/**
 * Aggregate a model's intralayer links into a single meta-graph.
 *
 * Returns:
 *   {
 *     edges:    [{ source, target, weight, perLayer:[{layerName,weight}], _layers:Set }],
 *     nodes:    Map<nodeName, { name, participation, metaDegree, metaStrength, layers:Set<layerName> }>,
 *     maxWeight
 *   }
 *
 * `nodes` includes physical nodes that appear in a layer but have no
 * intralayer links (they show up isolated in the meta-network).
 */
export function aggregateMetaNetwork(model, mode) {
  const directed = model.directed;
  const { edgeMap, nodeLayerMap } = collectEdges(model, directed);

  // Include nodes that appear in layers but have no intralayer links
  for (const [layerName, nodeNames] of model.nodesPerLayer) {
    for (const n of nodeNames) {
      if (!nodeLayerMap.has(n)) nodeLayerMap.set(n, new Set());
      nodeLayerMap.get(n).add(layerName);
    }
  }

  let maxWeight = 0;
  const edges = [];
  for (const { src, tgt, layers, weightSum, perLayerMap } of edgeMap.values()) {
    const weight = edgeWeightForMode(mode, weightSum, layers.size);
    const perLayer = [...perLayerMap.entries()]
      .map(([layerName, w]) => ({ layerName, weight: w }))
      .sort((a, b) => a.layerName.localeCompare(b.layerName));
    edges.push({ source: src, target: tgt, weight, perLayer, _layers: layers });
    if (weight > maxWeight) maxWeight = weight;
  }

  // Adjacency, used to compute meta-degree per node
  const adjMap = new Map();
  for (const e of edges) {
    if (!adjMap.has(e.source)) adjMap.set(e.source, new Set());
    if (!adjMap.has(e.target)) adjMap.set(e.target, new Set());
    adjMap.get(e.source).add(e.target);
    adjMap.get(e.target).add(e.source);
  }

  const nodes = new Map();
  for (const [name, layers] of nodeLayerMap) {
    const metaDegree = (adjMap.get(name) ?? new Set()).size;
    const metaStrength = edges
      .filter(e => e.source === name || e.target === name)
      .reduce((s, e) => s + e.weight, 0);
    nodes.set(name, { name, participation: layers.size, metaDegree, metaStrength, layers });
  }

  return { edges, nodes, maxWeight: maxWeight || 1 };
}

function collectEdges(model, directed) {
  const edgeMap = new Map();
  const nodeLayerMap = new Map();

  for (const link of model.intralayerLinks) {
    const a = link.node_from, b = link.node_to, layer = link.layer_from;
    const w = link.weight ?? 1;
    if (!a || !b) continue;

    for (const n of [a, b]) {
      if (!nodeLayerMap.has(n)) nodeLayerMap.set(n, new Set());
      nodeLayerMap.get(n).add(layer);
    }

    const [src, tgt] = directed ? [a, b] : (a <= b ? [a, b] : [b, a]);
    const key = `${src}${KEY_SEP}${tgt}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { src, tgt, layers: new Set(), weightSum: 0, perLayerMap: new Map() });
    }
    const e = edgeMap.get(key);
    e.layers.add(layer);
    e.weightSum += w;
    e.perLayerMap.set(layer, (e.perLayerMap.get(layer) ?? 0) + w);
  }

  return { edgeMap, nodeLayerMap };
}

function edgeWeightForMode(mode, weightSum, occurrence) {
  if (mode === 'union')      return 1;
  if (mode === 'sumWeights') return weightSum;
  return occurrence; // 'sumOccurrence'
}
