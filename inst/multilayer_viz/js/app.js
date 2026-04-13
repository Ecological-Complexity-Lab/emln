/**
 * app.js — Entry point, wires together all modules
 */

import { parseMultilayerData } from './dataParser.js';
import { Renderer } from './renderer.js';
import { ForceLayout } from './layout.js';
import { InteractionHandler } from './interaction.js';
import { ColorMapper } from './colorMapper.js';
import { LayerView } from './layerView.js';
import { csvToJson } from './csvImporter.js';
import { Dashboard } from './dashboard.js';

// ---- State ----
let model = null;
let positions = null;
let renderer = null;
let committedSearchName = null;
let _nodeSelectedBySearch = false;
let colorMapper = new ColorMapper();
let layout = new ForceLayout();

// Legend Scales
let activeNodeColorScale = null;
let activeNodeColorScaleA = null;
let activeNodeColorScaleB = null;
let activeNodeSizeScale = null;
let activeLinkColorScale = null;
let activeLayerColorScale = null;
const colorScaleOverrides = new Map(); // attrName -> 'categorical' | 'continuous'

// ---- DOM Elements ----
const canvas = document.getElementById('networkCanvas');
const openDemoDialogBtn = document.getElementById('openDemoDialogBtn');
const demoDialog = document.getElementById('demoDialog');
const demoCancelBtn = document.getElementById('demoCancelBtn');
const fileInput       = document.getElementById('fileInput');
const csvUploadBtn    = document.getElementById('csvUploadBtn');
const csvImportModal  = document.getElementById('csvImportModal');
const csvModalClose   = document.getElementById('csvModalClose');
const csvEdgeFile     = document.getElementById('csvEdgeFile');
const csvEdgeLabel    = document.getElementById('csvEdgeLabel');
const csvLayersFile   = document.getElementById('csvLayersFile');
const csvLayersLabel  = document.getElementById('csvLayersLabel');
const csvNodesFile        = document.getElementById('csvNodesFile');
const csvNodesLabel       = document.getElementById('csvNodesLabel');
const csvStateNodesFile   = document.getElementById('csvStateNodesFile');
const csvStateNodesLabel  = document.getElementById('csvStateNodesLabel');
const csvDirected         = document.getElementById('csvDirected');
const csvImportLoad   = document.getElementById('csvImportLoad');
const csvImportCancel = document.getElementById('csvImportCancel');
const csvImportError  = document.getElementById('csvImportError');
const csvImportWarn   = document.getElementById('csvImportWarn');
const csvImportInfo   = document.getElementById('csvImportInfo');
const dataLoadedNotice   = document.getElementById('dataLoadedNotice');
const dataLoadedClose    = document.getElementById('dataLoadedClose');
const dataLoadedOk       = document.getElementById('dataLoadedOk');
const dataLoadedDontShow = document.getElementById('dataLoadedDontShow');
const nodeColorSelect = document.getElementById('nodeColorSelect');
const nodeColorSelectSetA = document.getElementById('nodeColorSelectSetA');
const nodeColorSelectSetB = document.getElementById('nodeColorSelectSetB');
const colorByContainer = document.getElementById('colorByContainer');
const bipartiteColorByContainer = document.getElementById('bipartiteColorByContainer');
const bipartiteColorLabelA = document.getElementById('bipartiteColorLabelA');
const bipartiteColorLabelB = document.getElementById('bipartiteColorLabelB');
const nodeSizeSelect = document.getElementById('nodeSizeSelect');
const sizeByContainer = document.getElementById('sizeByContainer');
const bipartiteSizeByContainer = document.getElementById('bipartiteSizeByContainer');
const bipartiteSizeLabelA = document.getElementById('bipartiteSizeLabelA');
const bipartiteSizeLabelB = document.getElementById('bipartiteSizeLabelB');
const nodeSizeSelectSetA = document.getElementById('nodeSizeSelectSetA');
const nodeSizeSelectSetB = document.getElementById('nodeSizeSelectSetB');
const linkColorSelect = document.getElementById('linkColorSelect');
const layerColorSelect = document.getElementById('layerColorSelect');
const layerColorSwatches = document.getElementById('layerColorSwatches');
const nodeColorSwatches  = document.getElementById('nodeColorSwatches');
const linkColorSwatches      = document.getElementById('linkColorSwatches');
const arrowheadSizeControl   = document.getElementById('arrowheadSizeControl');
const arrowheadSizeSlider    = document.getElementById('arrowheadSizeSlider');

const LAYER_DEFAULT_HEX = '#8b5cf6';
const NODE_DEFAULT_HEX  = '#a78bfa';

// Legend Panel and State
const legendPanel = document.getElementById('legendPanel');
const expandedLegends = new Set();
const lvExpandedLegends = new Set(['lvColor', 'lvSize']); // layer view legends expanded by default

// Legend Dragging State
let isDraggingLegend = false;
let hasDraggedLegend = false;
let dragStartX, dragStartY;
let legendStartLeft, legendStartTop;

legendPanel.addEventListener('mousedown', (e) => {
    // Only ignore if clicking on a no-drag button (like minimize or toggle)
    if (e.target.closest('.legend-no-drag')) return;

    // Use current computed bounding box for absolute left/top switch if not already set
    const rect = legendPanel.getBoundingClientRect();

    // Switch from bottom/right to absolute window-based left/top positioning
    if (!legendPanel.style.left || !legendPanel.style.top) {
        legendPanel.style.right = 'auto';
        legendPanel.style.bottom = 'auto';
        legendPanel.style.left = rect.left + 'px';
        legendPanel.style.top = rect.top + 'px';
    }

    isDraggingLegend = true;
    hasDraggedLegend = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    legendStartLeft = parseFloat(legendPanel.style.left);
    legendStartTop = parseFloat(legendPanel.style.top);

    document.body.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isDraggingLegend) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDraggedLegend = true;
    }

    legendPanel.style.left = (legendStartLeft + dx) + 'px';
    legendPanel.style.top = (legendStartTop + dy) + 'px';
});

window.addEventListener('mouseup', () => {
    if (isDraggingLegend) {
        isDraggingLegend = false;
        document.body.style.cursor = '';
    }
});

const showLabelsCheckbox = document.getElementById('showLabelsCheckbox');
const transformNodesCheckbox = document.getElementById('transformNodesCheckbox');
const showLayerNamesCheckbox = document.getElementById('showLayerNamesCheckbox');
const networkModeBtn  = document.getElementById('networkModeBtn');
const mapModeBtn      = document.getElementById('mapModeBtn');
const layerViewBtn    = document.getElementById('layerViewBtn');
const layerDrillPanel   = document.getElementById('layerDrillPanel');
const layerDrillClose   = document.getElementById('layerDrillClose');
const layerDrillTitle   = document.getElementById('layerDrillTitle');
const layerDrillStats   = document.getElementById('layerDrillStats');
const layerComparePanel   = document.getElementById('layerComparePanel');
const layerCompareClose   = document.getElementById('layerCompareClose');
const layerCompareTitle   = document.getElementById('layerCompareTitle');
const layerCompareContent = document.getElementById('layerCompareContent');
// Layer view sidebar controls
const lvSizeBy                = document.getElementById('lvSizeBy');
const lvColorBy               = document.getElementById('lvColorBy');
const lvUniformColor          = document.getElementById('lvUniformColor');
const lvUniformColorContainer = document.getElementById('lvUniformColorContainer');
const lvShowEdges             = document.getElementById('lvShowEdges');
const lvEdgeOptionsContainer  = document.getElementById('lvEdgeOptionsContainer');
const lvEdgeMetric            = document.getElementById('lvEdgeMetric');
const lvMinEdgeWeight         = document.getElementById('lvMinEdgeWeight');
const lvMinEdgeWeightLabel    = document.getElementById('lvMinEdgeWeightLabel');
const lvEdgeLabels            = document.getElementById('lvEdgeLabels');
const lvShowLabels            = document.getElementById('lvShowLabels');
const lvFontSize              = document.getElementById('lvFontSize');
const lvSizeMult              = document.getElementById('lvSizeMult');
const lvSizeMultLabel         = document.getElementById('lvSizeMultLabel');
const lvSpacing               = document.getElementById('lvSpacing');
const lvSpacingLabel          = document.getElementById('lvSpacingLabel');
const LV_SECTIONS = ['sectionLayerViewCircles','sectionLayerViewEdges'];
const DB_SECTIONS = [];
const dashboardBtn       = document.getElementById('dashboardBtn');
const dashboardContainer = document.getElementById('dashboardContainer');
const dbBipartiteToggle  = document.getElementById('dbBipartiteToggle');
const dbBipartiteRow     = document.getElementById('dbBipartiteRow');
let   dashboard          = null;
let   _hasAnyBipartite   = false;
const mapOpacityControl = document.getElementById('mapOpacityControl');
const mapOpacitySlider = document.getElementById('mapOpacitySlider');
const showMapImageCheckbox = document.getElementById('showMapImageCheckbox');
const showLocationsCheckbox = document.getElementById('showLocationsCheckbox');
const streetMapCheckbox = document.getElementById('streetMapCheckbox');
const lvMapOpacityControl = document.getElementById('lvMapOpacityControl');
const lvMapOpacitySlider = document.getElementById('lvMapOpacitySlider');
const lvShowMapImageCheckbox = document.getElementById('lvShowMapImageCheckbox');
const lvStreetMapCheckbox = document.getElementById('lvStreetMapCheckbox');
const showSetNamesCheckbox = document.getElementById('showSetNamesCheckbox');
const bipartiteNestedCheckbox = document.getElementById('bipartiteNestedCheckbox');
const showInterlayerCheckbox = document.getElementById('showInterlayerCheckbox');
const layoutSelect = document.getElementById('layoutSelect');
const nodeSizeSlider = document.getElementById('nodeSizeSlider');
const stackHorizontalBtn = document.getElementById('stackHorizontalBtn');
const stackVerticalBtn = document.getElementById('stackVerticalBtn');
const layerSpacingSlider = document.getElementById('layerSpacingSlider');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const infoPanel = document.getElementById('infoPanel');
const infoTitle = document.getElementById('infoTitle');
const infoContent = document.getElementById('infoContent');
const closeInfoBtn = document.getElementById('closeInfoBtn');
const collapseInfoBtn = document.getElementById('collapseInfoBtn');
const tooltip = document.getElementById('tooltip');

// ---- Application State ----
let appMode = 'network'; // 'network', 'map', 'layer', or 'dashboard'
let layerViewHandlers = null;
let lvRAF  = null; // requestAnimationFrame id for meta-graph animation
let activeMapLayers = new Set();
const mapMarkersOverlay = document.getElementById('mapMarkersOverlay');
const layerCloseButtonsContainer = document.getElementById('layerCloseButtons');
const mapLayerPanel       = document.getElementById('mapLayerPanel');
const mapLayerPanelHeader = document.getElementById('mapLayerPanelHeader');
const mapLayerPanelBody   = document.getElementById('mapLayerPanelBody');
const mapLayerPanelToggle = document.getElementById('mapLayerPanelToggle');
const mapLayerList        = document.getElementById('mapLayerList');

// ── Select Layers panel drag + collapse ──────────────────────────────────
let _mlpDragging = false, _mlpHasDragged = false;
let _mlpStartX, _mlpStartY, _mlpStartLeft, _mlpStartTop;
let _mlpCollapsed = false;

mapLayerPanel.addEventListener('mousedown', (e) => {
    if (e.target.closest('.legend-no-drag')) return;
    const rect = mapLayerPanel.getBoundingClientRect();
    mapLayerPanel.style.right = 'auto';
    mapLayerPanel.style.left  = rect.left + 'px';
    mapLayerPanel.style.top   = rect.top  + 'px';
    _mlpDragging = true; _mlpHasDragged = false;
    _mlpStartX = e.clientX; _mlpStartY = e.clientY;
    _mlpStartLeft = parseFloat(mapLayerPanel.style.left);
    _mlpStartTop  = parseFloat(mapLayerPanel.style.top);
    mapLayerPanel.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!_mlpDragging) return;
    const dx = e.clientX - _mlpStartX, dy = e.clientY - _mlpStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mlpHasDragged = true;
    mapLayerPanel.style.left = (_mlpStartLeft + dx) + 'px';
    mapLayerPanel.style.top  = (_mlpStartTop  + dy) + 'px';
});

window.addEventListener('mouseup', () => {
    if (_mlpDragging) {
        _mlpDragging = false;
        mapLayerPanel.style.cursor = 'grab';
        document.body.style.cursor = '';
        setTimeout(() => { _mlpHasDragged = false; }, 0);
    }
});

mapLayerPanelToggle.addEventListener('click', () => {
    if (_mlpHasDragged) return;
    _mlpCollapsed = !_mlpCollapsed;
    mapLayerPanelBody.style.display = _mlpCollapsed ? 'none' : '';
    mapLayerPanelToggle.textContent  = _mlpCollapsed ? '+' : '−';
    mapLayerPanelToggle.title        = _mlpCollapsed ? 'Expand' : 'Collapse';
});

// ---- Init Background Map (network map mode) ----
const mapEl = document.getElementById('backgroundMap');
const bgMap = L.map('backgroundMap', {
    zoomControl: false,
    dragging: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: false,
    keyboard: false,
    attributionControl: false,
    zoomSnap: 0 // allow fractional zoom for smooth syncing
}).setView([42.35, 3.17], 11);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18
}).addTo(bgMap);

const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
});

// ---- Init Layer View Map (layer view geo mode) ----
const lvMapEl = document.getElementById('lvBackgroundMap');
const lvMap = L.map('lvBackgroundMap', {
    zoomControl: false,
    dragging: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: false,
    keyboard: false,
    attributionControl: false,
    zoomSnap: 0,
}).setView([42.35, 3.17], 11);

const lvSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18
}).addTo(lvMap);

const lvStreetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
});

