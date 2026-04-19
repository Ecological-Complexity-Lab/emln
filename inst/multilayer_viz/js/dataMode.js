/**
 * dataMode.js — Data Mode: tabular inspection and subsetting for MultilayerViz
 */

export const LAYER_PALETTE = [
    '#6ee7b7','#fbbf24','#f87171','#60a5fa','#a78bfa',
    '#fb923c','#34d399','#f472b6','#38bdf8','#facc15',
    '#c084fc','#4ade80','#fb7185','#22d3ee','#e879f9',
];

// Shared per-layer color map — survives mode switches
export const layerColors = new Map();

export function initLayerColors(layers) {
    layerColors.clear();
    layers.forEach((l, i) => {
        layerColors.set(l.layer_name, LAYER_PALETTE[i % LAYER_PALETTE.length]);
    });
}

const TABS = [
    { id: 'nodes',      label: 'Nodes' },
    { id: 'stateNodes', label: 'State Nodes' },
    { id: 'links',      label: 'Links' },
    { id: 'layers',     label: 'Layers' },
];

const MAX_CHECKBOX_VALUES = 40;
const FUNNEL_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2a1 1 0 011-1h12a1 1 0 01.8 1.6L10 9.5V14a1 1 0 01-.55.9l-2 1A1 1 0 016 15V9.5L1.2 2.6A1 1 0 011 2z"/></svg>`;

// ── Global subset state ──────────────────────────────────────────────────────
export const dataMode = {
    active: false,
    filteredNodeNames: null,
    filteredLayerNames: null,
    filteredLinkKeys: null,
    isSubsetActive() {
        return this.filteredNodeNames !== null
            || this.filteredLayerNames !== null
            || this.filteredLinkKeys !== null;
    },
    clear() {
        this.filteredNodeNames = null;
        this.filteredLayerNames = null;
        this.filteredLinkKeys = null;
    },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function linkKey(link) {
    return `${link.layer_from}::${link.node_from}::${link.layer_to}::${link.node_to}`;
}

function isNumeric(v) {
    if (v === null || v === undefined || v === '') return false;
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)));
}

function toNum(v) {
    return typeof v === 'number' ? v : Number(v);
}

function matchesFilter(value, filter, numeric) {
    if (!filter) return true;
    if (filter instanceof Set) {
        return filter.size === 0 || filter.has(String(value ?? ''));
    }
    const ft = String(filter).trim();
    if (!ft) return true;
    if (numeric) {
        const v = toNum(value);
        if (ft.startsWith('>=')) return v >= parseFloat(ft.slice(2));
        if (ft.startsWith('<=')) return v <= parseFloat(ft.slice(2));
        if (ft.startsWith('>'))  return v > parseFloat(ft.slice(1));
        if (ft.startsWith('<'))  return v < parseFloat(ft.slice(1));
        if (ft.startsWith('='))  return v === parseFloat(ft.slice(1));
        const n = parseFloat(ft);
        return !isNaN(n) && v === n;
    }
    return String(value ?? '').toLowerCase().includes(ft.toLowerCase());
}

// ── DataMode class ───────────────────────────────────────────────────────────

export class DataMode {
    constructor(container, model, onSubsetChange) {
        this._container = container;
        this._model = model;
        this._onSubsetChange = onSubsetChange;
        this._activeTab = 'nodes';
        this._sortCol = null;
        this._sortDir = 0;
        this._filters = {};
        this._selectionFilter = null;
        this._selectedKeys = new Set();
        this._lastClickedIndex = -1;
        this._tables = {};
        this._columns = {};
        this._openPopup = null;
        this._closePopupBound = this._closePopupOutside.bind(this);

        this._buildData();
        this._buildDOM();
        this.renderTable();
    }

    destroy() {
        this._closePopup();
        document.removeEventListener('mousedown', this._closePopupBound);
        this._container.innerHTML = '';
    }

    // ── Build row data ──────────────────────────────────────────────────────

