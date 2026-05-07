/**
 * nodeMetrics.js — Degree and strength for state nodes and physical nodes.
 *
 * Intralayer and interlayer connections are kept separate, following the
 * standard multilayer-network formalism (Boccaletti et al. 2014; De Domenico
 * et al. 2013/2015). For each state node (i, α) we compute four primitives
 * (intra/inter × degree/strength) when undirected, or eight (split into
 * in/out) when directed. Per physical node i we expose a per-layer vector
 * and a layer-summed scalar for each primitive.
 *
 * Self-loops (j = i within a layer) are excluded from intralayer counts,
 * per the j ≠ i in the math spec.
 */

const STATE_NODE_KEY = (layer, name) => `${layer}::${name}`;

/**
 * Compute state-node and physical-node metrics, mutating model.stateNodes
 * and model.nodes in place. Returns the names of the fields written, so
 * the parser can mark them as MiRA-computed for the dropdown grouping.
 */
export function computeMetrics(model) {
  const stateNodeFields = computeStateNodeMetrics(model);
  const physicalNodeFields = computePhysicalNodeMetrics(model, stateNodeFields);
  return { stateNodeFields, physicalNodeFields };
}

/**
 * Walk intralayer + interlayer link arrays and accumulate per-state-node
 * degree/strength. Returns the list of field names written to each state
 * node (varies with directed / directedInterlayer).
 */
function computeStateNodeMetrics(model) {
  const { stateNodeMap, intralayerLinks, interlayerLinks, directed, directedInterlayer } = model;

  const intraFields = directed
    ? ['intra_in_degree', 'intra_out_degree', 'intra_in_strength', 'intra_out_strength']
    : ['intra_degree', 'intra_strength'];
  // Only emit interlayer fields when interlayer links exist. A network with
  // zero cross-layer edges would otherwise carry uniformly-zero columns that
  // clutter the dropdowns and the info panel for no informational gain.
  const hasInterlayer = interlayerLinks.length > 0;
  const interFields = !hasInterlayer
    ? []
    : (directedInterlayer
      ? ['inter_in_degree', 'inter_out_degree', 'inter_in_strength', 'inter_out_strength']
      : ['inter_degree', 'inter_strength']);
  const fields = [...intraFields, ...interFields];

  for (const sn of model.stateNodes) {
    for (const f of fields) sn[f] = 0;
  }

  for (const link of intralayerLinks) {
    if (link.node_from === link.node_to) continue; // self-loop excluded
    accumulateIntralayer(stateNodeMap, link, directed);
  }
  if (hasInterlayer) {
    for (const link of interlayerLinks) {
      accumulateInterlayer(stateNodeMap, link, directedInterlayer);
    }
  }

  return fields;
}

function accumulateIntralayer(stateNodeMap, link, directed) {
  const fromKey = STATE_NODE_KEY(link.layer_from, link.node_from);
  const toKey   = STATE_NODE_KEY(link.layer_to,   link.node_to);
  const snFrom  = stateNodeMap.get(fromKey);
  const snTo    = stateNodeMap.get(toKey);
  const w = link.weight ?? 1;

  if (directed) {
    if (snFrom) { snFrom.intra_out_degree += 1; snFrom.intra_out_strength += w; }
    if (snTo)   { snTo.intra_in_degree    += 1; snTo.intra_in_strength    += w; }
  } else {
    if (snFrom) { snFrom.intra_degree += 1; snFrom.intra_strength += w; }
    if (snTo)   { snTo.intra_degree   += 1; snTo.intra_strength   += w; }
  }
}

function accumulateInterlayer(stateNodeMap, link, directed) {
  const fromKey = STATE_NODE_KEY(link.layer_from, link.node_from);
  const toKey   = STATE_NODE_KEY(link.layer_to,   link.node_to);
  const snFrom  = stateNodeMap.get(fromKey);
  const snTo    = stateNodeMap.get(toKey);
  const w = link.weight ?? 1;

  if (directed) {
    if (snFrom) { snFrom.inter_out_degree += 1; snFrom.inter_out_strength += w; }
    if (snTo)   { snTo.inter_in_degree    += 1; snTo.inter_in_strength    += w; }
  } else {
    if (snFrom) { snFrom.inter_degree += 1; snFrom.inter_strength += w; }
    if (snTo)   { snTo.inter_degree   += 1; snTo.inter_strength   += w; }
  }
}

/**
 * For each physical node, build a per-layer vector and a layer-sum scalar
 * for every state-node field. Vectors are Map<layerName, number>, scalars
 * use the `<field>_sum` naming convention.
 *
 * EMLN's `nodes` array carries one entry per (layer, node_name) pair — so
 * the same physical node has multiple entries here. We accumulate per
 * node_name, then mirror the resulting scalars onto every entry with that
 * name so attribute lookups work regardless of which entry is read.
 */
function computePhysicalNodeMetrics(model, stateNodeFields) {
  const byLayerFields = stateNodeFields.map(f => `${f}_by_layer`);
  const sumFields     = stateNodeFields.map(f => `${f}_sum`);
  const meanFields    = stateNodeFields.map(f => `${f}_mean`);

  const entriesByName = new Map();
  for (const node of model.nodes) {
    if (!entriesByName.has(node.node_name)) entriesByName.set(node.node_name, []);
    entriesByName.get(node.node_name).push(node);
  }

  for (const [, entries] of entriesByName) {
    const layersPresent = [];
    const byLayerMaps = byLayerFields.map(() => new Map());
    const sums = sumFields.map(() => 0);

    for (const sn of model.stateNodes) {
      if (sn.node_name !== entries[0].node_name) continue;
      layersPresent.push(sn.layer_name);
      stateNodeFields.forEach((f, i) => {
        const v = sn[f] ?? 0;
        byLayerMaps[i].set(sn.layer_name, v);
        sums[i] += v;
      });
    }

    // Mean is over the layers the node is actually present in (length of
    // its by_layer vector), not over all layers in the network.
    const denom = layersPresent.length || 1;
    const means = sums.map(s => s / denom);

    for (const node of entries) {
      node.layers_present = [...layersPresent];
      byLayerFields.forEach((f, i) => { node[f] = byLayerMaps[i]; });
      sumFields.forEach((f, i)     => { node[f] = sums[i]; });
      meanFields.forEach((f, i)    => { node[f] = means[i]; });
    }
  }

  // Order in the dropdowns matches stateNodeFields (intra→inter, degree→
  // strength), with sum and mean for each base field placed adjacent so
  // related aggregations stay grouped.
  return stateNodeFields.flatMap(f => [`${f}_sum`, `${f}_mean`]);
}
