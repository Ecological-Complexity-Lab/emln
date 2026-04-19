/**
 * metaNetwork.js — Meta-Network View
 *
 * Aggregates all intralayer links into a single 2D network of unique
 * physical nodes. Supports three aggregation modes (union, sumWeights,
 * sumOccurrence), bipartite two-row layout or force layout, directed
 * arrowheads, node dragging, pan/zoom, and per-node/edge fading based
 * on selection and layer filter.
 */

import { BIPARTITE_SET_A_COLOR, BIPARTITE_SET_B_COLOR } from './colorMapper.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MN_ROW_SPACING   = 150;   // sim-coord distance from centre to each bipartite row
const MN_MIN_R         = 5;
const MN_MAX_R         = 22;
const MN_DEFAULT_R     = 10;
const MN_EDGE_ALPHA    = 0.8;
const MN_DIM_NODE      = 0.08;
const MN_DIM_EDGE      = 0.06;
const MN_BG_COLOR      = '#f8f8fc';
const MN_UNIFORM_COLOR = '#6ee7b7';
const MN_ARROW_SIZE    = 8;     // px in sim coords
const MN_HIT_THRESHOLD = 6;     // px in sim coords for edge hit

// cmocean 'ice' palette — reversed so low = light cyan, high = dark navy
const MN_ICE_COLORS = [
    '#cde9f0', '#9dd1e5', '#6cb8d8', '#3f9ec8', '#1e84b5',
    '#0c6a9e', '#0a5085', '#0a3a6b', '#092651', '#060d35',
];

// ─── Geometry helper ─────────────────────────────────────────────────────────

function _ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ─── MetaNetwork class ───────────────────────────────────────────────────────

export class MetaNetwork {
    constructor(model, canvasWidth = 800, canvasHeight = 600) {
        this._model       = model;
        this._canvasW     = canvasWidth;
        this._canvasH     = canvasHeight;
        this._sim         = null;
        this._mnNodes     = [];        // node objects (also the d3 node array)
        this._mnEdges     = [];        // raw edge objects (source/target = strings)
        this._d3Links     = [];        // d3 link objects (source/target → node refs after sim init)
        this._nodeMap     = new Map(); // nodeName → node object
        this._maxWeight   = 1;
        this._focusSet    = null;      // Set<nodeName> | null — ego network of selected node
        this._draggedNode = null;

        this.viewScale   = 1;
        this.viewOffsetX = 0;
        this.viewOffsetY = 0;

        this.settings = {
            aggregation:   'sumOccurrence', // 'union' | 'sumWeights' | 'sumOccurrence'
            colorBy:       'participation', // 'participation' | 'metaDegree' | 'uniform'
            sizeBy:        'metaDegree',    // 'participation' | 'metaDegree' | 'uniform'
            layout:        'circular',      // 'circular' | 'force' | 'bipartite'
            minWeight:     0,
            showLabels:    true,
            labelFontSize: 12,
            nestedSort:    true,
            baseSize:      1.0,            // multiplier applied to all node radii
            uniformColorA: BIPARTITE_SET_A_COLOR, // uniform color for bipartite Set A
            uniformColorB: BIPARTITE_SET_B_COLOR, // uniform color for bipartite Set B
        };

        this.state = {
            selectedNode:   null,       // nodeName | null
            selectedEdge:   null,       // raw edge object | null
            selectedLayers: new Set(),
        };

        // Auto-detect bipartite BEFORE _aggregate so nodeType is assigned correctly
        const hasBipartite = [...model.bipartiteInfo.values()].some(i => i.isBipartite);
        if (hasBipartite) this.settings.layout = 'bipartite';

        this._aggregate();
        this._initLayout();
    }

    // ── Bipartite helpers ────────────────────────────────────────────────────

    get _useBipartiteLayout() {
        return this.settings.layout === 'bipartite';
    }

    get _useCircularLayout() {
        return this.settings.layout === 'circular';
    }

    /** True when the model has at least one bipartite layer (nodes have Set A / Set B types). */
    get hasBipartite() {
        return this._mnNodes.some(n => n.nodeType !== null);
    }