    _buildData() {
        const m = this._model;

        // Nodes
        const nodeLayerCount = new Map();
        for (const sn of m.stateNodes) {
            nodeLayerCount.set(sn.node_name, (nodeLayerCount.get(sn.node_name) || 0) + 1);
        }
        this._tables.nodes = m.nodes.map(n => {
            const row = { node_name: n.node_name };
            for (const attr of (m.nodeAttributeNames || [])) row[attr] = n[attr];
            row.layer_count = nodeLayerCount.get(n.node_name) || 0;
            return row;
        });
        this._columns.nodes = this._deriveColumns(this._tables.nodes, ['node_name']);

        // State Nodes
        const degreesMap = new Map();
        for (const link of m.intralayerLinks) {
            const kFrom = `${link.layer_from}::${link.node_from}`;
            const kTo = `${link.layer_from}::${link.node_to}`;
            degreesMap.set(kFrom, (degreesMap.get(kFrom) || 0) + 1);
            degreesMap.set(kTo, (degreesMap.get(kTo) || 0) + 1);
        }
        this._tables.stateNodes = m.stateNodes.map(sn => {
            const row = { node_name: sn.node_name, layer_name: sn.layer_name };
            for (const attr of (m.stateNodeAttributeNames || [])) row[attr] = sn[attr];
            row.degree = degreesMap.get(`${sn.layer_name}::${sn.node_name}`) || 0;
            return row;
        });
        this._columns.stateNodes = this._deriveColumns(this._tables.stateNodes, ['node_name', 'layer_name']);

        // Links
        this._tables.links = m.extended.map(link => {
            const row = {
                layer_from: link.layer_from, node_from: link.node_from,
                layer_to: link.layer_to, node_to: link.node_to,
                weight: link.weight ?? '',
                type: link.layer_from === link.layer_to ? 'intralayer' : 'interlayer',
            };
            for (const attr of (m.linkAttributeNames || [])) {
                if (!(attr in row)) row[attr] = link[attr];
            }
            row._linkRef = link;
            return row;
        });
        this._columns.links = this._deriveColumns(this._tables.links,
            ['layer_from', 'node_from', 'layer_to', 'node_to', 'weight', 'type']);

        // Layers
        const layerIndexMap = new Map();
        m.layers.forEach((l, i) => layerIndexMap.set(l.layer_name, i));
        this._layerIndexMap = layerIndexMap;
        this._tables.layers = m.layers.map(layer => {
            const row = {
                layer_id: layer.layer_id, layer_name: layer.layer_name,
                color: layerColors.get(layer.layer_name) || LAYER_PALETTE[layerIndexMap.get(layer.layer_name) % LAYER_PALETTE.length],
            };
            if (layer.latitude != null) row.latitude = layer.latitude;
            if (layer.longitude != null) row.longitude = layer.longitude;
            const nodeSet = m.nodesPerLayer.get(layer.layer_name);
            row.node_count = nodeSet ? nodeSet.size : 0;
            row.link_count = m.intralayerLinks.filter(l => l.layer_from === layer.layer_name).length;
            for (const attr of (m.layerAttributeNames || [])) {
                if (!(attr in row)) row[attr] = layer[attr];
            }
            return row;
        });
        this._columns.layers = this._deriveColumns(this._tables.layers, ['layer_id', 'layer_name', 'color']);
    }

    _deriveColumns(rows, leadCols) {
        if (!rows.length) return leadCols.map(c => ({ key: c, numeric: false, uniqueValues: null }));
        const allKeys = new Set();
        for (const r of rows) {
            for (const k of Object.keys(r)) { if (!k.startsWith('_')) allKeys.add(k); }
        }
        const ordered = [];
        for (const k of leadCols) { if (allKeys.has(k)) { ordered.push(k); allKeys.delete(k); } }
        for (const k of allKeys) ordered.push(k);

        return ordered.map(key => {
            const sample = rows.find(r => r[key] !== undefined && r[key] !== null && r[key] !== '');
            const numeric = sample ? isNumeric(sample[key]) : false;
            const uniq = new Set(rows.map(r => String(r[key] ?? '')));
            const useCheckboxes = !numeric && uniq.size <= MAX_CHECKBOX_VALUES && uniq.size > 0;
            return { key, numeric, uniqueValues: useCheckboxes ? [...uniq].sort() : null };
        });
    }

