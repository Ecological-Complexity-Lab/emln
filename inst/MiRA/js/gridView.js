const SET_A_COLOR = '#0072b2';
const SET_B_COLOR = '#f472b6';

export class GridView {
    constructor() {
        this._lastCells = []; // {layerName, cellX, cellY, cellW, cellH, nodePositions: Map}
    }

    // Mirrors renderer._computeFocusSet: all instances + 1-hop neighbours
    _computeFocusSet(nodeName, model) {
        const set = new Set();
        for (const layer of model.layers) {
            set.add(`${layer.layer_name}::${nodeName}`);
        }
        for (const link of model.intralayerLinks) {
            if (link.node_from === nodeName) set.add(`${link.layer_to}::${link.node_to}`);
            if (link.node_to   === nodeName) set.add(`${link.layer_from}::${link.node_from}`);
        }
        for (const link of model.interlayerLinks) {
            if (link.node_from === nodeName) set.add(`${link.layer_to}::${link.node_to}`);
            if (link.node_to   === nodeName) set.add(`${link.layer_from}::${link.node_from}`);
        }
        return set;
    }

    render(ctx, w, h, model, positions, opts) {
        const {
            columns = 3,
            layerWidth = 350,
            layerHeight = 250,
            nodeRadius = 10,
            nodeColorFn = null,
            nodeSizeFn = null,
            intraLinkColorFn = null,
            intraMinWeight = 0,
            layerColorFn = null,
            marginLeft = 0,
            marginTop = 0,
            selectedNodeName = null,
            bipartiteInfo = null,
            showSetNames = false,
            showLabels = false,
            labelFont = '12px Inter, system-ui, sans-serif',
            headerFontSize = 11,
        } = opts;

        const nLayers = model.layers.length;
        if (nLayers === 0) return;

        const cols = Math.max(1, Math.min(columns, nLayers));
        this._lastCells = [];

        const focusSet = selectedNodeName ? this._computeFocusSet(selectedNodeName, model) : null;

        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(marginLeft, marginTop, w - marginLeft, h - marginTop);

        for (let i = 0; i < nLayers; i++) {
            const layer = model.layers[i];
            const layerColors = layerColorFn ? layerColorFn(i, layer) : null;
            const bpInfo = bipartiteInfo?.get(layer.layer_name);
            const { x, y, cw, ch } = this._cellRect(i, nLayers, cols, w, h, marginLeft, marginTop);
            const nodePositions = this._drawCell(
                ctx, x, y, cw, ch, layer, positions, model,
                { nodeRadius, nodeColorFn, nodeSizeFn, intraLinkColorFn, intraMinWeight,
                  layerWidth, layerHeight, selectedNodeName, layerColors, focusSet,
                  bpInfo: (bpInfo?.isBipartite ? bpInfo : null), showSetNames,
                  showLabels, labelFont, headerFontSize }
            );
            this._lastCells.push({
                layerName: layer.layer_name, cellX: x, cellY: y, cellW: cw, cellH: ch, nodePositions
            });
        }
    }

