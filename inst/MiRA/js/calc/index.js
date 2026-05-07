/**
 * js/calc/ — All quantitative computations on a parsed multilayer model.
 *
 * Modules:
 *   nodeMetrics.js    — degree/strength split into intra and inter
 *   layerMetrics.js   — per-layer density, edge/node counts
 *   similarity.js     — pairwise layer similarity (Jaccard)
 *   metaAggregation.js — project the multilayer model onto a meta-graph
 */

export { computeMetrics } from './nodeMetrics.js';
export { computePerLayerStats } from './layerMetrics.js';
export { computeLayerSimilarity, jaccard } from './similarity.js';
export { aggregateMetaNetwork } from './metaAggregation.js';