    // ── DOM ──────────────────────────────────────────────────────────────────

    _buildDOM() {
        this._container.innerHTML = '';

        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.className = 'dm-tab-bar';
        for (const tab of TABS) {
            const btn = document.createElement('button');
            btn.className = 'dm-tab' + (tab.id === this._activeTab ? ' dm-tab-active' : '');
            btn.textContent = tab.label;
            btn.addEventListener('click', () => this._switchTab(tab.id));
            tabBar.appendChild(btn);
        }
        const exportBtn = document.createElement('button');
        exportBtn.className = 'dm-export-btn';
        exportBtn.textContent = 'Export CSV';
        exportBtn.addEventListener('click', () => this._exportCSV());
        tabBar.appendChild(exportBtn);
        this._container.appendChild(tabBar);

        // Selection action bar (hidden by default)
        this._selBar = document.createElement('div');
        this._selBar.className = 'dm-sel-bar';
        this._selBar.style.display = 'none';
        this._selBarText = document.createElement('span');
        this._selBar.appendChild(this._selBarText);
        const filterSelBtn = document.createElement('button');
        filterSelBtn.className = 'dm-sel-action';
        filterSelBtn.textContent = 'Filter to selection';
        filterSelBtn.addEventListener('click', () => this._filterToSelection());
        this._selBar.appendChild(filterSelBtn);
        const clearSelBtn = document.createElement('button');
        clearSelBtn.className = 'dm-sel-action dm-sel-clear';
        clearSelBtn.textContent = 'Clear';
        clearSelBtn.addEventListener('click', () => this._clearSelection());
        this._selBar.appendChild(clearSelBtn);
        this._container.appendChild(this._selBar);

        // Row count
        this._rowCountEl = document.createElement('div');
        this._rowCountEl.className = 'dm-row-count';
        this._container.appendChild(this._rowCountEl);

        // Table container
        this._tableContainer = document.createElement('div');
        this._tableContainer.className = 'dm-table-container';
        this._container.appendChild(this._tableContainer);

        this._tabButtons = tabBar.querySelectorAll('.dm-tab');

        document.addEventListener('mousedown', this._closePopupBound);
    }

    _switchTab(tabId) {
        this._activeTab = tabId;
        this._sortCol = null;
        this._sortDir = 0;
        this._filters = {};
        this._selectionFilter = null;
        this._selectedKeys = new Set();
        this._lastClickedIndex = -1;
        this._tabButtons.forEach((btn, i) => {
            btn.classList.toggle('dm-tab-active', TABS[i].id === tabId);
        });
        dataMode.clear();
        if (this._onSubsetChange) this._onSubsetChange();
        this._updateSelBar();
        this.renderTable();
    }

    // ── Table rendering ─────────────────────────────────────────────────────

