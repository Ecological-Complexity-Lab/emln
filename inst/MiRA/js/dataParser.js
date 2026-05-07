/**
 * dataParser.js — Parses EMLN multilayer JSON into an internal model
 *
 * Bipartite layers must be declared explicitly:
 *   - layer.bipartite === true (in the layers array)
 *   - nodes carry a "node_type" attribute with exactly two distinct values
 * Auto-detection (BFS 2-coloring) was removed because it produced false
 * positives on forest/tree structures (issue #23).
 */

import { computeMetrics } from './calc/index.js';

export function parseMultilayerData(json) {
  // Validate required fields
  const required = ['nodes', 'layers', 'extended', 'state_nodes'];
  for (const field of required) {
    if (!json[field] || !Array.isArray(json[field])) {
      throw new Error(`Missing or invalid required field: "${field}". Expected an array.`);
    }
  }

  // Index nodes by id and name
  const nodesById = new Map();
  const nodesByName = new Map();
  for (const node of json.nodes) {
    nodesById.set(node.node_id, node);
    nodesByName.set(node.node_name, node);
  }

  // Index layers by id and name
  const layersById = new Map();
  const layersByName = new Map();
  for (const layer of json.layers) {
    layersById.set(layer.layer_id, layer);
    layersByName.set(layer.layer_name, layer);
  }

  // Build state node map: key = "layerName::nodeName"
  const stateNodeMap = new Map();
  for (const sn of json.state_nodes) {
    const key = `${sn.layer_name}::${sn.node_name}`;
    stateNodeMap.set(key, sn);
  }

  // Build node sets per layer
  const nodesPerLayer = new Map(); // layer_name -> Set of node_names
  for (const sn of json.state_nodes) {
    if (!nodesPerLayer.has(sn.layer_name)) {
      nodesPerLayer.set(sn.layer_name, new Set());
    }
    nodesPerLayer.get(sn.layer_name).add(sn.node_name);
  }

  // Determine directed flags up-front (needed for dedup keys below).
  // directed           — applies to intralayer links
  // directedInterlayer — applies to interlayer links (defaults to same as directed)
  const directed = json.directed === true
    || json.layers.some(l => l.directed === true)
    || json.extended.some(l => l.layer_from === l.layer_to && l.directed === true);

  const directedInterlayer = json.directed_interlayer === true
    || directed  // if the whole network is directed, interlayer is too
    || json.extended.some(l => l.layer_from !== l.layer_to && l.directed === true);

  // ---- Clean & classify links ----
  // (1) Drop rows with weight === 0 — zero weight means "no link".
  // (2) Dedupe duplicate edges. For undirected networks, A→B and B→A are the same
  //     edge and degree/density calculations break if both rows are kept.
  //     For directed networks, A→B and B→A are distinct, but exact-duplicate rows
  //     are still dropped.
  const intralayerLinks = [];
  const interlayerLinks = [];
  const intraSeen = new Set();
  const interSeen = new Set();
  let droppedZeroWeight = 0;
  let droppedDuplicates = 0;

  for (const link of json.extended) {
    if (link.weight !== undefined && link.weight !== null && Number(link.weight) === 0) {
      droppedZeroWeight++;
      continue;
    }

    const isIntra = link.layer_from === link.layer_to;
    const isDir = isIntra ? directed : directedInterlayer;
    const key = edgeDedupKey(link, isIntra, isDir);
    const seen = isIntra ? intraSeen : interSeen;
    if (seen.has(key)) {
      droppedDuplicates++;
      continue;
    }
    seen.add(key);

    if (isIntra) intralayerLinks.push(link);
    else        interlayerLinks.push(link);
  }

  const warnings = [];
  if (droppedZeroWeight > 0) {
    warnings.push(
      `Dropped ${droppedZeroWeight} edge${droppedZeroWeight === 1 ? '' : 's'} with weight 0 ` +
      `(weight 0 means "no link" and is treated as no edge).`
    );
  }
  if (droppedDuplicates > 0) {
    warnings.push(
      `Dropped ${droppedDuplicates} duplicate edge${droppedDuplicates === 1 ? '' : 's'}` +
      (directed ? '.' : ' (e.g. both A→B and B→A in an undirected network).')
    );
  }

  // Propagate directed flag per link type so the renderer can draw arrowheads.
  for (const link of intralayerLinks)  link.directed = directed;
  for (const link of interlayerLinks)  link.directed = directedInterlayer;

  // ---- Compute node-level metrics (degree, strength — intra vs inter) ----
  // Math + module layout: see js/calc/ and docs/calculations.md.
  const metricsModel = {
    stateNodes: json.state_nodes,
    nodes: json.nodes,
    stateNodeMap,
    intralayerLinks,
    interlayerLinks,
    directed,
    directedInterlayer,
  };
  const { stateNodeFields, physicalNodeFields } = computeMetrics(metricsModel);

  // Extract attribute names for color mapping. The Map-valued `_by_layer`
  // fields and the structural `layers_present` array are excluded — they
  // aren't usable as scalar coloring attributes. Scalar aggregates (`_sum`,
  // `_mean`, `_max`) and all state-node fields fall through into the dropdowns.
  const byLayerFields = stateNodeFields.map(f => `${f}_by_layer`);
  const nodeAttributeNames = extractExtraAttributes(json.nodes, ['node_id', 'node_name', 'layers_present', ...byLayerFields]);
  const stateNodeAttributeNames = extractExtraAttributes(json.state_nodes, ['layer_id', 'node_id', 'layer_name', 'node_name']);
  const linkAttributeNames = extractExtraAttributes(json.extended, ['layer_from', 'node_from', 'layer_to', 'node_to', 'weight', 'directed']);
  const layerAttributeNames = extractExtraAttributes(json.layers, ['layer_id', 'layer_name', 'bipartite', 'latitude', 'longitude']);

  // MiRA-computed attribute names — used by the UI to group dropdown entries
  // under a "MiRA-computed" optgroup separate from "From data".
  const computedNodeAttributes = [...physicalNodeFields];
  const computedStateNodeAttributes = [...stateNodeFields];

  // ---- Bipartite detection ----
  const bipartiteInfo = detectBipartiteLayers(
    json.layers, json.nodes, intralayerLinks, nodesPerLayer, nodesByName
  );

  // Mixed bipartite/unipartite networks are an edge case — the data loads and
  // renders, but bipartite color/size coding only applies to nodes in the
  // bipartite layers. Full mixed-network UX is tracked for future development.
  const bipartiteLayerCount = [...bipartiteInfo.values()].filter(b => b.isBipartite).length;
  const totalLayers = json.layers.length;
  if (bipartiteLayerCount > 0 && bipartiteLayerCount < totalLayers) {
    warnings.push(
      `This network mixes bipartite and unipartite layers (${bipartiteLayerCount} of ` +
      `${totalLayers} layers are bipartite). The visualization is supported, but ` +
      `bipartite color/size coding only applies to nodes in the bipartite layer(s). ` +
      `Full mixed-network UX is planned for a future release.`
    );
  }

  return {
    nodes: json.nodes,
    layers: json.layers,
    extended: json.extended,
    stateNodes: json.state_nodes,
    directed,
    directedInterlayer,
    nodesById,
    nodesByName,
    layersById,
    layersByName,
    intralayerLinks,
    interlayerLinks,
    stateNodeMap,
    nodesPerLayer,
    nodeAttributeNames,
    stateNodeAttributeNames,
    linkAttributeNames,
    layerAttributeNames,
    computedNodeAttributes,
    computedStateNodeAttributes,
    bipartiteInfo,
    warnings,
  };
}