    _cellRect(i, nLayers, cols, w, h, marginLeft, marginTop) {
        const rows = Math.ceil(nLayers / cols);
        const GAP = 6;
        const PAD = 6;
        const availW = w - marginLeft;
        const availH = h - marginTop;
        const cw = Math.floor((availW - 2 * PAD - (cols - 1) * GAP) / cols);
        const ch = Math.floor((availH - 2 * PAD - (rows - 1) * GAP) / rows);
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            x: marginLeft + PAD + col * (cw + GAP),
            y: marginTop  + PAD + row * (ch + GAP),
            cw,
            ch,
        };
    }

    _drawCell(ctx, cellX, cellY, cellW, cellH, layer, positions, model, opts) {
        const {
            nodeRadius, nodeColorFn, nodeSizeFn, intraLinkColorFn,
            intraMinWeight, layerWidth, layerHeight, selectedNodeName,
            layerColors, focusSet, bpInfo, showSetNames,
            showLabels, labelFont, headerFontSize
        } = opts;
        const layerName = layer.layer_name;

        const HEADER_H = headerFontSize + 9;
        // layerColors is { fill, border, text } or null
        const borderColor = layerColors?.border ?? '#d1d5db';
        const headerFill  = layerColors?.fill   ?? '#f3f4f6';
        const textColor   = layerColors?.text   ?? '#111827';

        // Cell background + border
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = layerColors ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(cellX, cellY, cellW, cellH, 4);
        ctx.fill();
        ctx.stroke();

        // Header strip
        ctx.fillStyle = headerFill;
        ctx.beginPath();
        ctx.roundRect(cellX, cellY, cellW, HEADER_H, [4, 4, 0, 0]);
        ctx.fill();

        // Separator under header
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cellX, cellY + HEADER_H);
        ctx.lineTo(cellX + cellW, cellY + HEADER_H);
        ctx.stroke();

        // Layer name — always visible, always drawn
        ctx.save();
        ctx.font = `bold ${headerFontSize}px Inter, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const maxLabelW = cellW - 8;
        let label = layerName;
        if (ctx.measureText(label).width > maxLabelW) {
            while (label.length > 1 && ctx.measureText(label + '…').width > maxLabelW) {
                label = label.slice(0, -1);
            }
            label += '…';
        }
        ctx.fillText(label, cellX + cellW / 2, cellY + HEADER_H / 2);
        ctx.restore();

        // Reserve left margin for bipartite set labels when showSetNames is on
        const SET_LABEL_W = (showSetNames && bpInfo) ? Math.min(48, cellW * 0.18) : 0;

        const PAD_TOP = HEADER_H + 4;
        const PAD_SIDE = Math.max(6, Math.round(cellW * 0.05)) + SET_LABEL_W;
        const PAD_RIGHT = Math.max(6, Math.round(cellW * 0.05));
        const PAD_BOT = Math.max(4, Math.round(cellH * 0.04));
        const drawW = cellW - PAD_SIDE - PAD_RIGHT;
        const drawH = cellH - PAD_TOP - PAD_BOT;

        const layerPos = positions.get(layerName);
        if (!layerPos || layerPos.size === 0) return new Map();

        const scaleX = drawW / layerWidth;
        const scaleY = drawH / layerHeight;
        const cellScale = Math.min(scaleX, scaleY);

        const toScreen = (lx, ly) => ({
            sx: cellX + PAD_SIDE + lx * scaleX,
            sy: cellY + PAD_TOP  + ly * scaleY,
        });

        // Intralayer links
        const layerLinks = model.intralayerLinks.filter(l => l.layer_from === layerName);
        ctx.save();
        ctx.lineWidth = Math.max(0.4, cellScale * 0.5);
        for (const link of layerLinks) {
            if (intraMinWeight > 0 && (link.weight ?? 0) < intraMinWeight) continue;
            const pA = layerPos.get(link.node_from);
            const pB = layerPos.get(link.node_to);
            if (!pA || !pB) continue;
            const { sx: ax, sy: ay } = toScreen(pA.x, pA.y);
            const { sx: bx, sy: by } = toScreen(pB.x, pB.y);
            const linkInFocus = !focusSet || (
                focusSet.has(`${layerName}::${link.node_from}`) &&
                focusSet.has(`${layerName}::${link.node_to}`)
            );
            ctx.globalAlpha = linkInFocus ? 1 : 0.06;
            ctx.strokeStyle = intraLinkColorFn ? intraLinkColorFn(link) : 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Nodes — collect screen positions per set for set-name label placement
        const nodePositions = new Map();
        const baseR = nodeRadius * cellScale;
        let sumYA = 0, countA = 0, sumYB = 0, countB = 0;

        for (const [nodeName, pos] of layerPos) {
            const { sx, sy } = toScreen(pos.x, pos.y);
            const sizeMult = nodeSizeFn ? (nodeSizeFn(layerName, nodeName) ?? 1) : 1;
            const r = Math.max(1.5, baseR * sizeMult);
            const color = nodeColorFn ? (nodeColorFn(layerName, nodeName) ?? '#8b5cf6') : '#8b5cf6';
            const isSelected = selectedNodeName && nodeName === selectedNodeName;
            const isFaded = focusSet && !focusSet.has(`${layerName}::${nodeName}`);

            if (bpInfo) {
                if (bpInfo.setA.has(nodeName)) { sumYA += sy; countA++; }
                else { sumYB += sy; countB++; }
            }

            if (isFaded) {
                ctx.globalAlpha = 0.08;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.globalAlpha = 1;
                nodePositions.set(nodeName, { sx, sy, r });
                continue;
            }

            if (isSelected) {
                ctx.beginPath();
                ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(251,191,36,0.85)';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            if (r >= 3) {
                ctx.strokeStyle = isSelected ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.18)';
                ctx.lineWidth = isSelected ? 1 : 0.5;
                ctx.stroke();
            }

            nodePositions.set(nodeName, { sx, sy, r });
        }

        // Node labels — drawn after nodes so they paint on top, hidden for faded nodes.
        // Bipartite cells: Set A above (-45°), Set B below (+45°) — matches Meta-Network mode.
        if (showLabels) {
            ctx.save();
            ctx.font = labelFont;
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (const [nodeName, p] of nodePositions) {
                if (focusSet && !focusSet.has(`${layerName}::${nodeName}`)) continue;
                if (bpInfo) {
                    const above = bpInfo.setA.has(nodeName);
                    ctx.save();
                    ctx.translate(p.sx, p.sy + (above ? -(p.r + 3) : (p.r + 3)));
                    ctx.rotate(above ? -Math.PI / 4 : Math.PI / 4);
                    ctx.fillText(nodeName, 0, 0);
                    ctx.restore();
                } else {
                    ctx.fillText(nodeName, p.sx + p.r + 2, p.sy);
                }
            }
            ctx.restore();
        }

        // Bipartite set name labels — left margin
        if (showSetNames && bpInfo && SET_LABEL_W > 0) {
            const labelX = cellX + SET_LABEL_W - 4;
            ctx.save();
            ctx.font = `600 9px Inter, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            if (countA > 0) {
                ctx.fillStyle = SET_A_COLOR;
                ctx.save();
                ctx.translate(labelX, sumYA / countA);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(bpInfo.setALabel, 0, 0);
                ctx.restore();
            }
            if (countB > 0) {
                ctx.fillStyle = SET_B_COLOR;
                ctx.save();
                ctx.translate(labelX, sumYB / countB);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(bpInfo.setBLabel, 0, 0);
                ctx.restore();
            }
            ctx.restore();
        }

        return nodePositions;
    }

    hitTest(mx, my) {
        for (const cell of this._lastCells) {
            if (mx < cell.cellX || mx > cell.cellX + cell.cellW) continue;
            if (my < cell.cellY || my > cell.cellY + cell.cellH) continue;
            for (const [nodeName, pos] of cell.nodePositions) {
                const dx = mx - pos.sx;
                const dy = my - pos.sy;
                if (dx * dx + dy * dy <= (pos.r + 4) ** 2) {
                    return { layerName: cell.layerName, nodeName };
                }
            }
        }
        return null;
    }
}