    renderTable() {
        const rows = this._tables[this._activeTab];
        const cols = this._columns[this._activeTab];
        if (!rows || !cols) return;

        // Filter
        const filtered = rows.filter(row => {
            if (this._selectionFilter && !this._selectionFilter.has(this._rowKey(row))) return false;
            return cols.every(col => matchesFilter(row[col.key], this._filters[col.key], col.numeric));
        });

        // Sort
        let sorted = filtered;
        if (this._sortCol && this._sortDir !== 0) {
            const col = cols.find(c => c.key === this._sortCol);
            const dir = this._sortDir;
            sorted = [...filtered].sort((a, b) => {
                let va = a[this._sortCol], vb = b[this._sortCol];
                if (col && col.numeric) { va = toNum(va); vb = toNum(vb); return (va - vb) * dir; }
                va = String(va ?? ''); vb = String(vb ?? '');
                return va.localeCompare(vb) * dir;
            });
        }

        this._filteredRows = sorted;
        this._rowCountEl.textContent = `Showing ${sorted.length} of ${rows.length} rows`;

        // Build table
        const table = document.createElement('table');
        table.className = 'dm-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        for (const col of cols) {
            const th = document.createElement('th');
            const hasFilter = this._hasFilterFor(col.key);

            // Column label (clickable for sort)
            const label = document.createElement('span');
            label.className = 'dm-th-label';
            label.textContent = col.key.replace(/_/g, ' ');
            if (this._sortCol === col.key) {
                label.textContent += this._sortDir === 1 ? ' \u25B2' : ' \u25BC';
            }
            label.addEventListener('click', () => this._toggleSort(col.key));
            th.appendChild(label);

            // Funnel icon
            const funnel = document.createElement('button');
            funnel.className = 'dm-funnel' + (hasFilter ? ' dm-funnel-active' : '');
            funnel.innerHTML = FUNNEL_SVG;
            funnel.title = 'Filter this column';
            funnel.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openFilterPopup(col, funnel);
            });
            th.appendChild(funnel);

            if (col.numeric) th.classList.add('dm-numeric');
            if (this._sortCol === col.key) th.classList.add('dm-sorted');
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        sorted.forEach((row, idx) => {
            const tr = document.createElement('tr');
            const rowKey = this._rowKey(row);
            if (this._selectedKeys.has(rowKey)) tr.classList.add('dm-row-selected');
            tr.addEventListener('mousedown', (e) => { if (e.shiftKey) e.preventDefault(); });
            tr.addEventListener('click', (e) => this._handleRowClick(e, row, rowKey, idx, tr));

            for (const col of cols) {
                const td = document.createElement('td');
                if (col.numeric) td.classList.add('dm-numeric');
                this._renderCell(td, col, row[col.key], row);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        this._tableContainer.innerHTML = '';
        this._tableContainer.appendChild(table);
    }

    _renderCell(td, col, value, row) {
        if (col.key === 'color' && this._activeTab === 'layers') {
            const picker = document.createElement('input');
            picker.type = 'color';
            picker.className = 'dm-color-picker';
            picker.value = value;
            picker.addEventListener('input', (e) => {
                e.stopPropagation();
                const hex = picker.value;
                row.color = hex;
                layerColors.set(row.layer_name, hex);
                if (this._onColorChange) this._onColorChange();
            });
            picker.addEventListener('click', (e) => e.stopPropagation());
            td.appendChild(picker);
            return;
        }
        if (col.key === 'type' && this._activeTab === 'links') {
            const pill = document.createElement('span');
            pill.className = value === 'intralayer' ? 'dm-pill dm-pill-intra' : 'dm-pill dm-pill-inter';
            pill.textContent = value;
            td.appendChild(pill);
            return;
        }
        const text = value ?? '';
        td.textContent = col.numeric && typeof value === 'number'
            ? (Number.isInteger(value) ? value : value.toFixed(3))
            : text;
        if (String(text).length > 30) {
            td.title = text;
            td.classList.add('dm-truncate');
        }
    }

    _rowKey(row) {
        if (this._activeTab === 'nodes') return `n::${row.node_name}`;
        if (this._activeTab === 'stateNodes') return `sn::${row.layer_name}::${row.node_name}`;
        if (this._activeTab === 'links') return `l::${linkKey(row._linkRef || row)}`;
        if (this._activeTab === 'layers') return `ly::${row.layer_name}`;
        return JSON.stringify(row);
    }

    // ── Row selection (single, Cmd/Ctrl, Shift) ─────────────────────────────

    _handleRowClick(e, row, rowKey, idx, tr) {
        const metaOrCtrl = e.metaKey || e.ctrlKey;
        const shift = e.shiftKey;

        if (shift && this._lastClickedIndex >= 0) {
            // Range select
            const lo = Math.min(this._lastClickedIndex, idx);
            const hi = Math.max(this._lastClickedIndex, idx);
            if (!metaOrCtrl) this._selectedKeys.clear();
            for (let i = lo; i <= hi; i++) {
                this._selectedKeys.add(this._rowKey(this._filteredRows[i]));
            }
        } else if (metaOrCtrl) {
            // Toggle individual
            if (this._selectedKeys.has(rowKey)) this._selectedKeys.delete(rowKey);
            else this._selectedKeys.add(rowKey);
            this._lastClickedIndex = idx;
        } else {
            // Single select (deselect if same)
            if (this._selectedKeys.size === 1 && this._selectedKeys.has(rowKey)) {
                this._selectedKeys.clear();
            } else {
                this._selectedKeys.clear();
                this._selectedKeys.add(rowKey);
            }
            this._lastClickedIndex = idx;
        }

        // Update visual state
        this._tableContainer.querySelectorAll('tbody tr').forEach((tr2, i) => {
            const rk = this._rowKey(this._filteredRows[i]);
            tr2.classList.toggle('dm-row-selected', this._selectedKeys.has(rk));
        });
        this._updateSelBar();

        // Single selection → notify for cross-mode highlight
        if (this._selectedKeys.size === 1 && this._onSelect) {
            if (this._activeTab === 'nodes' || this._activeTab === 'stateNodes') {
                this._onSelect('node', row.node_name);
            } else if (this._activeTab === 'layers') {
                this._onSelect('layer', row.layer_name);
            }
        }
    }

    _updateSelBar() {
        const n = this._selectedKeys.size;
        if (n === 0) {
            this._selBar.style.display = 'none';
        } else {
            this._selBar.style.display = 'flex';
            this._selBarText.textContent = `${n} row${n > 1 ? 's' : ''} selected`;
        }
    }

    _clearSelection() {
        this._selectedKeys.clear();
        this._lastClickedIndex = -1;
        this._tableContainer.querySelectorAll('.dm-row-selected').forEach(el => el.classList.remove('dm-row-selected'));
        this._updateSelBar();
        if (this._onSelect) this._onSelect(null, null);
    }

    _filterToSelection() {
        if (this._selectedKeys.size === 0) return;

        const selected = this._filteredRows.filter(r => this._selectedKeys.has(this._rowKey(r)));
        if (this._activeTab === 'nodes') {
            dataMode.filteredNodeNames = new Set(selected.map(r => r.node_name));
        } else if (this._activeTab === 'stateNodes') {
            dataMode.filteredNodeNames = new Set(selected.map(r => r.node_name));
            dataMode.filteredLayerNames = new Set(selected.map(r => r.layer_name));
        } else if (this._activeTab === 'links') {
            dataMode.filteredLinkKeys = new Set(selected.map(r => linkKey(r._linkRef || r)));
        } else if (this._activeTab === 'layers') {
            dataMode.filteredLayerNames = new Set(selected.map(r => r.layer_name));
        }
        this._selectionFilter = new Set(this._selectedKeys);
        this._selectedKeys.clear();
        this._updateSelBar();
        this.renderTable();
        if (this._onSubsetChange) this._onSubsetChange();
    }

    // ── Column filter popup ─────────────────────────────────────────────────

    _openFilterPopup(col, anchor) {
        // Close existing popup
        this._closePopup();

        const popup = document.createElement('div');
        popup.className = 'dm-filter-popup';
        popup._isFilterPopup = true;

        if (col.uniqueValues) {
            this._buildCheckboxPopup(popup, col);
        } else {
            this._buildTextPopup(popup, col);
        }

        // Position below the anchor
        const rect = anchor.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.top = (rect.bottom + 4) + 'px';
        popup.style.left = rect.left + 'px';
        document.body.appendChild(popup);

        // Clamp to viewport
        requestAnimationFrame(() => {
            const pr = popup.getBoundingClientRect();
            if (pr.right > window.innerWidth - 8) {
                popup.style.left = Math.max(8, window.innerWidth - pr.width - 8) + 'px';
            }
            if (pr.bottom > window.innerHeight - 8) {
                popup.style.top = (rect.top - pr.height - 4) + 'px';
            }
        });

        this._openPopup = popup;
    }

    _buildCheckboxPopup(popup, col) {
        const current = this._filters[col.key];
        const activeSet = (current instanceof Set) ? current : new Set();

        // Search within list
        const search = document.createElement('input');
        search.className = 'dm-popup-search';
        search.placeholder = 'Search\u2026';
        popup.appendChild(search);

        // Select all / Clear all
        const actions = document.createElement('div');
        actions.className = 'dm-popup-actions';
        const selAll = document.createElement('button');
        selAll.textContent = 'Select all';
        selAll.addEventListener('click', () => {
            popup.querySelectorAll('.dm-popup-cb').forEach(cb => { cb.checked = true; });
        });
        const clrAll = document.createElement('button');
        clrAll.textContent = 'Clear all';
        clrAll.addEventListener('click', () => {
            popup.querySelectorAll('.dm-popup-cb').forEach(cb => { cb.checked = false; });
        });
        actions.appendChild(selAll);
        actions.appendChild(clrAll);
        popup.appendChild(actions);

        // Checkbox list
        const list = document.createElement('div');
        list.className = 'dm-popup-list';
        for (const val of col.uniqueValues) {
            const label = document.createElement('label');
            label.className = 'dm-popup-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'dm-popup-cb';
            cb.value = val;
            cb.checked = activeSet.size === 0 || activeSet.has(val);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(val));
            list.appendChild(label);
        }
        popup.appendChild(list);

        // Search filtering
        search.addEventListener('input', () => {
            const q = search.value.toLowerCase();
            list.querySelectorAll('.dm-popup-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(q) ? '' : 'none';
            });
        });

        // Apply / Reset
        const footer = document.createElement('div');
        footer.className = 'dm-popup-footer';
        const resetBtn = document.createElement('button');
        resetBtn.className = 'dm-popup-btn-secondary';
        resetBtn.textContent = 'Reset';
        resetBtn.addEventListener('click', () => {
            delete this._filters[col.key];
            this._closePopup();
            this.renderTable();
            this._updateSubset();
        });
        const applyBtn = document.createElement('button');
        applyBtn.className = 'dm-popup-btn-primary';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => {
            const checked = new Set();
            popup.querySelectorAll('.dm-popup-cb:checked').forEach(cb => checked.add(cb.value));
            if (checked.size === col.uniqueValues.length || checked.size === 0) {
                delete this._filters[col.key];
            } else {
                this._filters[col.key] = checked;
            }
            this._closePopup();
            this.renderTable();
            this._updateSubset();
        });
        footer.appendChild(resetBtn);
        footer.appendChild(applyBtn);
        popup.appendChild(footer);
    }

    _buildTextPopup(popup, col) {
        const currentVal = this._filters[col.key] || '';

        const label = document.createElement('div');
        label.className = 'dm-popup-label';
        label.textContent = col.numeric
            ? 'Expression: >n, <n, >=n, <=n, =n'
            : 'Case-insensitive substring match';
        popup.appendChild(label);

        const input = document.createElement('input');
        input.className = 'dm-popup-input';
        input.value = currentVal;
        input.placeholder = col.numeric ? 'e.g. >5' : 'e.g. flower';
        popup.appendChild(input);

        const footer = document.createElement('div');
        footer.className = 'dm-popup-footer';
        const resetBtn = document.createElement('button');
        resetBtn.className = 'dm-popup-btn-secondary';
        resetBtn.textContent = 'Reset';
        resetBtn.addEventListener('click', () => {
            delete this._filters[col.key];
            this._closePopup();
            this.renderTable();
            this._updateSubset();
        });
        const applyBtn = document.createElement('button');
        applyBtn.className = 'dm-popup-btn-primary';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => {
            const v = input.value.trim();
            if (v) this._filters[col.key] = v;
            else delete this._filters[col.key];
            this._closePopup();
            this.renderTable();
            this._updateSubset();
        });
        footer.appendChild(resetBtn);
        footer.appendChild(applyBtn);
        popup.appendChild(footer);

        requestAnimationFrame(() => input.focus());

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
            if (e.key === 'Escape') { e.preventDefault(); this._closePopup(); }
        });
    }

    _closePopup() {
        if (this._openPopup) {
            this._openPopup.remove();
            this._openPopup = null;
        }
    }

    _closePopupOutside(e) {
        if (!this._openPopup) return;
        if (this._openPopup.contains(e.target)) return;
        if (e.target.closest('.dm-funnel')) return;
        this._closePopup();
    }

    _hasFilterFor(key) {
        const f = this._filters[key];
        if (!f) return false;
        if (f instanceof Set) return f.size > 0;
        return String(f).trim().length > 0;
    }

    // ── Sorting ─────────────────────────────────────────────────────────────

    _toggleSort(colKey) {
        if (this._sortCol === colKey) {
            if (this._sortDir === 1) this._sortDir = -1;
            else if (this._sortDir === -1) { this._sortCol = null; this._sortDir = 0; }
        } else {
            this._sortCol = colKey;
            this._sortDir = 1;
        }
        this.renderTable();
    }

    // ── Subset propagation ──────────────────────────────────────────────────

    _hasAnyFilter() {
        return Object.values(this._filters).some(v => {
            if (v instanceof Set) return v.size > 0;
            return v && String(v).trim();
        });
    }

    _updateSubset() {
        if (!this._hasAnyFilter()) {
            dataMode.clear();
            if (this._onSubsetChange) this._onSubsetChange();
            return;
        }

        const applyFilters = (tabRows, tabCols, filters) => {
            return tabRows.filter(row =>
                tabCols.every(col => matchesFilter(row[col.key], filters[col.key], col.numeric))
            );
        };

        if (this._activeTab === 'nodes') {
            const passing = applyFilters(this._tables.nodes, this._columns.nodes, this._filters);
            dataMode.filteredNodeNames = new Set(passing.map(r => r.node_name));
            dataMode.filteredLayerNames = null;
            dataMode.filteredLinkKeys = null;
        } else if (this._activeTab === 'stateNodes') {
            const passing = applyFilters(this._tables.stateNodes, this._columns.stateNodes, this._filters);
            dataMode.filteredNodeNames = new Set(passing.map(r => r.node_name));
            dataMode.filteredLayerNames = new Set(passing.map(r => r.layer_name));
            dataMode.filteredLinkKeys = null;
        } else if (this._activeTab === 'links') {
            const passing = applyFilters(this._tables.links, this._columns.links, this._filters);
            dataMode.filteredLinkKeys = new Set(passing.map(r => linkKey(r._linkRef || r)));
            dataMode.filteredNodeNames = null;
            dataMode.filteredLayerNames = null;
        } else if (this._activeTab === 'layers') {
            const passing = applyFilters(this._tables.layers, this._columns.layers, this._filters);
            dataMode.filteredLayerNames = new Set(passing.map(r => r.layer_name));
            dataMode.filteredNodeNames = null;
            dataMode.filteredLinkKeys = null;
        }

        if (this._onSubsetChange) this._onSubsetChange();
    }

    clearFilters() {
        this._filters = {};
        this._selectionFilter = null;
        this._selectedKeys.clear();
        this._lastClickedIndex = -1;
        dataMode.clear();
        this._updateSelBar();
        this.renderTable();
        if (this._onSubsetChange) this._onSubsetChange();
    }

    // ── Export CSV ───────────────────────────────────────────────────────────

    _exportCSV() {
        const rows = this._filteredRows || this._tables[this._activeTab];
        const cols = this._columns[this._activeTab];
        if (!rows || !cols) return;

        const header = cols.map(c => c.key).join(',');
        const body = rows.map(row =>
            cols.map(c => {
                const v = row[c.key];
                if (v === null || v === undefined) return '';
                const s = String(v);
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this._activeTab}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