// ---- Canvas Resize ----
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (renderer) {
        renderer.resizeKonvaOverlay(canvas.width, canvas.height);
        renderer.render();
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---- Init Renderer ----
renderer = new Renderer(canvas);
renderer.showLabels = false;
renderer.transformNodes = transformNodesCheckbox.checked;
renderer.bgMap = bgMap;

// Update tracking close buttons automatically during pan/zoom/drag
renderer.onRender = () => {
    if (appMode === 'map') {
        updateCloseButtons();
    }
};

bgMap.on('move', () => {
    if (appMode === 'map') {
        renderMapMarkers();
        updateCloseButtons();
        renderer.render();
    }
});

// ---- Interaction ----
const interaction = new InteractionHandler(canvas, renderer, {
    onNodeSelect: (hit) => {
        if (hit) {
            showNodeInfo(hit);
        } else {
            hideNodeInfo();
        }
    },
    onNodeHover: (hit) => {
        if (hit) {
            showTooltip(hit);
        } else {
            hideTooltip();
        }
    },
    onLayerSelect: (layerIndex) => {
        showLayerInfo(layerIndex);
    },
    onLinkSelect: (hit) => {
        if (hit) {
            showLinkInfo(hit);
        } else {
            hideNodeInfo();
        }
    }
});

// ---- Reset all visualization options to defaults ----
function resetVisualizationOptions() {
    // Checkboxes
    showLabelsCheckbox.checked = false;
    renderer.showLabels = false;

    transformNodesCheckbox.checked = true;
    renderer.transformNodes = true;

    showLayerNamesCheckbox.checked = false;
    renderer.showLayerNames = false;

    showSetNamesCheckbox.checked = false;
    renderer.showSetNames = false;

    bipartiteNestedCheckbox.checked = false;
    layout.bipartiteNested = false;

    showInterlayerCheckbox.checked = true;
    renderer.showInterlayerLinks = true;

    // Stacking mode
    setStackMode('horizontal');

    // Layer spacing
    layerSpacingSlider.value = 300;
    renderer.layerSpacing = 300;

    // Node size slider — reset to HTML default; actual radius set by auto-scale in loadData
    nodeSizeSlider.value = 10;

    // Color dropdowns
    nodeColorSelect.value = '';
    nodeColorSelectSetA.value = '';
    nodeColorSelectSetB.value = '';
    nodeSizeSelect.value = '';
    nodeSizeSelectSetA.value = '';
    nodeSizeSelectSetB.value = '';
    linkColorSelect.value = '';
    layerColorSelect.value = '';
    layerColorPicker.value = LAYER_DEFAULT_HEX;
    nodeColorSelect.value = '';
    nodeColorPicker.value = NODE_DEFAULT_HEX;
    linkColorSelect.value = '';
    intraLinkColorPicker.value = '#000000';
    interLinkColorPicker.value = '#1e64dc';
    arrowheadSizeSlider.value = 1;
    renderer.arrowheadSize = 1;
    interlayerCurvatureSlider.value = 0.35;
    renderer.interlayerCurvature = 0.35;
    interlayerWeightSlider.value = 0;
    interlayerWeightLabel.textContent = '0';
    renderer.interlayerMinWeight = 0;

    // Color functions
    renderer.nodeColorFn = null;
    renderer.nodeSizeFn = null;
    renderer.linkColorFn = null;
    renderer.layerColorFn = null;
    activeNodeColorScale = null;
    activeNodeColorScaleA = null;
    activeNodeColorScaleB = null;
    activeLinkColorScale = null;
    activeLayerColorScale = null;
    colorScaleOverrides.clear();

    // Layer view
    if (appMode === 'layer') _exitLayerView();

    // Interaction state
    renderer.selectedNode = null;
    renderer.selectedLink = null;
    renderer.selectedLayer = null;
    renderer.hoveredNode = null;
    renderer.hoveredLink = null;
    renderer.searchedNodeName = null;
    committedSearchName = null;
    _nodeSelectedBySearch = false;
    if (nodeSearchInput) nodeSearchInput.value = '';
    if (nodeSearchResults) nodeSearchResults.innerHTML = '';

    // Info panel
    hideNodeInfo();

    renderLegends();
}

// ---- Load Data ----
function loadData(json) {
    try {
        model = parseMultilayerData(json);

        // Center Leaflet Map if geographic data is present
        const lats = [];
        const lngs = [];
        model.layers.forEach(layer => {
            const latVal = layer.latitude !== undefined ? layer.latitude : layer.Latitude;
            const lngVal = layer.longitude !== undefined ? layer.longitude : layer.Longitude;
            if (latVal !== undefined && lngVal !== undefined) {
                const lat = parseFloat(latVal);
                const lng = parseFloat(lngVal);
                if (!isNaN(lat) && !isNaN(lng)) {
                    lats.push(lat);
                    lngs.push(lng);
                }
            }
        });

        if (lats.length > 0) {
            mapModeBtn.style.display = 'inline-flex';
        } else {
            mapModeBtn.style.display = 'none';
        }

        arrowheadSizeControl.style.display = (model.directed || model.directedInterlayer) ? 'block' : 'none';
        const hasInterlayer = model.interlayerLinks.length > 0;
        interLinkColorControl.style.display = hasInterlayer ? 'flex' : 'none';
        interlayerControls.style.display    = hasInterlayer ? 'block' : 'none';
        if (hasInterlayer) {
            const weights = model.interlayerLinks.map(l => l.weight || 0).filter(w => w > 0);
            const maxW = weights.length ? Math.max(...weights) : 1;
            interlayerWeightSlider.max = maxW.toFixed(4);
            interlayerWeightSlider.step = (maxW / 100).toFixed(4);
            interlayerWeightSlider.value = 0;
            interlayerWeightLabel.textContent = '0';
        }

        // Reset out of any non-network mode when loading new data
        if (appMode === 'map')       { toggleMapMode(); }
        if (appMode === 'layer')     { _exitLayerView(); appMode = 'network'; }
        if (appMode === 'dashboard') { _exitDashboard(); appMode = 'network'; }

        // Pass bipartite info to layout engine
        layout.bipartiteInfo = model.bipartiteInfo;

        // Check for bipartite layers (always explicit now)
        let hasAnyBipartite = false;
        for (const [, info] of model.bipartiteInfo) {
            if (info.isBipartite) { hasAnyBipartite = true; break; }
        }
        const useBipartiteLayout = hasAnyBipartite;
        const bipartiteOption = layoutSelect.querySelector('option[value="bipartite"]');
        if (bipartiteOption) {
            bipartiteOption.style.display = hasAnyBipartite ? '' : 'none';
        }

        // Track for dashboard sidebar (shown/hidden with dashboard mode)
        _hasAnyBipartite = hasAnyBipartite;
        dbBipartiteRow.style.display = 'none'; // only shown in dashboard mode
        dbBipartiteToggle.checked = true;

        // Set layout type
        if (useBipartiteLayout) {
            layout.layoutType = 'bipartite';
            layoutSelect.value = 'bipartite';
        } else {
            // If they had bipartite selected from a previous network, but this one isn't, default to circle
            if (layoutSelect.value === 'bipartite' && !hasAnyBipartite) {
                layoutSelect.value = 'circle';
            }
            layout.layoutType = layoutSelect.value;
        }

        positions = layout.computeLayout(model);

        // Auto-scale node size for large networks
        const maxNodesPerLayer = Math.max(...Array.from(model.nodesPerLayer.values()).map(s => s.size));
        if (maxNodesPerLayer > 30) {
            renderer.nodeRadius = Math.max(4, 10 - (maxNodesPerLayer - 30) * 0.15);
            renderer.labelFont = `${Math.max(8, 12 - (maxNodesPerLayer - 30) * 0.1)}px Inter, system-ui, sans-serif`;
        } else {
            renderer.nodeRadius = 10;
            renderer.labelFont = '12px Inter, system-ui, sans-serif';
        }

        // Pass bipartite info to renderer
        renderer.bipartiteInfo = model.bipartiteInfo;
        renderer.layoutType = layout.layoutType;

        // Show/hide UI elements based on layout
        const isBipartiteLayout = layout.layoutType === 'bipartite';
        document.getElementById('setNamesContainer').style.display = isBipartiteLayout ? '' : 'none';
        colorByContainer.style.display = isBipartiteLayout ? 'none' : '';
        bipartiteColorByContainer.style.display = isBipartiteLayout ? '' : 'none';
        sizeByContainer.style.display = isBipartiteLayout ? 'none' : '';
        bipartiteSizeByContainer.style.display = isBipartiteLayout ? '' : 'none';

        populateDropdowns();
        resetVisualizationOptions();
        updateLayerColors();
        updateNodeColors();
        updateLinkColors();

        renderer.setData(model, positions);
        renderer.centerView();
        renderer.render();

        // Enable dropdowns
        nodeColorSelect.disabled = false;
        nodeColorSelectSetA.disabled = false;
        nodeColorSelectSetB.disabled = false;
        nodeSizeSelect.disabled = false;
        nodeSizeSelectSetA.disabled = nodeSizeSelectSetA.options.length <= 1;
        nodeSizeSelectSetB.disabled = nodeSizeSelectSetB.options.length <= 1;
        linkColorSelect.disabled = false;
    } catch (err) {
        console.error('Failed to load data:', err);
        alert('Error loading data: ' + err.message);
    }
}

// ---- Load Demo ----
openDemoDialogBtn.addEventListener('click', () => {
    demoDialog.style.display = 'flex';
});

demoCancelBtn.addEventListener('click', () => {
    demoDialog.style.display = 'none';
});

demoDialog.addEventListener('click', (e) => {
    if (e.target === demoDialog) demoDialog.style.display = 'none';
});

// ---- Example dataset metadata ----
const DATASET_INFO = {
    vitali2024: {
        name: 'Canary Islands pollination network',
        citation: 'Vitali et al. 2024',
        doi: 'https://doi.org/10.1111/1365-2656.14174',
        dataDoi: 'https://doi.org/10.5061/dryad.76173',
        layers: '5 layers — Fuerteventura, Gran Canaria, Tenerife, Gomera, Hierro',
        nodes: '235 species (34 plants · 201 pollinators)',
        links: '651 intralayer + 154 interlayer (Jaccard similarity of partner sets)',
        network: 'Undirected · bipartite per layer · GPS coordinates (map mode)',
        nodeAttrs: ['node_type (plant / pollinator)', 'module (1–33, Infomap)'],
        linkAttrs: ['weight'],
    },
    kefi2016: {
        name: 'Chilean intertidal food web',
        citation: 'Kéfi et al. 2016',
        doi: 'https://doi.org/10.1371/journal.pbio.1002527',
        dataDoi: 'https://doi.org/10.5061/dryad.b4vg0',
        layers: '3 layers — Trophic, NTI positive, NTI negative',
        nodes: '106 species',
        links: '4,623 directed interactions',
        network: 'Directed',
        nodeAttrs: ['body_mass', 'mobility (sessile / mobile)', 'functional_role',
                    'phylum', 'cluster (1–14)', 'functional_group (5 groups)', 'shore_height'],
        linkAttrs: ['weight', 'type (trophic / non-trophic+ / non-trophic−)'],
    },
    pilosof2017: {
        name: 'Siberian host–parasite network',
        citation: 'Pilosof et al. 2017',
        doi: 'https://doi.org/10.1038/s41559-017-0101',
        dataDoi: 'https://doi.org/10.1111/j.1600-0706.2009.17902.x',
        dataLabel: 'Original data (Krasnov et al. 2009):',
        layers: '6 temporal layers — 1982–1987',
        nodes: '78 species (22 hosts · 56 parasites)',
        links: '1,817 intralayer + 284 interlayer',
        network: 'Undirected intralayer · directed interlayer · bipartite per layer',
        nodeAttrs: ['node_type (host / parasite)', 'abundance', 'module (1–7, Infomap)'],
        linkAttrs: ['weight'],
    },
    magrach2020: {
        name: 'Basque Country spatial pollination network',
        citation: 'Magrach et al. (EuPPollNet)',
        doi: 'https://doi.org/10.1111/geb.70000',
        dataDoi: 'https://github.com/JoseBSL/EuPPollNet',
        layers: '5 layers — grassland sites, Orozko, Basque Country (Spain)',
        nodes: '137 species (45 plants · 92 pollinators)',
        links: '376 intralayer (interaction frequency) + 142 interlayer (Jaccard)',
        network: 'Undirected · bipartite per layer · GPS coordinates (map mode)',
        nodeAttrs: ['node_type (plant / pollinator)'],
        linkAttrs: ['weight'],
    },
    costa2020: {
        name: 'Portuguese temporal seed dispersal network',
        citation: 'Costa et al. 2020',
        doi: 'https://doi.org/10.1111/1365-2745.13391',
        dataDoi: 'https://doi.org/10.6084/m9.figshare.11985912',
        layers: '5 layers — 2012–2016 (annual)',
        nodes: '29 species (17 plants · 12 birds)',
        links: '170 intralayer (seed counts) + 43 directed interlayer (t → t+1)',
        network: 'Undirected intralayer · directed interlayer · bipartite per layer',
        nodeAttrs: ['node_type (plant / bird)', 'group (resident / partial-migratory)', 'versatility', 'degree', 'strength', 'd_specialisation', 'n_years'],
        linkAttrs: ['weight (seed count)'],
    },
    zhu2025: {
        name: 'Thousand Island Lake seed dispersal network',
        citation: 'Zhu et al. 2025',
        doi: 'https://doi.org/10.1073/pnas.2415846122',
        dataDoi: 'https://doi.org/10.6084/m9.figshare.26095444',
        layers: '22 layers — land-bridge islands (Thousand Island Lake, China)',
        nodes: '70 species (31 plants · 39 birds)',
        links: '1,157 intralayer (camera-trap visits)',
        network: 'Undirected · bipartite per layer · layer attributes: area (ha) and isolation (m)',
        nodeAttrs: ['node_type (plant / bird)', 'body_mass_g', 'HWI (hand-wing index)', 'migrant_status'],
        linkAttrs: ['weight (visit frequency)', 'role (meta-network)', 'c_value', 'z_value', 'compartment_group'],
    },
};

function buildDatasetRow(file) {
    const info = DATASET_INFO[file];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn btn-primary';
    loadBtn.style.cssText = 'flex:1; text-align:left; padding:7px 10px; line-height:1.3;';
    loadBtn.innerHTML = `<span style="display:block; font-size:12px; font-weight:600;">${info.name}</span>
                         <span style="display:block; font-size:10px; opacity:0.7; font-weight:400;">${info.citation}</span>`;
    loadBtn.addEventListener('click', () => loadDemoFile(file));

    const infoBtn = document.createElement('button');
    infoBtn.className = 'btn demo-info-btn';
    infoBtn.style.cssText = 'flex-shrink:0; width:28px; height:28px; padding:0; font-size:13px;';
    infoBtn.textContent = 'ⓘ';
    infoBtn.title = 'More info';
    infoBtn.addEventListener('click', () => showDemoInfo(file));

    row.appendChild(loadBtn);
    row.appendChild(infoBtn);
    return row;
}

function showDemoInfo(file) {
    const info = DATASET_INFO[file];
    document.getElementById('demoInfoName').textContent = info.name;
    document.getElementById('demoInfoCitation').textContent = info.citation;

    const nodeAttrList = info.nodeAttrs.map(a => `<li>${a}</li>`).join('');
    const linkAttrList = info.linkAttrs.map(a => `<li>${a}</li>`).join('');
    const doiLink = `<a href="${info.doi}" target="_blank" rel="noopener" style="color:#5b6af0;">${info.doi}</a>`;
    const dataLabel = info.dataLabel || 'Data:';
    const dataDoiLine = info.dataDoi
        ? `<div><strong>${dataLabel}</strong> <a href="${info.dataDoi}" target="_blank" rel="noopener" style="color:#5b6af0;">${info.dataDoi}</a></div>`
        : `<div style="color:#aaa;"><strong>Data source:</strong> see paper</div>`;

    document.getElementById('demoInfoContent').innerHTML = `
        <div style="margin-bottom:8px;"><strong>Layers:</strong> ${info.layers}</div>
        <div style="margin-bottom:8px;"><strong>Nodes:</strong> ${info.nodes}</div>
        <div style="margin-bottom:8px;"><strong>Links:</strong> ${info.links}</div>
        <div style="margin-bottom:12px;"><strong>Network type:</strong> ${info.network}</div>
        <div style="margin-bottom:4px;"><strong>Node attributes:</strong></div>
        <ul style="margin:0 0 8px; padding-left:16px;">${nodeAttrList}</ul>
        <div style="margin-bottom:4px;"><strong>Link attributes:</strong></div>
        <ul style="margin:0 0 12px; padding-left:16px;">${linkAttrList}</ul>
        <div><strong>Paper:</strong> ${doiLink}</div>
        ${dataDoiLine}
    `;

    document.getElementById('demoInfoLoadBtn').dataset.file = file;
    document.getElementById('demoListView').style.display = 'none';
    document.getElementById('demoInfoView').style.display = '';
}

document.getElementById('demoBackBtn').addEventListener('click', () => {
    document.getElementById('demoInfoView').style.display = 'none';
    document.getElementById('demoListView').style.display = '';
});

document.getElementById('demoInfoLoadBtn').addEventListener('click', () => {
    const file = document.getElementById('demoInfoLoadBtn').dataset.file;
    loadDemoFile(file);
});

async function loadDemoFile(file) {
    demoDialog.style.display = 'none';
    document.getElementById('demoInfoView').style.display = 'none';
    document.getElementById('demoListView').style.display = '';
    try {
        const resp = await fetch(`data/${file}.json`);
        if (!resp.ok) throw new Error('Failed to fetch demo data');
        const json = await resp.json();
        loadData(json);
    } catch (err) {
        console.error(err);
        alert('Failed to load demo data. Make sure to serve using a local server.');
    }
}

// Build dataset rows on load
Object.keys(DATASET_INFO).forEach(file => {
    document.getElementById('demoDatasetList').appendChild(buildDatasetRow(file));
});

// ---- Map Mode Logic ----
function toggleMapMode() {
    if (appMode === 'dashboard') { _exitDashboard(); appMode = 'network'; }
    if (appMode === 'layer')     { _exitLayerView(); appMode = 'network'; renderer.render(); }
    appMode = appMode === 'network' ? 'map' : 'network';

    if (appMode === 'map') {
        mapModeBtn.classList.add('active');
        mapEl.style.display = 'block';
        bgMap.invalidateSize();

        // Calculate bounds after the map container is visible
        fitMapToLayers();

        activeMapLayers.clear(); // Start with no active layers pop-out
        renderer.showMapBackground = showMapImageCheckbox.checked;
        renderer.isMapMode = true;
        mapOpacityControl.style.display = 'flex';
        mapLayerPanel.style.display = '';
    } else {
        mapModeBtn.classList.remove('active');
        mapEl.style.display = 'none';
        activeMapLayers.clear();
        renderer.showMapBackground = false;
        renderer.isMapMode = false;
        mapOpacityControl.style.display = 'none';
        mapLayerPanel.style.display = 'none';
    }

    updateMapModeViews();
}

mapModeBtn.addEventListener('click', toggleMapMode);

// ---- Layer View (Meta-Graph) Mode ----
function _startLayerViewLoop() {
    function loop() {
        if (appMode !== 'layer' || !renderer.layerView) { lvRAF = null; return; }
        const stillHot = renderer.layerView.tick();
        renderer.render();
        lvRAF = stillHot ? requestAnimationFrame(loop) : null;
    }
    lvRAF = requestAnimationFrame(loop);
}

function _ensureLayerViewLoop() {
    if (!lvRAF && appMode === 'layer' && renderer.layerView) _startLayerViewLoop();
}

function toggleLayerView() {
    if (!model) return;
    if (appMode === 'layer') {
        _exitLayerView();
        appMode = 'network';
        renderer.render();
        return;
    }
    if (appMode === 'map')       toggleMapMode();
    if (appMode === 'dashboard') { _exitDashboard(); appMode = 'network'; }
    appMode = 'layer';
    renderer.layerView = new LayerView(model, positions);
    window._layerView = renderer.layerView;
    renderer.layerViewMode = true;
    layerViewBtn.classList.add('active');
    canvas.style.cursor = 'grab';
    _showLayerViewSidebar();

    // Activate geo mode if data has coordinates
    const lv = renderer.layerView;
    if (lv.hasGeoData()) {
        _activateLvGeoMode();
    } else {
        _deactivateLvGeoMode();
        // Auto-fit initial viewScale so all bubbles are visible
        const layoutR = lv.layoutRadius();
        const fitScale = Math.min(canvas.width, canvas.height) * 0.42 / Math.max(layoutR, 1);
        lv.viewScale = Math.min(Math.max(fitScale, 0.05), 0.85);
    }

    let isDragging    = false;
    let isBubbleDrag  = false; // true = dragging a bubble; false = panning
    let dragStartX    = 0, dragStartY    = 0;
    let offsetStartX  = 0, offsetStartY  = 0;
    let mouseDownX    = 0, mouseDownY    = 0;

    const canvasCoords = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            mx: (e.clientX - rect.left) * (canvas.width  / rect.width),
            my: (e.clientY - rect.top)  * (canvas.height / rect.height),
        };
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        mouseDownX = e.clientX; mouseDownY = e.clientY;
        const { mx, my } = canvasCoords(e);
        const lv = renderer.layerView;
        // In geo mode bubbles are pinned to map coordinates — dragging is disabled
        const hitName = lv.geoMode ? null : lv.startDragBubble(mx, my, canvas.width, canvas.height);
        if (hitName) {
            isBubbleDrag = true;
            isDragging   = true;
            _ensureLayerViewLoop();
        } else if (!lv.geoMode) {
            isBubbleDrag = false;
            isDragging   = true;
            dragStartX   = e.clientX; dragStartY   = e.clientY;
            offsetStartX = lv.viewOffsetX;
            offsetStartY = lv.viewOffsetY;
            canvas.style.cursor = 'grabbing';
        }
    };

    const onMouseMove = (e) => {
        if (isDragging) {
            if (isBubbleDrag) {
                const { mx, my } = canvasCoords(e);
                renderer.layerView.moveDragBubble(mx, my, canvas.width, canvas.height);
                _ensureLayerViewLoop();
            } else {
                renderer.layerView.viewOffsetX = offsetStartX + (e.clientX - dragStartX);
                renderer.layerView.viewOffsetY = offsetStartY + (e.clientY - dragStartY);
                renderer.render();
            }
            tooltip.classList.remove('visible');
            return;
        }
        const { mx, my } = canvasCoords(e);
        const lv = renderer.layerView;
        const hitBubble = lv.hitTestBubble(mx, my, canvas.width, canvas.height);
        if (hitBubble) {
            const info = lv.getBubbleInfo(hitBubble);
            tooltip.textContent = `${hitBubble} — ${info.nodeCount} nodes, ${info.edgeCount} edges, density ${info.density.toFixed(3)}, avg deg ${info.avgDegree.toFixed(1)}`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8)  + 'px';
            canvas.style.cursor = 'pointer';
            return;
        }
        const hitEdge = lv.hitTestEdge(mx, my, canvas.width, canvas.height);
        if (hitEdge) {
            const parts = [];
            if (hitEdge.interlayerCount > 0) parts.push(`${hitEdge.interlayerCount} interlayer links`);
            if (hitEdge.sharedFraction > 0)  parts.push(`${Math.round(hitEdge.sharedFraction * 100)}% shared nodes`);
            tooltip.textContent = `${hitEdge.lA} ↔ ${hitEdge.lB}: ${parts.join(', ')}`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8)  + 'px';
            canvas.style.cursor = 'default';
            return;
        }
        tooltip.classList.remove('visible');
        canvas.style.cursor = 'grab';
    };

    const onMouseUp = (e) => {
        const didDrag = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY) > 5;
        if (isBubbleDrag) {
            renderer.layerView.endDragBubble();
            _ensureLayerViewLoop();
        }
        isDragging   = false;
        isBubbleDrag = false;
        canvas.style.cursor = 'grab';
        if (!didDrag) {
            const { mx, my } = canvasCoords(e);
            const hit = renderer.layerView.hitTestBubble(mx, my, canvas.width, canvas.height);
            const prevSel = renderer.layerView._selectedLayer;
            if ((e.metaKey || e.ctrlKey) && hit && prevSel && hit !== prevSel) {
                // Cmd+click on a different bubble → comparison mode
                renderer.layerView.selectForComparison(prevSel, hit);
                closeLayerDrillDown();
                openLayerComparison(prevSel, hit);
            } else {
                // Normal click → single selection
                renderer.layerView.selectBubble(hit);
                closeLayerComparison();
                if (hit) openLayerDrillDown(hit);
                else closeLayerDrillDown();
            }
            renderer.render();
        }
    };

    const onWheel = (e) => {
        e.preventDefault();
        const lv       = renderer.layerView;
        const factor   = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(lv.viewScale * factor, 0.15), 20);
        const { mx, my } = canvasCoords(e);
        const fracX = (mx - canvas.width  / 2 - lv.viewOffsetX) / lv.viewScale;
        const fracY = (my - canvas.height / 2 - lv.viewOffsetY) / lv.viewScale;
        lv.viewOffsetX = mx - canvas.width  / 2 - fracX * newScale;
        lv.viewOffsetY = my - canvas.height / 2 - fracY * newScale;
        lv.viewScale   = newScale;
        renderer.render();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('wheel',     onWheel, { passive: false });
    layerViewHandlers = { onMouseDown, onMouseMove, onMouseUp, onWheel };

    _startLayerViewLoop();
}