    /** Labels for Set A and Set B from the first bipartite layer, falling back to generic names. */
    get bipartiteSetLabels() {
        for (const info of this._model.bipartiteInfo.values()) {
            if (info.isBipartite) return { labelA: info.setALabel, labelB: info.setBLabel };
        }
        return { labelA: 'Set A', labelB: 'Set B' };
    }

    _buildBipartiteSets() {
        const setA = new Set(), setB = new Set();
        for (const info of this._model.bipartiteInfo.values()) {
            if (!info.isBipartite) continue;
            for (const n of info.setA) setA.add(n);
            for (const n of info.setB) setB.add(n);
        }
        for (const n of setA) setB.delete(n); // resolve conflicts: A wins
        return { setA, setB };
    }

    // ── Aggregation ──────────────────────────────────────────────────────────

    _aggregate() {
        const mode     = this.settings.aggregation;
        const directed = this._model.directed;
        const links    = this._model.intralayerLinks;

        // edge accumulator: edgeKey → {src, tgt, layers, weightSum, perLayerMap}
        const edgeMap     = new Map();
        // nodeName → Set<layerName>
        const nodeLayerMap = new Map();

        for (const link of links) {
            const a = link.node_from, b = link.node_to, layer = link.layer_from;
            const w = link.weight ?? 1;
            if (!a || !b) continue;

            for (const n of [a, b]) {
                if (!nodeLayerMap.has(n)) nodeLayerMap.set(n, new Set());
                nodeLayerMap.get(n).add(layer);
            }

            // Canonical direction
            const [src, tgt] = directed ? [a, b] : (a <= b ? [a, b] : [b, a]);
            const key = `${src}\x00${tgt}`;

            if (!edgeMap.has(key)) {
                edgeMap.set(key, { src, tgt, layers: new Set(), weightSum: 0, perLayerMap: new Map() });
            }
            const e = edgeMap.get(key);
            e.layers.add(layer);
            e.weightSum += w;
            e.perLayerMap.set(layer, (e.perLayerMap.get(layer) ?? 0) + w);
        }

        // Include nodes that appear in layers but have no intralayer links
        for (const [layerName, nodeNames] of this._model.nodesPerLayer) {
            for (const n of nodeNames) {
                if (!nodeLayerMap.has(n)) nodeLayerMap.set(n, new Set());
                nodeLayerMap.get(n).add(layerName);
            }
        }

        // Build _mnEdges
        let maxWeight = 0;
        this._mnEdges = [];
        for (const { src, tgt, layers, weightSum, perLayerMap } of edgeMap.values()) {
            const weight =
                mode === 'union'      ? 1 :
                mode === 'sumWeights' ? weightSum :
                                       layers.size; // sumOccurrence
            const perLayer = [...perLayerMap.entries()]
                .map(([layerName, w]) => ({ layerName, weight: w }))
                .sort((a, b) => a.layerName.localeCompare(b.layerName));

            this._mnEdges.push({ source: src, target: tgt, weight, perLayer, _layers: layers });
            if (weight > maxWeight) maxWeight = weight;
        }
        this._maxWeight = maxWeight || 1;

        // Bipartite typing (recomputed each time in case layout setting changed)
        const bpSets = this._useBipartiteLayout ? this._buildBipartiteSets() : null;

        // Adjacency for metaDegree
        const adjMap = new Map();
        for (const e of this._mnEdges) {
            if (!adjMap.has(e.source)) adjMap.set(e.source, new Set());
            if (!adjMap.has(e.target)) adjMap.set(e.target, new Set());
            adjMap.get(e.source).add(e.target);
            adjMap.get(e.target).add(e.source);
        }

        // Build _mnNodes
        this._mnNodes = [];
        this._nodeMap = new Map();
        for (const [name, layers] of nodeLayerMap) {
            const metaDegree   = (adjMap.get(name) ?? new Set()).size;
            const metaStrength = this._mnEdges
                .filter(e => e.source === name || e.target === name)
                .reduce((s, e) => s + e.weight, 0);

            let nodeType = null;
            if (bpSets) {
                if      (bpSets.setA.has(name)) nodeType = 'A';
                else if (bpSets.setB.has(name)) nodeType = 'B';
            }

            const node = {
                name, participation: layers.size, metaDegree, metaStrength, layers,
                nodeType, color: MN_UNIFORM_COLOR, r: MN_DEFAULT_R,
                x: (Math.random() - 0.5) * 200,
                y: (Math.random() - 0.5) * 200,
                vx: 0, vy: 0,
            };
            this._mnNodes.push(node);
            this._nodeMap.set(name, node);
        }

        this._updateNodeStyles();
    }

