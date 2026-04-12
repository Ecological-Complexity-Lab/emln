/**
 * csvImporter.js — Converts CSV files to the internal JSON format
 * expected by parseMultilayerData().
 *
 * Accepts:
 *   1. Extended edge list (required) — layer_from, node_from, layer_to, node_to, weight
 *   2. Layer attributes CSV (optional) — layer_id, layer_name, latitude, longitude,
 *        bipartite (TRUE/FALSE — required for any bipartite layer), …
 *   3. Node attributes CSV (optional) — node_name, node_type (required when any
 *        layer is bipartite — exactly two distinct values across the network), …
 */

/**
 * Parse CSV/TSV text into an array of objects.
 * Auto-detects delimiter (comma, tab, semicolon).
 * Handles RFC 4180 quoted fields, CRLF line endings, and UTF-8 BOM.
 * Delegates to PapaParse (globalThis.Papa).
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseCsv(text) {
    const result = globalThis.Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', ';'],
        transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
        transform: val => val.trim(),
    });
    if (result.data.length === 0)
        throw new Error('CSV file must have at least a header row and one data row.');
    return result.data;
}

/**
 * Convert CSV inputs to the JSON structure expected by parseMultilayerData().
 *
 * @param {string}      edgeListText  — Required. Extended edge list CSV text.
 * @param {string|null} layersText    — Optional. Layer attributes CSV text.
 * @param {string|null} nodesText     — Optional. Node attributes CSV text.
 * Bipartite layers must be declared via a "bipartite" column in the layers CSV
 * (TRUE/FALSE per layer). Nodes participating in any bipartite layer must carry
 * a "node_type" column with exactly two distinct values across the file.
 *
 * @param {{ directed: boolean }} options
 * @returns {{ json: object, infoMessages: string[] }}
 */