const NETWORK_SECTIONS = ['sectionLayers','sectionNodes','sectionLinks','sectionSearch'];

function _showLayerViewSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = ''; });
    _syncLayerViewControls();
}

function _hideLayerViewSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    renderLegends(); // restore network legends
}

// ---- Dashboard Mode ----
function _showDashboardSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    DB_SECTIONS.forEach(id => { document.getElementById(id).style.display = ''; });
    dbBipartiteRow.style.display = _hasAnyBipartite ? '' : 'none';
    legendPanel.innerHTML = '';
}

function _hideDashboardSidebar() {
    DB_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    dbBipartiteRow.style.display = 'none';
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    renderLegends();
}

function _exitDashboard() {
    dashboard?.destroy();
    dashboard = null;
    dashboardContainer.style.display = 'none';
    canvas.style.display = '';
    dashboardBtn.classList.remove('active');
    _hideDashboardSidebar();
}

function toggleDashboard() {
    if (!model) return;
    if (appMode === 'dashboard') {
        _exitDashboard();
        appMode = 'network';
        renderer.render();
        return;
    }
    // Exit other active modes first
    if (appMode === 'layer') { _exitLayerView(); appMode = 'network'; }
    if (appMode === 'map')   { toggleMapMode(); }

    appMode = 'dashboard';
    dashboardBtn.classList.add('active');
    canvas.style.display = 'none';
    dashboardContainer.style.display = 'block';
    _showDashboardSidebar();

    dashboard = new Dashboard(dashboardContainer, model, {});
    dashboard.render();
}

dashboardBtn.addEventListener('click', toggleDashboard);

function goToNetworkMode() {
    if (!model || appMode === 'network') return;
    if (appMode === 'map')       toggleMapMode();
    if (appMode === 'layer')     { _exitLayerView(); appMode = 'network'; renderer.render(); }
    if (appMode === 'dashboard') { _exitDashboard(); appMode = 'network'; renderer.render(); }
}
networkModeBtn.addEventListener('click', goToNetworkMode);
dbBipartiteToggle.addEventListener('change', () => dashboard?.setShowBipartite(dbBipartiteToggle.checked));

function _syncLayerViewControls() {
    const lv = renderer.layerView;
    if (!lv) return;
    const s = lv.settings;
    lvSizeBy.value    = s.sizeBy;
    lvColorBy.value   = s.colorBy;
    lvUniformColor.value = s.uniformColor;
    lvUniformColorContainer.style.display = s.colorBy === 'uniform' ? '' : 'none';
    lvShowEdges.checked  = s.showEdges;
    lvEdgeOptionsContainer.style.display = s.showEdges ? '' : 'none';
    lvEdgeMetric.value   = s.edgeMetric;
    lvEdgeLabels.checked = s.showEdgeLabels;
    lvShowLabels.checked = s.showLabels;
    lvFontSize.value     = s.labelFontSize;
    lvSizeMult.value     = s.sizeMultiplier;
    lvSizeMultLabel.textContent = s.sizeMultiplier.toFixed(1) + '×';
    lvSpacing.value      = s.bubbleSpacing;
    lvSpacingLabel.textContent = s.bubbleSpacing.toFixed(1) + '×';
    _updateEdgeWeightSlider();
    renderLayerViewLegend();
}

function _updateEdgeWeightSlider() {
    const lv = renderer.layerView;
    if (!lv) return;
    const maxW = lv.maxEdgeWeight(lv.settings.edgeMetric);
    lvMinEdgeWeight.max   = maxW;
    lvMinEdgeWeight.value = Math.min(lv.settings.minEdgeWeight, maxW);
    lvMinEdgeWeightLabel.textContent = lvMinEdgeWeight.value;
}

function _exitLayerView() {
    if (lvRAF) { cancelAnimationFrame(lvRAF); lvRAF = null; }
    _deactivateLvGeoMode();
    renderer.layerViewMode = false;
    renderer.layerView = null;
    window._layerView = null;
    layerViewBtn.classList.remove('active');
    canvas.style.cursor = '';
    tooltip.classList.remove('visible');
    _hideLayerViewSidebar();
    closeLayerDrillDown();
    closeLayerComparison();
    if (layerViewHandlers) {
        canvas.removeEventListener('mousedown', layerViewHandlers.onMouseDown);
        canvas.removeEventListener('mousemove', layerViewHandlers.onMouseMove);
        canvas.removeEventListener('mouseup',   layerViewHandlers.onMouseUp);
        canvas.removeEventListener('wheel',     layerViewHandlers.onWheel);
        layerViewHandlers = null;
    }
}

// ── Layer View Geo Mode ────────────────────────────────────────────────────

let _lvMapMoveHandler = null;
let _lvGeoMouseMoveHandler = null;
let _lvGeoClickHandler = null;

function _activateLvGeoMode() {
    const lv = renderer.layerView;
    if (!lv) return;
    lv.geoMode = true;

    // Fit map to layer coordinates
    const coords = model.layers
        .filter(l => l.latitude != null && l.longitude != null)
        .map(l => [l.latitude, l.longitude]);
    lvMapEl.style.display = 'block';
    lvMap.invalidateSize();
    if (coords.length === 1) {
        lvMap.setView(coords[0], 10);
    } else if (coords.length > 1) {
        lvMap.fitBounds(coords, { padding: [60, 60] });
    }

    // Re-project bubbles on every map move/zoom (fitBounds triggers move events during animation)
    _lvMapMoveHandler = () => {
        if (renderer.layerView?.geoMode) {
            renderer.layerView.setGeoPositions(lvMap, canvas.width, canvas.height);
            renderer.render();
        }
    };
    lvMap.on('move zoom', _lvMapMoveHandler);

    // Initial projection — defer one frame so the map container has laid out
    requestAnimationFrame(() => {
        if (renderer.layerView?.geoMode) {
            renderer.layerView.setGeoPositions(lvMap, canvas.width, canvas.height);
            renderer.render();
        }
    });

    // Let Leaflet receive mouse events for pan/zoom; tooltips via mousemove on lvMapEl
    canvas.style.pointerEvents = 'none';
    _lvGeoMouseMoveHandler = (e) => {
        const lv = renderer.layerView;
        if (!lv?.geoMode) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
        const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
        const hitBubble = lv.hitTestBubble(mx, my, canvas.width, canvas.height);
        if (hitBubble) {
            const info = lv.getBubbleInfo(hitBubble);
            tooltip.textContent = `${hitBubble} — ${info.nodeCount} nodes, ${info.edgeCount} edges, density ${info.density.toFixed(3)}, avg deg ${info.avgDegree.toFixed(1)}`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8)  + 'px';
        } else {
            tooltip.classList.remove('visible');
        }
    };
    lvMapEl.addEventListener('mousemove', _lvGeoMouseMoveHandler);

    // Bubble click in geo mode (canvas has pointer-events:none so we listen on the map div)
    _lvGeoClickHandler = (e) => {
        const lv = renderer.layerView;
        if (!lv?.geoMode) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
        const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
        const hit = lv.hitTestBubble(mx, my, canvas.width, canvas.height);
        const prevSel = lv._selectedLayer;
        if ((e.metaKey || e.ctrlKey) && hit && prevSel && hit !== prevSel) {
            lv.selectForComparison(prevSel, hit);
            closeLayerDrillDown();
            openLayerComparison(prevSel, hit);
        } else {
            lv.selectBubble(hit);
            closeLayerComparison();
            if (hit) openLayerDrillDown(hit);
            else closeLayerDrillDown();
        }
        renderer.render();
    };
    lvMapEl.addEventListener('click', _lvGeoClickHandler);

    // Update toggle button
    const btn = document.getElementById('lvGeoToggleBtn');
    if (btn) btn.textContent = 'Force Layout';
    document.getElementById('lvGeoToggleContainer').style.display = '';
    document.getElementById('lvSpacing').closest('div').style.display = 'none';
    lvMapOpacityControl.style.display = 'flex';
}

function _deactivateLvGeoMode() {
    const lv = renderer.layerView;
    if (lv) lv.geoMode = false;
    lvMapEl.style.display = 'none';
    if (_lvMapMoveHandler) {
        lvMap.off('move zoom', _lvMapMoveHandler);
        _lvMapMoveHandler = null;
    }
    canvas.style.pointerEvents = '';
    lvMapOpacityControl.style.display = 'none';
    if (_lvGeoMouseMoveHandler) {
        lvMapEl.removeEventListener('mousemove', _lvGeoMouseMoveHandler);
        _lvGeoMouseMoveHandler = null;
    }
    if (_lvGeoClickHandler) {
        lvMapEl.removeEventListener('click', _lvGeoClickHandler);
        _lvGeoClickHandler = null;
    }
    tooltip.classList.remove('visible');
    document.getElementById('lvSpacing')?.closest('div')?.style.removeProperty('display');
}

document.getElementById('lvGeoToggleBtn').addEventListener('click', () => {
    const lv = renderer.layerView;
    if (!lv) return;
    if (lv.geoMode) {
        _deactivateLvGeoMode();
        document.getElementById('lvGeoToggleBtn').textContent = 'Geographic Layout';
        // Re-fit force layout
        const layoutR = lv.layoutRadius();
        const fitScale = Math.min(canvas.width, canvas.height) * 0.42 / Math.max(layoutR, 1);
        lv.viewScale = Math.min(Math.max(fitScale, 0.05), 0.85);
        lv.viewOffsetX = 0; lv.viewOffsetY = 0;
        lv._initLayout();
        _startLayerViewLoop();
    } else {
        _activateLvGeoMode();
    }
    renderer.render();
});

function closeLayerDrillDown() {
    layerDrillPanel.style.transform    = 'translateX(340px)';
    layerDrillPanel.style.opacity      = '0';
    layerDrillPanel.style.pointerEvents = 'none';
}

function closeLayerComparison() {
    layerComparePanel.style.transform    = 'translateX(420px)';
    layerComparePanel.style.opacity      = '0';
    layerComparePanel.style.pointerEvents = 'none';
    if (renderer.layerView) renderer.layerView._compareLayer = null;
}

// ── Per-layer stats helper (used by comparison panel) ──────────────────────
function _layerStats(layerName) {
    const nodeSet    = model.nodesPerLayer.get(layerName) || new Set();
    const intraLinks = model.intralayerLinks.filter(l => l.layer_from === layerName);
    const N = nodeSet.size;

    const isDir  = model.directed ?? false;
    const bpInfo = model.bipartiteInfo?.get(layerName);
    const isBipartite = bpInfo?.isBipartite ?? false;
    const nA = isBipartite ? (bpInfo.setA?.size ?? 0) : 0;
    const nB = isBipartite ? (bpInfo.setB?.size ?? 0) : 0;

    // Edge deduplication — directed: preserve direction; undirected: sort pair
    const edgeKeys = new Set();
    for (const l of intraLinks) {
        const key = isDir
            ? `${l.node_from}::${l.node_to}`
            : [l.node_from, l.node_to].sort().join('::');
        edgeKeys.add(key);
    }
    const E = edgeKeys.size;

    // Density formula per network type
    let E_max;
    if (isBipartite) {
        E_max = isDir ? 2 * nA * nB : nA * nB;
    } else {
        E_max = isDir ? N * (N - 1) : N * (N - 1) / 2;
    }
    const density = E_max > 0 ? E / E_max : 0;

    // Degree maps — edges stored once, no halving needed
    const degMap    = new Map();
    const inDegMap  = new Map();
    const outDegMap = new Map();
    for (const node of nodeSet) {
        degMap.set(node, 0);
        if (isDir) { inDegMap.set(node, 0); outDegMap.set(node, 0); }
    }
    for (const l of intraLinks) {
        degMap.set(l.node_from, (degMap.get(l.node_from) ?? 0) + 1);
        degMap.set(l.node_to,   (degMap.get(l.node_to)   ?? 0) + 1);
        if (isDir) {
            outDegMap.set(l.node_from, (outDegMap.get(l.node_from) ?? 0) + 1);
            inDegMap.set(l.node_to,   (inDegMap.get(l.node_to)    ?? 0) + 1);
        }
    }

    const degrees    = [...degMap.values()];
    const avgDeg     = N > 0 ? degrees.reduce((s, d) => s + d, 0) / N : 0;
    const maxDeg     = degrees.length ? Math.max(...degrees) : 0;
    const maxDegNode = [...degMap.entries()].find(([, d]) => d === maxDeg)?.[0] ?? '—';

    const ilIn  = model.interlayerLinks.filter(l => l.layer_to   === layerName).length;
    const ilOut = model.interlayerLinks.filter(l => l.layer_from === layerName).length;

    // Degree by type for bipartite (keyed by type label)
    const degByType = new Map();
    if (isBipartite) {
        for (const [label, nodeNameSet] of [
            [bpInfo.setALabel, bpInfo.setA],
            [bpInfo.setBLabel, bpInfo.setB],
        ]) {
            const typeMap = new Map();
            for (const node of (nodeNameSet ?? [])) {
                if (degMap.has(node)) typeMap.set(node, degMap.get(node));
            }
            if (typeMap.size) degByType.set(label, typeMap);
        }
    }

    return { layerName, nodeSet, N, E, E_max, maxEdges: E_max, density, degMap, inDegMap, outDegMap, degrees, avgDeg, maxDeg, maxDegNode, ilIn, ilOut, edgeKeys, isBipartite, degByType, isDir, nA, nB };
}