    // ── Node styling ─────────────────────────────────────────────────────────

    _updateNodeStyles() {
        const nodes = this._mnNodes;
        if (!nodes.length) return;
        const { colorBy, sizeBy, baseSize } = this.settings;

        const maxPart = Math.max(...nodes.map(n => n.participation), 1);
        const minPart = Math.min(...nodes.map(n => n.participation), 0);
        const maxDeg  = Math.max(...nodes.map(n => n.metaDegree), 1);
        const minDeg  = Math.min(...nodes.map(n => n.metaDegree), 0);

        for (const n of nodes) {
            // ── Size
            let r;
            if (sizeBy === 'uniform') {
                r = MN_DEFAULT_R;
            } else {
                const [val, lo, hi] = sizeBy === 'participation'
                    ? [n.participation, minPart, maxPart]
                    : [n.metaDegree,    minDeg,  maxDeg];
                r = MN_MIN_R + (MN_MAX_R - MN_MIN_R) * (val - lo) / Math.max(hi - lo, 1);
            }
            n.r = r * baseSize;

            // ── Color
            if (colorBy === 'uniform') {
                if (n.nodeType === 'A')      n.color = this.settings.uniformColorA;
                else if (n.nodeType === 'B') n.color = this.settings.uniformColorB;
                else                         n.color = MN_UNIFORM_COLOR;
            } else {
                const [val, lo, hi] = colorBy === 'participation'
                    ? [n.participation, minPart, maxPart]
                    : [n.metaDegree,    minDeg,  maxDeg];
                const t = (val - lo) / Math.max(hi - lo, 1);
                n.color = globalThis.chroma.scale(MN_ICE_COLORS)(t).hex();
            }
        }
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    _initLayout() {
        if (this._sim) this._sim.stop();

        const bipartite = this._useBipartiteLayout;

        const circular  = this._useCircularLayout;

        // Clear all pins; set row pins for bipartite
        for (const n of this._mnNodes) {
            n.fx = undefined; n.fy = undefined;
            if (bipartite && n.nodeType === 'A') {
                n.fy = -MN_ROW_SPACING; n.y = -MN_ROW_SPACING;
            } else if (bipartite && n.nodeType === 'B') {
                n.fy =  MN_ROW_SPACING; n.y =  MN_ROW_SPACING;
            }
            if (!circular) { n.x = (Math.random() - 0.5) * 200; }
            n.vx = 0; n.vy = 0;
        }

        if (bipartite && this.settings.nestedSort) this._applyNestedSort();
        if (circular)  this._applyCircularLayout();

        // d3 replaces source/target strings with node object refs in-place
        this._d3Links = this._mnEdges.map(e => ({ source: e.source, target: e.target, _edge: e }));

        if (circular) {
            // Nodes are pinned — run one tick just to resolve source/target refs
            this._sim = d3.forceSimulation(this._mnNodes)
                .force('link', d3.forceLink(this._d3Links).id(n => n.name))
                .stop();
            this._sim.tick();
            // No animation needed; keep sim stopped
        } else {
            this._sim = d3.forceSimulation(this._mnNodes)
                .force('charge',  d3.forceManyBody().strength(-200))
                .force('link',    d3.forceLink(this._d3Links).id(n => n.name).distance(80).strength(0.4))
                .force('x',       d3.forceX(0).strength(bipartite ? 0.02 : 0.05))
                .force('y',       d3.forceY(0).strength(bipartite ? 0    : 0.05))
                .force('collide', d3.forceCollide(n => n.r + 4).iterations(3))
                .stop();

            // Pre-settle to convergence (cap at 500 ticks for safety on huge graphs)
            for (let i = 0; i < 500 && this._sim.alpha() > this._sim.alphaMin(); i++) {
                this._sim.tick();
            }
            // Brief gentle animation so the user sees the network is "live" (drag-able)
            this._sim.alpha(0.05).restart();
        }
    }

    // ── Circular layout ──────────────────────────────────────────────────────

    _applyCircularLayout() {
        // Sort by metaDegree descending so high-degree nodes are evenly spread
        const sorted = [...this._mnNodes].sort((a, b) => b.metaDegree - a.metaDegree);
        const n = sorted.length;
        // Target: fit within 40% of the smaller canvas dimension (sim coords = pixels at scale 1)
        const fitR   = Math.min(this._canvasW, this._canvasH) * 0.40;
        // Floor: nodes shouldn't overlap — circumference must hold n nodes of their avg radius
        const avgR   = this._mnNodes.reduce((s, nd) => s + nd.r, 0) / Math.max(n, 1);
        const minR   = (n * (avgR + 4)) / (2 * Math.PI);
        const R      = Math.max(minR, fitR);
        sorted.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2; // start at top
            node.x  = R * Math.cos(angle);
            node.y  = R * Math.sin(angle);
            node.fx = node.x;
            node.fy = node.y;
            node.vx = 0;
            node.vy = 0;
        });
    }

    // ── Nested sort ──────────────────────────────────────────────────────────

    /**
     * For bipartite two-row layout: sort each row by meta-degree descending
     * and pin fx so nodes spread evenly, producing a visually nested pattern.
     */
    _applyNestedSort() {
        // Use 80% of canvas width as the max row span (sim coords = canvas px at scale 1).
        // This means nodes overlap when the row is dense — intentional for large networks.
        const maxRowW = this._canvasW * 0.80;

        const sortRow = (nodes) => {
            nodes.sort((a, b) => b.metaDegree - a.metaDegree);
            const n = nodes.length;
            if (n === 0) return;
            // Natural spacing: diameter + small gap
            const avgDiam  = nodes.reduce((s, nd) => s + nd.r * 2, 0) / n;
            const naturalW = (n - 1) * (avgDiam + 4);
            const totalW   = Math.min(naturalW, maxRowW);
            nodes.forEach((node, i) => {
                node.fx = (n === 1) ? 0 : (i / (n - 1) - 0.5) * totalW;
                node.x  = node.fx;
            });
        };
        sortRow(this._mnNodes.filter(n => n.nodeType === 'A'));
        sortRow(this._mnNodes.filter(n => n.nodeType === 'B'));
    }

    resetLayout() {
        for (const n of this._mnNodes) {
            n.fx = undefined; n.fy = undefined;
            n.x  = (Math.random() - 0.5) * 200;
            n.y  = (Math.random() - 0.5) * 200;
            n.vx = 0; n.vy = 0;
        }
        this._initLayout();
    }

    // ── Tick & Render ────────────────────────────────────────────────────────

    tick() {
        if (this._useCircularLayout) return false;
        return this._sim ? this._sim.alpha() > this._sim.alphaMin() : false;
    }

    render(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = MN_BG_COLOR;
        ctx.fillRect(0, 0, w, h);

        // Bipartite row guide lines in screen coordinates (drawn outside view transform)
        if (this._useBipartiteLayout) {
            const yA = this.viewScale * (-MN_ROW_SPACING) + h / 2 + this.viewOffsetY;
            const yB = this.viewScale * ( MN_ROW_SPACING) + h / 2 + this.viewOffsetY;
            ctx.save();
            ctx.strokeStyle = 'rgba(100,116,139,0.18)';
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, yA); ctx.lineTo(w, yA); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(w, yB); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('Set A', 10, yA - 14);
            ctx.fillText('Set B', 10, yB - 14);
            ctx.restore();
        }

        ctx.save();
        ctx.translate(w / 2 + this.viewOffsetX, h / 2 + this.viewOffsetY);
        ctx.scale(this.viewScale, this.viewScale);

        const maxW = this._maxWeight;

        // ── Edges
        for (const link of this._d3Links) {
            const edge = link._edge;
            if (edge.weight < this.settings.minWeight) continue;
            const src = link.source, tgt = link.target;
            if (typeof src === 'string' || typeof tgt === 'string') continue;

            ctx.save();
            ctx.globalAlpha = this._edgeAlpha(link);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth   = 0.5 + 3.5 * (edge.weight / maxW);

            ctx.beginPath();
            ctx.moveTo(src.x, src.y);
            ctx.lineTo(tgt.x, tgt.y);
            ctx.stroke();

            if (this._model.directed) this._drawArrowhead(ctx, src, tgt);
            ctx.restore();
        }

        // ── Selected edge highlight (drawn on top of all other edges)
        if (this.state.selectedEdge) {
            const selLink = this._d3Links.find(l => l._edge === this.state.selectedEdge);
            if (selLink) {
                const src = selLink.source, tgt = selLink.target;
                if (typeof src !== 'string' && typeof tgt !== 'string') {
                    const w = this.state.selectedEdge.weight;
                    ctx.save();
                    ctx.globalAlpha = 1.0;
                    ctx.strokeStyle = '#1d4ed8';
                    ctx.lineWidth   = (0.5 + 3.5 * (w / maxW)) + 2;
                    ctx.beginPath();
                    ctx.moveTo(src.x, src.y);
                    ctx.lineTo(tgt.x, tgt.y);
                    ctx.stroke();
                    if (this._model.directed) this._drawArrowhead(ctx, src, tgt);
                    ctx.restore();
                }
            }
        }

        // ── Nodes
        for (const node of this._mnNodes) {
            const alpha = this._nodeAlpha(node);
            ctx.save();
            ctx.globalAlpha = alpha;

            // Selection ring — for selected node or edge endpoints
            const selEdge = this.state.selectedEdge;
            const isRinged = node.name === this.state.selectedNode
                || (selEdge && (node.name === selEdge.source || node.name === selEdge.target));
            if (isRinged) {
                ctx.strokeStyle = '#1d4ed8';
                ctx.lineWidth   = 2.5;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle   = node.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth   = 0.8;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            if (this.settings.showLabels) {
                ctx.save();
                ctx.globalAlpha  = alpha;
                ctx.fillStyle    = '#374151';
                ctx.font         = `${this.settings.labelFontSize}px Inter, sans-serif`;
                ctx.textAlign    = 'left';
                ctx.textBaseline = 'middle';
                // Top-row bipartite nodes (Set A): label above, angled up-right (−45°)
                // All other nodes: label below, angled down-right (+45°)
                const above = node.nodeType === 'A';
                ctx.translate(node.x, node.y + (above ? -(node.r + 3) : (node.r + 3)));
                ctx.rotate(above ? -Math.PI / 4 : Math.PI / 4);
                ctx.fillText(node.name, 0, 0);
                ctx.restore();
            }
        }

        ctx.restore();
    }

    // ── Arrowhead ────────────────────────────────────────────────────────────

    _drawArrowhead(ctx, src, tgt) {
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const tipX = tgt.x - ux * tgt.r;
        const tipY = tgt.y - uy * tgt.r;
        const bx = tipX - ux * MN_ARROW_SIZE;
        const by = tipY - uy * MN_ARROW_SIZE;
        const px = -uy * MN_ARROW_SIZE * 0.4;
        const py =  ux * MN_ARROW_SIZE * 0.4;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(bx + px, by + py);
        ctx.lineTo(bx - px, by - py);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    }

    // ── Fading ───────────────────────────────────────────────────────────────

    _nodeAlpha(node) {
        const selNode   = this.state.selectedNode;
        const selEdge   = this.state.selectedEdge;
        const selLayers = this.state.selectedLayers;

        let inEgo;
        if (selEdge) {
            inEgo = node.name === selEdge.source || node.name === selEdge.target;
        } else {
            inEgo = !selNode || node.name === selNode || (this._focusSet?.has(node.name) ?? true);
        }

        const inFilter = selLayers.size === 0 || [...node.layers].some(l => selLayers.has(l));
        return (inEgo && inFilter) ? 1.0 : MN_DIM_NODE;
    }

    _edgeAlpha(link) {
        const edge      = link._edge;
        const selNode   = this.state.selectedNode;
        const selEdge   = this.state.selectedEdge;
        const selLayers = this.state.selectedLayers;
        const sn = typeof link.source === 'string' ? link.source : link.source.name;
        const tn = typeof link.target === 'string' ? link.target : link.target.name;

        let inEgo;
        if (selEdge) {
            inEgo = link._edge === selEdge;
        } else {
            inEgo = !selNode || sn === selNode || tn === selNode;
        }

        const inFilter = selLayers.size === 0 || [...edge._layers].some(l => selLayers.has(l));
        return (inEgo && inFilter) ? MN_EDGE_ALPHA : MN_DIM_EDGE;
    }

    _computeFocusSet(nodeName) {
        this._focusSet = new Set([nodeName]);
        for (const link of this._d3Links) {
            const sn = typeof link.source === 'string' ? link.source : link.source.name;
            const tn = typeof link.target === 'string' ? link.target : link.target.name;
            if (sn === nodeName) this._focusSet.add(tn);
            if (tn === nodeName) this._focusSet.add(sn);
        }
    }

    // ── Hit testing ──────────────────────────────────────────────────────────

    _screenToSim(mx, my, w, h) {
        return {
            sx: (mx - w / 2 - this.viewOffsetX) / this.viewScale,
            sy: (my - h / 2 - this.viewOffsetY) / this.viewScale,
        };
    }

    hitTestNode(mx, my, w, h) {
        const { sx, sy } = this._screenToSim(mx, my, w, h);
        for (const node of this._mnNodes) {
            const dx = sx - node.x, dy = sy - node.y;
            if (dx * dx + dy * dy <= node.r * node.r) return node.name;
        }
        return null;
    }

    hitTestEdge(mx, my, w, h) {
        const { sx, sy } = this._screenToSim(mx, my, w, h);
        const threshold  = MN_HIT_THRESHOLD / this.viewScale;

        for (const link of this._d3Links) {
            const edge = link._edge;
            if (edge.weight < this.settings.minWeight) continue;
            const src = link.source, tgt = link.target;
            if (typeof src === 'string' || typeof tgt === 'string') continue;
            if (_ptSegDist(sx, sy, src.x, src.y, tgt.x, tgt.y) <= threshold) return edge;
        }
        return null;
    }

    // ── Dragging ─────────────────────────────────────────────────────────────

    startDragNode(mx, my, w, h) {
        const name = this.hitTestNode(mx, my, w, h);
        if (!name) return null;
        const node = this._nodeMap.get(name);
        this._draggedNode   = node;
        this._didActualDrag = false;  // set to true only when mouse actually moves
        // Snapshot position so we can unpin on a plain click
        this._dragStartX = node.x;
        this._dragStartY = node.y;
        return name;
    }

    moveDragNode(mx, my, w, h) {
        if (!this._draggedNode) return;
        if (!this._didActualDrag) {
            // First real movement — pin the node and heat the sim
            this._draggedNode.fx = this._dragStartX;
            if (!this._useBipartiteLayout || this._draggedNode.nodeType === null) {
                this._draggedNode.fy = this._dragStartY;
            }
            this._didActualDrag = true;
            this._sim?.alphaTarget(0.3).restart();
        }
        const { sx, sy } = this._screenToSim(mx, my, w, h);
        this._draggedNode.fx = sx;
        if (!this._useBipartiteLayout || this._draggedNode.nodeType === null) {
            this._draggedNode.fy = sy;
        }
    }

    endDragNode() {
        if (!this._draggedNode) return;
        if (!this._didActualDrag) {
            // Plain click — do not pin the node at all
            this._draggedNode.fx = undefined;
            this._draggedNode.fy = undefined;
        }
        this._sim?.alphaTarget(0);
        this._draggedNode   = null;
        this._didActualDrag = false;
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    updateSetting(key, value) {
        this.settings[key] = value;

        switch (key) {
            case 'aggregation':
                this._aggregate();
                this._initLayout();
                break;
            case 'layout':
                this._aggregate(); // re-type nodes for bipartite
                this._initLayout();
                break;
            case 'colorBy':
            case 'sizeBy':
            case 'baseSize':
            case 'uniformColorA':
            case 'uniformColorB':
                this._updateNodeStyles();
                break;
            case 'nestedSort':
                if (this._useBipartiteLayout) {
                    if (value) {
                        this._applyNestedSort();
                    } else {
                        // Remove fx pins so the force sim can move nodes freely again
                        for (const n of this._mnNodes) {
                            if (n.nodeType === 'A' || n.nodeType === 'B') n.fx = undefined;
                        }
                        this._sim?.alpha(0.15).restart();
                    }
                }
                break;
            // minWeight, showLabels, labelFontSize — re-render only (caller handles)
        }
    }

    /** Maximum weight across all meta-edges (useful for setting slider max). */
    get maxEdgeWeight() {
        return this._maxWeight;
    }
}
