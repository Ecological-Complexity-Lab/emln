/**
 * dashboard.js — Dashboard mode for multilayer network visualization.
 * Renders KPI cards, per-layer bar charts, presence matrix, degree
 * distributions, participation histogram, and set-size ratio chart.
 */

const ACCENT      = '#6366f1';
const SET_A_COLOR = '#0072b2';
const SET_B_COLOR = '#f472b6';
const BAR_FILL    = 'rgba(99,102,241,0.72)';
const GRID        = '#e5e7eb';
const TEXT        = '#374151';
const SUBTEXT     = '#9ca3af';

// ─── Number formats ──────────────────────────────────────────────────────────
const fmtInteger = d3.format('.0f');   // counts: 1234 → "1234"
const fmtDecimal = d3.format('.3f');   // density/small floats: 0.384
const fmtRatio   = d3.format('.2f');   // ratios / Jaccard: 0.75

// ─── SVG chart helpers ──────────────────────────────────────────────────────

/**
 * Simple bar chart (one value per layer).
 * items: [{label, value}]
 */
export function svgBar(items, { width = 280, height = 200, color = BAR_FILL, yLabel = '', fmt = null } = {}) {
    const PL = 46, PR = 10, PT = 14, PB = 56;
    const W = width - PL - PR, H = height - PT - PB;
    if (!items.length) return `<svg width="${width}" height="${height}"></svg>`;

    const maxV = Math.max(...items.map(d => d.value), 0.0001);
    const fmtV = fmt || (v => v < 1 ? fmtDecimal(v) : fmtInteger(v));
    const step = W / items.length;
    const barW = Math.max(4, step * 0.62);

    let grid = '', yAxis = '', bars = '', xlabels = '';

    for (let i = 0; i <= 4; i++) {
        const v = (maxV * i) / 4;
        const y = PT + H - (v / maxV) * H;
        grid  += `<line x1="${PL}" y1="${y}" x2="${PL + W}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
        yAxis += `<text x="${PL - 5}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="${SUBTEXT}">${fmtV(v)}</text>`;
    }

    items.forEach(({ label, value }, i) => {
        const cx = PL + i * step + step / 2;
        const bh = (value / maxV) * H;
        bars    += `<rect x="${cx - barW / 2}" y="${PT + H - bh}" width="${barW}" height="${bh}" fill="${color}" rx="2"/>`;
        xlabels += `<text transform="translate(${cx},${PT + H + 5}) rotate(40)" text-anchor="start" font-size="10" fill="${TEXT}">${label}</text>`;
    });

    const axis = `<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>
                  <line x1="${PL}" y1="${PT + H}" x2="${PL + W}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>`;
    const yLbl = yLabel
        ? `<text transform="translate(10,${PT + H / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="${SUBTEXT}">${yLabel}</text>`
        : '';

    return `<svg width="${width}" height="${height}" style="overflow:visible">${yLbl}${grid}${axis}${bars}${xlabels}${yAxis}</svg>`;
}

/**
 * Stacked bar chart (Set A bottom, Set B top).
 * items: [{label, valueA, valueB}]
 */
function svgStackedBar(items, {
    width = 280, height = 200,
    colorA = SET_A_COLOR, colorB = SET_B_COLOR,
    labelA = 'Set A', labelB = 'Set B',
} = {}) {
    const PL = 46, PR = 82, PT = 14, PB = 56;
    const W = width - PL - PR, H = height - PT - PB;
    if (!items.length) return `<svg width="${width}" height="${height}"></svg>`;

    const maxT = Math.max(...items.map(d => d.valueA + d.valueB), 0.0001);
    const step = W / items.length;
    const barW = Math.max(4, step * 0.62);

    let grid = '', yAxis = '', bars = '', xlabels = '';

    for (let i = 0; i <= 4; i++) {
        const v = Math.round((maxT * i) / 4);
        const y = PT + H - (v / maxT) * H;
        grid  += `<line x1="${PL}" y1="${y}" x2="${PL + W}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
        yAxis += `<text x="${PL - 5}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="${SUBTEXT}">${v}</text>`;
    }

    items.forEach(({ label, valueA, valueB }, i) => {
        const cx  = PL + i * step + step / 2;
        const bhA = (valueA / maxT) * H;
        const bhB = (valueB / maxT) * H;
        const yA  = PT + H - bhA;
        const yB  = yA - bhB;
        bars    += `<rect x="${cx - barW / 2}" y="${yB}" width="${barW}" height="${bhB}" fill="${colorB}" rx="2"/>
                    <rect x="${cx - barW / 2}" y="${yA}" width="${barW}" height="${bhA}" fill="${colorA}"/>`;
        xlabels += `<text transform="translate(${cx},${PT + H + 5}) rotate(40)" text-anchor="start" font-size="10" fill="${TEXT}">${label}</text>`;
    });

    const axis = `<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>
                  <line x1="${PL}" y1="${PT + H}" x2="${PL + W}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>`;
    const legendY = PT + 8;
    const legend  = `<rect x="${PL + W + 14}" y="${legendY}"      width="10" height="10" fill="${colorB}" rx="2"/>
                     <text x="${PL + W + 28}" y="${legendY + 9}"  font-size="10" fill="${TEXT}">${labelB}</text>
                     <rect x="${PL + W + 14}" y="${legendY + 17}" width="10" height="10" fill="${colorA}" rx="2"/>
                     <text x="${PL + W + 28}" y="${legendY + 26}" font-size="10" fill="${TEXT}">${labelA}</text>`;

    return `<svg width="${width}" height="${height}" style="overflow:visible">${grid}${axis}${bars}${xlabels}${yAxis}${legend}</svg>`;
}