/** Canonical key for edge dedup. Direction-preserving when isDir, otherwise pair-sorted. */
function edgeDedupKey(link, isIntra, isDir) {
  const SEP = '\x00';
  if (isIntra) {
    if (isDir) return `${link.layer_from}${SEP}${link.node_from}${SEP}${link.node_to}`;
    const [a, b] = [link.node_from, link.node_to].sort();
    return `${link.layer_from}${SEP}${a}${SEP}${b}`;
  }
  // Interlayer
  if (isDir) {
    return `${link.layer_from}${SEP}${link.node_from}${SEP}${link.layer_to}${SEP}${link.node_to}`;
  }
  const endA = `${link.layer_from}${SEP}${link.node_from}`;
  const endB = `${link.layer_to}${SEP}${link.node_to}`;
  const [a, b] = [endA, endB].sort();
  return `${a}${SEP}${b}`;
}

/**
 * Resolve bipartite structure for each layer.
 * Returns Map<layerName, { isBipartite, setA, setB, setALabel, setBLabel, explicit }>
 *
 * Bipartite is only set when the user has explicitly declared it:
 *   - layer.bipartite === true
 *   - Nodes carry a "node_type" (or legacy "type") attribute with exactly
 *     two distinct values across the network.
 * If declared but the node_type data is missing/invalid, a console warning
 * is emitted and the layer is treated as unipartite.
 *
 * Set A vs Set B ordering:
 *   - If layer.setA_type is given and matches one of the two types, that
 *     type becomes Set A (rendered as the top row, by ecological convention
 *     the higher trophic level: pollinator, parasite, disperser, etc.).
 *   - Otherwise the two types are sorted alphabetically and the first
 *     becomes Set A. This is a fallback — explicit setA_type is preferred.
 */