export function csvToJson(edgeListText, layersText, nodesText, options = {}) {
    const { directed = false } = options;
    const infoMessages = [];

    // ── Parse edge list ──────────────────────────────────────────────────────
    const edges = parseCsv(edgeListText);
    if (edges.length === 0) throw new Error('Edge list is empty — no data rows found.');
    const required = ['layer_from', 'node_from', 'layer_to', 'node_to'];
    for (const col of required) {
        if (!(col in edges[0])) {
            throw new Error(`Edge list is missing required column: "${col}". Expected: layer_from, node_from, layer_to, node_to.`);
        }
    }

    const warnings = [];
    const hasWeight = 'weight' in (edges[0] ?? {});
    if (!hasWeight) {
        warnings.push('Column "weight" not found in edge list — all link weights set to 1. If your file uses a different column name, rename it to "weight".');
    }

    // ── Build layers ─────────────────────────────────────────────────────────
    let layers;
    if (layersText) {
        const layerRows = parseCsv(layersText);
        if (!('layer_name' in (layerRows[0] ?? {}))) {
            throw new Error('Layer attributes file is missing required column: "layer_name".');
        }
        // Ensure layer_id is present; assign if missing
        layers = layerRows.map((row, i) => {
            const out = { ...row };
            if (!out.layer_id) out.layer_id = i + 1;
            else out.layer_id = isNaN(Number(out.layer_id)) ? out.layer_id : Number(out.layer_id);
            // Normalise lat/lon capitalisation
            for (const [k, v] of Object.entries(out)) {
                const kl = k.toLowerCase();
                if (kl === 'latitude'  && k !== 'latitude')  { out.latitude  = v; delete out[k]; }
                if (kl === 'longitude' && k !== 'longitude') { out.longitude = v; delete out[k]; }
            }
            if (out.latitude  !== undefined) out.latitude  = parseFloat(out.latitude);
            if (out.longitude !== undefined) out.longitude = parseFloat(out.longitude);
            // Parse explicit bipartite flag (TRUE/FALSE/1/0/yes/no)
            if (out.bipartite !== undefined) {
                const v = String(out.bipartite).trim().toLowerCase();
                out.bipartite = (v === 'true' || v === '1' || v === 'yes' || v === 't');
            }
            return out;
        });
    } else {
        // Derive unique layers from edge list
        const seen = new Set();
        const names = [];
        for (const e of edges) {
            if (!seen.has(e.layer_from)) { seen.add(e.layer_from); names.push(e.layer_from); }
            if (!seen.has(e.layer_to))   { seen.add(e.layer_to);   names.push(e.layer_to);   }
        }
        names.sort();
        layers = names.map((name, i) => ({ layer_id: i + 1, layer_name: name }));
        infoMessages.push(`Layers derived from edge list (${layers.length} layer${layers.length !== 1 ? 's' : ''} found)`);
    }

    const layerIdByName = new Map(layers.map(l => [l.layer_name, l.layer_id]));

    // Validate that all layer names in edges exist in layers
    const unknownLayers = new Set();
    for (const e of edges) {
        if (!layerIdByName.has(e.layer_from)) unknownLayers.add(e.layer_from);
        if (!layerIdByName.has(e.layer_to))   unknownLayers.add(e.layer_to);
    }
    if (unknownLayers.size) {
        throw new Error(`Layer names in edge list not found in layer attributes: ${[...unknownLayers].slice(0, 3).join(', ')}${unknownLayers.size > 3 ? ' …' : ''}`);
    }

    // ── Build nodes ──────────────────────────────────────────────────────────
    let nodeAttribs = new Map(); // node_name → extra attribute object
    if (nodesText) {
        const nodeRows = parseCsv(nodesText);
        if (!('node_name' in (nodeRows[0] ?? {}))) {
            throw new Error('Node attributes file is missing required column: "node_name".');
        }
        for (const row of nodeRows) {
            const out = { ...row };
            // Legacy "type" column → canonical "node_type"
            if (out.type && !out.node_type) { out.node_type = out.type; delete out.type; }
            nodeAttribs.set(out.node_name, out);
        }
    }

    // Collect all unique node names from edge list (preserving first-seen order)
    const seenNodes = new Set();
    const nodeNames = [];
    for (const e of edges) {
        if (!seenNodes.has(e.node_from)) { seenNodes.add(e.node_from); nodeNames.push(e.node_from); }
        if (!seenNodes.has(e.node_to))   { seenNodes.add(e.node_to);   nodeNames.push(e.node_to);   }
    }

    if (!nodesText) {
        infoMessages.push(`Nodes derived from edge list (${nodeNames.length} node${nodeNames.length !== 1 ? 's' : ''} found)`);
    }

    const nodes = nodeNames.map((name, i) => {
        const attribs = nodeAttribs.get(name) ?? {};
        return { node_id: i + 1, node_name: name, ...attribs };
    });

    const nodeIdByName = new Map(nodes.map(n => [n.node_name, n.node_id]));

    // ── Build state_nodes ────────────────────────────────────────────────────
    // One entry per unique (layer_name, node_name) pair seen in edge list
    const stateNodeSet = new Set();
    const state_nodes = [];
    for (const e of edges) {
        for (const [layerName, nodeName] of [[e.layer_from, e.node_from], [e.layer_to, e.node_to]]) {
            const key = `${layerName}::${nodeName}`;
            if (!stateNodeSet.has(key)) {
                stateNodeSet.add(key);
                state_nodes.push({
                    layer_id:   layerIdByName.get(layerName),
                    node_id:    nodeIdByName.get(nodeName),
                    layer_name: layerName,
                    node_name:  nodeName,
                });
            }
        }
    }

    // ── Build extended edge list ─────────────────────────────────────────────
    const CORE_COLS = new Set(['layer_from', 'node_from', 'layer_to', 'node_to', 'weight']);
    const extended = edges.map(e => {
        const out = {
            layer_from: e.layer_from,
            node_from:  e.node_from,
            layer_to:   e.layer_to,
            node_to:    e.node_to,
            weight:     e.weight !== undefined && e.weight !== '' ? (parseFloat(e.weight) || 1) : 1,
        };
        // Preserve any extra columns
        for (const [k, v] of Object.entries(e)) {
            if (!CORE_COLS.has(k)) out[k] = v;
        }
        return out;
    });

    // Validate bipartite declarations
    const anyBipartite = layers.some(l => l.bipartite === true);
    if (anyBipartite) {
        const distinctTypes = new Set();
        for (const n of nodes) {
            if (n.node_type !== undefined && n.node_type !== null && n.node_type !== '') {
                distinctTypes.add(n.node_type);
            }
        }
        if (distinctTypes.size !== 2) {
            warnings.push(
                `One or more layers are marked bipartite, but the nodes file does not contain ` +
                `a "node_type" column with exactly 2 distinct values (found ${distinctTypes.size}). ` +
                `Bipartite layers will be displayed as unipartite.`
            );
        } else {
            infoMessages.push(`Bipartite layers detected: ${layers.filter(l => l.bipartite).length}`);
        }
    }

    const json = {
        directed,
        layers,
        nodes,
        extended,
        state_nodes,
    };

    return { json, infoMessages, warnings };
}