/**
 * Histogram with integer-labelled bins.
 * bins: [{x0, count}]
 */
function svgHist(bins, { width = 300, height = 160, color = BAR_FILL, xLabel = '', yLabel = 'Nodes' } = {}) {
    const PL = 40, PR = 20, PT = 14, PB = 42;
    const W = width - PL - PR, H = height - PT - PB;
    if (!bins.length) return `<svg width="${width}" height="${height}"><text x="${PL + W / 2}" y="${PT + H / 2}" text-anchor="middle" font-size="11" fill="${SUBTEXT}">No data</text></svg>`;

    const maxC = Math.max(...bins.map(b => b.count), 1);
    const binW = W / bins.length;
    const nT   = Math.min(4, maxC);

    let grid = '', yAxis = '', bars = '', xlabels = '';

    for (let i = 0; i <= nT; i++) {
        const v = Math.round((maxC * i) / nT);
        const y = PT + H - (v / maxC) * H;
        grid  += `<line x1="${PL}" y1="${y}" x2="${PL + W}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
        yAxis += `<text x="${PL - 5}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="${SUBTEXT}">${v}</text>`;
    }

    const step = bins.length <= 12 ? 1 : Math.ceil(bins.length / 8);
    bins.forEach(({ x0, count }, i) => {
        const x  = PL + i * binW;
        const bh = (count / maxC) * H;
        bars += `<rect x="${x + 1}" y="${PT + H - bh}" width="${Math.max(1, binW - 2)}" height="${bh}" fill="${color}" rx="2"/>`;
        if (i % step === 0 || i === bins.length - 1) {
            xlabels += `<text x="${x + binW / 2}" y="${PT + H + 13}" text-anchor="middle" font-size="10" fill="${SUBTEXT}">${x0}</text>`;
        }
    });

    const axis  = `<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>
                   <line x1="${PL}" y1="${PT + H}" x2="${PL + W}" y2="${PT + H}" stroke="${GRID}" stroke-width="1.5"/>`;
    const xLbl  = xLabel ? `<text x="${PL + W / 2}" y="${PT + H + 34}" text-anchor="middle" font-size="10" fill="${SUBTEXT}">${xLabel}</text>` : '';
    const yLbl  = yLabel ? `<text transform="translate(10,${PT + H / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="${SUBTEXT}">${yLabel}</text>` : '';

    return `<svg width="${width}" height="${height}" style="overflow:visible">${yLbl}${grid}${axis}${bars}${xlabels}${xLbl}${yAxis}</svg>`;
}

// ─── Heatmap helpers ─────────────────────────────────────────────────────────

function _hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Interpolate from white → hex color by t (0–1). NaN → light gray. */
function _lerpColor(t, hex) {
    if (isNaN(t)) return '#e5e7eb';
    const [r, g, b] = _hexToRgb(hex);
    return `rgb(${Math.round(255 + (r - 255) * t)},${Math.round(255 + (g - 255) * t)},${Math.round(255 + (b - 255) * t)})`;
}

/**
 * Square heatmap SVG.
 * matrix[i][j]: 0–1 (NaN = missing).
 * labels: array of strings (row = column order).
 */
function svgHeatmap(matrix, labels, { accentColor = ACCENT, cellSize = 36 } = {}) {
    const n = labels.length;
    if (n === 0) return '<svg width="10" height="10"></svg>';

    const maxLen  = Math.max(...labels.map(l => l.length));
    const LABEL_W = Math.min(maxLen * 6.2 + 10, 130);
    const HDR_H   = Math.min(maxLen * 6.2 + 10, 120);
    const showTxt = cellSize >= 30;

    // Luminance of accent at full saturation — determines text colour crossover
    const [ar, ag, ab] = _hexToRgb(accentColor);
    const accentLum = (ar * 0.299 + ag * 0.587 + ab * 0.114) / 255;

    let colLabels = '', rowLabels = '', cells = '';

    labels.forEach((ln, j) => {
        const x = LABEL_W + j * cellSize + cellSize / 2;
        const lbl = ln.length > 18 ? ln.slice(0, 17) + '…' : ln;
        colLabels += `<text transform="translate(${x},${HDR_H - 4}) rotate(-45)" text-anchor="start" font-size="10" fill="${TEXT}">${lbl}</text>`;
    });

    labels.forEach((rowLabel, i) => {
        const y   = HDR_H + i * cellSize;
        const lbl = rowLabel.length > 18 ? rowLabel.slice(0, 17) + '…' : rowLabel;
        rowLabels += `<text x="${LABEL_W - 5}" y="${y + cellSize / 2 + 3}" text-anchor="end" font-size="10" fill="${TEXT}">${lbl}</text>`;

        labels.forEach((_, j) => {
            const val  = matrix[i][j];
            const fill = _lerpColor(val, accentColor);
            const x    = LABEL_W + j * cellSize;
            // White text when interpolated luminance is dark enough
            const interpLum = isNaN(val) ? 1 : 1 + (accentLum - 1) * val;
            const textFill  = interpLum < 0.52 ? '#fff' : TEXT;

            cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="${GRID}" stroke-width="0.5"/>`;
            if (showTxt && !isNaN(val)) {
                const fs  = Math.min(10, cellSize * 0.27);
                cells += `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + fs * 0.4}" text-anchor="middle" font-size="${fs}" fill="${textFill}">${fmtRatio(val)}</text>`;
            }
        });
    });

    const W = LABEL_W + n * cellSize, H = HDR_H + n * cellSize;
    return `<svg width="${W}" height="${H}" style="overflow:visible">${colLabels}${rowLabels}${cells}</svg>`;
}