function openLayerComparison(nameA, nameB) {
    if (!model) return;
    closeLayerDrillDown();

    const sA = _layerStats(nameA);
    const sB = _layerStats(nameB);

    // Bubble colors
    const lv = renderer.layerView;
    const colorA = lv?._bubbles.find(b => b.layerName === nameA)?.color ?? '#60a5fa';
    const colorB = lv?._bubbles.find(b => b.layerName === nameB)?.color ?? '#f87171';

    // ── Overlap ──
    const sharedNodes = [...sA.nodeSet].filter(n => sB.nodeSet.has(n));
    const sharedN     = sharedNodes.length;
    const unionN      = sA.N + sB.N - sharedN;
    const nodeJacc    = unionN > 0 ? sharedN / unionN : 0;

    let sharedE = 0;
    for (const k of sA.edgeKeys) if (sB.edgeKeys.has(k)) sharedE++;
    const unionE   = sA.E + sB.E - sharedE;
    const edgeJacc = unionE > 0 ? sharedE / unionE : 0;

    const ilAtoB = model.interlayerLinks.filter(l => l.layer_from === nameA && l.layer_to === nameB).length;
    const ilBtoA = model.interlayerLinks.filter(l => l.layer_from === nameB && l.layer_to === nameA).length;

    const commonHubs = sharedNodes
        .map(n => ({ name: n, dA: sA.degMap.get(n) ?? 0, dB: sB.degMap.get(n) ?? 0 }))
        .sort((a, b) => (b.dA + b.dB) - (a.dA + a.dB))
        .slice(0, 5);

    // ── HTML helpers ──
    const fmt  = (v, d = 0) => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : v;
    const pct  = (v, tot)   => tot > 0 ? `${((v / tot) * 100).toFixed(1)}%` : '—';
    const trunc = (s, n = 18) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    // 3-column row: label | A | B
    const colHdr =
        `<div style="display:grid;grid-template-columns:1fr 88px 88px;gap:4px;padding:2px 0 5px;border-bottom:2px solid rgba(0,0,0,0.08);margin-bottom:2px;">
            <span></span>
            <span style="text-align:right;font-size:10px;font-weight:700;color:${colorA};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${trunc(nameA, 12)}</span>
            <span style="text-align:right;font-size:10px;font-weight:700;color:${colorB};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${trunc(nameB, 12)}</span>
        </div>`;

    const cRow = (label, a, b) =>
        `<div style="display:grid;grid-template-columns:1fr 88px 88px;gap:4px;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
            <span style="color:#6b7280;">${label}</span>
            <span style="font-weight:600;color:#1a1a2e;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a}</span>
            <span style="font-weight:600;color:#1a1a2e;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b}</span>
        </div>`;

    const sRow = (label, v) =>
        `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
            <span style="color:#6b7280;">${label}</span>
            <span style="font-weight:600;color:#1a1a2e;text-align:right;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v}</span>
        </div>`;

    const section = (title, content) =>
        `<div style="margin-bottom:14px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:6px;">${title}</div>
            ${content}
        </div>`;

    // Common hubs list
    const hubsVal = commonHubs.length
        ? commonHubs.map(h => `${trunc(h.name)} <span style="color:#9ca3af;">(${h.dA}/${h.dB})</span>`).join(', ')
        : '—';

    // Bipartite: shared types between both layers
    const biTypes = sA.isBipartite && sB.isBipartite
        ? [...sA.degByType.keys()].filter(t => sB.degByType.has(t))
        : [];
    const isBothBi = biTypes.length >= 2;

    layerCompareTitle.innerHTML =
        `<span style="color:${colorA};font-weight:700;">${trunc(nameA, 16)}</span>` +
        `<span style="color:#9ca3af;font-weight:400;margin:0 6px;">vs</span>` +
        `<span style="color:${colorB};font-weight:700;">${trunc(nameB, 16)}</span>`;

    const isEitherDir = sA.isDir || sB.isDir;
    const avgInA  = sA.isDir && sA.N > 0 ? sA.E / sA.N : null;
    const avgOutA = sA.isDir && sA.N > 0 ? sA.E / sA.N : null;
    const avgInB  = sB.isDir && sB.N > 0 ? sB.E / sB.N : null;
    const avgOutB = sB.isDir && sB.N > 0 ? sB.E / sB.N : null;

    layerCompareContent.innerHTML =
        section('Size',
            colHdr +
            cRow('Nodes', fmt(sA.N), fmt(sB.N)) +
            cRow('Edges', fmt(sA.E), fmt(sB.E)) +
            cRow('Density', sA.density.toFixed(4), sB.density.toFixed(4)) +
            (isEitherDir
                ? cRow('Avg in-degree',  fmt(avgInA,  2), fmt(avgInB,  2)) +
                  cRow('Avg out-degree', fmt(avgOutA, 2), fmt(avgOutB, 2))
                : cRow('Avg degree', fmt(sA.avgDeg, 2), fmt(sB.avgDeg, 2))
            ) +
            cRow('Max degree', `${fmt(sA.maxDeg)} (${trunc(sA.maxDegNode, 10)})`, `${fmt(sB.maxDeg)} (${trunc(sB.maxDegNode, 10)})`)
        ) +
        section('Overlap',
            sRow('Shared nodes', `${fmt(sharedN)} &nbsp;<span style="color:#9ca3af;">${pct(sharedN, sA.N)} of A &middot; ${pct(sharedN, sB.N)} of B</span>`) +
            sRow('Shared edges', `${fmt(sharedE)} &nbsp;<span style="color:#9ca3af;">${pct(sharedE, sA.E)} of A &middot; ${pct(sharedE, sB.E)} of B</span>`) +
            sRow('Node Jaccard', nodeJacc.toFixed(3)) +
            sRow('Edge Jaccard', edgeJacc.toFixed(3)) +
            sRow('Interlayer A→B', fmt(ilAtoB)) +
            sRow('Interlayer B→A', fmt(ilBtoA)) +
            sRow('Common hubs', hubsVal)
        ) +
        section('Divergence',
            colHdr +
            cRow('Nodes only in', fmt(sA.N - sharedN), fmt(sB.N - sharedN)) +
            cRow('Edges only in', fmt(sA.E - sharedE), fmt(sB.E - sharedE)) +
            `<div style="margin-top:10px;">
                <div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">Degree distribution</div>
                ${isBothBi
                    ? biTypes.map((t, i) =>
                        `<div style="font-size:10px;color:#6b7280;margin-bottom:2px;">${t}</div>
                         <canvas id="cmpHist_${i}" width="348" height="80" style="display:block;width:100%;border-radius:4px;margin-bottom:6px;"></canvas>`
                      ).join('')
                    : `<canvas id="cmpHist_0" width="348" height="90" style="display:block;width:100%;border-radius:4px;"></canvas>`
                }
            </div>`
        ) +
        section('Cross-layer links',
            colHdr +
            cRow('Incoming', fmt(sA.ilIn), fmt(sB.ilIn)) +
            cRow('Outgoing', fmt(sA.ilOut), fmt(sB.ilOut)) +
            cRow('Total', fmt(sA.ilIn + sA.ilOut), fmt(sB.ilIn + sB.ilOut))
        );

    // Draw histogram(s)
    if (isBothBi) {
        biTypes.forEach((t, i) => {
            const c = document.getElementById(`cmpHist_${i}`);
            if (c) _drawComparisonHistogram(c,
                [...(sA.degByType.get(t)?.values() ?? [])],
                [...(sB.degByType.get(t)?.values() ?? [])],
                colorA, colorB);
        });
    } else {
        const c = document.getElementById('cmpHist_0');
        if (c) _drawComparisonHistogram(c, sA.degrees, sB.degrees, colorA, colorB);
    }

    layerComparePanel.style.transform    = 'translateX(0)';
    layerComparePanel.style.opacity      = '1';
    layerComparePanel.style.pointerEvents = 'all';
}

function _drawComparisonHistogram(canvas, degsA, degsB, colorA, colorB) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 6, right: 8, bottom: 22, left: 28 };
    ctx.clearRect(0, 0, W, H);
    if (!degsA.length && !degsB.length) return;

    const maxDeg = Math.max(...degsA, ...degsB, 0);
    const bins   = maxDeg + 1;
    const cA = new Array(bins).fill(0); for (const d of degsA) cA[d]++;
    const cB = new Array(bins).fill(0); for (const d of degsB) cB[d]++;
    const maxC = Math.max(...cA, ...cB, 1);

    const cW  = W - PAD.left - PAD.right;
    const cH  = H - PAD.top  - PAD.bottom;
    const barW = cW / bins;

    // Grid lines + y-labels
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, Math.round(maxC / 2), maxC]) {
        const y = PAD.top + cH - Math.round((v / maxC) * cH);
        ctx.fillText(v, PAD.left - 3, y);
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }

    // Bars A then B (overlaid, semi-transparent)
    for (const [counts, color] of [[cA, colorA], [cB, colorB]]) {
        ctx.fillStyle = color + 'aa';
        for (let i = 0; i < bins; i++) {
            if (!counts[i]) continue;
            const bh = Math.round((counts[i] / maxC) * cH);
            ctx.fillRect(Math.round(PAD.left + i * barW), PAD.top + cH - bh, Math.max(1, Math.floor(barW) - 1), bh);
        }
    }

    // X-axis labels
    ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = bins <= 10 ? 1 : bins <= 20 ? 2 : Math.ceil(bins / 10);
    for (let i = 0; i < bins; i += step)
        ctx.fillText(i, PAD.left + (i + 0.5) * barW, PAD.top + cH + 3);

    // Legend dots
    for (const [color, label, xOff] of [[colorA, 'A', 28], [colorB, 'B', 14]]) {
        ctx.fillStyle = color;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillText(label, W - PAD.right - xOff + 14, PAD.top + 1);
    }
}

function openLayerDrillDown(layerName) {
    if (!model) return;

    const layerObj   = model.layers.find(l => l.layer_name === layerName);
    const layerIdx   = model.layers.indexOf(layerObj) + 1;
    const nodeSet    = model.nodesPerLayer.get(layerName) || new Set();
    const intraLinks = model.intralayerLinks.filter(l => l.layer_from === layerName);
    const N = nodeSet.size;

    const isDir  = model.directed ?? false;
    const bpInfo = model.bipartiteInfo?.get(layerName);
    const isBipartite = bpInfo?.isBipartite ?? false;
    const nA = isBipartite ? (bpInfo.setA?.size ?? 0) : 0;
    const nB = isBipartite ? (bpInfo.setB?.size ?? 0) : 0;

    // Edge count — edges stored once, no /2
    const E = intraLinks.length;

    // Density formula per network type
    let E_max;
    if (isBipartite) {
        E_max = isDir ? 2 * nA * nB : nA * nB;
    } else {
        E_max = isDir ? N * (N - 1) : N * (N - 1) / 2;
    }
    const density = E_max > 0 ? E / E_max : 0;

    // Degree per node — edges stored once, no halving
    const degMap    = new Map();
    const inDegMap  = new Map();
    const outDegMap = new Map();
    for (const node of nodeSet) {
        degMap.set(node, 0);
        if (isDir) { inDegMap.set(node, 0); outDegMap.set(node, 0); }
    }
    for (const l of intraLinks) {
        degMap.set(l.node_from, (degMap.get(l.node_from) ?? 0) + 1);
        degMap.set(l.node_to,   (degMap.get(l.node_to)   ?? 0) + 1);
        if (isDir) {
            outDegMap.set(l.node_from, (outDegMap.get(l.node_from) ?? 0) + 1);
            inDegMap.set(l.node_to,   (inDegMap.get(l.node_to)    ?? 0) + 1);
        }
    }

    const degrees   = [...degMap.values()];
    const avgDeg    = N > 0 ? degrees.reduce((s, d) => s + d, 0) / N : 0;
    const maxDeg    = degrees.length ? Math.max(...degrees) : 0;
    const minDeg    = degrees.length ? Math.min(...degrees) : 0;
    const maxDegNode = [...degMap.entries()].find(([, d]) => d === maxDeg)?.[0] ?? '—';
    const isolated  = degrees.filter(d => d === 0).length;

    // Interlayer links
    const ilIn    = model.interlayerLinks.filter(l => l.layer_to   === layerName).length;
    const ilOut   = model.interlayerLinks.filter(l => l.layer_from === layerName).length;
    const ilTotal = ilIn + ilOut;

    // Layers sharing at least one node
    let sharedLayers = 0;
    for (const [otherName, otherNodes] of model.nodesPerLayer) {
        if (otherName === layerName) continue;
        for (const n of otherNodes) { if (nodeSet.has(n)) { sharedLayers++; break; } }
    }

    // Degree maps per node type for bipartite
    const degByType = new Map(); // typeLabel → Map<node, degree>
    if (isBipartite) {
        for (const [label, nodeNameSet] of [
            [bpInfo.setALabel, bpInfo.setA],
            [bpInfo.setBLabel, bpInfo.setB],
        ]) {
            const typeMap = new Map();
            for (const node of (nodeNameSet ?? [])) {
                if (degMap.has(node)) typeMap.set(node, degMap.get(node));
            }
            if (typeMap.size) degByType.set(label, typeMap);
        }
    }

    // ── HTML helpers ──
    const fmt = (v, d = 0) => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : v;

    const section = (title, rows) =>
        `<div style="margin-bottom:14px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:6px;">${title}</div>
            ${rows.map(([k, v]) =>
                `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
                    <span style="color:#6b7280;">${k}</span>
                    <span style="font-weight:600;color:#1a1a2e;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;">${v}</span>
                </div>`
            ).join('')}
        </div>`;

    // Build connectivity rows depending on network type
    const connectivityRows = [];
    if (isDir) {
        const avgIn  = N > 0 ? E / N : 0;
        const avgOut = N > 0 ? E / N : 0;
        const maxIn  = inDegMap.size  ? Math.max(...inDegMap.values())  : 0;
        const maxOut = outDegMap.size ? Math.max(...outDegMap.values()) : 0;
        const maxInNode  = [...inDegMap.entries()].find(([, d])  => d === maxIn)?.[0]  ?? '—';
        const maxOutNode = [...outDegMap.entries()].find(([, d]) => d === maxOut)?.[0] ?? '—';
        connectivityRows.push(
            ['Avg in-degree',  fmt(avgIn,  2)],
            ['Avg out-degree', fmt(avgOut, 2)],
            ['Max in-degree',  `${fmt(maxIn)}  (${maxInNode})`],
            ['Max out-degree', `${fmt(maxOut)} (${maxOutNode})`],
            ['Isolated nodes', fmt(isolated)],
        );
    } else {
        connectivityRows.push(
            ['Average degree', fmt(avgDeg, 2)],
            ['Max degree', `${fmt(maxDeg)} (${maxDegNode})`],
            ['Min degree', fmt(minDeg)],
            ['Isolated nodes', fmt(isolated)],
        );
    }

    // Size section: for bipartite, show set sizes
    const sizeRows = [['Nodes', fmt(N)]];
    if (isBipartite) sizeRows.push([`  ${bpInfo.setALabel}`, fmt(nA)], [`  ${bpInfo.setBLabel}`, fmt(nB)]);
    sizeRows.push(['Edges (intra-layer)', fmt(E)], ['Density', E_max > 0 ? density.toFixed(4) : '—']);

    layerDrillTitle.textContent = layerName;
    layerDrillStats.innerHTML =
        section('Identity', [
            ['Layer name', layerName],
            ['Layer index', layerIdx],
            ['Type', `${isDir ? 'Directed' : (model.directedInterlayer ? 'Undirected (directed interlayer)' : 'Undirected')} ${isBipartite ? 'bipartite' : 'unipartite'}`],
        ]) +
        section('Size', sizeRows) +
        section('Connectivity', connectivityRows) +
        section('Cross-layer connectivity', [
            ['Interlayer links — incoming', fmt(ilIn)],
            ['Interlayer links — outgoing', fmt(ilOut)],
            ['Interlayer links — total', fmt(ilTotal)],
            ['Layers sharing ≥1 node', fmt(sharedLayers)],
        ]) +
        `<div style="margin-bottom:6px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:8px;">Degree distribution</div>
            <canvas id="degHistCanvas" width="268" height="120" style="display:block;width:100%;border-radius:4px;"></canvas>
        </div>`;

    // ── Draw histogram(s) ──
    const histCanvas = document.getElementById('degHistCanvas');
    if (histCanvas) _drawDegreeHistogram(histCanvas, isBipartite ? degByType : null, degrees);

    // Slide panel in
    layerDrillPanel.style.transform    = 'translateX(0)';
    layerDrillPanel.style.opacity      = '1';
    layerDrillPanel.style.pointerEvents = 'all';
}

function _drawDegreeHistogram(canvas, degByType, allDegrees) {
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width, H = canvas.height;
    const PAD  = { top: 8, right: 8, bottom: 28, left: 32 };
    ctx.clearRect(0, 0, W, H);

    // Build datasets: either [{ label, degrees, color }] or single set
    const PALETTE = ['#60a5fa', '#f87171', '#34d399', '#fbbf24'];
    let datasets;
    if (degByType && degByType.size > 1) {
        datasets = [...degByType.entries()].map(([type, dMap], i) => ({
            label: type, degrees: [...dMap.values()], color: PALETTE[i % PALETTE.length],
        }));
    } else {
        datasets = [{ label: '', degrees: allDegrees, color: '#60a5fa' }];
    }

    const isBi = datasets.length > 1;
    const chartH = isBi ? Math.floor((H - PAD.top - PAD.bottom - 6) / 2) : H - PAD.top - PAD.bottom;

    datasets.forEach((ds, di) => {
        const degs = ds.degrees;
        if (!degs.length) return;
        const maxD = Math.max(...degs);
        const bins = maxD + 1;
        const counts = new Array(bins).fill(0);
        for (const d of degs) counts[d]++;
        const maxC = Math.max(...counts, 1);

        const yOff  = PAD.top + di * (chartH + 6);
        const cW    = W - PAD.left - PAD.right;
        const barW  = Math.max(1, Math.floor(cW / bins) - 1);

        // Y-axis ticks
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let v of [0, Math.round(maxC / 2), maxC]) {
            const y = yOff + chartH - Math.round((v / maxC) * chartH);
            ctx.fillText(v, PAD.left - 4, y);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        }

        // Bars
        ctx.fillStyle = ds.color + 'cc';
        for (let i = 0; i < bins; i++) {
            if (!counts[i]) continue;
            const bh = Math.round((counts[i] / maxC) * chartH);
            const x  = PAD.left + i * (cW / bins);
            ctx.fillRect(Math.round(x), yOff + chartH - bh, barW, bh);
        }

        // X-axis labels (every few ticks to avoid crowding)
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const step = bins <= 10 ? 1 : bins <= 20 ? 2 : Math.ceil(bins / 10);
        for (let i = 0; i < bins; i += step) {
            const x = PAD.left + (i + 0.5) * (cW / bins);
            ctx.fillText(i, x, yOff + chartH + 3);
        }

        // Label (bipartite only)
        if (isBi) {
            ctx.fillStyle = ds.color;
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(ds.label, W - PAD.right, yOff + 1);
        }
    });
}

