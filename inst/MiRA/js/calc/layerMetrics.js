/**
 * layerMetrics.js — Per-layer counts and density.
 *
 * For every layer ℓ produces { layerName, N, E, density, nA, nB, isBp }
 * where N is the node count, E is the deduplicated intralayer edge count,
 * and density follows the standard {unipartite, bipartite} × {directed,
 * undirected} formulas. Bipartite split-counts (nA, nB) come from
 * model.bipartiteInfo.
 *
 * Edges are deduplicated by sort-pair key (undirected) or `from→to` key
 * (directed) so duplicate listings in user data don't inflate E.
 */

/**
 * Compute per-layer stats. Returns:
 *   { perLayer: [{...}], edgeKeySets: Map<layerName, Set>, avgDensity }
 *
 * `edgeKeySets` is exposed because layer-similarity reuses the same
 * deduplicated edge sets (avoids walking the link list twice).
 */
export function computePerLayerStats(model) {
  const isDir = model.directed ?? false;
  const layerNames = model.layers.map(l => l.layer_name);
  const bpInfoAll  = layerNames.map(ln => model.bipartiteInfo?.get(ln));
  const edgeKeySets = new Map();

  const perLayer = layerNames.map((layerName, li) => {
    const nodeSet = model.nodesPerLayer.get(layerName) ?? new Set();
    const N  = nodeSet.size;
    const bp = bpInfoAll[li];
    const isBp = bp?.isBipartite ?? false;
    const nA = isBp ? (bp.setA?.size ?? 0) : 0;
    const nB = isBp ? (bp.setB?.size ?? 0) : 0;

    const edgeKeys = collectEdgeKeys(model.intralayerLinks, layerName, isDir);
    edgeKeySets.set(layerName, edgeKeys);
    const E = edgeKeys.size;
    const density = layerDensity(E, N, nA, nB, isBp, isDir);

    return { layerName, N, E, density, nA, nB, isBp };
  });

  const avgDensity = perLayer.length
    ? perLayer.reduce((sum, l) => sum + l.density, 0) / perLayer.length
    : 0;

  return { perLayer, edgeKeySets, avgDensity };
}

function collectEdgeKeys(intralayerLinks, layerName, isDir) {
  const out = new Set();
  for (const lk of intralayerLinks) {
    if (lk.layer_from !== layerName) continue;
    const key = isDir
      ? `${lk.node_from}→${lk.node_to}`
      : [lk.node_from, lk.node_to].sort().join('::');
    out.add(key);
  }
  return out;
}

function layerDensity(E, N, nA, nB, isBp, isDir) {
  let Emax;
  if (isBp) Emax = isDir ? 2 * nA * nB : nA * nB;
  else       Emax = isDir ? N * (N - 1) : N * (N - 1) / 2;
  return Emax > 0 ? E / Emax : 0;
}