// ─── Dashboard class ─────────────────────────────────────────────────────────

export class Dashboard {
    constructor(container, model, { onLayerClick } = {}) {
        this.container    = container;
        this.model        = model;
        this.onLayerClick = onLayerClick;
        this._collapsed        = new Set();
        this._sortOrder        = 'participation';
        this._showBipartite    = true;
        this._matrixFlipped    = true; // false = Node rows × Layer cols; true = Layer rows × Node cols
        this._tip              = null;
        this._intraLayer       = 'all'; // 'all' or a layer name
        this._interPair        = null;  // null = all, or { from, to }
    }

    setSortOrder(order)     { this._sortOrder = order;           this.render(); }
    setShowBipartite(val)   { this._showBipartite = val;         this.render(); }
    setMatrixFlipped(val)   { this._matrixFlipped = val;         this.render(); }

    render() {
        this._tip?.remove();
        this._tip = null;
        const s  = this._computeStats();
        this._stats = s;
        const bp = s.isBipartite && this._showBipartite;

        this.container.innerHTML = `<div class="db-root">
            ${this._sKPI(s, bp)}
            ${this._sLayerCharts(s, bp)}
            ${this._sWeightDist(s)}
            ${this._sMatrix(s, bp)}
            ${this._sLayerSimilarity(s, bp)}
            ${this._sDegree(s, bp)}
            ${this._sParticipation(s, bp)}
        </div>`;

        this._attachEvents();
    }

    // ── Data computation ───────────────────────────────────────────────────

    _computeStats() {
        const m          = this.model;
        const layerNames = m.layers.map(l => l.layer_name);
        const isDir      = m.directed ?? false;

        const bpInfoAll  = layerNames.map(ln => m.bipartiteInfo?.get(ln));
        const isBipartite = bpInfoAll.length > 0 && bpInfoAll.every(b => b?.isBipartite);
        const firstBp    = bpInfoAll.find(b => b?.isBipartite);
        const setALabel  = firstBp?.setALabel ?? 'Set A';
        const setBLabel  = firstBp?.setBLabel ?? 'Set B';

        const setANodes = new Set(), setBNodes = new Set();
        if (isBipartite) {
            for (const b of bpInfoAll) {
                if (!b?.isBipartite) continue;
                for (const n of b.setA) setANodes.add(n);
                for (const n of b.setB) setBNodes.add(n);
            }
        }

        // Per-layer stats
        const edgeKeySets = new Map(); // layerName → Set of deduplicated edge keys
        const perLayer = layerNames.map((layerName, li) => {
            const nodeSet = m.nodesPerLayer.get(layerName) ?? new Set();
            const N  = nodeSet.size;
            const bp = bpInfoAll[li];
            const isBp = bp?.isBipartite ?? false;
            const nA = isBp ? (bp.setA?.size ?? 0) : 0;
            const nB = isBp ? (bp.setB?.size ?? 0) : 0;

            const edgeKeys = new Set();
            for (const lk of m.intralayerLinks) {
                if (lk.layer_from !== layerName) continue;
                const key = isDir
                    ? `${lk.node_from}→${lk.node_to}`
                    : [lk.node_from, lk.node_to].sort().join('::');
                edgeKeys.add(key);
            }
            edgeKeySets.set(layerName, edgeKeys);
            const E = edgeKeys.size;

            let Emax;
            if (isBp)  Emax = isDir ? 2 * nA * nB : nA * nB;
            else       Emax = isDir ? N * (N - 1)  : N * (N - 1) / 2;
            const density = Emax > 0 ? E / Emax : 0;

            return { layerName, N, E, density, nA, nB, isBp };
        });

        const avgDensity = perLayer.length
            ? perLayer.reduce((sum, l) => sum + l.density, 0) / perLayer.length
            : 0;

        // Node participation
        const nodeParticipation = new Map();
        for (const n of m.nodes) nodeParticipation.set(n.node_name, 0);
        for (const sn of m.stateNodes) {
            nodeParticipation.set(sn.node_name, (nodeParticipation.get(sn.node_name) ?? 0) + 1);
        }

        // Degree: summed across all layers per physical node
        const nodeDegree = new Map();
        for (const sn of m.stateNodes) {
            nodeDegree.set(sn.node_name, (nodeDegree.get(sn.node_name) ?? 0) + (sn.degree ?? 0));
        }

        // Presence set for matrix ("layerName::nodeName")
        const presence = new Set();
        for (const sn of m.stateNodes) presence.add(`${sn.layer_name}::${sn.node_name}`);

        // Node set membership
        const nodeSetMap = new Map();
        if (isBipartite) {
            for (const n of setANodes) nodeSetMap.set(n, 'A');
            for (const n of setBNodes) nodeSetMap.set(n, 'B');
        }

        const allNodeNames = m.nodes.map(n => n.node_name);
        const sortedNodes  = this._sortNodes(allNodeNames, nodeParticipation, setANodes, setBNodes);

        return {
            isDir, isBipartite,
            setALabel, setBLabel, setANodes, setBNodes, nodeSetMap,
            totalNodes: m.nodes.length, totalLayers: layerNames.length,
            totalIntra: m.intralayerLinks.length, totalInter: m.interlayerLinks.length,
            avgDensity, perLayer, layerNames,
            nodeParticipation, nodeDegree, presence, sortedNodes, edgeKeySets,
        };
    }