layerViewBtn.addEventListener('click', toggleLayerView);
layerDrillClose.addEventListener('click', closeLayerDrillDown);
layerCompareClose.addEventListener('click', () => {
    closeLayerComparison();
    renderer.render();
});

// ── Layer View sidebar controls ────────────────────────────────────────────
lvSizeBy.addEventListener('change', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('sizeBy', lvSizeBy.value);
    renderLayerViewLegend();
    _ensureLayerViewLoop();
});
lvColorBy.addEventListener('change', () => {
    if (!renderer.layerView) return;
    lvUniformColorContainer.style.display = lvColorBy.value === 'uniform' ? '' : 'none';
    renderer.layerView.updateSetting('colorBy', lvColorBy.value);
    renderLayerViewLegend();
    renderer.render();
});
lvUniformColor.addEventListener('input', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('uniformColor', lvUniformColor.value);
    renderer.render();
});
lvShowEdges.addEventListener('change', () => {
    if (!renderer.layerView) return;
    lvEdgeOptionsContainer.style.display = lvShowEdges.checked ? '' : 'none';
    renderer.layerView.updateSetting('showEdges', lvShowEdges.checked);
    renderer.render();
});
lvEdgeMetric.addEventListener('change', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('edgeMetric', lvEdgeMetric.value);
    _updateEdgeWeightSlider();
    renderer.render();
});
lvMinEdgeWeight.addEventListener('input', () => {
    if (!renderer.layerView) return;
    const val = parseInt(lvMinEdgeWeight.value);
    lvMinEdgeWeightLabel.textContent = val;
    renderer.layerView.updateSetting('minEdgeWeight', val);
    renderer.render();
});
lvEdgeLabels.addEventListener('change', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('showEdgeLabels', lvEdgeLabels.checked);
    renderer.render();
});
lvShowLabels.addEventListener('change', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('showLabels', lvShowLabels.checked);
    renderer.render();
});
lvFontSize.addEventListener('input', () => {
    if (!renderer.layerView) return;
    renderer.layerView.updateSetting('labelFontSize', parseInt(lvFontSize.value));
    renderer.render();
});
lvSizeMult.addEventListener('input', () => {
    if (!renderer.layerView) return;
    const val = parseFloat(lvSizeMult.value);
    lvSizeMultLabel.textContent = val.toFixed(1) + '×';
    renderer.layerView.updateSetting('sizeMultiplier', val);
    renderLayerViewLegend();
    _ensureLayerViewLoop();
});
lvSpacing.addEventListener('input', () => {
    if (!renderer.layerView) return;
    const val = parseFloat(lvSpacing.value);
    lvSpacingLabel.textContent = val.toFixed(1) + '×';
    renderer.layerView.updateSetting('bubbleSpacing', val);
    _ensureLayerViewLoop();
});
function fitMapToLayers() {
    if (!model || !model.layers) return;
    const lats = [];
    const lngs = [];
    model.layers.forEach(layer => {
        const latVal = layer.latitude !== undefined ? layer.latitude : layer.Latitude;
        const lngVal = layer.longitude !== undefined ? layer.longitude : layer.Longitude;
        if (latVal !== undefined && lngVal !== undefined) {
            const lat = parseFloat(latVal);
            const lng = parseFloat(lngVal);
            if (!isNaN(lat) && !isNaN(lng)) {
                lats.push(lat);
                lngs.push(lng);
            }
        }
    });
    if (lats.length > 0) {
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        if (minLat === maxLat && minLng === maxLng) {
            bgMap.setView([minLat, minLng], 12);
        } else {
            bgMap.fitBounds([
                [minLat, minLng],
                [maxLat, maxLng]
            ], { padding: [40, 40] });
        }
    }
}

function updateMapModeViews() {
    layerCloseButtonsContainer.innerHTML = '';

    if (appMode === 'network') {
        mapMarkersOverlay.style.display = 'none';
        canvas.style.pointerEvents = 'auto';
        renderer.activeMapLayers = null; // render all
        renderer.render();
    } else {
        mapMarkersOverlay.style.display = 'block';
        renderer.activeMapLayers = activeMapLayers; // Only render these layers

        if (activeMapLayers.size === 0) {
            canvas.style.pointerEvents = 'none'; // Map gets controls
            mapOpacityControl.style.opacity = '1';
            mapOpacityControl.style.pointerEvents = 'auto';
        } else {
            canvas.style.pointerEvents = 'auto'; // Canvas gets controls
            mapOpacityControl.style.opacity = '0.4'; // Dim control slightly when layers popped out
            mapOpacityControl.style.pointerEvents = 'auto'; // Still allow them to edit opacity while viewing overlays
        }

        renderMapMarkers();
        renderMapLayerList();
        updateCloseButtons();
        renderer.render();
    }
}

// ==== Map Opacity Handlers ====
mapOpacitySlider.addEventListener('input', () => {
    const val = parseFloat(mapOpacitySlider.value);
    satelliteLayer.setOpacity(val);
    streetLayer.setOpacity(val);
    mapMarkersOverlay.style.opacity = val;
});

showMapImageCheckbox.addEventListener('change', () => {
    const show = showMapImageCheckbox.checked;
    const activeLayer = streetMapCheckbox.checked ? streetLayer : satelliteLayer;
    if (show) {
        bgMap.addLayer(activeLayer);
    } else {
        bgMap.removeLayer(activeLayer);
    }
    renderer.showMapBackground = show;
    renderer.render();
});

showLocationsCheckbox.addEventListener('change', () => {
    mapMarkersOverlay.style.visibility = showLocationsCheckbox.checked ? 'visible' : 'hidden';
});

streetMapCheckbox.addEventListener('change', () => {
    const mapVisible = showMapImageCheckbox.checked;
    if (streetMapCheckbox.checked) {
        bgMap.removeLayer(satelliteLayer);
        if (mapVisible) bgMap.addLayer(streetLayer);
    } else {
        bgMap.removeLayer(streetLayer);
        if (mapVisible) bgMap.addLayer(satelliteLayer);
    }
});

// ==== Layer View Geo Map Controls ====
lvMapOpacitySlider.addEventListener('input', () => {
    const val = parseFloat(lvMapOpacitySlider.value);
    lvSatelliteLayer.setOpacity(val);
    lvStreetLayer.setOpacity(val);
});

lvShowMapImageCheckbox.addEventListener('change', () => {
    const show = lvShowMapImageCheckbox.checked;
    const activeLayer = lvStreetMapCheckbox.checked ? lvStreetLayer : lvSatelliteLayer;
    if (show) {
        lvMap.addLayer(activeLayer);
    } else {
        lvMap.removeLayer(activeLayer);
    }
});

lvStreetMapCheckbox.addEventListener('change', () => {
    const mapVisible = lvShowMapImageCheckbox.checked;
    if (lvStreetMapCheckbox.checked) {
        lvMap.removeLayer(lvSatelliteLayer);
        if (mapVisible) lvMap.addLayer(lvStreetLayer);
    } else {
        lvMap.removeLayer(lvStreetLayer);
        if (mapVisible) lvMap.addLayer(lvSatelliteLayer);
    }
});

function renderMapMarkers() {
    mapMarkersOverlay.innerHTML = '';
    if (appMode !== 'map' || !model || !model.layers) return;

    model.layers.forEach(layer => {
        const latVal = layer.latitude !== undefined ? layer.latitude : layer.Latitude;
        const lngVal = layer.longitude !== undefined ? layer.longitude : layer.Longitude;
        if (latVal !== undefined && lngVal !== undefined) {
            const lat = parseFloat(latVal);
            const lng = parseFloat(lngVal);
            if (!isNaN(lat) && !isNaN(lng)) {
                const pos = bgMap.latLngToContainerPoint([lat, lng]);

                // Hide marker if the layer is currently popped out
                if (activeMapLayers.has(layer.layer_name)) return;

                const marker = document.createElement('div');
                marker.className = 'map-marker';
                marker.style.left = pos.x + 'px';
                marker.style.top = pos.y + 'px';
                marker.title = layer.layer_name;

                if (renderer.showLayerNames) {
                    const label = document.createElement('div');
                    label.className = 'map-marker-label';
                    label.innerText = layer.layer_name;
                    marker.appendChild(label);
                }

                marker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    activeMapLayers.add(layer.layer_name);
                    updateMapModeViews();
                });

                mapMarkersOverlay.appendChild(marker);
            }
        }
    });
}

function renderMapLayerList() {
    mapLayerList.innerHTML = '';
    if (appMode !== 'map' || !model || !model.layers) return;

    for (const layer of model.layers) {
        const isActive = activeMapLayers.has(layer.layer_name);
        const li = document.createElement('li');
        li.className = 'map-layer-item' + (isActive ? ' active' : '');

        const dot = document.createElement('span');
        dot.className = 'map-layer-dot';
        li.appendChild(dot);

        const name = document.createElement('span');
        name.textContent = layer.layer_name;
        li.appendChild(name);

        if (isActive) {
            const closeBtn = document.createElement('span');
            closeBtn.className = 'map-layer-close';
            closeBtn.textContent = '✕';
            closeBtn.title = 'Close layer';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                activeMapLayers.delete(layer.layer_name);
                updateMapModeViews();
            });
            li.appendChild(closeBtn);
        }

        li.addEventListener('click', () => {
            if (!isActive) {
                activeMapLayers.add(layer.layer_name);
                updateMapModeViews();
            }
        });

        mapLayerList.appendChild(li);
    }
}

function updateCloseButtons() {
    layerCloseButtonsContainer.innerHTML = '';
    if (appMode !== 'map' || activeMapLayers.size === 0 || !renderer.positions || !renderer.model) return;

    Array.from(activeMapLayers).forEach(layerName => {
        const layerIndex = renderer.model.layers.findIndex(l => l.layer_name === layerName);
        if (layerIndex === -1) return;

        // Find the top-right corner of the layer in screen coords
        // The geographic origin is calculated safely in renderer project
        // So we grab a generic point near the origin representing top-right
        const topRScreen = renderer.project(renderer.layerWidth, 0, layerIndex);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'popout-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.style.left = topRScreen.x + 'px';
        closeBtn.style.top = topRScreen.y + 'px';
        closeBtn.title = "Close " + layerName;

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            activeMapLayers.delete(layerName);
            updateMapModeViews();
        });

        layerCloseButtonsContainer.appendChild(closeBtn);
    });
}

// ---- Toggle Labels ----
showLabelsCheckbox.addEventListener('change', () => {
    renderer.showLabels = showLabelsCheckbox.checked;
    renderer.render();
});

// ---- Toggle Transform Nodes ----
transformNodesCheckbox.addEventListener('change', () => {
    renderer.transformNodes = transformNodesCheckbox.checked;
    renderer.render();
});

// ---- Toggle Layer Names ----
showLayerNamesCheckbox.addEventListener('change', () => {
    renderer.showLayerNames = showLayerNamesCheckbox.checked;
    if (appMode === 'map') renderMapMarkers();
    renderer.render();
});

// ---- Toggle Set Names ----
showSetNamesCheckbox.addEventListener('change', () => {
    renderer.showSetNames = showSetNamesCheckbox.checked;
    renderer.render();
});

// ---- Toggle Bipartite Nested Sorting ----
bipartiteNestedCheckbox.addEventListener('change', () => {
    layout.bipartiteNested = bipartiteNestedCheckbox.checked;
    if (layout.layoutType === 'bipartite' && model) {
        positions = layout.computeLayout(model);
        renderer.setData(model, positions);
        renderer.render();
    }
});

// ---- Toggle Interlayer Links ----
showInterlayerCheckbox.addEventListener('change', () => {
    renderer.showInterlayerLinks = showInterlayerCheckbox.checked;
    renderer.render();
});

// ---- Stacking Mode Toggle ----
function setStackMode(mode) {
    renderer.stackMode = mode;
    stackHorizontalBtn.classList.toggle('active', mode === 'horizontal');
    stackVerticalBtn.classList.toggle('active', mode === 'vertical');
    renderer.centerView();
    renderer.render();
}

stackHorizontalBtn.addEventListener('click', () => setStackMode('horizontal'));
stackVerticalBtn.addEventListener('click', () => setStackMode('vertical'));

// ---- Layer Spacing ----
layerSpacingSlider.addEventListener('input', () => {
    renderer.layerSpacing = parseInt(layerSpacingSlider.value);
    renderer.centerView();
    renderer.render();
});

// ---- Layout Algorithm ----
layoutSelect.addEventListener('change', () => {
    if (!model) return;
    layout.layoutType = layoutSelect.value;
    layout.bipartiteInfo = model.bipartiteInfo;
    positions = layout.computeLayout(model);
    renderer.setData(model, positions);
    renderer.layoutType = layout.layoutType;

    // Show/hide UI elements based on layout
    const isBipartiteLayout = layout.layoutType === 'bipartite';
    document.getElementById('setNamesContainer').style.display = isBipartiteLayout ? '' : 'none';
    colorByContainer.style.display = isBipartiteLayout ? 'none' : '';
    bipartiteColorByContainer.style.display = isBipartiteLayout ? '' : 'none';
    sizeByContainer.style.display = isBipartiteLayout ? 'none' : '';
    bipartiteSizeByContainer.style.display = isBipartiteLayout ? '' : 'none';

    updateNodeColors();
    renderer.render();
});

// ---- Node Size Slider ----
nodeSizeSlider.addEventListener('input', () => {
    const size = parseInt(nodeSizeSlider.value);
    renderer.nodeRadius = size;
    renderer.labelFont = `${Math.max(8, size + 2)}px Inter, system-ui, sans-serif`;
    renderer.render();
});



// ---- File Upload ----
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target.result);
            loadData(json);
            _showDataLoadedNotice();
        } catch (err) {
            alert('Invalid JSON file: ' + err.message);
        }
    };
    reader.readAsText(file);
});

// ---- Data-loaded notice ----
const DATA_NOTICE_KEY = 'mlviz_dataLoadedNoticeDismissed';

function _showDataLoadedNotice() {
    if (sessionStorage.getItem(DATA_NOTICE_KEY)) return;
    dataLoadedNotice.style.display = 'flex';
}

function _closeDataLoadedNotice() {
    dataLoadedNotice.style.display = 'none';
}

dataLoadedClose.addEventListener('click', _closeDataLoadedNotice);
dataLoadedOk.addEventListener('click', _closeDataLoadedNotice);
dataLoadedDontShow.addEventListener('click', () => {
    sessionStorage.setItem(DATA_NOTICE_KEY, '1');
    _closeDataLoadedNotice();
});
dataLoadedNotice.addEventListener('click', e => { if (e.target === dataLoadedNotice) _closeDataLoadedNotice(); });

// ---- CSV Import ----
let _csvEdgeText = null, _csvLayersText = null, _csvNodesText = null, _csvStateNodesText = null;
let _csvPendingJson = null;

function _readFileAsText(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsText(file);
    });
}

function _closeCsvModal() {
    _csvPendingJson = null;
    csvImportLoad.textContent = 'Load Network';
    csvImportModal.style.display = 'none';
}

csvUploadBtn.addEventListener('click', () => {
    _csvEdgeText = _csvLayersText = _csvNodesText = _csvStateNodesText = null;
    csvEdgeLabel.textContent = 'Choose file…';
    csvLayersLabel.textContent = 'Choose file…';
    csvNodesLabel.textContent = 'Choose file…';
    csvStateNodesLabel.textContent = 'Choose file…';
    csvDirected.checked = false;
    csvImportLoad.disabled = true;
    csvImportLoad.style.opacity = '0.4';
    csvImportError.style.display = 'none';
    csvImportWarn.style.display  = 'none';
    csvImportInfo.style.display  = 'none';
    csvImportModal.style.display = 'flex';
});

csvModalClose.addEventListener('click', _closeCsvModal);
csvImportCancel.addEventListener('click', _closeCsvModal);
csvImportModal.addEventListener('click', e => { if (e.target === csvImportModal) _closeCsvModal(); });

csvEdgeFile.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    csvEdgeLabel.textContent = f.name;
    _csvEdgeText = await _readFileAsText(f);
    csvImportLoad.disabled = false;
    csvImportLoad.style.opacity = '1';
});

csvLayersFile.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    csvLayersLabel.textContent = f.name;
    _csvLayersText = await _readFileAsText(f);
});

csvNodesFile.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    csvNodesLabel.textContent = f.name;
    _csvNodesText = await _readFileAsText(f);
});

csvStateNodesFile.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    csvStateNodesLabel.textContent = f.name;
    _csvStateNodesText = await _readFileAsText(f);
});

csvImportLoad.addEventListener('click', () => {
    // If user is confirming after a warning, load the pending json directly
    if (_csvPendingJson) {
        const json = _csvPendingJson;
        _closeCsvModal();
        loadData(json);
        _showDataLoadedNotice();
        return;
    }

    csvImportError.style.display = 'none';
    csvImportWarn.style.display  = 'none';
    csvImportInfo.style.display  = 'none';
    try {
        const { json, infoMessages, warnings } = csvToJson(_csvEdgeText, _csvLayersText, _csvNodesText, _csvStateNodesText, {
            directed: csvDirected.checked,
        });
        if (warnings.length) {
            csvImportWarn.textContent = '⚠ ' + warnings.join(' | ');
            csvImportWarn.style.display = 'block';
            if (infoMessages.length) {
                csvImportInfo.textContent = infoMessages.join(' · ');
                csvImportInfo.style.display = 'block';
            }
            // Require explicit confirmation — store json and change button label
            _csvPendingJson = json;
            csvImportLoad.textContent = 'Load Anyway';
        } else if (infoMessages.length) {
            csvImportInfo.textContent = infoMessages.join(' · ');
            csvImportInfo.style.display = 'block';
            _closeCsvModal();
            loadData(json);
            _showDataLoadedNotice();
        } else {
            _closeCsvModal();
            loadData(json);
            _showDataLoadedNotice();
        }
    } catch (err) {
        csvImportError.textContent = err.message;
        csvImportError.style.display = 'block';
    }
});

