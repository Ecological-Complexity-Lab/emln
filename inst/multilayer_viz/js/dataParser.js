/**
 * dataParser.js — Parses EMLN multilayer JSON into an internal model
 *
 * Bipartite layers must be declared explicitly:
 *   - layer.bipartite === true (in the layers array)
 *   - nodes carry a "node_type" attribute with exactly two distinct values
 * Auto-detection (BFS 2-coloring) was removed because it produced false
 * positives on forest/tree structures (issue #23).
 */

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

  // Classify links as intralayer vs interlayer
  const intralayerLinks = [];
  const interlayerLinks = [];
  for (const link of json.extended) {
    if (link.layer_from === link.layer_to) {
      intralayerLinks.push(link);
    } else {
      interlayerLinks.push(link);
    }
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

  // ---- Compute Network Statistics (Degree, Strength) ----
  // Initialize to 0
  for (const sn of json.state_nodes) {
    sn.degree = 0;
    sn.strength = 0;
    sn.in_degree = 0;
    sn.out_degree = 0;
    sn.in_strength = 0;
    sn.out_strength = 0;
  }

  // Iterate over all links (O(E) time - very fast for sparse networks)
  for (const link of json.extended) {
    const fromKey = `${link.layer_from}::${link.node_from}`;
    const toKey = `${link.layer_to}::${link.node_to}`;
    const snFrom = stateNodeMap.get(fromKey);
    const snTo = stateNodeMap.get(toKey);
    const w = link.weight !== undefined ? link.weight : 1;

    if (snFrom) {
      snFrom.degree += 1;
      snFrom.strength += w;
      if (link.directed) {
        snFrom.out_degree += 1;
        snFrom.out_strength += w;
      }
    }

    if (snTo) {
      // Prevent double counting if it's a self-loop
      if (fromKey !== toKey) {
        snTo.degree += 1;
        snTo.strength += w;
      }
      if (link.directed) {
        snTo.in_degree += 1;
        snTo.in_strength += w;
      }
    }
  }

  // Determine directed flags.
  // directed          — applies to intralayer links
  // directedInterlayer — applies to interlayer links (defaults to same as directed)
  const directed = json.directed === true
    || json.layers.some(l => l.directed === true)
    || intralayerLinks.some(l => l.directed === true);

  const directedInterlayer = json.directed_interlayer === true
    || directed  // if the whole network is directed, interlayer is too
    || interlayerLinks.some(l => l.directed === true);

  // Propagate directed flag per link type so the renderer can draw arrowheads.
  for (const link of intralayerLinks)  link.directed = directed;
  for (const link of interlayerLinks)  link.directed = directedInterlayer;

  // If intralayer is undirected, remove in/out metrics to avoid cluttering attribute lists.
  if (!directed) {
    for (const sn of json.state_nodes) {
      delete sn.in_degree;
      delete sn.out_degree;
      delete sn.in_strength;
      delete sn.out_strength;
    }
  }

  // Extract attribute names for color mapping
  const nodeAttributeNames = extractExtraAttributes(json.nodes, ['node_id', 'node_name']);
  const stateNodeAttributeNames = extractExtraAttributes(json.state_nodes, ['layer_id', 'node_id', 'layer_name', 'node_name']);
  const linkAttributeNames = extractExtraAttributes(json.extended, ['layer_from', 'node_from', 'layer_to', 'node_to', 'weight', 'directed']);
  const layerAttributeNames = extractExtraAttributes(json.layers, ['layer_id', 'layer_name', 'bipartite', 'latitude', 'longitude']);

  // ---- Bipartite detection ----
  const bipartiteInfo = detectBipartiteLayers(
    json.layers, json.nodes, intralayerLinks, nodesPerLayer, nodesByName
  );

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
    bipartiteInfo,
  };
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

    const [typeA, typeB] = distinctTypes;
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