    _sortNodes(names, participation, setA, setB) {
        const arr = [...names];
        if (this._sortOrder === 'name') {
            arr.sort();
        } else if (this._sortOrder === 'set') {
            arr.sort((a, b) => {
                const ra = setA.has(a) ? 0 : setB.has(a) ? 1 : 2;
                const rb = setA.has(b) ? 0 : setB.has(b) ? 1 : 2;
                if (ra !== rb) return ra - rb;
                return (participation.get(b) ?? 0) - (participation.get(a) ?? 0);
            });
        } else {
            arr.sort((a, b) => (participation.get(b) ?? 0) - (participation.get(a) ?? 0));
        }
        return arr;
    }

    // ── Section builders ───────────────────────────────────────────────────

    _sec(id, title, content) {
        const open = !this._collapsed.has(id);
        return `<div class="db-section">
            <div class="db-sec-hd" data-sec="${id}">
                <span class="db-sec-title">${title}</span>
                <span class="db-chevron">${open ? '▾' : '▸'}</span>
            </div>
            <div class="db-sec-bd" id="dbsec-${id}"${open ? '' : ' style="display:none"'}>${content}</div>
        </div>`;
    }

    _sKPI(s, bp) {
        const ratio = s.totalInter > 0
            ? fmtRatio(s.totalIntra / s.totalInter)
            : (s.totalIntra > 0 ? '∞' : '—');
        const nodesVal = bp
            ? `${s.totalNodes}<span class="db-kpi-sub">${s.setALabel}: ${s.setANodes.size} · ${s.setBLabel}: ${s.setBNodes.size}</span>`
            : `${s.totalNodes}`;

        const cards = [
            { v: nodesVal,                l: 'Physical nodes' },
            { v: s.totalLayers,           l: 'Layers' },
            { v: s.totalIntra,            l: 'Intra-layer edges' },
            { v: s.totalInter,            l: 'Interlayer edges' },
            { v: ratio,                   l: 'Intra : inter ratio' },
            { v: `<span class="db-badge">${s.isDir ? 'Directed' : 'Undirected'}</span><span class="db-badge">${bp ? 'Bipartite' : 'Unipartite'}</span>`, l: 'Network type' },
            { v: fmtDecimal(s.avgDensity), l: 'Avg layer density' },
        ];

        return this._sec('kpi', 'Summary',
            `<div class="db-kpi-row">${cards.map(c =>
                `<div class="db-card"><div class="db-kpi-v">${c.v}</div><div class="db-kpi-l">${c.l}</div></div>`
            ).join('')}</div>`
        );
    }

    _sLayerCharts(s, bp) {
        const W = 280, H = 200;

        let nodeChart;
        if (bp) {
            nodeChart = svgStackedBar(
                s.perLayer.map(l => ({ label: l.layerName, valueA: l.nA, valueB: l.nB })),
                { width: W, height: H, labelA: s.setALabel, labelB: s.setBLabel }
            );
        } else {
            nodeChart = svgBar(
                s.perLayer.map(l => ({ label: l.layerName, value: l.N })),
                { width: W, height: H, yLabel: 'Nodes', fmt: fmtInteger }
            );
        }
        const edgeChart = svgBar(
            s.perLayer.map(l => ({ label: l.layerName, value: l.E })),
            { width: W, height: H, yLabel: 'Edges', fmt: fmtInteger }
        );
        const densChart = svgBar(
            s.perLayer.map(l => ({ label: l.layerName, value: l.density })),
            { width: W, height: H, yLabel: 'Density', fmt: fmtDecimal }
        );

        return this._sec('layercharts', 'Per-Layer Overview', `
            <div class="db-charts-row">
                <div class="db-chart-box"><div class="db-chart-title">Nodes per layer</div>${nodeChart}</div>
                <div class="db-chart-box"><div class="db-chart-title">Edges per layer</div>${edgeChart}</div>
                <div class="db-chart-box"><div class="db-chart-title">Density per layer</div>${densChart}</div>
            </div>`);
    }