// ---- Dropdowns ----
function populateDropdowns() {
    if (!model) return;

    // Node color options
    nodeColorSelect.innerHTML = '<option value="">Default</option>';
    for (const attr of model.nodeAttributeNames) {
        const opt = document.createElement('option');
        opt.value = `node:${attr}`;
        opt.textContent = `Node: ${attr}`;
        nodeColorSelect.appendChild(opt);
    }
    for (const attr of model.stateNodeAttributeNames) {
        const opt = document.createElement('option');
        opt.value = `state:${attr}`;
        opt.textContent = `State: ${attr}`;
        nodeColorSelect.appendChild(opt);
    }

    // Bipartite node color options
    nodeColorSelectSetA.innerHTML = '<option value="">Set Default</option>';
    nodeColorSelectSetB.innerHTML = '<option value="">Set Default</option>';

    const setA_nodeAttrs = new Set();
    const setA_stateAttrs = new Set();
    const setB_nodeAttrs = new Set();
    const setB_stateAttrs = new Set();
    let hasBipartite = false;
    let labelA = "Set A", labelB = "Set B";

    for (const [layerName, info] of model.bipartiteInfo) {
        if (!info.isBipartite) continue;
        hasBipartite = true;
        labelA = info.setALabel || labelA;
        labelB = info.setBLabel || labelB;
        for (const nodeName of info.setA) {
            const pn = model.nodesByName.get(nodeName);
            if (pn) Object.keys(pn).forEach(k => { if (k !== 'node_id' && k !== 'node_name') setA_nodeAttrs.add(k); });
            const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`);
            if (sn) Object.keys(sn).forEach(k => { if (!['layer_id', 'node_id', 'layer_name', 'node_name', 'degree', 'strength', 'in_degree', 'out_degree', 'in_strength', 'out_strength'].includes(k)) setA_stateAttrs.add(k); });
        }
        for (const nodeName of info.setB) {
            const pn = model.nodesByName.get(nodeName);
            if (pn) Object.keys(pn).forEach(k => { if (k !== 'node_id' && k !== 'node_name') setB_nodeAttrs.add(k); });
            const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`);
            if (sn) Object.keys(sn).forEach(k => { if (!['layer_id', 'node_id', 'layer_name', 'node_name', 'degree', 'strength', 'in_degree', 'out_degree', 'in_strength', 'out_strength'].includes(k)) setB_stateAttrs.add(k); });
        }
    }

    ['degree', 'strength', 'in_degree', 'out_degree', 'in_strength', 'out_strength'].forEach(attr => {
        if (model.stateNodeAttributeNames.includes(attr)) {
            setA_stateAttrs.add(attr);
            setB_stateAttrs.add(attr);
        }
    });

    if (hasBipartite) {
        bipartiteColorLabelA.textContent = `Color by ${labelA}`;
        bipartiteColorLabelB.textContent = `Color by ${labelB}`;
        setA_nodeAttrs.forEach(attr => { const opt = document.createElement('option'); opt.value = `node:${attr}`; opt.textContent = `Node: ${attr}`; nodeColorSelectSetA.appendChild(opt); });
        setA_stateAttrs.forEach(attr => { const opt = document.createElement('option'); opt.value = `state:${attr}`; opt.textContent = `State: ${attr}`; nodeColorSelectSetA.appendChild(opt); });
        setB_nodeAttrs.forEach(attr => { const opt = document.createElement('option'); opt.value = `node:${attr}`; opt.textContent = `Node: ${attr}`; nodeColorSelectSetB.appendChild(opt); });
        setB_stateAttrs.forEach(attr => { const opt = document.createElement('option'); opt.value = `state:${attr}`; opt.textContent = `State: ${attr}`; nodeColorSelectSetB.appendChild(opt); });
    }

    // Node size options
    nodeSizeSelect.innerHTML = '<option value="">Uniform (slider)</option>';
    nodeSizeSelectSetA.innerHTML = '<option value="">Uniform (slider)</option>';
    nodeSizeSelectSetB.innerHTML = '<option value="">Uniform (slider)</option>';

    // Only numeric attributes; heuristic: check sample value type
    const isNumericAttr = (attr, entities) => {
        for (const e of entities) {
            const v = e[attr];
            if (v !== undefined && v !== null && v !== '')
                return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)));
        }
        return false;
    };

    const addSizeOpt = (select, source, attr) => {
        const opt = document.createElement('option');
        opt.value = `${source}:${attr}`;
        opt.textContent = `${source === 'node' ? 'Node' : 'State'}: ${attr}`;
        select.appendChild(opt);
    };

    for (const attr of model.nodeAttributeNames) {
        if (isNumericAttr(attr, model.nodes)) addSizeOpt(nodeSizeSelect, 'node', attr);
    }
    for (const attr of Object.keys(model.stateNodes[0] || {})) {
        if (!['layer_name', 'node_name', 'layer_id', 'node_id'].includes(attr)) {
            if (isNumericAttr(attr, model.stateNodes)) addSizeOpt(nodeSizeSelect, 'state', attr);
        }
    }

    // Bipartite size selects — only numeric attrs per set
    if (hasBipartite) {
        bipartiteSizeLabelA.textContent = `Size by ${labelA}`;
        bipartiteSizeLabelB.textContent = `Size by ${labelB}`;

        const addSetSizeOpts = (select, nodeAttrs, stateAttrs) => {
            nodeAttrs.forEach(attr => { if (isNumericAttr(attr, model.nodes)) addSizeOpt(select, 'node', attr); });
            stateAttrs.forEach(attr => { if (isNumericAttr(attr, model.stateNodes)) addSizeOpt(select, 'state', attr); });
        };
        addSetSizeOpts(nodeSizeSelectSetA, setA_nodeAttrs, setA_stateAttrs);
        addSetSizeOpts(nodeSizeSelectSetB, setB_nodeAttrs, setB_stateAttrs);

        nodeSizeSelectSetA.disabled = nodeSizeSelectSetA.options.length <= 1;
        nodeSizeSelectSetB.disabled = nodeSizeSelectSetB.options.length <= 1;
    }


    // Link color options
    linkColorSelect.innerHTML = '<option value="">Default</option>';
    for (const attr of model.linkAttributeNames) {
        const opt = document.createElement('option');
        opt.value = attr;
        opt.textContent = attr;
        linkColorSelect.appendChild(opt);
    }

    // Layer color options
    layerColorSelect.innerHTML = '<option value="">Default</option>';
    for (const attr of model.layerAttributeNames) {
        const opt = document.createElement('option');
        opt.value = attr;
        opt.textContent = attr;
        layerColorSelect.appendChild(opt);
    }
    layerColorSelect.disabled = model.layerAttributeNames.length === 0;

}

const layerColorPicker = document.getElementById('layerColorPicker');
layerColorPicker.addEventListener('input', () => {
    if (!layerColorSelect.value) updateLayerColors();
});

const nodeColorPicker = document.getElementById('nodeColorPicker');
nodeColorPicker.addEventListener('input', () => {
    if (!nodeColorSelect.value) updateNodeColors();
});

const intraLinkColorPicker  = document.getElementById('intraLinkColorPicker');
const interLinkColorPicker  = document.getElementById('interLinkColorPicker');
const interLinkColorControl      = document.getElementById('interLinkColorControl');
const interlayerControls         = document.getElementById('interlayerControls');
const interlayerCurvatureSlider  = document.getElementById('interlayerCurvatureSlider');
const interlayerWeightSlider     = document.getElementById('interlayerWeightSlider');
const interlayerWeightLabel      = document.getElementById('interlayerWeightLabel');

intraLinkColorPicker.addEventListener('input', () => { if (!linkColorSelect.value) updateLinkColors(); });
interLinkColorPicker.addEventListener('input', () => { if (!linkColorSelect.value) updateLinkColors(); });

interlayerCurvatureSlider.addEventListener('input', () => {
    renderer.interlayerCurvature = parseFloat(interlayerCurvatureSlider.value);
    renderer.render();
});

interlayerWeightSlider.addEventListener('input', () => {
    const val = parseFloat(interlayerWeightSlider.value);
    renderer.interlayerMinWeight = val;
    interlayerWeightLabel.textContent = val.toFixed(2);
    renderer.render();
});

arrowheadSizeSlider.addEventListener('input', () => {
    renderer.arrowheadSize = parseFloat(arrowheadSizeSlider.value);
    renderer.render();
});

nodeColorSelect.addEventListener('change', () => {
    updateNodeColors();
    renderer.render();
});

nodeColorSelectSetA.addEventListener('change', () => {
    updateNodeColors();
    renderer.render();
});

nodeColorSelectSetB.addEventListener('change', () => {
    updateNodeColors();
    renderer.render();
});

nodeSizeSelect.addEventListener('change', () => { updateNodeSizes(); renderer.render(); });
nodeSizeSelectSetA.addEventListener('change', () => { updateNodeSizes(); renderer.render(); });
nodeSizeSelectSetB.addEventListener('change', () => { updateNodeSizes(); renderer.render(); });

linkColorSelect.addEventListener('change', () => {
    updateLinkColors();
    renderer.render();
});



function _buildSizeScaleFn(val, entities, stateEntities) {
    if (!val) return null;
    const [source, attrName] = val.split(':');
    const items = source === 'node' ? entities : stateEntities;
    let minVal = Infinity, maxVal = -Infinity;
    for (const e of items) {
        const v = e[attrName];
        if (typeof v === 'number') {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
    }
    const range = maxVal - minVal;
    const scale = { type: 'size', min: minVal, max: maxVal, attrName };
    const compute = (v) => {
        if (typeof v !== 'number') return 1.0;
        if (range === 0) return 1.0;
        return 0.3 + ((v - minVal) / range) * 1.7;
    };
    const fn = source === 'node'
        ? (layerName, nodeName) => { const n = model.nodesByName.get(nodeName); return n ? compute(n[attrName]) : 1.0; }
        : (layerName, nodeName) => { const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`); return sn ? compute(sn[attrName]) : 1.0; };
    return { scale, fn };
}

function updateNodeSizes() {
    if (!model) { renderer.nodeSizeFn = null; return; }

    const isBipartiteLayout = layout.layoutType === 'bipartite';

    if (isBipartiteLayout) {
        const resA = _buildSizeScaleFn(nodeSizeSelectSetA.value, model.nodes, model.stateNodes);
        const resB = _buildSizeScaleFn(nodeSizeSelectSetB.value, model.nodes, model.stateNodes);

        activeNodeSizeScale = resA?.scale || resB?.scale || null;

        if (!resA && !resB) {
            renderer.nodeSizeFn = null;
        } else {
            // Determine which set each node belongs to (use first bipartite layer found)
            const setANodes = new Set();
            const setBNodes = new Set();
            for (const [, info] of model.bipartiteInfo) {
                if (!info.isBipartite) continue;
                info.setA.forEach(n => setANodes.add(n));
                info.setB.forEach(n => setBNodes.add(n));
            }
            renderer.nodeSizeFn = (layerName, nodeName) => {
                if (setANodes.has(nodeName)) return resA ? resA.fn(layerName, nodeName) : 1.0;
                if (setBNodes.has(nodeName)) return resB ? resB.fn(layerName, nodeName) : 1.0;
                return 1.0;
            };
        }
    } else {
        const res = _buildSizeScaleFn(nodeSizeSelect.value, model.nodes, model.stateNodes);
        activeNodeSizeScale = res?.scale || null;
        renderer.nodeSizeFn = res?.fn || null;
    }

    renderLegends();
}


function updateNodeColors() {
    activeNodeColorScale = null;
    activeNodeColorScaleA = null;
    activeNodeColorScaleB = null;

    if (!model) {
        renderer.nodeColorFn = null;
        renderLegends();
        return;
    }

    if (layout.layoutType === 'bipartite') {
        const valA = nodeColorSelectSetA.value;
        const valB = nodeColorSelectSetB.value;

        const getScaleObj = (val, isSetA) => {
            if (!val) return null;
            const [source, attrName] = val.split(':');
            let items = [];
            for (const [layerName, info] of model.bipartiteInfo) {
                if (!info.isBipartite) continue;
                const set = isSetA ? info.setA : info.setB;
                for (const nodeName of set) {
                    if (source === 'node') {
                        const n = model.nodesByName.get(nodeName);
                        if (n) items.push(n);
                    } else {
                        const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`);
                        if (sn) items.push(sn);
                    }
                }
            }
            const override = colorScaleOverrides.get(attrName);
            return colorMapper.buildColorScale(items, attrName, override);
        };

        const scA = getScaleObj(valA, true);
        const scB = getScaleObj(valB, false);

        activeNodeColorScaleA = scA;
        activeNodeColorScaleB = scB;

        renderer.nodeColorFn = (layerName, nodeName) => {
            const info = model.bipartiteInfo.get(layerName);
            const isSetA = info && info.setA.has(nodeName);
            const isSetB = info && info.setB.has(nodeName);

            if (isSetA) {
                if (scA) {
                    const [source, attrName] = valA.split(':');
                    const obj = source === 'node' ? model.nodesByName.get(nodeName) : model.stateNodeMap.get(`${layerName}::${nodeName}`);
                    return obj ? scA.scaleFn(obj[attrName]) : '#6b7280';
                } else {
                    return colorMapper.getBipartiteNodeColor(true);
                }
            } else if (isSetB) {
                if (scB) {
                    const [source, attrName] = valB.split(':');
                    const obj = source === 'node' ? model.nodesByName.get(nodeName) : model.stateNodeMap.get(`${layerName}::${nodeName}`);
                    return obj ? scB.scaleFn(obj[attrName]) : '#6b7280';
                } else {
                    return colorMapper.getBipartiteNodeColor(false);
                }
            }
            return '#6b7280'; // fallback
        };
        renderLegends();
        return;
    }

    const val = nodeColorSelect.value;
    nodeColorSwatches.style.display = val ? 'none' : 'flex';
    if (!val) {
        const hex = nodeColorPicker.value;
        renderer.nodeColorFn = () => hex;
        renderLegends();
        return;
    }

    const [source, attrName] = val.split(':');

    if (source === 'node') {
        // Color by physical node attribute
        const override = colorScaleOverrides.get(attrName);
        const sc = colorMapper.buildColorScale(model.nodes, attrName, override);
        activeNodeColorScale = sc;
        renderer.nodeColorFn = (layerName, nodeName) => {
            const node = model.nodesByName.get(nodeName);
            return node ? sc.scaleFn(node[attrName]) : '#6b7280';
        };
    } else if (source === 'state') {
        // Color by state node attribute
        const override = colorScaleOverrides.get(attrName);
        const sc = colorMapper.buildColorScale(model.stateNodes, attrName, override);
        activeNodeColorScale = sc;
        renderer.nodeColorFn = (layerName, nodeName) => {
            const key = `${layerName}::${nodeName}`;
            const sn = model.stateNodeMap.get(key);
            return sn ? sc.scaleFn(sn[attrName]) : '#6b7280';
        };
    }

    renderLegends();
}

function updateLinkColors() {
    activeLinkColorScale = null;
    const attrName = linkColorSelect.value;
    linkColorSwatches.style.display = attrName ? 'none' : 'flex';
    if (!attrName || !model) {
        renderer.linkColorFn = null;
        renderer.defaultIntraColor = intraLinkColorPicker.value;
        renderer.defaultInterColor = interLinkColorPicker.value;
        renderer.render();
        renderLegends();
        return;
    }

    const override = colorScaleOverrides.get(attrName);
    const sc = colorMapper.buildColorScale(model.extended, attrName, override);
    activeLinkColorScale = sc;
    renderer.linkColorFn = (link) => sc.scaleFn(link[attrName]);
    renderLegends();
}

function _hexToRgba(color, alpha) {
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    }
    return color;
}

function updateLayerColors() {
    const attrName = layerColorSelect.value;
    layerColorSwatches.style.display = attrName ? 'none' : 'flex';

    if (!model) { renderer.layerColorFn = null; activeLayerColorScale = null; renderer.render(); return; }

    if (attrName) {
        const override = colorScaleOverrides.get(attrName);
        const sc = colorMapper.buildColorScale(model.layers, attrName, override);
        activeLayerColorScale = sc;
        renderer.layerColorFn = (layerIndex, layer) => {
            const hex = sc.scaleFn(layer[attrName]);
            return { fill: _hexToRgba(hex, 0.35), border: _hexToRgba(hex, 0.7), text: hex };
        };
    } else {
        activeLayerColorScale = null;
        const hex = layerColorPicker.value;
        renderer.layerColorFn = (layerIndex, layer) => (
            { fill: _hexToRgba(hex, 0.18), border: _hexToRgba(hex, 0.55), text: hex }
        );
    }
    renderLegends();
    renderer.render();
}

layerColorSelect.addEventListener('change', updateLayerColors);

// ---- Zoom Controls ----
zoomInBtn.addEventListener('click', () => {
    if (appMode === 'map') { bgMap.zoomIn(1); return; }
    if (appMode === 'layer' && renderer.layerView) {
        if (renderer.layerView.geoMode) { lvMap.zoomIn(1); return; }
        renderer.layerView.viewScale *= 1.2;
        renderer.render();
        return;
    }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const factor = 1.2;
    renderer.offsetX = cx - (cx - renderer.offsetX) * factor;
    renderer.offsetY = cy - (cy - renderer.offsetY) * factor;
    renderer.scale *= factor;
    renderer.render();
});