function detectBipartiteLayers(layers, nodes, intralayerLinks, nodesPerLayer, nodesByName) {
  const info = new Map();

  // Collect node_type values (fallback to legacy "type")
  const nodeTypeValues = new Map();
  for (const node of nodes) {
    const typeValue = node.node_type !== undefined ? node.node_type : node.type;
    if (typeValue !== undefined && typeValue !== null) {
      nodeTypeValues.set(node.node_name, typeValue);
    }
  }
  for (const layer of layers) {
    const layerName = layer.layer_name;
    const layerNodes = nodesPerLayer.get(layerName);

    if (!layerNodes || layerNodes.size === 0 || layer.bipartite !== true) {
      info.set(layerName, { isBipartite: false });
      continue;
    }

    const layerTypes = new Set();
    for (const nodeName of layerNodes) {
      const t = nodeTypeValues.get(nodeName);
      if (t !== undefined) layerTypes.add(t);
    }
    const distinctTypes = [...layerTypes].sort();
    if (distinctTypes.length !== 2) {
      console.warn(
        `Layer "${layerName}" is declared bipartite but its nodes have ${distinctTypes.length} ` +
        `distinct node_type values (need exactly 2). Treating as unipartite.`
      );
      info.set(layerName, { isBipartite: false });
      continue;
    }

    let typeA, typeB;
    const declared = layer.setA_type;
    if (declared !== undefined && declared !== null && declared !== '') {
      const declaredStr = String(declared);
      if (distinctTypes.includes(declaredStr)) {
        typeA = declaredStr;
        typeB = distinctTypes.find(t => t !== declaredStr);
      } else {
        console.warn(
          `Layer "${layerName}" declared setA_type="${declared}" but it does not match any ` +
          `node_type in this layer (${distinctTypes.join(', ')}). Falling back to alphabetical.`
        );
        [typeA, typeB] = distinctTypes;
      }
    } else {
      [typeA, typeB] = distinctTypes;
    }

    const setA = new Set();
    const setB = new Set();
    for (const nodeName of layerNodes) {
      const nt = nodeTypeValues.get(nodeName);
      if (nt === typeA) setA.add(nodeName);
      else if (nt === typeB) setB.add(nodeName);
    }

    info.set(layerName, {
      isBipartite: true,
      explicit: true,
      setA,
      setB,
      setALabel: String(typeA),
      setBLabel: String(typeB),
    });
  }

  return info;
}

function extractExtraAttributes(arr, excludeKeys) {
  const attrSet = new Set();
  for (const item of arr) {
    for (const key of Object.keys(item)) {
      if (!excludeKeys.includes(key)) {
        attrSet.add(key);
      }
    }
  }
  return Array.from(attrSet);
}