    _sMatrix(s, bp) {
        const CELL  = 13;
        const HDR_H = 88;

        const flipped   = this._matrixFlipped;
        const title     = flipped ? 'Layer × Node Presence Matrix' : 'Node × Layer Presence Matrix';

        // Controls row: sort + orientation toggle
        const sortCtrl = `<div class="db-matrix-ctrl">
            <span style="font-size:11px;color:${SUBTEXT}">Sort nodes by:</span>
            <button class="db-sort-btn${this._sortOrder === 'participation' ? ' active' : ''}" data-sort="participation">Participation</button>
            <button class="db-sort-btn${this._sortOrder === 'name'          ? ' active' : ''}" data-sort="name">Name</button>
            ${bp ? `<button class="db-sort-btn${this._sortOrder === 'set' ? ' active' : ''}" data-sort="set">Set</button>` : ''}
            <span style="font-size:11px;color:${SUBTEXT};margin-left:8px;">Layout:</span>
            <button class="db-sort-btn${!flipped ? ' active' : ''}" data-flip="false">Node rows</button>
            <button class="db-sort-btn${flipped  ? ' active' : ''}" data-flip="true">Layer rows</button>
        </div>`;

        let svgContent, svgW, svgH;

        if (!flipped) {
            // ── Node rows × Layer cols ────────────────────────────────────
            const LABEL_W = 132;

            const colHdrs = s.layerNames.map((ln, j) => {
                const x = LABEL_W + j * CELL + CELL / 2;
                return `<text transform="translate(${x},${HDR_H}) rotate(-55)" text-anchor="start" font-size="10" fill="${TEXT}">${ln}</text>`;
            }).join('');

            let rowSvg = '';
            s.sortedNodes.forEach((nodeName, i) => {
                const mem = s.nodeSetMap.get(nodeName) ?? '';
                const lc  = mem === 'A' ? SET_A_COLOR : mem === 'B' ? SET_B_COLOR : SUBTEXT;
                const y   = HDR_H + 6 + i * CELL;
                const cnt = s.nodeParticipation.get(nodeName) ?? 0;
                const lbl = nodeName.length > 17 ? nodeName.slice(0, 16) + '…' : nodeName;
                rowSvg += `<text x="${LABEL_W - 5}" y="${y + CELL / 2 + 3}" text-anchor="end" font-size="10" fill="${lc}" class="db-m-node" data-node="${nodeName}" data-cnt="${cnt}">${lbl}</text>`;
                s.layerNames.forEach((ln, j) => {
                    const present = s.presence.has(`${ln}::${nodeName}`);
                    const fill    = present ? (mem === 'A' ? SET_A_COLOR : mem === 'B' ? SET_B_COLOR : ACCENT) : '#f3f4f6';
                    rowSvg += `<rect x="${LABEL_W + j * CELL}" y="${y}" width="${CELL - 1}" height="${CELL - 1}" fill="${fill}" rx="1"/>`;
                });
            });

            svgW = LABEL_W + s.layerNames.length * CELL + 20;
            svgH = HDR_H + 8 + s.sortedNodes.length * CELL;
            svgContent = colHdrs + rowSvg;

        } else {
            // ── Layer rows × Node cols ────────────────────────────────────
            const LABEL_W = 110;

            // Rotated node-name column headers
            const colHdrs = s.sortedNodes.map((nodeName, j) => {
                const x   = LABEL_W + j * CELL + CELL / 2;
                const mem = s.nodeSetMap.get(nodeName) ?? '';
                const lc  = mem === 'A' ? SET_A_COLOR : mem === 'B' ? SET_B_COLOR : SUBTEXT;
                const cnt = s.nodeParticipation.get(nodeName) ?? 0;
                const lbl = nodeName.length > 17 ? nodeName.slice(0, 16) + '…' : nodeName;
                return `<text transform="translate(${x},${HDR_H}) rotate(-55)" text-anchor="start" font-size="10" fill="${lc}" class="db-m-node" data-node="${nodeName}" data-cnt="${cnt}" style="cursor:default">${lbl}</text>`;
            }).join('');

            // Layer rows
            let rowSvg = '';
            s.layerNames.forEach((layerName, i) => {
                const y   = HDR_H + 6 + i * CELL;
                const lbl = layerName.length > 14 ? layerName.slice(0, 13) + '…' : layerName;
                rowSvg += `<text x="${LABEL_W - 5}" y="${y + CELL / 2 + 3}" text-anchor="end" font-size="10" fill="${TEXT}">${lbl}</text>`;
                s.sortedNodes.forEach((nodeName, j) => {
                    const present = s.presence.has(`${layerName}::${nodeName}`);
                    const mem     = s.nodeSetMap.get(nodeName) ?? '';
                    const fill    = present ? (mem === 'A' ? SET_A_COLOR : mem === 'B' ? SET_B_COLOR : ACCENT) : '#f3f4f6';
                    rowSvg += `<rect x="${LABEL_W + j * CELL}" y="${y}" width="${CELL - 1}" height="${CELL - 1}" fill="${fill}" rx="1"/>`;
                });
            });

            svgW = LABEL_W + s.sortedNodes.length * CELL + 20;
            svgH = HDR_H + 8 + s.layerNames.length * CELL;
            svgContent = colHdrs + rowSvg;
        }

        return this._sec('matrix', title, `
            ${sortCtrl}
            <div class="db-matrix-wrap">
                <svg width="${svgW}" height="${svgH}" style="overflow:visible">${svgContent}</svg>
            </div>`);
    }

    _sDegree(s, bp) {
        const makeBins = (vals, nBins = 10) => {
            if (!vals.length) return [];
            const max = Math.max(...vals);
            if (max === 0) return [{ x0: 0, count: vals.length }];
            const bw   = Math.max(1, Math.ceil(max / nBins));
            const n    = Math.ceil((max + 1) / bw);
            const bins = Array.from({ length: n }, (_, i) => ({ x0: i * bw, count: 0 }));
            for (const v of vals) bins[Math.min(Math.floor(v / bw), n - 1)].count++;
            while (bins.length > 1 && bins.at(-1).count === 0) bins.pop();
            return bins;
        };

        let content;
        if (bp) {
            const dA = [...s.setANodes].map(n => s.nodeDegree.get(n) ?? 0);
            const dB = [...s.setBNodes].map(n => s.nodeDegree.get(n) ?? 0);
            content = `<div class="db-charts-row">
                <div class="db-chart-box"><div class="db-chart-title">${s.setALabel} — degree distribution</div>
                    ${svgHist(makeBins(dA), { width: 300, height: 160, color: SET_A_COLOR, xLabel: 'Degree' })}</div>
                <div class="db-chart-box"><div class="db-chart-title">${s.setBLabel} — degree distribution</div>
                    ${svgHist(makeBins(dB), { width: 300, height: 160, color: SET_B_COLOR, xLabel: 'Degree' })}</div>
            </div>`;
        } else {
            const d = [...s.nodeDegree.values()];
            content = `<div class="db-chart-box"><div class="db-chart-title">Degree distribution</div>
                ${svgHist(makeBins(d), { width: 460, height: 200, xLabel: 'Degree' })}</div>`;
        }
        return this._sec('degree', 'Degree Distributions', content);
    }