zoomOutBtn.addEventListener('click', () => {
    if (appMode === 'map') { bgMap.zoomOut(1); return; }
    if (appMode === 'layer' && renderer.layerView) {
        if (renderer.layerView.geoMode) { lvMap.zoomOut(1); return; }
        renderer.layerView.viewScale /= 1.2;
        renderer.render();
        return;
    }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const factor = 1 / 1.2;
    renderer.offsetX = cx - (cx - renderer.offsetX) * factor;
    renderer.offsetY = cy - (cy - renderer.offsetY) * factor;
    renderer.scale *= factor;
    renderer.render();
});

zoomResetBtn.addEventListener('click', () => {
    if (appMode === 'map') {
        fitMapToLayers();
        return;
    }

    if (appMode === 'layer' && renderer.layerView) {
        if (renderer.layerView.geoMode) {
            // Fit lvMap to layer coordinates
            const coords = model.layers
                .filter(l => l.latitude != null && l.longitude != null)
                .map(l => [l.latitude, l.longitude]);
            if (coords.length === 1) lvMap.setView(coords[0], 10);
            else if (coords.length > 1) lvMap.fitBounds(coords, { padding: [60, 60] });
            return;
        }
        renderer.layerView.resetLayout();
        // Re-fit the viewport to the new layout
        const lr = renderer.layerView.layoutRadius();
        const margin = 60;
        const fitScale = Math.min(canvas.width, canvas.height) / (2 * (lr + margin));
        renderer.layerView.viewScale   = fitScale;
        renderer.layerView.viewOffsetX = 0;
        renderer.layerView.viewOffsetY = 0;
        _ensureLayerViewLoop();
        return;
    }

    // Reset rotation angles to defaults
    renderer.skewX = 0.7;
    renderer.skewY = 0.55;
    renderer.resetLayerOffsets();
    renderer.centerView();
    renderer.render();
});

// ---- Node Info Panel ----
function showNodeInfo(hit) {
    if (!model) return;

    const { layerName, nodeName } = hit;

    // Physical node attributes
    const physicalNode = model.nodesByName.get(nodeName);
    // State node attributes
    const stateNode = model.stateNodeMap.get(`${layerName}::${nodeName}`);
    // Connected links
    const connectedLinks = model.extended.filter(
        l => (l.layer_from === layerName && l.node_from === nodeName) ||
            (l.layer_to === layerName && l.node_to === nodeName)
    );

    infoTitle.textContent = nodeName;

    let html = '';

    // Physical node attributes
    if (physicalNode) {
        html += '<div class="info-section"><h4>Node Attributes</h4>';
        for (const [key, value] of Object.entries(physicalNode)) {
            if (key === 'node_id') continue;
            html += `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${value ?? 'N/A'}</span></div>`;
        }
        html += '</div>';
    }

    // State node attributes
    if (stateNode) {
        html += '<div class="info-section"><h4>State Node (in ' + layerName + ')</h4>';
        for (const [key, value] of Object.entries(stateNode)) {
            if (['layer_id', 'node_id', 'layer_name', 'node_name'].includes(key)) continue;
            html += `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${value ?? 'N/A'}</span></div>`;
        }
        html += '</div>';
    }

    // Layer info
    const layerObj = model.layersByName.get(layerName);
    if (layerObj) {
        html += '<div class="info-section"><h4>Layer</h4>';
        for (const [key, value] of Object.entries(layerObj)) {
            if (key === 'layer_id') continue;
            html += `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${value ?? 'N/A'}</span></div>`;
        }
        html += '</div>';
    }

    // Connections
    if (connectedLinks.length > 0) {
        html += '<div class="info-section"><h4>Connections (' + connectedLinks.length + ')</h4><ul class="info-connections">';
        for (const link of connectedLinks) {
            const isFrom = link.node_from === nodeName && link.layer_from === layerName;
            const otherNode = isFrom ? link.node_to : link.node_from;
            const otherLayer = isFrom ? link.layer_to : link.layer_from;
            const isInter = link.layer_from !== link.layer_to;
            const label = isInter
                ? `${otherNode} (${otherLayer})`
                : otherNode;
            const extraAttrs = Object.entries(link)
                .filter(([k]) => !['layer_from', 'node_from', 'layer_to', 'node_to', 'weight'].includes(k))
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            const suffix = extraAttrs ? ` [${extraAttrs}]` : '';
            html += `<li>${label}${link.weight !== 1 ? ` (w=${link.weight})` : ''}${suffix}</li>`;
        }
        html += '</ul></div>';
    }

    infoContent.innerHTML = html;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
    collapseInfoBtn.textContent = '›';
}

function showLinkInfo(link) {
    if (!model) return;

    infoTitle.textContent = link.isInterlayer ? 'Interlayer Link' : 'Intralayer Link';

    let html = '<div class="info-section"><h4>Link Attributes</h4>';

    // Core attributes
    html += `<div class="info-row"><span class="info-key">From</span><span class="info-value">${link.node_from} (${link.layer_from})</span></div>`;
    html += `<div class="info-row"><span class="info-key">To</span><span class="info-value">${link.node_to} (${link.layer_to})</span></div>`;
    html += `<div class="info-row"><span class="info-key">Weight</span><span class="info-value">${link.weight ?? 1}</span></div>`;

    // Extra attributes
    const extraAttrs = Object.entries(link)
        .filter(([k]) => !['layer_from', 'node_from', 'layer_to', 'node_to', 'weight', 'isInterlayer'].includes(k));

    if (extraAttrs.length > 0) {
        html += '<h4 style="margin-top: 12px;">Additional Properties</h4>';
        for (const [key, value] of extraAttrs) {
            html += `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${value ?? 'N/A'}</span></div>`;
        }
    }

    html += '</div>';

    infoContent.innerHTML = html;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
    collapseInfoBtn.textContent = '›';
}

function hideNodeInfo() {
    infoPanel.classList.remove('visible');
    infoPanel.classList.remove('collapsed');
    collapseInfoBtn.textContent = '›';
}

function showLayerInfo(layerIndex) {
    if (!model || layerIndex < 0 || layerIndex >= model.layers.length) return;

    const layer = model.layers[layerIndex];
    infoTitle.textContent = layer.layer_name;

    let html = '<div class="info-section"><h4>Layer Attributes</h4>';
    for (const [key, value] of Object.entries(layer)) {
        if (key === 'layer_id') continue;
        html += `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${value ?? 'N/A'}</span></div>`;
    }
    html += '</div>';

    infoContent.innerHTML = html;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
    collapseInfoBtn.textContent = '›';
}

closeInfoBtn.addEventListener('click', () => {
    renderer.selectedNode = null;
    renderer.selectedLayer = null;
    hideNodeInfo();
    renderer.render();
});

collapseInfoBtn.addEventListener('click', () => {
    const isCollapsed = infoPanel.classList.toggle('collapsed');
    collapseInfoBtn.textContent = isCollapsed ? '‹' : '›';
});

// ---- Tooltip ----
function showTooltip(hit) {
    if (!hit) return;
    tooltip.textContent = `${hit.nodeName} (${hit.layerName})`;
    tooltip.classList.add('visible');

    // Position near mouse
    document.addEventListener('mousemove', positionTooltip);
}

function positionTooltip(e) {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 8) + 'px';
}

function hideTooltip() {
    tooltip.classList.remove('visible');
    document.removeEventListener('mousemove', positionTooltip);
}

// ---- Autoload from R pipeline ----
// When called from plot_multilayer(), the URL will have ?autoload=true
// and the JSON is served at /api/network.json
(function autoloadFromR() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoload') === 'true') {
        fetch('/api/network.json')
            .then(resp => {
                if (!resp.ok) throw new Error('Failed to fetch network data from R server');
                return resp.json();
            })
            .then(json => {
                loadData(json);
            })
            .catch(err => {
                console.error('Autoload failed:', err);
            });
    }
})();

function renderScaleLegend(scale, id, titleText) {
    if (!scale) return;
    if (expandedLegends.has(id)) {
        const dom = createLegendDOM(titleText, scale, id);
        legendPanel.appendChild(dom);
    } else {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'pointer-events: auto; font-size: 11px; padding: 6px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; color: #4b5563; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: grab; transition: all 0.15s ease;';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg> Expand ${titleText} Legend`;
        btn.onclick = () => {
            if (hasDraggedLegend) return;
            expandedLegends.add(id);
            renderLegends();
        };
        btn.onmousedown = () => btn.style.cursor = 'grabbing';
        btn.onmouseup = () => btn.style.cursor = 'grab';
        btn.onmouseover = () => btn.style.background = '#ffffff';
        btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.95)';
        legendPanel.appendChild(btn);
    }
}

function renderLegends() {
    // Check if dragging has locked the legend to a left/top spot
    const hasFixedPosition = Boolean(legendPanel.style.left);

    legendPanel.innerHTML = '';

    const isBipartite = layout.layoutType === 'bipartite';

    if (!isBipartite) {
        renderScaleLegend(activeNodeColorScale, 'nodeColor', 'Node Color');
    } else {
        const titleA = bipartiteColorLabelA.textContent.replace('Color by ', '').replace('Color By ', '');
        renderScaleLegend(activeNodeColorScaleA, 'nodeColorA', 'Node Color (' + titleA + ')');

        const titleB = bipartiteColorLabelB.textContent.replace('Color by ', '').replace('Color By ', '');
        renderScaleLegend(activeNodeColorScaleB, 'nodeColorB', 'Node Color (' + titleB + ')');
    }

    renderScaleLegend(activeNodeSizeScale, 'nodeSize', 'Node Size');
    renderScaleLegend(activeLinkColorScale, 'linkColor', 'Link Color');
    renderScaleLegend(activeLayerColorScale, 'layerColor', 'Layer Color');
}

function createLegendDOM(titleText, scale, id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'legend-box';
    wrapper.style.cssText = 'background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); font-family: Inter, system-ui, sans-serif; min-width: 140px; pointer-events: auto; cursor: grab;';

    wrapper.onmousedown = () => { wrapper.style.cursor = 'grabbing'; };
    wrapper.onmouseup = () => { wrapper.style.cursor = 'grab'; };

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 12px; min-height: 16px;';

    const title = document.createElement('div');
    title.textContent = titleText + ': ' + scale.attrName;
    title.style.cssText = 'font-size: 11px; font-weight: 600; color: #1a1a2e; text-transform: uppercase; letter-spacing: 0.5px; flex-grow: 1;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 4px; align-items: center; margin-top: -2px; margin-right: -4px;';

    if (scale.canToggle && scale.type !== 'size') {
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '⇌';
        toggleBtn.title = 'Switch between Categorical and Continuous palettes';
        toggleBtn.style.cssText = 'background: none; border: 1px solid rgba(0,0,0,0.12); cursor: pointer; color: #4b5563; border-radius: 4px; font-size: 10px; line-height: 1; padding: 2px 4px; font-weight: bold; display: flex; align-items: center; justify-content: center; height: 18px;';
        toggleBtn.onmouseover = () => toggleBtn.style.background = '#f3f4f6';
        toggleBtn.onmouseout = () => toggleBtn.style.background = 'none';
        toggleBtn.onclick = () => {
            const newType = scale.type === 'continuous' ? 'categorical' : 'continuous';
            colorScaleOverrides.set(scale.attrName, newType);
            updateNodeColors();
            updateLinkColors();
            updateLayerColors();
            renderer.render();
        };
        controls.appendChild(toggleBtn);
    }

    const minBtn = document.createElement('button');
    minBtn.innerHTML = '✕';
    minBtn.title = 'Minimize Legend';
    minBtn.style.cssText = 'background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 12px; line-height: 1; padding: 2px; height: 18px; display: flex; align-items: center; justify-content: center;';
    minBtn.onmouseover = () => minBtn.style.color = '#4b5563';
    minBtn.onmouseout = () => minBtn.style.color = '#9ca3af';
    minBtn.onclick = () => {
        expandedLegends.delete(id);
        renderLegends();
    };
    controls.appendChild(minBtn);

    header.appendChild(title);
    header.appendChild(controls);
    wrapper.appendChild(header);

    if (scale.type === 'categorical') {
        const list = document.createElement('div');
        list.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
        for (const [val, col] of scale.map.entries()) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4b5563;';
            const swatch = document.createElement('div');
            swatch.style.cssText = `width: 12px; height: 12px; border-radius: 50%; background: ${col}; flex-shrink: 0;`;
            const text = document.createElement('span');
            text.textContent = val;
            text.style.cssText = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;';
            row.appendChild(swatch);
            row.appendChild(text);
            list.appendChild(row);
        }
        wrapper.appendChild(list);
    } else if (scale.type === 'continuous' || scale.type === 'size') {
        const gradWrap = document.createElement('div');
        gradWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const track = document.createElement('div');
        if (scale.type === 'continuous') {
            track.style.cssText = 'height: 12px; border-radius: 6px; background: linear-gradient(to right, rgb(68,1,84), rgb(49,104,142), rgb(53,183,121), rgb(253,231,37));';
        } else {
            track.style.cssText = 'height: 24px; position: relative; border-bottom: 1px solid #e5e7eb; display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 4px;';
            const dot1 = document.createElement('div');
            dot1.style.cssText = 'width: 4px; height: 4px; background: #6b7280; border-radius: 50%;';
            const dot2 = document.createElement('div');
            dot2.style.cssText = 'width: 12px; height: 12px; background: #6b7280; border-radius: 50%; margin-bottom: -4px; margin-left: 10px;';
            const dot3 = document.createElement('div');
            dot3.style.cssText = 'width: 20px; height: 20px; background: #6b7280; border-radius: 50%; margin-bottom: -8px; margin-left: 10px;';
            track.appendChild(dot1);
            track.appendChild(dot2);
            track.appendChild(dot3);
        }

        const labels = document.createElement('div');
        labels.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-top: 2px;';

        const fmt = (v) => Number.isInteger(v) ? v : v.toFixed(2);
        const minSpan = document.createElement('span'); minSpan.textContent = fmt(scale.min);
        const maxSpan = document.createElement('span'); maxSpan.textContent = fmt(scale.max);
        labels.appendChild(minSpan);
        labels.appendChild(maxSpan);

        gradWrap.appendChild(track);
        gradWrap.appendChild(labels);
        wrapper.appendChild(gradWrap);
    }

    return wrapper;
}

// ── Layer View Legend ──────────────────────────────────────────────────────

function renderLayerViewLegend() {
    if (appMode !== 'layer' || !renderer.layerView) return;
    legendPanel.innerHTML = '';
    for (const scale of renderer.layerView.getLegendScales()) {
        legendPanel.appendChild(
            lvExpandedLegends.has(scale.id)
                ? _createLVLegendBox(scale)
                : _createLVLegendBtn(scale)
        );
    }
}

function _createLVLegendBox(scale) {
    const BOX_CSS = 'background:rgba(255,255,255,0.95);border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:10px 14px;box-shadow:0 4px 6px rgba(0,0,0,0.05);font-family:Inter,system-ui,sans-serif;min-width:140px;pointer-events:auto;cursor:grab;';
    const wrapper = document.createElement('div');
    wrapper.className = 'legend-box';
    wrapper.style.cssText = BOX_CSS;
    wrapper.onmousedown = () => { wrapper.style.cursor = 'grabbing'; };
    wrapper.onmouseup   = () => { wrapper.style.cursor = 'grab'; };

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:12px;';
    const titleEl = document.createElement('div');
    titleEl.textContent = `${scale.title}: ${scale.attrName}`;
    titleEl.style.cssText = 'font-size:11px;font-weight:600;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;flex-grow:1;';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:-2px;margin-right:-4px;';

    if (scale.canToggle) {
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '⇌';
        toggleBtn.title = 'Switch between Continuous and Categorical display';
        toggleBtn.style.cssText = 'background:none;border:1px solid rgba(0,0,0,0.12);cursor:pointer;color:#4b5563;border-radius:4px;font-size:10px;padding:2px 4px;font-weight:bold;height:18px;';
        toggleBtn.onclick = () => {
            const lv = renderer.layerView;
            if (!lv) return;
            const cur = lv.settings.colorLegendType;
            lv.updateSetting('colorLegendType', cur === 'categorical' ? 'continuous' : 'categorical');
            renderLayerViewLegend();
        };
        controls.appendChild(toggleBtn);
    }

    const minBtn = document.createElement('button');
    minBtn.innerHTML = '✕';
    minBtn.title = 'Minimize';
    minBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#9ca3af;font-size:12px;padding:2px;height:18px;';
    minBtn.onclick = () => { lvExpandedLegends.delete(scale.id); renderLayerViewLegend(); };
    controls.appendChild(minBtn);

    header.appendChild(titleEl);
    header.appendChild(controls);
    wrapper.appendChild(header);

    // Content
    if (scale.type === 'categorical') {
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;';
        for (const [val, col] of scale.map.entries()) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#4b5563;';
            const swatch = document.createElement('div');
            swatch.style.cssText = `width:12px;height:12px;border-radius:50%;background:${col};flex-shrink:0;`;
            const text = document.createElement('span');
            text.textContent = val;
            text.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;';
            row.appendChild(swatch); row.appendChild(text); list.appendChild(row);
        }
        wrapper.appendChild(list);
    } else if (scale.type === 'continuous') {
        const gradWrap = document.createElement('div');
        gradWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        const track = document.createElement('div');
        track.style.cssText = `height:12px;border-radius:6px;background:${scale.gradient};`;
        const labels = document.createElement('div');
        labels.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:2px;';
        const minS = document.createElement('span'); minS.textContent = scale.minLabel;
        const maxS = document.createElement('span'); maxS.textContent = scale.maxLabel;
        labels.appendChild(minS); labels.appendChild(maxS);
        gradWrap.appendChild(track); gradWrap.appendChild(labels);
        wrapper.appendChild(gradWrap);
    } else if (scale.type === 'size') {
        const DISP_MAX = 22;
        const minR = scale.minR || DISP_MAX * 0.25;
        const maxR = scale.maxR || DISP_MAX;
        const midR = Math.sqrt(minR * maxR);
        const items = [
            { r: DISP_MAX * minR / maxR, label: scale.minLabel },
            { r: DISP_MAX * midR / maxR, label: scale.midLabel || '' },
            { r: DISP_MAX,               label: scale.maxLabel },
        ];
        const dotsRow = document.createElement('div');
        dotsRow.style.cssText = `display:flex;align-items:flex-end;gap:10px;height:${DISP_MAX * 2 + 4}px;`;
        const labelsRow = document.createElement('div');
        labelsRow.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:5px;';
        items.forEach(({ r, label }) => {
            const d = Math.max(3, Math.round(r * 2));
            const dot = document.createElement('div');
            dot.style.cssText = `width:${d}px;height:${d}px;background:#6b7280;border-radius:50%;flex-shrink:0;`;
            dotsRow.appendChild(dot);
            const lbl = document.createElement('span'); lbl.textContent = label;
            labelsRow.appendChild(lbl);
        });
        wrapper.appendChild(dotsRow); wrapper.appendChild(labelsRow);
    }
    return wrapper;
}

function _createLVLegendBtn(scale) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'pointer-events:auto;font-size:11px;padding:6px 10px;box-shadow:0 4px 6px rgba(0,0,0,0.05);background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.1);border-radius:8px;color:#4b5563;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg> Expand ${scale.title} Legend`;
    btn.onclick = () => { lvExpandedLegends.add(scale.id); renderLayerViewLegend(); };
    return btn;
}

// ---- Help Popup ----
const helpBtn            = document.getElementById('helpBtn');
const helpPopup          = document.getElementById('helpPopup');
const helpPopupClose     = document.getElementById('helpPopupClose');
const helpPopupTitle     = document.getElementById('helpPopupTitle');
const helpPopupBody      = document.getElementById('helpPopupBody');
const helpPopupFullManual = document.getElementById('helpPopupFullManual');

const HELP_CONTENT = {
    network: {
        title: '🕸️ Network Mode',
        body: `<p>All layers are rendered simultaneously in a 3D coordinate space.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Rotate</b> — drag the background</li>
  <li><b>Pan</b> — <kbd>Shift</kbd> + drag</li>
  <li><b>Move a layer</b> — <kbd>Cmd/Ctrl</kbd> + drag its outline</li>
  <li><b>Hover</b> a node to highlight connections</li>
  <li><b>Click</b> a node to lock its selection</li>
</ul>
<p>Use the left panel to control layers, nodes, and links.</p>`,
    },
    map: {
        title: '🗺️ Map Mode',
        body: `<p>Layers are placed on a geographic map using their <code>latitude</code>/<code>longitude</code>.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Click a marker</b> to pop that layer into 3D space</li>
  <li><b>Click ✕</b> on a popped layer to return it to the map</li>
  <li><b>Pan the map</b> — <kbd>Shift</kbd> + drag (carries 3D layers with it)</li>
  <li>Use the <b>Map</b> sidebar section to control opacity</li>
</ul>`,
    },
    layer: {
        title: '🔵 Layer Mode',
        body: `<p>Each layer is a bubble in a force-directed meta-graph with a micro-graph preview inside.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Click</b> a bubble — layer statistics panel</li>
  <li><b>Cmd/Ctrl + click</b> a second bubble — side-by-side comparison</li>
  <li><b>Drag</b> a bubble to pin it; <b>Reset</b> to unpin all</li>
  <li><b>Scroll</b> to zoom; drag background to pan</li>
</ul>
<p><b>Blue lines</b> = interlayer links &nbsp;·&nbsp; <b>Gray lines</b> = shared nodes</p>`,
    },
    dashboard: {
        title: '📊 Dashboard Mode',
        body: `<p>Analytics panels for your multilayer network. Click any section header to collapse it.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>KPI Cards</b> — totals at a glance</li>
  <li><b>Per-Layer Charts</b> — nodes, links, density per layer. Click a layer name to highlight it.</li>
  <li><b>Presence Matrix</b> — node × layer heatmap with orientation and sort toggles</li>
  <li><b>Layer Similarity</b> — Jaccard heatmaps for node and edge identity</li>
  <li><b>Degree Distributions</b> — histograms for full network and per layer</li>
  <li><b>Node Participation</b> — how many layers each node appears in</li>
</ul>
<p>Use the left panel to change sort order and highlight metric.</p>`,
    },
};

helpBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (helpPopup.style.display !== 'none') { helpPopup.style.display = 'none'; return; }
    const c = HELP_CONTENT[appMode] ?? HELP_CONTENT.network;
    helpPopupTitle.textContent = c.title;
    helpPopupBody.innerHTML = c.body;
    helpPopup.style.display = 'block';
});
helpPopupClose.addEventListener('click', () => { helpPopup.style.display = 'none'; });
helpPopupFullManual.addEventListener('click', () => { window.open('docs/manual.html', '_blank'); });
document.addEventListener('click', e => {
    if (helpPopup.style.display !== 'none' && !helpPopup.contains(e.target) && e.target !== helpBtn) {
        helpPopup.style.display = 'none';
    }
});

// ---- Screenshot Export ----
const toggleLegendBtn = document.getElementById('toggleLegendBtn');
let legendVisible = true;
toggleLegendBtn.addEventListener('click', () => {
    legendVisible = !legendVisible;
    legendPanel.style.display = legendVisible ? 'flex' : 'none';
    toggleLegendBtn.classList.toggle('active', !legendVisible);
});

const captureBtn = document.getElementById('captureBtn');
const exportDialog = document.getElementById('exportDialog');
const exportCancelBtn = document.getElementById('exportCancelBtn');

captureBtn.addEventListener('click', () => {
    const hasMap = appMode === 'map' || (appMode === 'layer' && renderer.layerView?.geoMode);
    const gridLabel = exportDialog.querySelector('#exportGridCheckbox + span');
    if (gridLabel) gridLabel.textContent = hasMap ? 'Background map' : 'Background grid';
    exportDialog.style.display = 'flex';
});

exportCancelBtn.addEventListener('click', () => {
    exportDialog.style.display = 'none';
});

// Close on overlay click
exportDialog.addEventListener('click', (e) => {
    if (e.target === exportDialog) exportDialog.style.display = 'none';
});

// Format buttons
exportDialog.querySelectorAll('[data-format]').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const format = btn.dataset.format;
        exportDialog.style.display = 'none';
        await exportScreenshot(format);
    });
});

// ── Dynamic script loader ──────────────────────────────────────────────────
async function _loadScript(src) {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
        // Already loaded successfully — nothing to do
        if (existing.dataset.loaded) return;
        // Still in flight — wait for it
        return new Promise((resolve, reject) => {
            existing.addEventListener('load',  resolve, { once: true });
            existing.addEventListener('error', reject,  { once: true });
        });
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload  = () => { s.dataset.loaded = '1'; resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// ── Composite visible overlay panels onto offscreen canvas ────────────────
// Captures legend + drill/compare panels (if open) and draws them at their
// screen positions, scaled to match the export resolution.
async function _compositeOverlays(ctx, scale) {
    await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

    const panels = [];

    // Legend
    const lp = document.getElementById('legendPanel');
    if (lp && lp.children.length > 0) panels.push(lp);

    // Layer stats / compare panels (only meaningful in layer view)
    const drill = document.getElementById('layerDrillPanel');
    if (drill && drill.style.opacity === '1') panels.push(drill);

    const compare = document.getElementById('layerComparePanel');
    if (compare && compare.style.opacity === '1') panels.push(compare);

    for (const el of panels) {
        const rect = el.getBoundingClientRect();
        try {
            const panelCanvas = await html2canvas(el, {
                scale,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: false,
            });
            ctx.drawImage(panelCanvas, rect.left * scale, rect.top * scale,
                rect.width * scale, rect.height * scale);
        } catch (e) {
            console.warn('Panel capture failed for', el.id, e);
        }
    }
}

async function exportScreenshot(format) {
    if (format === 'pdf') { await _exportPDF(); return; }

    // Raster export (PNG / JPG)
    const srcCanvas = document.getElementById('networkCanvas');
    const scale = 2;

    const includeGrid   = document.getElementById('exportGridCheckbox').checked;
    const includePanels = document.getElementById('exportPanelsCheckbox').checked;
    const prevShowGrid  = renderer.showGrid;
    renderer.showGrid = includeGrid;
    renderer.render();

    const w = srcCanvas.width, h = srcCanvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width  = w * scale;
    offscreen.height = h * scale;
    const ctx = offscreen.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    // In map mode or layer view geo mode: composite the Leaflet map underneath the canvas
    const isLvGeo = appMode === 'layer' && renderer.layerView?.geoMode;
    if ((appMode === 'map' || isLvGeo) && includeGrid) {
        try {
            await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            const mapEl = document.getElementById(appMode === 'map' ? 'backgroundMap' : 'lvBackgroundMap');
            const mapCanvas = await html2canvas(mapEl, {
                scale, useCORS: true, allowTaint: true,
                backgroundColor: '#ffffff', logging: false,
                width: w, height: h, x: 0, y: 0,
            });
            ctx.drawImage(mapCanvas, 0, 0, offscreen.width, offscreen.height);
        } catch (e) { console.warn('Map capture failed:', e); }
    }

    // Network canvas (nodes, edges, layer planes)
    ctx.drawImage(srcCanvas, 0, 0, offscreen.width, offscreen.height);

    // In map mode: composite the map markers overlay on top of the network
    if (appMode === 'map') {
        try {
            const markersCanvas = await html2canvas(mapMarkersOverlay, {
                scale, useCORS: true, allowTaint: true,
                backgroundColor: null, logging: false,
                width: w, height: h, x: 0, y: 0,
            });
            ctx.drawImage(markersCanvas, 0, 0, offscreen.width, offscreen.height);
        } catch (e) { console.warn('Map markers capture failed:', e); }
    }

    // Restore grid
    renderer.showGrid = prevShowGrid;
    renderer.render();

    // Panels & legend
    if (includePanels) await _compositeOverlays(ctx, scale);

    // Branding
    _drawBranding(ctx, offscreen.width, offscreen.height, scale);

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality  = format === 'jpg' ? 0.92 : undefined;
    await _saveCanvas(offscreen, `multilayer_network.${format}`, mimeType, quality);
}

async function _saveCanvas(offscreen, filename, mimeType, quality) {
    if (window.showSaveFilePicker) {
        try {
            const ext = filename.split('.').pop();
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: `${ext.toUpperCase()} file`, accept: { [mimeType]: [`.${ext}`] } }],
            });
            const writable = await handle.createWritable();
            const blob = await new Promise(resolve => offscreen.toBlob(resolve, mimeType, quality));
            await writable.write(blob); await writable.close();
        } catch (err) { if (err.name !== 'AbortError') console.error('Save failed:', err); }
    } else {
        const dataUrl = offscreen.toDataURL(mimeType, quality);
        const link = document.createElement('a');
        link.download = filename; link.href = dataUrl; link.click();
    }
}


function _drawBranding(ctx, canvasW, canvasH, scale) {
    const padding = 12 * scale;
    const boxH = 28 * scale;
    const fontSize = 13 * scale;
    const text = 'Multilayer Viz';

    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    const textW = ctx.measureText(text).width;
    const boxW = textW + 24 * scale;

    const x = canvasW - boxW - padding;
    const y = canvasH - boxH - padding;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1 * scale;

    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, boxW, boxH, 8 * scale);
    } else {
        // Plain rectangle fallback (for jsPDF context2d which lacks roundRect and arcTo)
        ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 12 * scale, y + boxH / 2);
}

async function _exportPDF() {
    try {
        await _loadScript('https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js');
    } catch (err) {
        alert('Could not load PDF library. Please check your internet connection and try again.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;

        const srcCanvas = document.getElementById('networkCanvas');
        const scale = 4; // ~300 DPI
        const includeGrid   = document.getElementById('exportGridCheckbox').checked;
        const includePanels = document.getElementById('exportPanelsCheckbox').checked;
        const prevShowGrid  = renderer.showGrid;
        renderer.showGrid = includeGrid;
        renderer.render();

        const w = srcCanvas.width, h = srcCanvas.height;
        const offscreen = document.createElement('canvas');
        offscreen.width = w * scale; offscreen.height = h * scale;
        const ctx = offscreen.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);

        // Map background (if in map mode or layer view geo mode)
        const isLvGeoPdf = appMode === 'layer' && renderer.layerView?.geoMode;
        if ((appMode === 'map' || isLvGeoPdf) && includeGrid) {
            try {
                await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                const mapEl = document.getElementById(appMode === 'map' ? 'backgroundMap' : 'lvBackgroundMap');
                const mapCanvas = await html2canvas(mapEl, {
                    scale, useCORS: true, allowTaint: true,
                    backgroundColor: '#ffffff', logging: false,
                    width: w, height: h, x: 0, y: 0,
                });
                ctx.drawImage(mapCanvas, 0, 0, offscreen.width, offscreen.height);
            } catch (e) { console.warn('Map capture failed (PDF):', e); }
        }

        ctx.drawImage(srcCanvas, 0, 0, offscreen.width, offscreen.height);

        // In map mode: composite the map markers overlay on top of the network
        if (appMode === 'map') {
            try {
                const markersCanvas = await html2canvas(mapMarkersOverlay, {
                    scale, useCORS: true, allowTaint: true,
                    backgroundColor: null, logging: false,
                    width: w, height: h, x: 0, y: 0,
                });
                ctx.drawImage(markersCanvas, 0, 0, offscreen.width, offscreen.height);
            } catch (e) { console.warn('Map markers capture failed (PDF):', e); }
        }

        renderer.showGrid = prevShowGrid;
        renderer.render();

        if (includePanels) await _compositeOverlays(ctx, scale);

        _drawBranding(ctx, offscreen.width, offscreen.height, scale);

        // Create PDF at the original CSS-pixel page size
        const isLandscape = w > h;
        const pdf = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'px',
            format: [w, h],
            hotfixes: ['px_scaling']
        });

        // Embed the high-res image — fills the page, but is 4x resolution
        const imgData = offscreen.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, w, h, undefined, 'FAST');

        // Save
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'multilayer_network.pdf',
                    types: [{
                        description: 'PDF Document',
                        accept: { 'application/pdf': ['.pdf'] },
                    }],
                });
                const writable = await handle.createWritable();
                const blob = pdf.output('blob');
                await writable.write(blob);
                await writable.close();
            } catch (err) {
                if (err.name !== 'AbortError') console.error('Save failed:', err);
            }
        } else {
            pdf.save('multilayer_network.pdf');
        }
    } catch (err) {
        alert('PDF export failed: ' + err.message);
        console.error(err);
    }
}

// ---- Node Search ----
const nodeSearchInput = document.getElementById('nodeSearchInput');
const nodeSearchResults = document.getElementById('nodeSearchResults');
const nodeSearchClearBtn = document.getElementById('nodeSearchClearBtn');

// committedSearchName declared at top of file with other state variables

function closeSearchDropdown() {
    nodeSearchResults.style.display = 'none';
    nodeSearchResults.innerHTML = '';
}

function clearNodeSearch() {
    committedSearchName = null;
    nodeSearchInput.value = '';
    closeSearchDropdown();
    if (renderer) {
        renderer.searchedNodeName = null;
        if (_nodeSelectedBySearch) {
            renderer.selectedNode = null;
            hideNodeInfo();
        }
        renderer.render();
    }
    _nodeSelectedBySearch = false;
}

function selectSearchNode(name) {
    committedSearchName = name;
    nodeSearchInput.value = name;
    closeSearchDropdown();
    if (!renderer || !model) return;
    // Find first layer this node appears in for the info panel
    let firstLayer = null;
    for (const [layerName, nodeSet] of model.nodesPerLayer) {
        if (nodeSet.has(name)) { firstLayer = layerName; break; }
    }
    renderer.searchedNodeName = null;
    renderer.selectedNode = firstLayer ? { layerName: firstLayer, nodeName: name } : null;
    _nodeSelectedBySearch = true;
    if (firstLayer) showNodeInfo({ layerName: firstLayer, nodeName: name });
    renderer.render();
}

nodeSearchInput.addEventListener('input', () => {
    const query = nodeSearchInput.value.trim().toLowerCase();
    if (!model || !query) {
        closeSearchDropdown();
        if (!query && renderer) { renderer.searchedNodeName = committedSearchName; renderer.render(); }
        return;
    }
    const matches = model.nodes
        .filter(n => n.node_name.toLowerCase().includes(query))
        .slice(0, 12);
    if (matches.length === 0) {
        nodeSearchResults.innerHTML = '<div style="font-size:11px;color:#999;padding:6px 10px;">No results</div>';
        nodeSearchResults.style.display = 'block';
        return;
    }
    nodeSearchResults.innerHTML = matches.map(n =>
        `<div data-name="${n.node_name}"
          style="font-size:11px;padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        >${n.node_name}</div>`
    ).join('');
    nodeSearchResults.style.display = 'block';
    nodeSearchResults.querySelectorAll('[data-name]').forEach(el => {
        el.addEventListener('mouseover', () => {
            el.style.background = 'rgba(0,0,0,0.06)';
            if (renderer) { renderer.searchedNodeName = el.dataset.name; renderer.render(); }
        });
        el.addEventListener('mouseout', () => {
            el.style.background = '';
            if (renderer) { renderer.searchedNodeName = committedSearchName; renderer.render(); }
        });
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectSearchNode(el.dataset.name);
        });
    });
});

nodeSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearNodeSearch();
    if (e.key === 'Enter') {
        const first = nodeSearchResults.querySelector('[data-name]');
        if (first) selectSearchNode(first.dataset.name);
    }
});

nodeSearchInput.addEventListener('blur', () => {
    setTimeout(closeSearchDropdown, 150);
});

nodeSearchClearBtn.addEventListener('click', clearNodeSearch);