    _sParticipation(s, bp) {
        const L       = s.totalLayers;
        const makeBins = vals => Array.from({ length: L }, (_, i) => ({
            x0: i + 1,
            count: vals.filter(v => v === i + 1).length,
        }));

        let content;
        if (bp) {
            const vA = [...s.setANodes].map(n => s.nodeParticipation.get(n) ?? 0);
            const vB = [...s.setBNodes].map(n => s.nodeParticipation.get(n) ?? 0);
            content = `<div class="db-charts-row">
                <div class="db-chart-box"><div class="db-chart-title">${s.setALabel} — layer participation</div>
                    ${svgHist(makeBins(vA), { width: 300, height: 160, color: SET_A_COLOR, xLabel: 'Number of layers' })}</div>
                <div class="db-chart-box"><div class="db-chart-title">${s.setBLabel} — layer participation</div>
                    ${svgHist(makeBins(vB), { width: 300, height: 160, color: SET_B_COLOR, xLabel: 'Number of layers' })}</div>
            </div>`;
        } else {
            const v = [...s.nodeParticipation.values()];
            content = `<div class="db-chart-box"><div class="db-chart-title">Layer participation (multiplexity)</div>
                ${svgHist(makeBins(v), { width: 460, height: 200, xLabel: 'Number of layers' })}</div>`;
        }
        return this._sec('participation', 'Node Participation (Multiplexity)', content);
    }

    _sSetRatio(s) {
        const items = s.perLayer.map(l => ({ label: l.layerName, valueA: l.nA, valueB: l.nB }));
        return this._sec('setratio', `Set Size Ratio Across Layers`,
            `<div class="db-chart-box">
                ${svgStackedBar(items, { width: 460, height: 200, labelA: s.setALabel, labelB: s.setBLabel })}
            </div>`
        );
    }

    _sWeightDist(s) {
        const INTRA_COLOR  = BAR_FILL;
        const INTER_COLOR  = 'rgba(245,158,11,0.75)';
        const W_HIST = 420, H_HIST = 220;

        const makeBins = (weights, nBins = 15) => {
            if (!weights.length) return [];
            const mn = Math.min(...weights), mx = Math.max(...weights);
            if (mn === mx) return [{ x0: parseFloat(mn.toFixed(3)), count: weights.length }];
            const bw = (mx - mn) / nBins;
            const bins = Array.from({ length: nBins }, (_, i) => ({
                x0: parseFloat((mn + i * bw).toFixed(3)), count: 0
            }));
            for (const w of weights) {
                const idx = Math.min(Math.floor((w - mn) / bw), nBins - 1);
                bins[idx].count++;
            }
            while (bins.length > 1 && bins.at(-1).count === 0) bins.pop();
            return bins;
        };

        // ── Intralayer ──
        const intraLinks = this.model.intralayerLinks;
        const layerNames = s.layerNames;

        const intraWeightsFor = (layerName) =>
            intraLinks
                .filter(lk => layerName === 'all' || lk.layer_from === layerName)
                .map(lk => lk.weight ?? 1);

        const intraWeights = intraWeightsFor(this._intraLayer);
        const allUniform   = intraWeights.every(w => w === intraWeights[0]);

        const dropdownOpts = [`<option value="all"${this._intraLayer === 'all' ? ' selected' : ''}>All layers</option>`]
            .concat(layerNames.map(ln =>
                `<option value="${ln}"${this._intraLayer === ln ? ' selected' : ''}>${ln}</option>`
            )).join('');

        const intraTitle = this._intraLayer === 'all'
            ? 'Intralayer link weights (all layers)'
            : `Intralayer link weights — ${this._intraLayer}`;

        const intraHist = intraWeights.length === 0
            ? `<p style="font-size:11px;color:${SUBTEXT};margin:8px 0;">No intralayer links.</p>`
            : svgHist(makeBins(intraWeights), { width: W_HIST, height: H_HIST, color: INTRA_COLOR, xLabel: 'Weight', yLabel: 'Links' });

        const intraPanel = `<div class="db-chart-box">
            <div class="db-chart-title">${intraTitle}</div>
            <div style="margin-bottom:8px;">
                <select id="dbIntraLayerSelect" class="db-weight-select">${dropdownOpts}</select>
            </div>
            ${intraHist}
        </div>`;

        // ── Interlayer ──
        const interLinks = this.model.interlayerLinks;
        if (!interLinks.length) {
            return this._sec('weightdist', 'Link Weight Distributions',
                `<div class="db-charts-row">${intraPanel}</div>`);
        }

        // Count matrix: interCount[i][j] = number of links between layerNames[i] and layerNames[j]
        const idx = Object.fromEntries(layerNames.map((ln, i) => [ln, i]));
        const n   = layerNames.length;
        const countMat = Array.from({ length: n }, () => new Array(n).fill(0));
        const directedInter = this.model.directedInterlayer ?? this.model.directed ?? false;
        for (const lk of interLinks) {
            const i = idx[lk.layer_from], j = idx[lk.layer_to];
            if (i !== undefined && j !== undefined) {
                countMat[i][j]++;
                if (!directedInter) countMat[j][i]++;
            }
        }
        const maxCount = Math.max(...countMat.flat(), 1);

        // Normalised (0–1) for colour, raw count for cell text + data attrs
        const cellSize = n <= 8 ? 28 : n <= 14 ? 20 : n <= 22 ? 14 : 10;
        const maxLen   = Math.max(...layerNames.map(l => l.length));
        const LABEL_W  = Math.min(maxLen * 6.2 + 10, 130);
        const HDR_H    = Math.min(maxLen * 6.2 + 10, 120);

        let colLabels = '', rowLabels = '', cells = '';
        layerNames.forEach((ln, j) => {
            const x   = LABEL_W + j * cellSize + cellSize / 2;
            const lbl = ln.length > 18 ? ln.slice(0, 17) + '…' : ln;
            colLabels += `<text transform="translate(${x},${HDR_H - 4}) rotate(-45)" text-anchor="start" font-size="10" fill="${TEXT}">${lbl}</text>`;
        });
        layerNames.forEach((rowLn, i) => {
            const y   = HDR_H + i * cellSize;
            const lbl = rowLn.length > 18 ? rowLn.slice(0, 17) + '…' : rowLn;
            rowLabels += `<text x="${LABEL_W - 5}" y="${y + cellSize / 2 + 3}" text-anchor="end" font-size="10" fill="${TEXT}">${lbl}</text>`;
            layerNames.forEach((colLn, j) => {
                const cnt  = countMat[i][j];
                const t    = cnt / maxCount;
                const fill = _lerpColor(t, '#f59e0b');
                const x    = LABEL_W + j * cellSize;
                const isSelected = this._interPair && this._interPair.from === rowLn && this._interPair.to === colLn;
                const stroke = isSelected ? '#1f2937' : GRID;
                const sw     = isSelected ? 2 : 0.5;
                const fs     = Math.min(10, cellSize * 0.27);
                const textFill = (1 + (((245*0.299+158*0.587+11*0.114)/255) - 1) * t) < 0.52 ? '#fff' : TEXT;
                cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" class="db-inter-cell" data-from="${rowLn}" data-to="${colLn}" style="cursor:${cnt > 0 ? 'pointer' : 'default'}"/>`;
                if (cellSize >= 14 && cnt > 0) {
                    cells += `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + fs * 0.4}" text-anchor="middle" font-size="${fs}" fill="${textFill}" pointer-events="none">${cnt}</text>`;
                }
            });
        });
        const hmW = LABEL_W + n * cellSize, hmH = HDR_H + n * cellSize;
        const heatmapSvg = `<svg width="${hmW}" height="${hmH}" id="dbInterHeatmap" style="overflow:visible;cursor:default">${colLabels}${rowLabels}${cells}</svg>`;

        // Interlayer histogram
        const interWeights = interLinks
            .filter(lk => {
                if (!this._interPair) return true;
                const fwd = lk.layer_from === this._interPair.from && lk.layer_to === this._interPair.to;
                const rev = !directedInter && lk.layer_from === this._interPair.to && lk.layer_to === this._interPair.from;
                return fwd || rev;
            })
            .map(lk => lk.weight ?? 1);

        const interTitle = this._interPair
            ? `Interlayer weights — ${this._interPair.from} ↔ ${this._interPair.to}`
            : 'Interlayer link weights (all pairs)';

        const clearBtn = this._interPair
            ? `<button id="dbInterClearBtn" class="db-sort-btn" style="margin-left:8px;">✕ Clear</button>`
            : '';

        const heatmapOpen = !!this._interPair;
        const toggleLabel = heatmapOpen ? 'Filter by pair ▾' : 'Filter by pair ▸';

        const interHist = interWeights.length === 0
            ? `<p style="font-size:11px;color:${SUBTEXT};margin:8px 0;">No links for this pair.</p>`
            : svgHist(makeBins(interWeights), { width: W_HIST, height: H_HIST, color: INTER_COLOR, xLabel: 'Weight', yLabel: 'Links' });

        const interPanel = `<div class="db-chart-box">
            <div class="db-chart-title" style="display:flex;align-items:center;gap:6px;">
                ${interTitle}${clearBtn}
                <button id="dbInterToggleBtn" class="db-sort-btn" style="margin-left:auto;">${toggleLabel}</button>
            </div>
            <div id="dbInterHeatmapWrap" style="${heatmapOpen ? '' : 'display:none;'}margin-top:10px;">
                <div style="font-size:11px;color:${SUBTEXT};margin-bottom:6px;">Click a cell to filter by layer pair</div>
                <div style="overflow:auto;">${heatmapSvg}</div>
            </div>
            ${interHist}
        </div>`;

        return this._sec('weightdist', 'Link Weight Distributions',
            `<div class="db-charts-row">${intraPanel}${interPanel}</div>`);
    }

    _sLayerSimilarity(s, bp) {
        const L = s.layerNames;
        const n = L.length;
        const m = this.model;

        // Jaccard index between two sets
        const jaccard = (A, B) => {
            if (!A.size && !B.size) return NaN;
            let inter = 0;
            const [small, large] = A.size <= B.size ? [A, B] : [B, A];
            for (const x of small) if (large.has(x)) inter++;
            return inter / (A.size + B.size - inter);
        };

        const cellSize = n <= 8 ? 44 : n <= 14 ? 32 : n <= 22 ? 22 : 14;

        // Edge similarity matrix (always shown)
        const matE = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) =>
                jaccard(s.edgeKeySets.get(L[i]) ?? new Set(), s.edgeKeySets.get(L[j]) ?? new Set())
            )
        );

        let content;
        if (bp) {
            // Per-layer Set A and Set B node subsets
            const layerA = L.map(ln => {
                const all = m.nodesPerLayer.get(ln) ?? new Set();
                return new Set([...all].filter(x => s.setANodes.has(x)));
            });
            const layerB = L.map(ln => {
                const all = m.nodesPerLayer.get(ln) ?? new Set();
                return new Set([...all].filter(x => s.setBNodes.has(x)));
            });
            const matA = Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => jaccard(layerA[i], layerA[j]))
            );
            const matB = Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => jaccard(layerB[i], layerB[j]))
            );
            content = `<div class="db-heatmap-col">
                <div class="db-chart-box">
                    <div class="db-chart-title">${s.setALabel} node identity (Jaccard)</div>
                    ${svgHeatmap(matA, L, { accentColor: SET_A_COLOR, cellSize })}
                </div>
                <div class="db-chart-box">
                    <div class="db-chart-title">${s.setBLabel} node identity (Jaccard)</div>
                    ${svgHeatmap(matB, L, { accentColor: SET_B_COLOR, cellSize })}
                </div>
                <div class="db-chart-box">
                    <div class="db-chart-title">Edge identity (Jaccard)</div>
                    ${svgHeatmap(matE, L, { accentColor: '#f59e0b', cellSize })}
                </div>
            </div>`;
        } else {
            const matN = Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) =>
                    jaccard(m.nodesPerLayer.get(L[i]) ?? new Set(), m.nodesPerLayer.get(L[j]) ?? new Set())
                )
            );
            content = `<div class="db-heatmap-col">
                <div class="db-chart-box">
                    <div class="db-chart-title">Node identity (Jaccard)</div>
                    ${svgHeatmap(matN, L, { accentColor: ACCENT, cellSize })}
                </div>
                <div class="db-chart-box">
                    <div class="db-chart-title">Edge identity (Jaccard)</div>
                    ${svgHeatmap(matE, L, { accentColor: '#f59e0b', cellSize })}
                </div>
            </div>`;
        }

        return this._sec('similarity', 'Layer Similarity (Jaccard)', content);
    }

    // ── Event wiring ───────────────────────────────────────────────────────

    _attachEvents() {
        const root = this.container;

        // Section collapse / expand
        root.querySelectorAll('.db-sec-hd').forEach(hd => {
            hd.addEventListener('click', () => {
                const id   = hd.dataset.sec;
                const body = document.getElementById(`dbsec-${id}`);
                const chev = hd.querySelector('.db-chevron');
                const open = body.style.display !== 'none';
                body.style.display = open ? 'none' : '';
                chev.textContent   = open ? '▸' : '▾';
                open ? this._collapsed.add(id) : this._collapsed.delete(id);
            });
        });

        // Presence matrix: sort + flip buttons
        root.querySelectorAll('.db-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.sort !== undefined) {
                    this._sortOrder = btn.dataset.sort;
                } else if (btn.dataset.flip !== undefined) {
                    this._matrixFlipped = btn.dataset.flip === 'true';
                }
                this.render();
            });
        });

        // Weight distribution: intralayer dropdown
        const intraSelect = root.querySelector('#dbIntraLayerSelect');
        if (intraSelect) {
            intraSelect.addEventListener('change', () => {
                this._intraLayer = intraSelect.value;
                this.render();
            });
        }

        // Weight distribution: interlayer heatmap cell clicks
        root.querySelectorAll('.db-inter-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const from = cell.dataset.from, to = cell.dataset.to;
                // Check there are actually links for this pair
                const dirInter = this.model.directedInterlayer ?? this.model.directed ?? false;
                const hasLinks = this.model.interlayerLinks.some(lk => {
                    const fwd = lk.layer_from === from && lk.layer_to === to;
                    const rev = !dirInter && lk.layer_from === to && lk.layer_to === from;
                    return fwd || rev;
                });
                if (!hasLinks) return;
                this._interPair = { from, to };
                this.render();
            });
        });

        // Weight distribution: toggle heatmap visibility
        const toggleBtn = root.querySelector('#dbInterToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const wrap = root.querySelector('#dbInterHeatmapWrap');
                if (!wrap) return;
                const open = wrap.style.display !== 'none';
                wrap.style.display = open ? 'none' : '';
                toggleBtn.textContent = open ? 'Filter by pair ▸' : 'Filter by pair ▾';
            });
        }

        // Weight distribution: clear interlayer filter
        const clearBtn = root.querySelector('#dbInterClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._interPair = null;
                this.render();
            });
        }

        // Presence matrix: node tooltip
        const tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;background:#1f2937;color:#fff;font-size:11px;padding:4px 10px;border-radius:4px;pointer-events:none;display:none;z-index:9999;white-space:nowrap;';
        document.body.appendChild(tip);
        this._tip = tip;

        root.querySelectorAll('.db-m-node').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const cnt = el.dataset.cnt;
                tip.textContent = `${el.dataset.node}  ·  ${cnt} layer${cnt === '1' ? '' : 's'}`;
                tip.style.display = 'block';
            });
            el.addEventListener('mousemove', e => {
                tip.style.left = `${e.clientX + 14}px`;
                tip.style.top  = `${e.clientY - 8}px`;
            });
            el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
        });
    }

    destroy() {
        this._tip?.remove();
        this._tip = null;
    }
}
