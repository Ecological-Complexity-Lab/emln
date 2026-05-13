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
import { Dashboard, svgBar } from './dashboard.js';
import { MetaNetwork } from './metaNetwork.js';
import { DataMode, dataMode, layerColors, initLayerColors } from './dataMode.js';
import { saveSession, loadSession, loadSessionFromUrl } from './sessionManager.js';
import { startTour } from './tourManager.js';
import { initDemoDatasets } from './demoDatasets.js';
import { initExportManager } from './exportManager.js';
import { GridView } from './gridView.js';

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
let activeNodeSizeScaleA = null;
let activeNodeSizeScaleB = null;
let activeIntraLinkColorScale = null;
let activeInterLinkColorScale = null;
let activeLayerColorScale = null;
let _interPairFilter = new Set(); // empty = show all; Set<"from::to"> = selected pairs
const colorScaleOverrides = new Map(); // attrName -> 'categorical' | 'continuous'
const categoryColorOverrides = new Map(); // attrName -> Map<value, hex color>

function applyCategoryOverride(attrName, value, fallback) {
    const m = categoryColorOverrides.get(attrName);
    if (m && m.has(value)) return m.get(value);
    return fallback;
}

function isClassicBipartiteUI() {
    if (!model || layout?.layoutType !== 'bipartite') return false;
    const types = new Set();
    for (const n of model.nodes) {
        const t = n.node_type ?? n.type;
        if (t !== undefined && t !== null) types.add(t);
    }
    return types.size === 2;
}

function applyBipartiteUIVisibility() {
    const classic = isClassicBipartiteUI();
    const isBip   = layout?.layoutType === 'bipartite';
    document.getElementById('setNamesContainer').style.display = isBip ? '' : 'none';
    colorByContainer.style.display          = classic ? 'none' : '';
    bipartiteColorByContainer.style.display = classic ? '' : 'none';
    sizeByContainer.style.display           = classic ? 'none' : '';
    bipartiteSizeByContainer.style.display  = classic ? '' : 'none';
}

// ---- EMLN mode detection ----
const IS_EMLN = new URLSearchParams(window.location.search).get('autoload') === 'true';

// CSS-pixel canvas dimensions — updated in resizeCanvas(). Use these everywhere
// instead of canvas.width/canvas.height (which are physical pixels after DPR scaling).
let cssW = window.innerWidth;
let cssH = window.innerHeight;

// ---- DOM Elements ----
const canvas = document.getElementById('networkCanvas');
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
const layerColorSelect = document.getElementById('layerColorSelect');
const layerColorSwatches = document.getElementById('layerColorSwatches');
const nodeColorSwatches  = document.getElementById('nodeColorSwatches');
const arrowheadSizeControl      = document.getElementById('arrowheadSizeControl');
const arrowheadSizeSlider       = document.getElementById('arrowheadSizeSlider');
const interArrowheadSizeControl = document.getElementById('interArrowheadSizeControl');
const interArrowheadSizeSlider  = document.getElementById('interArrowheadSizeSlider');

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
const layerNameSizeSlider    = document.getElementById('layerNameSizeSlider');
const layerNameSizeLabel     = document.getElementById('layerNameSizeLabel');
const networkModeBtn  = document.getElementById('networkModeBtn');
const mapModeBtn      = document.getElementById('mapModeBtn');
const layerViewBtn    = document.getElementById('layerViewBtn');
const gridViewBtn     = document.getElementById('gridViewBtn');
const gridColumnsRow  = document.getElementById('gridColumnsRow');
const gridColumnsSlider = document.getElementById('gridColumnsSlider');
const gridColumnsLabel  = document.getElementById('gridColumnsLabel');
const transformNodesRow = document.getElementById('transformNodesRow');
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
const LV_SECTIONS   = ['sectionLayerViewCircles','sectionLayerViewEdges'];
const DB_SECTIONS   = [];
const META_SECTIONS = ['sectionMetaNetwork', 'sectionMnSearch'];
const metaNetworkBtn = document.getElementById('metaNetworkBtn');
const mnAggregationSelect  = document.getElementById('mnAggregationSelect');
const mnLayoutSelect       = document.getElementById('mnLayoutSelect');
const mnColorBySelect      = document.getElementById('mnColorBySelect');
const mnSizeBySelect       = document.getElementById('mnSizeBySelect');
const mnBaseSizeSlider     = document.getElementById('mnBaseSizeSlider');
const mnBaseSizeLabel      = document.getElementById('mnBaseSizeLabel');
const mnMinWeightSlider    = document.getElementById('mnMinWeightSlider');
const mnMinWeightLabel     = document.getElementById('mnMinWeightLabel');
const mnNestedSortCheckbox = document.getElementById('mnNestedSortCheckbox');
const mnShowLabelsCheckbox = document.getElementById('mnShowLabelsCheckbox');
const mnLabelSizeSlider    = document.getElementById('mnLabelSizeSlider');
const mnLabelSizeLabel     = document.getElementById('mnLabelSizeLabel');
const mnLabelSizeRow       = document.getElementById('mnLabelSizeRow');
const mnUniformColorRow    = document.getElementById('mnUniformColorRow');
const mnUniformColorPicker = document.getElementById('mnUniformColorPicker');
const mnBpColorRow         = document.getElementById('mnBpColorRow');
const mnColorSetA          = document.getElementById('mnColorSetA');
const mnColorSetALabel     = document.getElementById('mnColorSetALabel');
const mnColorSetB          = document.getElementById('mnColorSetB');
const mnColorSetBLabel     = document.getElementById('mnColorSetBLabel');
const mnResetLayoutBtn     = document.getElementById('mnResetLayoutBtn');
const mnSearchInput        = document.getElementById('mnSearchInput');
const mnSearchResults      = document.getElementById('mnSearchResults');
const mnSearchClearBtn     = document.getElementById('mnSearchClearBtn');
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
const sectionInterLinks      = document.getElementById('sectionInterLinks');
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
let appMode = 'network'; // 'network', 'map', 'layer', 'dashboard', 'metanetwork', 'data', or 'grid'
let gridView = null;
let layerViewHandlers = null;
let lvRAF  = null; // requestAnimationFrame id for layer-view animation
let metaNetwork = null;       // MetaNetwork instance
let mnRAF       = null;       // requestAnimationFrame id for meta-network animation
let _mnMouseHandlers = null;  // { onMouseDown, onMouseMove, onMouseUp, onWheel }
let dataModeInstance = null;   // DataMode instance
const dataModePanel = document.getElementById('dataModePanel');
const dataModeBtn   = document.getElementById('dataModeBtn');
const dataFilterBanner = document.getElementById('dataFilterBanner');
const dataFilterText   = document.getElementById('dataFilterText');
const dataFilterClear  = document.getElementById('dataFilterClear');
const selectedNodeBanner = document.getElementById('selectedNodeBanner');
const selectedNodeText   = document.getElementById('selectedNodeText');
const selectedNodeClear  = document.getElementById('selectedNodeClear');
// Cross-mode persistent node selection — survives transitions between
// network/map/metanetwork. Holds just the node name (not the layer).
let crossModeSelectedNode = null;
let activeMapLayers = new Set();
const mapMarkersOverlay = document.getElementById('mapMarkersOverlay');
const layerCloseButtonsContainer = document.getElementById('layerCloseButtons');
const mapLayerPanel       = document.getElementById('mapLayerPanel');
const mapLayerPanelHeader = document.getElementById('mapLayerPanelHeader');
const mapLayerPanelBody   = document.getElementById('mapLayerPanelBody');
const mapLayerPanelToggle = document.getElementById('mapLayerPanelToggle');
const mapLayerList        = document.getElementById('mapLayerList');
const mnLayerPanel        = document.getElementById('mnLayerPanel');
const mnLayerPanelHeader  = document.getElementById('mnLayerPanelHeader');
const mnLayerPanelBody    = document.getElementById('mnLayerPanelBody');
const mnLayerPanelToggle  = document.getElementById('mnLayerPanelToggle');
const mnLayerList         = document.getElementById('mnLayerList');

// ── Sidebar accordion: opening one section collapses other visible ones ──────
{
    const sections = document.querySelectorAll('.control-section');
    sections.forEach(details => {
        details.addEventListener('toggle', () => {
            if (!details.open) return;
            sections.forEach(other => {
                if (other !== details && other.open && other.style.display !== 'none') {
                    other.open = false;
                }
            });
        });
    });
}

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

// ── Meta-network layer panel drag + collapse ──────────────────────────────
let _mnpDragging = false, _mnpHasDragged = false;
let _mnpStartX, _mnpStartY, _mnpStartLeft, _mnpStartTop;
let _mnpCollapsed = false;

mnLayerPanel.addEventListener('mousedown', (e) => {
    if (e.target.closest('.legend-no-drag')) return;
    const rect = mnLayerPanel.getBoundingClientRect();
    mnLayerPanel.style.right = 'auto';
    mnLayerPanel.style.left  = rect.left + 'px';
    mnLayerPanel.style.top   = rect.top  + 'px';
    _mnpDragging = true; _mnpHasDragged = false;
    _mnpStartX = e.clientX; _mnpStartY = e.clientY;
    _mnpStartLeft = parseFloat(mnLayerPanel.style.left);
    _mnpStartTop  = parseFloat(mnLayerPanel.style.top);
    mnLayerPanel.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!_mnpDragging) return;
    const dx = e.clientX - _mnpStartX, dy = e.clientY - _mnpStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mnpHasDragged = true;
    mnLayerPanel.style.left = (_mnpStartLeft + dx) + 'px';
    mnLayerPanel.style.top  = (_mnpStartTop  + dy) + 'px';
});

window.addEventListener('mouseup', () => {
    if (_mnpDragging) {
        _mnpDragging = false;
        mnLayerPanel.style.cursor = 'grab';
        document.body.style.cursor = '';
        setTimeout(() => { _mnpHasDragged = false; }, 0);
    }
});

mnLayerPanelToggle.addEventListener('click', () => {
    if (_mnpHasDragged) return;
    _mnpCollapsed = !_mnpCollapsed;
    mnLayerPanelBody.style.display = _mnpCollapsed ? 'none' : '';
    mnLayerPanelToggle.textContent  = _mnpCollapsed ? '+' : '−';
    mnLayerPanelToggle.title        = _mnpCollapsed ? 'Expand' : 'Collapse';
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
    const dpr = window.devicePixelRatio || 1;
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    if (renderer) {
        renderer.dpr = dpr;
        renderer.resizeKonvaOverlay(cssW, cssH);
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

// Splash screen links — "Ecological Complexity Lab" and "visualization guidelines"
canvas.addEventListener('click', (e) => {
    if (model) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const inBounds = b => b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
    if (inBounds(renderer._ecoLabBounds))    window.open('https://ecomplab.com/', '_blank', 'noopener');
    if (inBounds(renderer._guidelinesBounds)) window.open('docs/manual.html#guidelines', '_blank', 'noopener');
});

canvas.addEventListener('mousemove', (e) => {
    if (model) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const inBounds = b => b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
    canvas.style.cursor = (inBounds(renderer._ecoLabBounds) || inBounds(renderer._guidelinesBounds))
        ? 'pointer' : 'default';
});

// ---- Interaction ----
const interaction = new InteractionHandler(canvas, renderer, {
    onNodeSelect: (hit) => {
        crossModeSelectedNode = hit ? hit.nodeName : null;
        if (hit) {
            showNodeInfo(hit);
        } else {
            hideNodeInfo();
        }
        _updateFilterBanner();
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

// Grid View click — node selection
canvas.addEventListener('click', (e) => {
    if (appMode !== 'grid' || !gridView || !model) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = gridView.hitTest(mx, my);
    crossModeSelectedNode = hit ? hit.nodeName : null;
    renderer.searchedNodeName = hit ? hit.nodeName : null;
    // Drop any stale (layerName, nodeName) selection from a prior mode so it
    // doesn't leak through when the user returns to Network mode.
    renderer.selectedNode = hit ? { layerName: hit.layerName, nodeName: hit.nodeName } : null;
    if (hit) {
        showNodeInfo(hit);
    } else {
        hideNodeInfo();
    }
    _updateFilterBanner();
    renderer.render();
});

// ---- Reset all visualization options to defaults ----
function resetVisualizationOptions() {
    // Checkboxes
    showLabelsCheckbox.checked = false;
    renderer.showLabels = false;
    labelSizeRow.style.display = 'none';
    labelSizeSlider.value = 12;
    labelSizeLabel.textContent = '12px';
    renderer.labelFont = '12px Inter, system-ui, sans-serif';

    transformNodesCheckbox.checked = true;
    renderer.transformNodes = true;

    showLayerNamesCheckbox.checked = false;
    renderer.showLayerNames = false;
    layerNameSizeSlider.value = 14;
    layerNameSizeLabel.textContent = '14px';
    renderer.layerNameFontSize = 14;

    showSetNamesCheckbox.checked = false;
    renderer.showSetNames = false;

    bipartiteNestedCheckbox.checked = false;
    layout.bipartiteNested = false;

    showInterlayerCheckbox.checked = false;
    renderer.showInterlayerLinks = false;
    interPairPanel.style.display = 'none';

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
    intraLinkColorSelect.value = '';
    interLinkColorSelect.value = '';
    layerColorSelect.value = '';
    layerColorPicker.value = LAYER_DEFAULT_HEX;
    nodeColorSelect.value = '';
    nodeColorPicker.value = NODE_DEFAULT_HEX;
    intraLinkColorPicker.value = '#000000';
    interLinkColorPicker.value = '#1e64dc';
    arrowheadSizeSlider.value = 1;
    interArrowheadSizeSlider.value = 1;
    renderer.arrowheadSize = 1;
    interlayerCurvatureSlider.value = 0.35;
    renderer.interlayerCurvature = 0.35;
    intraLinkWeightSlider.value = 0;
    intraLinkWeightLabel.textContent = '0';
    renderer.intraMinWeight = 0;
    interlayerWeightSlider.value = 0;
    interlayerWeightLabel.textContent = '0';
    renderer.interlayerMinWeight = 0;
    _interPairFilter = new Set();
    renderer.interlayerLayerPairs = null;

    // Color functions
    renderer.nodeColorFn = null;
    renderer.nodeSizeFn = null;
    renderer.intraLinkColorFn = null;
    renderer.interLinkColorFn = null;
    renderer.linkColorFn = null;
    renderer.layerColorFn = null;
    activeNodeColorScale = null;
    activeNodeColorScaleA = null;
    activeNodeColorScaleB = null;
    activeNodeSizeScale = null;
    activeNodeSizeScaleA = null;
    activeNodeSizeScaleB = null;
    activeIntraLinkColorScale = null;
    activeInterLinkColorScale = null;
    activeLayerColorScale = null;
    colorScaleOverrides.clear();
    categoryColorOverrides.clear();
    expandedLegends.clear();

    // Layer view
    if (appMode === 'layer') _exitLayerView();

    // Interaction state
    renderer.selectedNode = null;
    renderer.selectedLink = null;
    renderer.selectedLayer = null;
    renderer.hoveredNode = null;
    renderer.hoveredLink = null;
    renderer.searchedNodeName = null;
    crossModeSelectedNode = null;
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

        if (model.warnings && model.warnings.length) {
            alert('Data warnings:\n\n• ' + model.warnings.join('\n• '));
        }

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

        arrowheadSizeControl.style.display      = model.directed         ? 'block' : 'none';
        interArrowheadSizeControl.style.display = model.directedInterlayer ? 'block' : 'none';
        const hasInterlayer = model.interlayerLinks.length > 0;
        sectionInterLinks.style.display = hasInterlayer ? '' : 'none';
        if (hasInterlayer) {
            setTimeout(() => showBounceArrow(sectionInterLinks.querySelector('summary'), 'left'), 800);
            const iWeights = model.interlayerLinks.map(l => l.weight || 0).filter(w => w > 0);
            const maxIW = iWeights.length ? Math.max(...iWeights) : 1;
            interlayerWeightSlider.max  = maxIW.toFixed(4);
            interlayerWeightSlider.step = (maxIW / 100).toFixed(4);
            interlayerWeightSlider.value = 0;
            interlayerWeightLabel.textContent = '0';
        }
        const intraWeights = model.intralayerLinks.map(l => l.weight || 0).filter(w => w > 0);
        const maxIntraW = intraWeights.length ? Math.max(...intraWeights) : 1;
        intraLinkWeightSlider.max  = maxIntraW.toFixed(4);
        intraLinkWeightSlider.step = (maxIntraW / 100).toFixed(4);
        intraLinkWeightSlider.value = 0;
        intraLinkWeightLabel.textContent = '0';

        // Reset out of any non-network mode when loading new data
        if (appMode === 'map')         { toggleMapMode(); }
        if (appMode === 'layer')       { _exitLayerView();   appMode = 'network'; }
        if (appMode === 'dashboard')   { _exitDashboard();   appMode = 'network'; }
        if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
        if (appMode === 'data')        { _exitDataMode();    appMode = 'network'; }
        if (appMode === 'grid')        { _exitGridView();    appMode = 'network'; }
        dataMode.clear();
        _updateFilterBanner();
        _updateModeButtons();
        initLayerColors(model.layers);

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
            // If they had bipartite selected from a previous network, but this one isn't, default to Kamada-Kawai
            if (layoutSelect.value === 'bipartite' && !hasAnyBipartite) {
                layoutSelect.value = 'kamada_kawai';
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

        applyBipartiteUIVisibility();

        populateDropdowns();
        resetVisualizationOptions();
        updateLayerColors();
        updateNodeColors();
        updateIntraLinkColors();
        updateInterLinkColors();

        renderer.setData(model, positions);
        renderer.skewX = 0.7;
        renderer.skewY = 0.55;
        renderer.resetLayerOffsets();
        renderer.centerView();
        renderer.render();

        // Enable dropdowns
        nodeColorSelect.disabled = false;
        nodeColorSelectSetA.disabled = false;
        nodeColorSelectSetB.disabled = false;
        nodeSizeSelect.disabled = false;
        nodeSizeSelectSetA.disabled = nodeSizeSelectSetA.options.length <= 1;
        nodeSizeSelectSetB.disabled = nodeSizeSelectSetB.options.length <= 1;
        intraLinkColorSelect.disabled = false;
        if (hasInterlayer) interLinkColorSelect.disabled = false;
    } catch (err) {
        console.error('Failed to load data:', err);
        alert('Error loading data: ' + err.message);
    }
}

// ---- Demo datasets dialog ----
initDemoDatasets(loadData);


// ---- Mode Button Highlighting ----
const MODE_BTNS = document.querySelectorAll('.mode-btn');
function _updateModeButtons() {
    const modeMap = { network: 'network', map: 'map', layer: 'layer',
                      metanetwork: 'meta', dashboard: 'dashboard', data: 'data', grid: 'grid' };
    const activeMode = modeMap[appMode] || 'network';
    MODE_BTNS.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === activeMode);
    });
}

// ---- Map Mode Logic ----
function toggleMapMode() {
    if (appMode === 'dashboard')   { _exitDashboard();   appMode = 'network'; }
    if (appMode === 'layer')       { _exitLayerView();   appMode = 'network'; renderer.render(); }
    if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
    if (appMode === 'data')        { _exitDataMode();    appMode = 'network'; }
    if (appMode === 'grid')        { _exitGridView();    appMode = 'network'; }
    appMode = appMode === 'network' ? 'map' : 'network';

    _updateModeButtons();
    if (appMode === 'map') {
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
        mapEl.style.display = 'none';
        activeMapLayers.clear();
        renderer.showMapBackground = false;
        renderer.isMapMode = false;
        mapOpacityControl.style.display = 'none';
        mapLayerPanel.style.display = 'none';
    }

    updateMapModeViews();
    _updateFilterBanner();
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
        _updateFilterBanner();
        _updateModeButtons();
        renderer.render();
        return;
    }
    if (appMode === 'map')         toggleMapMode();
    if (appMode === 'dashboard')   { _exitDashboard();   appMode = 'network'; }
    if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
    if (appMode === 'data')        { _exitDataMode();    appMode = 'network'; }
    if (appMode === 'grid')        { _exitGridView();    appMode = 'network'; }
    appMode = 'layer';
    _updateFilterBanner();
    _updateModeButtons();
    renderer.layerView = new LayerView(model, positions);
    window._layerView = renderer.layerView;
    renderer.layerViewMode = true;
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
        const fitScale = Math.min(cssW, cssH) * 0.42 / Math.max(layoutR, 1);
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
            mx: e.clientX - rect.left,
            my: e.clientY - rect.top,
        };
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        mouseDownX = e.clientX; mouseDownY = e.clientY;
        const { mx, my } = canvasCoords(e);
        const lv = renderer.layerView;
        // In geo mode bubbles are pinned to map coordinates — dragging is disabled
        const hitName = lv.geoMode ? null : lv.startDragBubble(mx, my, cssW, cssH);
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
                renderer.layerView.moveDragBubble(mx, my, cssW, cssH);
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
        const hitBubble = lv.hitTestBubble(mx, my, cssW, cssH);
        if (hitBubble) {
            const info = lv.getBubbleInfo(hitBubble);
            tooltip.textContent = `${hitBubble} — ${info.nodeCount} nodes, ${info.edgeCount} edges, density ${info.density.toFixed(3)}, avg deg ${info.avgDegree.toFixed(1)}`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8)  + 'px';
            canvas.style.cursor = 'pointer';
            return;
        }
        const hitEdge = lv.hitTestEdge(mx, my, cssW, cssH);
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
            if (didDrag) {
                renderer.layerView.endDragBubble();
                _ensureLayerViewLoop();
            } else {
                renderer.layerView.cancelDragBubble();
            }
        }
        isDragging   = false;
        isBubbleDrag = false;
        canvas.style.cursor = 'grab';
        if (!didDrag) {
            const { mx, my } = canvasCoords(e);
            const hit = renderer.layerView.hitTestBubble(mx, my, cssW, cssH);
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
        const fracX = (mx - cssW  / 2 - lv.viewOffsetX) / lv.viewScale;
        const fracY = (my - cssH / 2 - lv.viewOffsetY) / lv.viewScale;
        lv.viewOffsetX = mx - cssW  / 2 - fracX * newScale;
        lv.viewOffsetY = my - cssH / 2 - fracY * newScale;
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

const NETWORK_SECTIONS = ['sectionLayers','sectionNodes','sectionLinks','sectionSearch','sectionIntraLinks','sectionInterLinks'];

function _showLayerViewSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = ''; });
    _syncLayerViewControls();
}

function _hideLayerViewSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    sectionInterLinks.style.display = model && model.interlayerLinks.length > 0 ? '' : 'none';
    renderLegends(); // restore network legends
}

// ---- Grid View Mode ----
const GRID_HIDDEN_IDS = [
    'layerNamesRow', 'stackingRow', 'layerSpacingRow',
    'layerColorRow', 'layerColorSwatches',
    'intraLinkColorSwatches',
];

function _showGridViewSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    META_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    sectionInterLinks.style.display = 'none';
    if (transformNodesRow) transformNodesRow.style.display = 'none';
    GRID_HIDDEN_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.dataset.gridSavedDisplay = el.style.display;
        el.style.display = 'none';
    });
    gridColumnsRow.style.display = '';
    const L = model ? model.layers.length : 4;
    const defCols = Math.min(Math.ceil(Math.sqrt(L)), 8);
    gridColumnsSlider.value = defCols;
    gridColumnsLabel.textContent = defCols;
    renderer._gridColumns = defCols;
}

function _exitGridView() {
    renderer.gridViewMode = false;
    canvas.style.cursor = 'grab';
    if (transformNodesRow) transformNodesRow.style.display = '';
    gridColumnsRow.style.display = 'none';
    GRID_HIDDEN_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.dataset.gridSavedDisplay ?? '';
        delete el.dataset.gridSavedDisplay;
    });
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    LV_SECTIONS.forEach(id => { document.getElementById(id).style.display = 'none'; });
    sectionInterLinks.style.display = model && model.interlayerLinks.length > 0 ? '' : 'none';
    renderLegends();
}

function toggleGridView() {
    if (appMode === 'grid') {
        _exitGridView();
        appMode = 'network';
        renderer.render();
        _updateFilterBanner();
        _updateModeButtons();
        return;
    }
    if (appMode === 'map')         toggleMapMode();
    if (appMode === 'layer')       { _exitLayerView();   appMode = 'network'; }
    if (appMode === 'dashboard')   { _exitDashboard();   appMode = 'network'; }
    if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
    if (appMode === 'data')        { _exitDataMode();    appMode = 'network'; }

    appMode = 'grid';
    if (!gridView) gridView = new GridView();
    renderer.gridViewMode = true;
    renderer._gridView = gridView;
    canvas.style.cursor = 'default';
    _showGridViewSidebar();
    _updateFilterBanner();
    _updateModeButtons();
    renderer.render();
}

gridViewBtn.addEventListener('click', toggleGridView);

gridColumnsSlider.addEventListener('input', () => {
    gridColumnsLabel.textContent = gridColumnsSlider.value;
    renderer._gridColumns = parseInt(gridColumnsSlider.value);
    if (appMode === 'grid') renderer.render();
});

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
    sectionInterLinks.style.display = model && model.interlayerLinks.length > 0 ? '' : 'none';
    renderLegends();
}

function _exitDashboard() {
    dashboard?.destroy();
    dashboard = null;
    dashboardContainer.style.display = 'none';
    canvas.style.display = '';
    _hideDashboardSidebar();
}

function toggleDashboard() {
    if (!model) return;
    if (appMode === 'dashboard') {
        _exitDashboard();
        appMode = 'network';
        _updateFilterBanner();
        _updateModeButtons();
        renderer.render();
        return;
    }
    // Exit other active modes first
    if (appMode === 'layer')       { _exitLayerView();   appMode = 'network'; }
    if (appMode === 'map')         { toggleMapMode(); }
    if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
    if (appMode === 'data')        { _exitDataMode();    appMode = 'network'; }
    if (appMode === 'grid')        { _exitGridView();    appMode = 'network'; }

    appMode = 'dashboard';
    _updateFilterBanner();
    _updateModeButtons();
    canvas.style.display = 'none';
    dashboardContainer.style.display = 'block';
    _showDashboardSidebar();

    dashboard = new Dashboard(dashboardContainer, model, {});
    dashboard.render();
}

dashboardBtn.addEventListener('click', toggleDashboard);

// ─── Data Mode ───────────────────────────────────────────────────────────────

function _exitDataMode() {
    dataModeInstance?.destroy();
    dataModeInstance = null;
    dataModePanel.style.display = 'none';
    canvas.style.display = '';
    dataMode.active = false;
    document.getElementById('controlPanels').style.display = '';
    legendPanel.style.display = '';
    renderer.searchedNodeName = null;
}

function _updateFilterBanner() {
    const show = dataMode.isSubsetActive() && (appMode === 'network' || appMode === 'map');
    if (!show) {
        dataFilterBanner.style.display = 'none';
    } else {
        const parts = [];
        if (dataMode.filteredNodeNames) parts.push(`${dataMode.filteredNodeNames.size} nodes`);
        if (dataMode.filteredLayerNames) parts.push(`${dataMode.filteredLayerNames.size} layers`);
        if (dataMode.filteredLinkKeys) parts.push(`${dataMode.filteredLinkKeys.size} links`);
        dataFilterText.textContent = `\u26A1 Data filter active \u2014 ${parts.join(', ')} visible`;
        dataFilterBanner.style.display = 'flex';
    }
    _updateSelectedNodeBanner();
}

function _updateSelectedNodeBanner() {
    const show = crossModeSelectedNode
        && (appMode === 'network' || appMode === 'map' || appMode === 'metanetwork' || appMode === 'grid');
    if (!show) {
        selectedNodeBanner.style.display = 'none';
        return;
    }
    selectedNodeText.textContent = `\u29BF Selected node: ${crossModeSelectedNode}`;
    selectedNodeBanner.style.display = 'flex';
}

function _clearCrossModeSelection() {
    crossModeSelectedNode = null;
    if (renderer) {
        renderer.selectedNode = null;
        renderer.searchedNodeName = null;
    }
    if (metaNetwork) {
        metaNetwork.state.selectedNode = null;
        metaNetwork._focusSet = null;
    }
    hideNodeInfo();
}

// Push crossModeSelectedNode into renderer.selectedNode/searchedNodeName so
// the network/map view highlights every state-node instance of that name.
function _applyCrossModeSelectionToRenderer() {
    if (!renderer || !model) return;
    if (!crossModeSelectedNode) return;
    let firstLayer = null;
    for (const [layerName, nodeSet] of model.nodesPerLayer) {
        if (nodeSet.has(crossModeSelectedNode)) { firstLayer = layerName; break; }
    }
    if (firstLayer) {
        renderer.selectedNode = { layerName: firstLayer, nodeName: crossModeSelectedNode };
        renderer.searchedNodeName = crossModeSelectedNode;
    } else {
        // Node not found in current model — drop stale selection
        crossModeSelectedNode = null;
    }
}

function toggleDataMode() {
    if (!model) return;
    if (appMode === 'data') {
        _exitDataMode();
        appMode = 'network';
        _updateFilterBanner();
        _updateModeButtons();
        renderer.render();
        return;
    }
    if (appMode === 'map')         toggleMapMode();
    if (appMode === 'layer')       { _exitLayerView();   appMode = 'network'; }
    if (appMode === 'dashboard')   { _exitDashboard();   appMode = 'network'; }
    if (appMode === 'metanetwork') { _exitMetaNetwork(); appMode = 'network'; }
    if (appMode === 'grid')        { _exitGridView();    appMode = 'network'; }

    appMode = 'data';
    _updateFilterBanner();
    _updateModeButtons();
    dataMode.active = true;
    canvas.style.display = 'none';
    dataModePanel.style.display = 'flex';
    legendPanel.style.display = 'none';

    // Hide sidebar
    document.getElementById('controlPanels').style.display = 'none';

    dataModeInstance = new DataMode(dataModePanel, model, () => {
        _updateFilterBanner();
        if (appMode !== 'data') renderer.render();
    });
    dataModeInstance._onSelect = (type, name) => {
        if (type === 'node') {
            renderer.searchedNodeName = name;
        } else if (type === 'layer') {
            renderer.searchedNodeName = null;
        } else {
            renderer.searchedNodeName = null;
        }
    };
    dataModeInstance._onColorChange = () => {
        if (layerColorSelect.value === '__individual__') {
            updateLayerColors();
        }
    };
}

dataModeBtn.addEventListener('click', toggleDataMode);

dataFilterClear.addEventListener('click', () => {
    if (dataModeInstance) dataModeInstance.clearFilters();
    dataMode.clear();
    renderer.searchedNodeName = null;
    _updateFilterBanner();
    if (appMode !== 'data') renderer.render();
});

selectedNodeClear.addEventListener('click', () => {
    _clearCrossModeSelection();
    _updateFilterBanner();
    if (appMode === 'metanetwork' && metaNetwork) {
        _mnRenderSync();
    } else if (renderer) {
        renderer.render();
    }
});

// ── Meta-network layer palette (same as LayerView PALETTE) ────────────────
const MN_LAYER_PALETTE = [
    '#6ee7b7','#fbbf24','#f87171','#60a5fa','#a78bfa',
    '#fb923c','#34d399','#f472b6','#38bdf8','#facc15',
    '#c084fc','#4ade80','#fb7185','#22d3ee','#e879f9',
];

// ─── Meta-network mode ────────────────────────────────────────────────────

function _showMetaNetworkSidebar() {
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    LV_SECTIONS.forEach(id => document.getElementById(id).style.display = 'none');
    DB_SECTIONS.forEach(id => document.getElementById(id).style.display = 'none');
    META_SECTIONS.forEach(id => document.getElementById(id).style.display = '');
    mnLayerPanel.style.display = '';
    renderMetaNetworkLegend();
}

function _hideMetaNetworkSidebar() {
    META_SECTIONS.forEach(id => document.getElementById(id).style.display = 'none');
    mnLayerPanel.style.display = 'none';
    NETWORK_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    sectionInterLinks.style.display = model && model.interlayerLinks.length > 0 ? '' : 'none';
    renderLegends();
}

function _updateMnBpColorPickerVisibility() {
    if (!metaNetwork) { mnUniformColorRow.style.display = 'none'; mnBpColorRow.style.display = 'none'; return; }
    const isUniform   = metaNetwork.settings.colorBy === 'uniform';
    const isBipartite = metaNetwork.hasBipartite;
    mnUniformColorRow.style.display = isUniform && !isBipartite ? '' : 'none';
    mnBpColorRow.style.display      = isUniform &&  isBipartite ? '' : 'none';
    if (isUniform && isBipartite) {
        const { labelA, labelB } = metaNetwork.bipartiteSetLabels;
        mnColorSetALabel.textContent = labelA + ' color';
        mnColorSetBLabel.textContent = labelB + ' color';
    }
}

function _syncMetaNetworkControls() {
    if (!metaNetwork) return;
    const s = metaNetwork.settings;
    mnAggregationSelect.value      = s.aggregation;
    mnLayoutSelect.value           = s.layout;
    mnColorBySelect.value          = s.colorBy;
    mnSizeBySelect.value           = s.sizeBy;
    mnBaseSizeSlider.value         = s.baseSize;
    mnBaseSizeLabel.textContent    = s.baseSize.toFixed(1) + '×';
    mnNestedSortCheckbox.checked   = s.nestedSort;
    mnShowLabelsCheckbox.checked   = s.showLabels;
    mnLabelSizeSlider.value        = s.labelFontSize;
    mnLabelSizeLabel.textContent   = s.labelFontSize + 'px';
    mnLabelSizeRow.style.display   = s.showLabels ? '' : 'none';
    mnUniformColorPicker.value     = s.uniformColor;
    mnColorSetA.value              = s.uniformColorA;
    mnColorSetB.value              = s.uniformColorB;
    _updateMnBpColorPickerVisibility();
    // Set slider range from maxEdgeWeight
    const maxW = metaNetwork.maxEdgeWeight;
    mnMinWeightSlider.max   = maxW;
    mnMinWeightSlider.step  = (maxW / 100).toFixed(4);
    mnMinWeightSlider.value = 0;
    mnMinWeightLabel.textContent = '0';
    mnSearchInput.value  = '';
    mnSearchResults.style.display = 'none';
}

function _buildMnLayerPanel() {
    if (!model) return;
    mnLayerList.innerHTML = '';
    model.layers.forEach((layer, i) => {
        const color = MN_LAYER_PALETTE[i % MN_LAYER_PALETTE.length];
        const li = document.createElement('li');
        li.className = 'map-layer-item';
        li.dataset.layerName = layer.layer_name;
        li.innerHTML = `<span class="map-layer-dot" style="background:${color};"></span>
                        <span style="font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${layer.layer_name}</span>`;
        li.addEventListener('click', () => {
            if (!metaNetwork) return;
            const name = layer.layer_name;
            const sel  = metaNetwork.state.selectedLayers;
            if (sel.has(name)) sel.delete(name); else sel.add(name);
            li.classList.toggle('active', sel.has(name));
            _ensureMetaNetworkLoop();
        });
        mnLayerList.appendChild(li);
    });
}

function _startMetaNetworkLoop() {
    function loop() {
        if (appMode !== 'metanetwork' || !metaNetwork) { mnRAF = null; return; }
        const stillHot = metaNetwork.tick();
        renderer.ctx.setTransform(renderer.dpr || 1, 0, 0, renderer.dpr || 1, 0, 0);
        metaNetwork.render(renderer.ctx, cssW, cssH);
        mnRAF = stillHot ? requestAnimationFrame(loop) : null;
    }
    mnRAF = requestAnimationFrame(loop);
}

function _ensureMetaNetworkLoop() {
    if (!mnRAF && appMode === 'metanetwork' && metaNetwork) _startMetaNetworkLoop();
}

// Render one frame immediately (synchronous), then keep the loop alive if the
// sim is still hot. Use this whenever state changes need instant visual feedback.
function _mnRenderSync() {
    if (!metaNetwork || appMode !== 'metanetwork') return;
    if (mnRAF) { cancelAnimationFrame(mnRAF); mnRAF = null; }
    renderer.ctx.setTransform(renderer.dpr || 1, 0, 0, renderer.dpr || 1, 0, 0);
    metaNetwork.render(renderer.ctx, cssW, cssH);
    if (metaNetwork.tick()) _startMetaNetworkLoop();
}

function toggleMetaNetwork() {
    if (!model) return;
    if (appMode === 'metanetwork') {
        _exitMetaNetwork();
        appMode = 'network';
        _applyCrossModeSelectionToRenderer();
        _updateFilterBanner();
        _updateModeButtons();
        renderer.render();
        return;
    }
    if (appMode === 'map')       toggleMapMode();
    if (appMode === 'layer')     { _exitLayerView(); appMode = 'network'; }
    if (appMode === 'dashboard') { _exitDashboard(); appMode = 'network'; }
    if (appMode === 'data')      { _exitDataMode();  appMode = 'network'; }
    if (appMode === 'grid')      { _exitGridView();  appMode = 'network'; }

    appMode = 'metanetwork';
    _updateFilterBanner();
    _updateModeButtons();
    renderer.metaNetworkMode = true;
    canvas.style.display = '';
    canvas.style.cursor  = 'grab';

    metaNetwork = new MetaNetwork(model, cssW, cssH);
    _showMetaNetworkSidebar();
    _syncMetaNetworkControls();
    _buildMnLayerPanel();

    // Restore cross-mode selection if a node was selected in another mode
    if (crossModeSelectedNode && metaNetwork._nodeMap.has(crossModeSelectedNode)) {
        metaNetwork.state.selectedNode = crossModeSelectedNode;
        metaNetwork._computeFocusSet(crossModeSelectedNode);
        _showMnNodeInfo(crossModeSelectedNode);
    } else if (crossModeSelectedNode) {
        // Selected node not present in metanetwork — drop the cross-mode selection.
        crossModeSelectedNode = null;
    }
    _updateFilterBanner();

    // Mouse handlers — nodes are NOT draggable in meta-network mode; only
    // the background can be panned. Clicks on nodes select them.
    let _isDragging    = false;       // true while panning the background
    let _mouseDownX    = 0, _mouseDownY = 0;
    let _dragStartX    = 0, _dragStartY = 0;
    let _offsetStartX  = 0, _offsetStartY = 0;
    let _mouseDownOnCanvas = false; // true only when mousedown originated on the canvas

    const canvasCoords = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            mx: e.clientX - rect.left,
            my: e.clientY - rect.top,
        };
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        _mouseDownOnCanvas = true;
        _mouseDownX = e.clientX; _mouseDownY = e.clientY;
        const { mx, my } = canvasCoords(e);
        const hitName = metaNetwork.hitTestNode(mx, my, cssW, cssH);
        if (hitName) {
            // Mousedown on a node: don't enter pan mode and don't drag the node.
            // mouseup will treat this as a click (selection) if movement stayed
            // within the click threshold.
            _isDragging = false;
        } else {
            _isDragging   = true;
            _dragStartX   = e.clientX; _dragStartY  = e.clientY;
            _offsetStartX = metaNetwork.viewOffsetX;
            _offsetStartY = metaNetwork.viewOffsetY;
            canvas.style.cursor = 'grabbing';
        }
    };

    const onMouseMove = (e) => {
        if (_isDragging) {
            // Pan only — node dragging has been removed.
            metaNetwork.viewOffsetX = _offsetStartX + (e.clientX - _dragStartX);
            metaNetwork.viewOffsetY = _offsetStartY + (e.clientY - _dragStartY);
            _ensureMetaNetworkLoop();
            tooltip.classList.remove('visible');
            return;
        }
        const { mx, my } = canvasCoords(e);
        const hitName = metaNetwork.hitTestNode(mx, my, cssW, cssH);
        if (hitName) {
            const n = metaNetwork._nodeMap.get(hitName);
            tooltip.textContent = `${hitName} — participation ${n.participation}, meta-degree ${n.metaDegree}`;
            tooltip.classList.add('visible');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 8)  + 'px';
            canvas.style.cursor = 'pointer';
            return;
        }
        const hitEdge = metaNetwork.hitTestEdge(mx, my, cssW, cssH);
        if (hitEdge) {
            tooltip.textContent = `${hitEdge.source} — ${hitEdge.target}  (weight ${hitEdge.weight.toFixed(2)})`;
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
        if (!_mouseDownOnCanvas) return; // mousedown was on another element (e.g. search dropdown)
        _mouseDownOnCanvas = false;
        const wasDragging = _isDragging;
        _isDragging = false;
        canvas.style.cursor = 'grab';
        // Click if minimal movement
        const moved = Math.abs(e.clientX - _mouseDownX) > 3 || Math.abs(e.clientY - _mouseDownY) > 3;
        if (wasDragging && moved) return;

        const { mx, my } = canvasCoords(e);
        const hitName = metaNetwork.hitTestNode(mx, my, cssW, cssH);
        if (hitName) {
            // Toggle node selection (deselect if already selected)
            if (metaNetwork.state.selectedNode === hitName) {
                metaNetwork.state.selectedNode = null;
                metaNetwork.state.selectedEdge = null;
                metaNetwork._focusSet = null;
                crossModeSelectedNode = null;
                infoPanel.classList.remove('visible');
            } else {
                metaNetwork.state.selectedNode = hitName;
                metaNetwork.state.selectedEdge = null;
                metaNetwork._computeFocusSet(hitName);
                crossModeSelectedNode = hitName;
                _showMnNodeInfo(hitName);
            }
            _updateFilterBanner();
            _mnRenderSync();
            return;
        }
        const hitEdge = metaNetwork.hitTestEdge(mx, my, cssW, cssH);
        if (hitEdge) {
            // Toggle edge selection
            if (metaNetwork.state.selectedEdge === hitEdge) {
                metaNetwork.state.selectedEdge = null;
                metaNetwork.state.selectedNode = null;
                metaNetwork._focusSet = null;
                infoPanel.classList.remove('visible');
            } else {
                metaNetwork.state.selectedEdge = hitEdge;
                metaNetwork.state.selectedNode = null;
                metaNetwork._focusSet = null;
                _showMnEdgeInfo(hitEdge);
            }
            crossModeSelectedNode = null;
            _updateFilterBanner();
            _mnRenderSync();
            return;
        }
        // Click on empty space: deselect
        if (metaNetwork.state.selectedNode || metaNetwork.state.selectedEdge) {
            metaNetwork.state.selectedNode = null;
            metaNetwork.state.selectedEdge = null;
            metaNetwork._focusSet = null;
            crossModeSelectedNode = null;
            infoPanel.classList.remove('visible');
            _updateFilterBanner();
            _mnRenderSync();
        }
    };

    const onWheel = (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const prevScale = metaNetwork.viewScale;
        metaNetwork.viewScale = Math.min(Math.max(prevScale * zoomFactor, 0.05), 10);
        const scaleDelta = metaNetwork.viewScale / prevScale;
        metaNetwork.viewOffsetX = mx - scaleDelta * (mx - metaNetwork.viewOffsetX - cssW  / 2) - cssW  / 2;
        metaNetwork.viewOffsetY = my - scaleDelta * (my - metaNetwork.viewOffsetY - cssH / 2) - cssH / 2;
        _ensureMetaNetworkLoop();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('wheel',     onWheel, { passive: false });
    _mnMouseHandlers = { onMouseDown, onMouseMove, onMouseUp, onWheel };

    _startMetaNetworkLoop();
}

function _exitMetaNetwork() {
    if (mnRAF) { cancelAnimationFrame(mnRAF); mnRAF = null; }
    renderer.metaNetworkMode = false;
    if (_mnMouseHandlers) {
        canvas.removeEventListener('mousedown', _mnMouseHandlers.onMouseDown);
        canvas.removeEventListener('mousemove', _mnMouseHandlers.onMouseMove);
        canvas.removeEventListener('mouseup',   _mnMouseHandlers.onMouseUp);
        canvas.removeEventListener('wheel',     _mnMouseHandlers.onWheel);
        _mnMouseHandlers = null;
    }
    metaNetwork?._sim?.stop();
    metaNetwork = null;
    canvas.style.cursor = '';
    tooltip.classList.remove('visible');
    infoPanel.classList.remove('visible');
    _hideMetaNetworkSidebar();
}

function _showMnNodeInfo(nodeName) {
    const node = metaNetwork._nodeMap.get(nodeName);
    const layerList = [...node.layers].sort().join(', ');
    infoTitle.textContent = `Node: ${nodeName}`;
    infoContent.innerHTML = `
        <ul style="margin:6px 0 0; padding-left:18px; font-size:12px; line-height:1.7;">
          <li><b>Participation:</b> ${node.participation}</li>
          <li><b>Layers:</b> ${layerList}</li>
          <li><b>Meta-degree:</b> ${node.metaDegree}</li>
          <li><b>Meta-strength:</b> ${node.metaStrength.toFixed(2)}</li>
        </ul>`;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
}

function _showMnEdgeInfo(edge) {
    const arrow   = metaNetwork?._model?.directed ? '→' : '—';
    const srcName = typeof edge.source === 'string' ? edge.source : edge.source.name;
    const tgtName = typeof edge.target === 'string' ? edge.target : edge.target.name;
    const barData = edge.perLayer.map(({ layerName, weight }) => ({ label: layerName, value: weight }));
    infoTitle.textContent = `Link: ${srcName} ${arrow} ${tgtName}`;
    infoContent.innerHTML = `
        <p>Appears in <b>${edge.perLayer.length}</b> layer${edge.perLayer.length !== 1 ? 's' : ''}:</p>
        ${svgBar(barData, { width: 240, height: 160, yLabel: 'weight' })}`;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
}

metaNetworkBtn.addEventListener('click', toggleMetaNetwork);

// ── Meta-network sidebar controls ─────────────────────────────────────────
mnAggregationSelect.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('aggregation', mnAggregationSelect.value);
    const maxW = metaNetwork.maxEdgeWeight;
    mnMinWeightSlider.max   = maxW;
    mnMinWeightSlider.step  = (maxW / 100).toFixed(4);
    mnMinWeightSlider.value = 0;
    mnMinWeightLabel.textContent = '0';
    metaNetwork.settings.minWeight = 0;
    _ensureMetaNetworkLoop();
});

mnLayoutSelect.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('layout', mnLayoutSelect.value);
    _updateMnBpColorPickerVisibility();
    _ensureMetaNetworkLoop();
});

mnColorBySelect.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('colorBy', mnColorBySelect.value);
    _updateMnBpColorPickerVisibility();
    renderMetaNetworkLegend();
    _ensureMetaNetworkLoop();
});

mnSizeBySelect.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('sizeBy', mnSizeBySelect.value);
    renderMetaNetworkLegend();
    _ensureMetaNetworkLoop();
});

mnMinWeightSlider.addEventListener('input', () => {
    if (!metaNetwork) return;
    const val = parseFloat(mnMinWeightSlider.value);
    mnMinWeightLabel.textContent = val.toFixed(2);
    metaNetwork.settings.minWeight = val;
    _ensureMetaNetworkLoop();
});

mnNestedSortCheckbox.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('nestedSort', mnNestedSortCheckbox.checked);
    _ensureMetaNetworkLoop();
});

mnShowLabelsCheckbox.addEventListener('change', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('showLabels', mnShowLabelsCheckbox.checked);
    mnLabelSizeRow.style.display = mnShowLabelsCheckbox.checked ? '' : 'none';
    _ensureMetaNetworkLoop();
});

mnLabelSizeSlider.addEventListener('input', () => {
    if (!metaNetwork) return;
    const val = parseInt(mnLabelSizeSlider.value);
    mnLabelSizeLabel.textContent = val + 'px';
    metaNetwork.updateSetting('labelFontSize', val);
    _ensureMetaNetworkLoop();
});

mnUniformColorPicker.addEventListener('input', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('uniformColor', mnUniformColorPicker.value);
    _ensureMetaNetworkLoop();
});

mnColorSetA.addEventListener('input', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('uniformColorA', mnColorSetA.value);
    _ensureMetaNetworkLoop();
});

mnColorSetB.addEventListener('input', () => {
    if (!metaNetwork) return;
    metaNetwork.updateSetting('uniformColorB', mnColorSetB.value);
    _ensureMetaNetworkLoop();
});

mnResetLayoutBtn.addEventListener('click', () => {
    if (!metaNetwork) return;
    metaNetwork.resetLayout();
    _mnRenderSync();
});

mnBaseSizeSlider.addEventListener('input', () => {
    if (!metaNetwork) return;
    const val = parseFloat(mnBaseSizeSlider.value);
    mnBaseSizeLabel.textContent = val.toFixed(1) + '×';
    metaNetwork.updateSetting('baseSize', val);
    renderMetaNetworkLegend();
    _ensureMetaNetworkLoop();
});

// ── Meta-network search ────────────────────────────────────────────────────

function _mnCloseDrop() {
    mnSearchResults.style.display = 'none';
    mnSearchResults.innerHTML = '';
}

function _mnSelectNode(name) {
    if (!metaNetwork) return;
    mnSearchInput.value = name;
    _mnCloseDrop();
    metaNetwork.state.selectedNode = name;
    metaNetwork.state.selectedEdge = null;
    metaNetwork._computeFocusSet(name);
    crossModeSelectedNode = name;
    _showMnNodeInfo(name);
    _updateFilterBanner();
    _mnRenderSync();
}

mnSearchInput.addEventListener('input', () => {
    const query = mnSearchInput.value.trim().toLowerCase();
    if (!metaNetwork || !query) { _mnCloseDrop(); return; }
    const matches = [...metaNetwork._nodeMap.keys()]
        .filter(n => n.toLowerCase().includes(query))
        .slice(0, 12);
    if (!matches.length) {
        mnSearchResults.innerHTML = '<div style="font-size:11px;color:#999;padding:6px 10px;">No results</div>';
        mnSearchResults.style.display = 'block';
        return;
    }
    mnSearchResults.innerHTML = matches.map(n =>
        `<div data-name="${n}" style="font-size:11px;padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>`
    ).join('');
    mnSearchResults.style.display = 'block';
    // Shared closure state for hover preview/restore.
    // _hoverCommitted prevents mouseout from undoing a click-committed selection:
    // closing the dropdown (display:none) fires mouseout asynchronously *after*
    // _mnSelectNode has already run, so without the flag mouseout would clear it.
    let _hoverSavedNode = null, _hoverSavedFocus = null, _hoverCommitted = false;
    mnSearchResults.querySelectorAll('[data-name]').forEach(el => {
        el.addEventListener('mouseover', () => {
            el.style.background = 'rgba(0,0,0,0.06)';
            if (!metaNetwork) return;
            _hoverCommitted  = false;
            _hoverSavedNode  = metaNetwork.state.selectedNode;
            _hoverSavedFocus = metaNetwork._focusSet;
            metaNetwork.state.selectedNode = el.dataset.name;
            metaNetwork.state.selectedEdge = null;
            metaNetwork._computeFocusSet(el.dataset.name);
            _mnRenderSync();
        });
        el.addEventListener('mouseout', () => {
            el.style.background = '';
            if (!metaNetwork || _hoverCommitted) return; // click already committed
            metaNetwork.state.selectedNode = _hoverSavedNode;
            metaNetwork._focusSet          = _hoverSavedFocus;
            _mnRenderSync();
        });
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            _hoverCommitted = true; // block the deferred mouseout from undoing this
            _mnSelectNode(el.dataset.name);
        });
    });
});

mnSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { _mnCloseDrop(); mnSearchInput.value = ''; }
    if (e.key === 'Enter') {
        const first = mnSearchResults.querySelector('[data-name]');
        if (first) _mnSelectNode(first.dataset.name);
    }
});

mnSearchInput.addEventListener('blur', () => { setTimeout(_mnCloseDrop, 150); });

mnSearchClearBtn.addEventListener('click', () => {
    mnSearchInput.value = '';
    _mnCloseDrop();
    if (!metaNetwork) return;
    metaNetwork.state.selectedNode = null;
    metaNetwork.state.selectedEdge = null;
    metaNetwork._focusSet = null;
    crossModeSelectedNode = null;
    infoPanel.classList.remove('visible');
    _updateFilterBanner();
    _mnRenderSync();
});

document.getElementById('mnSelectAllLayers').addEventListener('click', () => {
    if (!metaNetwork || !model) return;
    model.layers.forEach(l => metaNetwork.state.selectedLayers.add(l.layer_name));
    mnLayerList.querySelectorAll('li').forEach(li => li.classList.add('active'));
    _ensureMetaNetworkLoop();
});

document.getElementById('mnClearLayers').addEventListener('click', () => {
    if (!metaNetwork) return;
    metaNetwork.state.selectedLayers.clear();
    mnLayerList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    _ensureMetaNetworkLoop();
});

function goToNetworkMode() {
    if (!model || appMode === 'network') return;
    if (appMode === 'map')         toggleMapMode();
    if (appMode === 'layer')       { _exitLayerView();     appMode = 'network'; renderer.render(); }
    if (appMode === 'dashboard')   { _exitDashboard();     appMode = 'network'; renderer.render(); }
    if (appMode === 'metanetwork') { _exitMetaNetwork();   appMode = 'network'; _applyCrossModeSelectionToRenderer(); renderer.render(); }
    if (appMode === 'data')        { _exitDataMode();      appMode = 'network'; renderer.render(); }
    if (appMode === 'grid')        { _exitGridView();      appMode = 'network'; _applyCrossModeSelectionToRenderer(); renderer.render(); }
    _updateFilterBanner();
    _updateModeButtons();
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
            renderer.layerView.setGeoPositions(lvMap, cssW, cssH);
            renderer.render();
        }
    };
    lvMap.on('move zoom', _lvMapMoveHandler);

    // Initial projection — defer one frame so the map container has laid out
    requestAnimationFrame(() => {
        if (renderer.layerView?.geoMode) {
            renderer.layerView.setGeoPositions(lvMap, cssW, cssH);
            renderer.render();
        }
    });

    // Let Leaflet receive mouse events for pan/zoom; tooltips via mousemove on lvMapEl
    canvas.style.pointerEvents = 'none';
    _lvGeoMouseMoveHandler = (e) => {
        const lv = renderer.layerView;
        if (!lv?.geoMode) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hitBubble = lv.hitTestBubble(mx, my, cssW, cssH);
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
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = lv.hitTestBubble(mx, my, cssW, cssH);
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
        const fitScale = Math.min(cssW, cssH) * 0.42 / Math.max(layoutR, 1);
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
            sRow('Interlayer B→A', fmt(ilBtoA))
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
    const W = cssW, H = cssH;
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
    const W    = cssW, H = cssH;
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
const labelSizeRow    = document.getElementById('labelSizeRow');
const labelSizeSlider = document.getElementById('labelSizeSlider');
const labelSizeLabel  = document.getElementById('labelSizeLabel');

showLabelsCheckbox.addEventListener('change', () => {
    renderer.showLabels = showLabelsCheckbox.checked;
    labelSizeRow.style.display = showLabelsCheckbox.checked ? '' : 'none';
    renderer.render();
});

labelSizeSlider.addEventListener('input', () => {
    const px = parseInt(labelSizeSlider.value);
    labelSizeLabel.textContent = px + 'px';
    renderer.labelFont = `${px}px Inter, system-ui, sans-serif`;
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

// ---- Layer Name Size ----
layerNameSizeSlider.addEventListener('input', () => {
    const px = parseInt(layerNameSizeSlider.value);
    layerNameSizeLabel.textContent = px + 'px';
    renderer.layerNameFontSize = px;
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

// ---- Show / Hide Interlayer Links ----
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

    applyBipartiteUIVisibility();

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
        } finally {
            e.target.value = '';
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
    // Reset native file inputs so re-selecting the same file fires `change` again
    csvEdgeFile.value = '';
    csvLayersFile.value = '';
    csvNodesFile.value = '';
    csvStateNodesFile.value = '';
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

// Append an <optgroup> with one <option> per item. Items is a list of
// {value, text} objects. Skipped silently when items is empty.
function appendOptgroup(select, label, items) {
    if (!items.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    for (const { value, text } of items) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        og.appendChild(opt);
    }
    select.appendChild(og);
}

// Split MiRA-computed attribute names by side (intra / inter) so the
// dropdown can show separate optgroups and users don't have to scan
// one long alphabetical list.
function splitMiraAttrs(attrs, computedSet) {
    const fromData = [], intra = [], inter = [];
    for (const a of attrs) {
        if (!computedSet.has(a)) { fromData.push(a); continue; }
        if (a.startsWith('inter_')) inter.push(a);
        else if (a.startsWith('intra_')) intra.push(a);
        else fromData.push(a); // fallback for any future computed attr that isn't intra/inter-prefixed
    }
    return { fromData, intra, inter };
}

// ---- Dropdowns ----
function populateDropdowns() {
    if (!model) return;

    const computedNode  = new Set(model.computedNodeAttributes || []);
    const computedState = new Set(model.computedStateNodeAttributes || []);

    // Node color options — grouped to help users navigate. Optgroups:
    //   "From data"            (raw attributes from the input file)
    //   "MiRA — intralayer"    (intra_* fields)
    //   "MiRA — interlayer"    (inter_* fields, only emitted when inter
    //                           links exist)
    nodeColorSelect.innerHTML = '<option value="">Default</option>';
    {
        const node  = splitMiraAttrs(model.nodeAttributeNames, computedNode);
        const state = splitMiraAttrs(model.stateNodeAttributeNames, computedState);
        const toItem = (prefix, src) => a => ({ value: `${src}:${a}`, text: `${prefix}: ${a}` });
        appendOptgroup(nodeColorSelect, 'From data', [
            ...node.fromData.map(toItem('Node', 'node')),
            ...state.fromData.map(toItem('State', 'state')),
        ]);
        appendOptgroup(nodeColorSelect, 'MiRA — intralayer', [
            ...node.intra.map(toItem('Node', 'node')),
            ...state.intra.map(toItem('State', 'state')),
        ]);
        appendOptgroup(nodeColorSelect, 'MiRA — interlayer', [
            ...node.inter.map(toItem('Node', 'node')),
            ...state.inter.map(toItem('State', 'state')),
        ]);
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

    // Per-set walks collect every attribute exposed on a node belonging to
    // that set, except (a) structural keys, and (b) MiRA-computed state-node
    // fields — those are network-wide so we add them to both sets explicitly.
    const STRUCTURAL_NODE_KEYS = new Set(['node_id', 'node_name']);
    const STRUCTURAL_STATE_KEYS = new Set(['layer_id', 'node_id', 'layer_name', 'node_name']);
    const computedStateSet = new Set(model.computedStateNodeAttributes || []);

    for (const [layerName, info] of model.bipartiteInfo) {
        if (!info.isBipartite) continue;
        hasBipartite = true;
        labelA = info.setALabel || labelA;
        labelB = info.setBLabel || labelB;
        for (const nodeName of info.setA) {
            const pn = model.nodesByName.get(nodeName);
            if (pn) Object.keys(pn).forEach(k => { if (!STRUCTURAL_NODE_KEYS.has(k)) setA_nodeAttrs.add(k); });
            const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`);
            if (sn) Object.keys(sn).forEach(k => { if (!STRUCTURAL_STATE_KEYS.has(k) && !computedStateSet.has(k)) setA_stateAttrs.add(k); });
        }
        for (const nodeName of info.setB) {
            const pn = model.nodesByName.get(nodeName);
            if (pn) Object.keys(pn).forEach(k => { if (!STRUCTURAL_NODE_KEYS.has(k)) setB_nodeAttrs.add(k); });
            const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`);
            if (sn) Object.keys(sn).forEach(k => { if (!STRUCTURAL_STATE_KEYS.has(k) && !computedStateSet.has(k)) setB_stateAttrs.add(k); });
        }
    }

    if (hasBipartite) {
        bipartiteColorLabelA.textContent = `Color by ${labelA}`;
        bipartiteColorLabelB.textContent = `Color by ${labelB}`;

        const toItem = (prefix, src) => a => ({ value: `${src}:${a}`, text: `${prefix}: ${a}` });
        const stateMira = splitMiraAttrs(model.computedStateNodeAttributes || [], computedState);

        const populateSet = (select, nodeAttrSet, stateAttrSet) => {
            const node = splitMiraAttrs([...nodeAttrSet], computedNode);
            appendOptgroup(select, 'From data', [
                ...node.fromData.map(toItem('Node', 'node')),
                ...[...stateAttrSet].map(toItem('State', 'state')),
            ]);
            appendOptgroup(select, 'MiRA — intralayer', [
                ...node.intra.map(toItem('Node', 'node')),
                ...stateMira.intra.map(toItem('State', 'state')),
            ]);
            appendOptgroup(select, 'MiRA — interlayer', [
                ...node.inter.map(toItem('Node', 'node')),
                ...stateMira.inter.map(toItem('State', 'state')),
            ]);
        };
        populateSet(nodeColorSelectSetA, setA_nodeAttrs, setA_stateAttrs);
        populateSet(nodeColorSelectSetB, setB_nodeAttrs, setB_stateAttrs);
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

    const sizeItem = (prefix, src) => a => ({ value: `${src}:${a}`, text: `${prefix}: ${a}` });

    {
        const numericNodeAttrs  = model.nodeAttributeNames.filter(a => isNumericAttr(a, model.nodes));
        const stateAttrCandidates = Object.keys(model.stateNodes[0] || {})
            .filter(a => !STRUCTURAL_STATE_KEYS.has(a));
        const numericStateAttrs = stateAttrCandidates.filter(a => isNumericAttr(a, model.stateNodes));

        const node  = splitMiraAttrs(numericNodeAttrs, computedNode);
        const state = splitMiraAttrs(numericStateAttrs, computedState);
        appendOptgroup(nodeSizeSelect, 'From data', [
            ...node.fromData.map(sizeItem('Node', 'node')),
            ...state.fromData.map(sizeItem('State', 'state')),
        ]);
        appendOptgroup(nodeSizeSelect, 'MiRA — intralayer', [
            ...node.intra.map(sizeItem('Node', 'node')),
            ...state.intra.map(sizeItem('State', 'state')),
        ]);
        appendOptgroup(nodeSizeSelect, 'MiRA — interlayer', [
            ...node.inter.map(sizeItem('Node', 'node')),
            ...state.inter.map(sizeItem('State', 'state')),
        ]);
    }

    // Bipartite size selects — only numeric attrs per set
    if (hasBipartite) {
        bipartiteSizeLabelA.textContent = `Size by ${labelA}`;
        bipartiteSizeLabelB.textContent = `Size by ${labelB}`;

        const stateMira = splitMiraAttrs(
            (model.computedStateNodeAttributes || []).filter(a => isNumericAttr(a, model.stateNodes)),
            computedState,
        );

        const populateSetSize = (select, nodeAttrSet, stateAttrSet) => {
            const numericNode = [...nodeAttrSet].filter(a => isNumericAttr(a, model.nodes));
            const numericState = [...stateAttrSet].filter(a => isNumericAttr(a, model.stateNodes));
            const node = splitMiraAttrs(numericNode, computedNode);
            appendOptgroup(select, 'From data', [
                ...node.fromData.map(sizeItem('Node', 'node')),
                ...numericState.map(sizeItem('State', 'state')),
            ]);
            appendOptgroup(select, 'MiRA — intralayer', [
                ...node.intra.map(sizeItem('Node', 'node')),
                ...stateMira.intra.map(sizeItem('State', 'state')),
            ]);
            appendOptgroup(select, 'MiRA — interlayer', [
                ...node.inter.map(sizeItem('Node', 'node')),
                ...stateMira.inter.map(sizeItem('State', 'state')),
            ]);
        };
        populateSetSize(nodeSizeSelectSetA, setA_nodeAttrs, setA_stateAttrs);
        populateSetSize(nodeSizeSelectSetB, setB_nodeAttrs, setB_stateAttrs);

        nodeSizeSelectSetA.disabled = nodeSizeSelectSetA.options.length <= 1;
        nodeSizeSelectSetB.disabled = nodeSizeSelectSetB.options.length <= 1;
    }


    // Link color options (both panels share the same attribute list)
    const linkOptHTML = '<option value="">Default</option>' +
        model.linkAttributeNames.map(a => `<option value="${a}">${a}</option>`).join('');
    intraLinkColorSelect.innerHTML = linkOptHTML;
    interLinkColorSelect.innerHTML = linkOptHTML;

    // Layer color options
    layerColorSelect.innerHTML = '<option value="">Default</option><option value="__individual__">Individual</option>';
    for (const attr of model.layerAttributeNames) {
        const opt = document.createElement('option');
        opt.value = attr;
        opt.textContent = attr;
        layerColorSelect.appendChild(opt);
    }
    layerColorSelect.disabled = false;

}

const layerColorPicker = document.getElementById('layerColorPicker');
layerColorPicker.addEventListener('input', () => {
    if (!layerColorSelect.value) updateLayerColors();
});

const nodeColorPicker = document.getElementById('nodeColorPicker');
nodeColorPicker.addEventListener('input', () => {
    if (!nodeColorSelect.value) updateNodeColors();
});

const intraLinkColorSelect  = document.getElementById('intraLinkColorSelect');
const intraLinkColorSwatches= document.getElementById('intraLinkColorSwatches');
const intraLinkColorPicker  = document.getElementById('intraLinkColorPicker');
const intraLinkWeightSlider = document.getElementById('intraLinkWeightSlider');
const intraLinkWeightLabel  = document.getElementById('intraLinkWeightLabel');
const interLinkColorSelect  = document.getElementById('interLinkColorSelect');
const interLinkColorSwatches= document.getElementById('interLinkColorSwatches');
const interLinkColorPicker  = document.getElementById('interLinkColorPicker');
const interlayerCurvatureSlider = document.getElementById('interlayerCurvatureSlider');
const interlayerWeightSlider    = document.getElementById('interlayerWeightSlider');
const interlayerWeightLabel     = document.getElementById('interlayerWeightLabel');
const filterInterPairsBtn   = document.getElementById('filterInterPairsBtn');
const interPairPanel        = document.getElementById('interPairPanel');
const interPairPanelHeader  = document.getElementById('interPairPanelHeader');
const interPairPanelBody    = document.getElementById('interPairPanelBody');
const interPairPanelClose   = document.getElementById('interPairPanelClose');

intraLinkColorPicker.addEventListener('input', () => { if (!intraLinkColorSelect.value) updateIntraLinkColors(); });
interLinkColorPicker.addEventListener('input', () => { if (!interLinkColorSelect.value) updateInterLinkColors(); });

intraLinkWeightSlider.addEventListener('input', () => {
    const val = parseFloat(intraLinkWeightSlider.value);
    renderer.intraMinWeight = val;
    intraLinkWeightLabel.textContent = val.toFixed(2);
    renderer.render();
});

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
    interArrowheadSizeSlider.value = arrowheadSizeSlider.value;
    renderer.render();
});

interArrowheadSizeSlider.addEventListener('input', () => {
    renderer.arrowheadSize = parseFloat(interArrowheadSizeSlider.value);
    arrowheadSizeSlider.value = interArrowheadSizeSlider.value;
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

intraLinkColorSelect.addEventListener('change', () => { updateIntraLinkColors(); renderer.render(); });
interLinkColorSelect.addEventListener('change', () => { updateInterLinkColors(); renderer.render(); });

// ── Interlayer layer-pair filter panel ───────────────────────────────────────

function _lerpHexToAmber(t) {
    // white (#fff) → amber (#f59e0b)
    const tr = Math.round(255 + (245 - 255) * t);
    const tg = Math.round(255 + (158 - 255) * t);
    const tb = Math.round(255 + (11  - 255) * t);
    return `rgb(${tr},${tg},${tb})`;
}

function _applyInterPairFilter() {
    if (_interPairFilter.size === 0) {
        renderer.interlayerLayerPairs = null;
    } else {
        const pairs = new Set();
        for (const key of _interPairFilter) {
            const [f, t] = key.split('::');
            pairs.add(`${f}::${t}`);
            pairs.add(`${t}::${f}`);
        }
        renderer.interlayerLayerPairs = pairs;
    }
    renderer.render();
}

function _renderInterPairHeatmap() {
    if (!model || !interPairPanelBody) return;
    const layerNames = model.layers.map(l => l.layer_name);
    const n = layerNames.length;
    const idx = Object.fromEntries(layerNames.map((ln, i) => [ln, i]));
    const dirInter = model.directedInterlayer ?? model.directed ?? false;

    const countMat = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const lk of model.interlayerLinks) {
        const i = idx[lk.layer_from], j = idx[lk.layer_to];
        if (i !== undefined && j !== undefined) {
            countMat[i][j]++;
            if (!dirInter) countMat[j][i]++;
        }
    }
    const maxCount = Math.max(...countMat.flat(), 1);

    const cellSize = n <= 8 ? 28 : n <= 14 ? 20 : n <= 22 ? 14 : 10;
    const maxLen   = Math.max(...layerNames.map(l => l.length));
    const LABEL_W  = Math.min(maxLen * 6.2 + 10, 130);
    const HDR_H    = Math.min(maxLen * 6.2 + 10, 120);
    const TEXT     = '#374151';
    const GRID     = '#e5e7eb';

    const SEL_COLOR = 'rgba(30,100,220,0.9)';
    const SEL_SW    = 3;

    let colLabels = '', rowLabels = '', cells = '', selOverlays = '';
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
            const fill = _lerpHexToAmber(t);
            const x    = LABEL_W + j * cellSize;
            const isSel = _interPairFilter.has(`${rowLn}::${colLn}`) || _interPairFilter.has(`${colLn}::${rowLn}`);
            const fs     = Math.min(10, cellSize * 0.27);
            const textFill = (1 - 0.7 * t) < 0.52 ? '#fff' : TEXT;
            cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="${GRID}" stroke-width="0.5" style="cursor:${cnt > 0 ? 'pointer' : 'default'}" data-from="${rowLn}" data-to="${colLn}"/>`;
            if (cellSize >= 14 && cnt > 0) {
                cells += `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + fs * 0.4}" text-anchor="middle" font-size="${fs}" fill="${textFill}" pointer-events="none">${cnt}</text>`;
            }
            if (isSel) {
                const half = SEL_SW / 2;
                selOverlays += `<rect x="${x + half}" y="${y + half}" width="${cellSize - SEL_SW}" height="${cellSize - SEL_SW}" fill="none" stroke="${SEL_COLOR}" stroke-width="${SEL_SW}" pointer-events="none"/>`;
            }
        });
    });

    const hmW = LABEL_W + n * cellSize;
    const hmH = HDR_H + n * cellSize;
    const hint = `<div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">Click to select · Cmd/Ctrl+click to multi-select</div>`;
    const clearBtn = _interPairFilter.size > 0
        ? `<button id="interPairClearBtn" style="font-size:11px;padding:3px 8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;margin-bottom:6px;">✕ Show all pairs</button>`
        : '';
    const svg = `<svg width="${hmW}" height="${hmH}" style="overflow:visible;display:block;">${colLabels}${rowLabels}${cells}${selOverlays}</svg>`;

    interPairPanelBody.innerHTML = clearBtn + hint + `<div style="overflow:auto;">${svg}</div>`;

    // Wire cell clicks
    interPairPanelBody.querySelectorAll('rect[data-from]').forEach(rect => {
        rect.addEventListener('click', (e) => {
            const from = rect.dataset.from, to = rect.dataset.to;
            const hasLinks = model.interlayerLinks.some(lk => {
                const fwd = lk.layer_from === from && lk.layer_to === to;
                const rev = !dirInter && lk.layer_from === to && lk.layer_to === from;
                return fwd || rev;
            });
            if (!hasLinks) return;

            const key  = `${from}::${to}`;
            const isSel = _interPairFilter.has(key) || _interPairFilter.has(`${to}::${from}`);

            if (e.metaKey || e.ctrlKey) {
                // Toggle this pair in/out of the multi-selection
                if (isSel) {
                    _interPairFilter.delete(key);
                    _interPairFilter.delete(`${to}::${from}`);
                } else {
                    _interPairFilter.add(key);
                }
            } else {
                // Regular click: replace selection, or deselect if sole pair
                _interPairFilter = (isSel && _interPairFilter.size === 1)
                    ? new Set()
                    : new Set([key]);
            }

            _applyInterPairFilter();
            _renderInterPairHeatmap();
        });
    });

    const clearBtnEl = interPairPanelBody.querySelector('#interPairClearBtn');
    if (clearBtnEl) {
        clearBtnEl.addEventListener('click', () => {
            _interPairFilter = new Set();
            _applyInterPairFilter();
            _renderInterPairHeatmap();
        });
    }
}

// Open / close floating panel
filterInterPairsBtn.addEventListener('click', () => {
    const open = interPairPanel.style.display !== 'none';
    if (open) {
        interPairPanel.style.display = 'none';
    } else {
        interPairPanel.style.display = '';
        _renderInterPairHeatmap();
    }
});
interPairPanelClose.addEventListener('click', () => { interPairPanel.style.display = 'none'; });

// Drag for interPairPanel — same pattern as mapLayerPanel
{
    let _ipDragging = false, _ipHasDragged = false;
    let _ipStartX, _ipStartY, _ipStartLeft, _ipStartTop;

    interPairPanelHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        _ipDragging = true; _ipHasDragged = false;
        _ipStartX = e.clientX; _ipStartY = e.clientY;
        const r = interPairPanel.getBoundingClientRect();
        _ipStartLeft = r.left; _ipStartTop = r.top;
        interPairPanel.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!_ipDragging) return;
        const dx = e.clientX - _ipStartX, dy = e.clientY - _ipStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _ipHasDragged = true;
        interPairPanel.style.left   = (_ipStartLeft + dx) + 'px';
        interPairPanel.style.top    = (_ipStartTop  + dy) + 'px';
        interPairPanel.style.right  = 'auto';
    });
    document.addEventListener('mouseup', () => {
        if (_ipDragging) { _ipDragging = false; interPairPanel.style.cursor = ''; }
    });
}



function _toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? null : n; }
    return null;
}

function _buildSizeScaleFn(val, entities, stateEntities) {
    if (!val) return null;
    const [source, attrName] = val.split(':');
    const items = source === 'node' ? entities : stateEntities;
    let minVal = Infinity, maxVal = -Infinity;
    for (const e of items) {
        const v = _toNumber(e[attrName]);
        if (v !== null) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
    }
    const range = maxVal - minVal;
    const scale = { type: 'size', min: minVal, max: maxVal, attrName };
    const compute = (v) => {
        const n = _toNumber(v);
        if (n === null) return 1.0;
        if (range === 0) return 1.0;
        return 0.3 + ((n - minVal) / range) * 1.7;
    };
    const fn = source === 'node'
        ? (layerName, nodeName) => { const n = model.nodesByName.get(nodeName); return n ? compute(n[attrName]) : 1.0; }
        : (layerName, nodeName) => { const sn = model.stateNodeMap.get(`${layerName}::${nodeName}`); return sn ? compute(sn[attrName]) : 1.0; };
    return { scale, fn };
}

function updateNodeSizes() {
    activeNodeSizeScale = null;
    activeNodeSizeScaleA = null;
    activeNodeSizeScaleB = null;

    if (!model) { renderer.nodeSizeFn = null; renderLegends(); return; }

    const isBipartiteLayout = layout.layoutType === 'bipartite';

    if (isClassicBipartiteUI()) {
        const resA = _buildSizeScaleFn(nodeSizeSelectSetA.value, model.nodes, model.stateNodes);
        const resB = _buildSizeScaleFn(nodeSizeSelectSetB.value, model.nodes, model.stateNodes);

        activeNodeSizeScaleA = resA?.scale || null;
        activeNodeSizeScaleB = resB?.scale || null;

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

    if (activeNodeSizeScale)  expandedLegends.add('nodeSize');
    if (activeNodeSizeScaleA) expandedLegends.add('nodeSizeA');
    if (activeNodeSizeScaleB) expandedLegends.add('nodeSizeB');
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

    if (isClassicBipartiteUI()) {
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
            const isSetA = info?.isBipartite && info.setA.has(nodeName);
            const isSetB = info?.isBipartite && info.setB.has(nodeName);

            if (isSetA) {
                if (scA) {
                    const [source, attrName] = valA.split(':');
                    const obj = source === 'node' ? model.nodesByName.get(nodeName) : model.stateNodeMap.get(`${layerName}::${nodeName}`);
                    return obj ? applyCategoryOverride(attrName, obj[attrName], scA.scaleFn(obj[attrName])) : '#6b7280';
                } else {
                    return colorMapper.getBipartiteNodeColor(true);
                }
            } else if (isSetB) {
                if (scB) {
                    const [source, attrName] = valB.split(':');
                    const obj = source === 'node' ? model.nodesByName.get(nodeName) : model.stateNodeMap.get(`${layerName}::${nodeName}`);
                    return obj ? applyCategoryOverride(attrName, obj[attrName], scB.scaleFn(obj[attrName])) : '#6b7280';
                } else {
                    return colorMapper.getBipartiteNodeColor(false);
                }
            }
            return '#6b7280'; // fallback
        };
        if (activeNodeColorScaleA) expandedLegends.add('nodeColorA');
        if (activeNodeColorScaleB) expandedLegends.add('nodeColorB');
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
            return node ? applyCategoryOverride(attrName, node[attrName], sc.scaleFn(node[attrName])) : '#6b7280';
        };
    } else if (source === 'state') {
        // Color by state node attribute
        const override = colorScaleOverrides.get(attrName);
        const sc = colorMapper.buildColorScale(model.stateNodes, attrName, override);
        activeNodeColorScale = sc;
        renderer.nodeColorFn = (layerName, nodeName) => {
            const key = `${layerName}::${nodeName}`;
            const sn = model.stateNodeMap.get(key);
            return sn ? applyCategoryOverride(attrName, sn[attrName], sc.scaleFn(sn[attrName])) : '#6b7280';
        };
    }

    if (activeNodeColorScale) expandedLegends.add('nodeColor');
    renderLegends();
}

function updateIntraLinkColors() {
    activeIntraLinkColorScale = null;
    const attrName = intraLinkColorSelect.value;
    intraLinkColorSwatches.style.display = attrName ? 'none' : 'flex';
    if (!attrName || !model) {
        renderer.intraLinkColorFn = null;
        renderer.defaultIntraColor = intraLinkColorPicker.value;
        renderLegends();
        return;
    }
    const override = colorScaleOverrides.get(attrName);
    const sc = colorMapper.buildColorScale(
        model.intralayerLinks.length ? model.intralayerLinks : model.extended, attrName, override);
    activeIntraLinkColorScale = sc;
    renderer.intraLinkColorFn = (link) => applyCategoryOverride(attrName, link[attrName], sc.scaleFn(link[attrName]));
    if (activeIntraLinkColorScale) expandedLegends.add('intraLinkColor');
    renderLegends();
}

function updateInterLinkColors() {
    activeInterLinkColorScale = null;
    const attrName = interLinkColorSelect.value;
    interLinkColorSwatches.style.display = attrName ? 'none' : 'flex';
    if (!attrName || !model) {
        renderer.interLinkColorFn = null;
        renderer.defaultInterColor = interLinkColorPicker.value;
        renderLegends();
        return;
    }
    const override = colorScaleOverrides.get(attrName);
    const sc = colorMapper.buildColorScale(
        model.interlayerLinks.length ? model.interlayerLinks : model.extended, attrName, override);
    activeInterLinkColorScale = sc;
    renderer.interLinkColorFn = (link) => applyCategoryOverride(attrName, link[attrName], sc.scaleFn(link[attrName]));
    if (activeInterLinkColorScale) expandedLegends.add('interLinkColor');
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
    layerColorSwatches.style.display = (!attrName) ? 'flex' : 'none';

    if (!model) { renderer.layerColorFn = null; activeLayerColorScale = null; renderer.render(); return; }

    if (attrName === '__individual__') {
        activeLayerColorScale = null;
        renderer.layerColorFn = (layerIndex, layer) => {
            const hex = layerColors.get(layer.layer_name) || '#8b5cf6';
            return { fill: _hexToRgba(hex, 0.35), border: _hexToRgba(hex, 0.7), text: hex };
        };
    } else if (attrName) {
        const override = colorScaleOverrides.get(attrName);
        const sc = colorMapper.buildColorScale(model.layers, attrName, override);
        activeLayerColorScale = sc;
        renderer.layerColorFn = (layerIndex, layer) => {
            const hex = applyCategoryOverride(attrName, layer[attrName], sc.scaleFn(layer[attrName]));
            return { fill: _hexToRgba(hex, 0.35), border: _hexToRgba(hex, 0.7), text: hex };
        };
    } else {
        activeLayerColorScale = null;
        const hex = layerColorPicker.value;
        renderer.layerColorFn = (layerIndex, layer) => (
            { fill: _hexToRgba(hex, 0.18), border: _hexToRgba(hex, 0.55), text: hex }
        );
    }
    if (activeLayerColorScale) expandedLegends.add('layerColor');
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
    if (appMode === 'metanetwork' && metaNetwork) {
        metaNetwork.viewScale = Math.min(metaNetwork.viewScale * 1.2, 10);
        _ensureMetaNetworkLoop();
        return;
    }
    const cx = cssW / 2;
    const cy = cssH / 2;
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
    if (appMode === 'metanetwork' && metaNetwork) {
        metaNetwork.viewScale = Math.max(metaNetwork.viewScale / 1.2, 0.05);
        _ensureMetaNetworkLoop();
        return;
    }
    const cx = cssW / 2;
    const cy = cssH / 2;
    const factor = 1 / 1.2;
    renderer.offsetX = cx - (cx - renderer.offsetX) * factor;
    renderer.offsetY = cy - (cy - renderer.offsetY) * factor;
    renderer.scale *= factor;
    renderer.render();
});

zoomResetBtn.addEventListener('click', () => {
    if (appMode === 'dashboard') return;

    if (appMode === 'data') {
        dataModeInstance?.clearFilters();
        return;
    }

    if (appMode === 'layer' && renderer.layerView) {
        if (renderer.layerView.geoMode) {
            const coords = model.layers
                .filter(l => l.latitude != null && l.longitude != null)
                .map(l => [l.latitude, l.longitude]);
            if (coords.length === 1) lvMap.setView(coords[0], 10);
            else if (coords.length > 1) lvMap.fitBounds(coords, { padding: [60, 60] });
            return;
        }
        renderer.layerView.resetLayout();
        const lr = renderer.layerView.layoutRadius();
        const margin = 60;
        const fitScale = Math.min(cssW, cssH) / (2 * (lr + margin));
        renderer.layerView.viewScale   = fitScale;
        renderer.layerView.viewOffsetX = 0;
        renderer.layerView.viewOffsetY = 0;
        _ensureLayerViewLoop();
        return;
    }

    if (appMode === 'metanetwork' && metaNetwork) {
        // Clear selection
        metaNetwork.state.selectedNode = null;
        metaNetwork.state.selectedEdge = null;
        metaNetwork._focusSet = null;
        crossModeSelectedNode = null;
        _updateFilterBanner();
        hideNodeInfo();
        // Fit viewport to current node positions
        const nodes = metaNetwork._mnNodes;
        if (nodes.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const n of nodes) {
                if (n.x != null) {
                    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
                    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
                }
            }
            const pad = 60;
            const rawW = (maxX - minX) || 1;
            const rawH = (maxY - minY) || 1;
            const scale = Math.min(
                (cssW  - 2 * pad) / rawW,
                (cssH - 2 * pad) / rawH,
                10
            );
            metaNetwork.viewScale   = scale;
            metaNetwork.viewOffsetX = -((minX + maxX) / 2) * scale;
            metaNetwork.viewOffsetY = -((minY + maxY) / 2) * scale;
        } else {
            metaNetwork.viewScale   = 1;
            metaNetwork.viewOffsetX = 0;
            metaNetwork.viewOffsetY = 0;
        }
        _ensureMetaNetworkLoop();
        return;
    }

    // Network and Map modes: full reset — visualization options + view
    resetVisualizationOptions();
    updateLayerColors();
    updateNodeColors();
    updateIntraLinkColors(); updateInterLinkColors();
    renderer.skewX = 0.7;
    renderer.skewY = 0.55;
    renderer.resetLayerOffsets();
    renderer.centerView();
    renderer.render();

    if (appMode === 'map') fitMapToLayers();
});

// ---- Node Info Panel ----
// Format any node/link/layer attribute value for display in the info panel.
// Maps render as small per-layer breakdowns; arrays as comma-joined values;
// numbers get a sensible decimal cap. Everything else stringifies normally.
function formatInfoValue(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (value instanceof Map) {
        if (value.size === 0) return '—';
        const parts = [];
        for (const [k, v] of value) {
            const fv = typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v;
            parts.push(`${k}: ${fv}`);
        }
        return parts.join(', ');
    }
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'number' && !Number.isInteger(value)) return value.toFixed(3);
    return String(value);
}

// Render an info-section with rows. Optional `collapsedByDefault` wraps the
// rows behind a click-to-expand header so the panel doesn't dominate the
// viewport when computed properties or long connection lists are present.
function renderInfoSection(title, rows, { collapsedByDefault = false } = {}) {
    if (!rows.length) return '';
    const id = `infosec-${Math.random().toString(36).slice(2, 9)}`;
    const body = rows.map(({ key, value }) =>
        `<div class="info-row"><span class="info-key">${key}</span><span class="info-value">${formatInfoValue(value)}</span></div>`
    ).join('');
    if (!collapsedByDefault) {
        return `<div class="info-section"><h4>${title}</h4>${body}</div>`;
    }
    return `<div class="info-section">
        <h4 class="info-toggle" data-target="${id}" style="cursor:pointer;user-select:none;"><span class="info-chevron">▸</span> ${title} <span style="font-weight:normal;color:#9ca3af;font-size:11px;">(click to expand)</span></h4>
        <div id="${id}" style="display:none;">${body}</div>
    </div>`;
}

function showNodeInfo(hit) {
    if (!model) return;

    const { layerName, nodeName } = hit;

    const physicalNode = model.nodesByName.get(nodeName);
    const stateNode = model.stateNodeMap.get(`${layerName}::${nodeName}`);
    const connectedLinks = model.extended.filter(
        l => (l.layer_from === layerName && l.node_from === nodeName) ||
            (l.layer_to === layerName && l.node_to === nodeName)
    );

    const computedNode  = new Set(model.computedNodeAttributes || []);
    const computedState = new Set(model.computedStateNodeAttributes || []);
    // `_by_layer` Maps and `layers_present` are MiRA-computed metadata too —
    // pin them to the computed bucket even though they aren't in the
    // dropdown-attribute marker arrays (those expose only scalar attributes).
    const COMPUTED_NODE_EXTRAS = new Set(['layers_present']);
    const isByLayerKey = k => k.endsWith('_by_layer');

    const STRUCTURAL_NODE = new Set(['node_id', 'node_name', 'layer_name']);
    const STRUCTURAL_STATE = new Set(['layer_id', 'node_id', 'layer_name', 'node_name']);

    infoTitle.textContent = nodeName;

    const dataNodeRows = [], computedNodeRows = [];
    if (physicalNode) {
        for (const [key, value] of Object.entries(physicalNode)) {
            if (STRUCTURAL_NODE.has(key)) continue;
            const isComputed = computedNode.has(key) || COMPUTED_NODE_EXTRAS.has(key) || isByLayerKey(key);
            (isComputed ? computedNodeRows : dataNodeRows).push({ key, value });
        }
    }

    const dataStateRows = [], computedStateRows = [];
    if (stateNode) {
        for (const [key, value] of Object.entries(stateNode)) {
            if (STRUCTURAL_STATE.has(key)) continue;
            (computedState.has(key) ? computedStateRows : dataStateRows).push({ key, value });
        }
    }

    const layerObj = model.layersByName.get(layerName);
    const layerRows = layerObj
        ? Object.entries(layerObj)
            .filter(([k]) => k !== 'layer_id')
            .map(([key, value]) => ({ key, value }))
        : [];

    let html = '';
    html += renderInfoSection('Node attributes', dataNodeRows);
    html += renderInfoSection('State node (in ' + layerName + ')', dataStateRows);
    html += renderInfoSection('Layer', layerRows);
    html += renderInfoSection('MiRA-computed', [...computedNodeRows, ...computedStateRows], { collapsedByDefault: true });

    if (connectedLinks.length > 0) {
        const items = connectedLinks.map(link => {
            const isFrom = link.node_from === nodeName && link.layer_from === layerName;
            const otherNode = isFrom ? link.node_to : link.node_from;
            const otherLayer = isFrom ? link.layer_to : link.layer_from;
            const isInter = link.layer_from !== link.layer_to;
            const label = isInter ? `${otherNode} (${otherLayer})` : otherNode;
            const extraAttrs = Object.entries(link)
                .filter(([k]) => !['layer_from', 'node_from', 'layer_to', 'node_to', 'weight', 'directed'].includes(k))
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => `${k}: ${formatInfoValue(v)}`)
                .join(', ');
            const suffix = extraAttrs ? ` [${extraAttrs}]` : '';
            const wTxt = link.weight !== undefined && link.weight !== 1 ? ` (w=${link.weight})` : '';
            return `<li>${label}${wTxt}${suffix}</li>`;
        }).join('');
        const id = `infosec-conn-${Math.random().toString(36).slice(2, 9)}`;
        html += `<div class="info-section">
            <h4 class="info-toggle" data-target="${id}" style="cursor:pointer;user-select:none;"><span class="info-chevron">▸</span> Connections (${connectedLinks.length}) <span style="font-weight:normal;color:#9ca3af;font-size:11px;">(click to expand)</span></h4>
            <ul class="info-connections" id="${id}" style="display:none;">${items}</ul>
        </div>`;
    }

    infoContent.innerHTML = html;
    infoPanel.classList.add('visible');
    infoPanel.classList.remove('collapsed');
    collapseInfoBtn.textContent = '›';

    // Wire up the toggle headers
    infoContent.querySelectorAll('.info-toggle').forEach(h => {
        h.addEventListener('click', () => {
            const tgt = document.getElementById(h.dataset.target);
            if (!tgt) return;
            const open = tgt.style.display !== 'none';
            tgt.style.display = open ? 'none' : '';
            const chevron = h.querySelector('.info-chevron');
            if (chevron) chevron.textContent = open ? '▸' : '▾';
        });
    });
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
    renderer.searchedNodeName = null;
    crossModeSelectedNode = null;
    if (metaNetwork) {
        metaNetwork.state.selectedNode = null;
        metaNetwork._focusSet = null;
    }
    hideNodeInfo();
    _updateFilterBanner();
    if (appMode === 'metanetwork' && metaNetwork) _mnRenderSync();
    else renderer.render();
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

// ---- EMLN mode UI setup ----
if (IS_EMLN) {
    const ONLINE_URL = 'https://mira.ecomplab.com/';

    // Replace data import buttons with message
    const btnRow = document.querySelector('#sectionData .btn-row');
    if (btnRow) {
        btnRow.innerHTML = `<div class="emln-data-msg">
            Network loaded from EMLN.<br>
            For example datasets and manual import, use the
            <a href="${ONLINE_URL}" target="_blank" rel="noopener">online version &#x2197;</a>
        </div>`;
    }

    // Swap "(Beta)" → "(EMLN)" in branding
    const betaEl = document.querySelector('.branding-beta');
    if (betaEl) betaEl.textContent = '(EMLN)';

}

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

    const stripPrefix = (text, prefix) => text.replace(new RegExp('^' + prefix + '\\s*', 'i'), '').trim();

    if (!isClassicBipartiteUI()) {
        renderScaleLegend(activeNodeColorScale, 'nodeColor', 'Node Color');
        renderScaleLegend(activeNodeSizeScale, 'nodeSize', 'Node Size');
    } else {
        const colorTitleA = stripPrefix(bipartiteColorLabelA.textContent, 'Color By');
        renderScaleLegend(activeNodeColorScaleA, 'nodeColorA', 'Node Color (' + colorTitleA + ')');

        const colorTitleB = stripPrefix(bipartiteColorLabelB.textContent, 'Color By');
        renderScaleLegend(activeNodeColorScaleB, 'nodeColorB', 'Node Color (' + colorTitleB + ')');

        const sizeTitleA = stripPrefix(bipartiteSizeLabelA.textContent, 'Size By');
        renderScaleLegend(activeNodeSizeScaleA, 'nodeSizeA', 'Node Size (' + sizeTitleA + ')');

        const sizeTitleB = stripPrefix(bipartiteSizeLabelB.textContent, 'Size By');
        renderScaleLegend(activeNodeSizeScaleB, 'nodeSizeB', 'Node Size (' + sizeTitleB + ')');
    }
    renderScaleLegend(activeIntraLinkColorScale, 'intraLinkColor', 'Intralayer Link Color');
    renderScaleLegend(activeInterLinkColorScale, 'interLinkColor', 'Interlayer Link Color');
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
        toggleBtn.className = 'ltp-pill';
        const isCont = scale.type === 'continuous';
        toggleBtn.innerHTML = `<span class="ltp-opt${isCont ? ' ltp-active' : ''}">Continuous</span><span class="ltp-opt${!isCont ? ' ltp-active' : ''}">Discrete</span>`;
        toggleBtn.title = 'Switch between Continuous and Discrete palettes';
        toggleBtn.onclick = () => {
            const newType = scale.type === 'continuous' ? 'categorical' : 'continuous';
            colorScaleOverrides.set(scale.attrName, newType);
            updateNodeColors();
            updateIntraLinkColors(); updateInterLinkColors();
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
            const swatch = document.createElement('input');
            swatch.type = 'color';
            swatch.className = 'legend-color-pick legend-no-drag';
            const overrideMap = categoryColorOverrides.get(scale.attrName);
            swatch.value = (overrideMap && overrideMap.has(val)) ? overrideMap.get(val) : col;
            swatch.title = `Change color for "${val}"`;
            swatch.addEventListener('input', () => {
                if (!categoryColorOverrides.has(scale.attrName)) {
                    categoryColorOverrides.set(scale.attrName, new Map());
                }
                categoryColorOverrides.get(scale.attrName).set(val, swatch.value);
                // The existing colorFn closures already call applyCategoryOverride,
                // so just re-render the canvas — no legend rebuild needed mid-interaction.
                renderer.render();
            });
            swatch.addEventListener('change', () => {
                // Picker closed/committed — rebuild legend so the swatch reflects the new color.
                updateNodeColors();
                updateIntraLinkColors(); updateInterLinkColors();
                updateLayerColors();
                renderer.render();
            });
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
            const grad = scale.gradient || 'linear-gradient(to right, rgb(68,1,84), rgb(49,104,142), rgb(53,183,121), rgb(253,231,37))';
            track.style.cssText = `height: 12px; border-radius: 6px; background: ${grad};`;
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

// ── Meta-network Legend ────────────────────────────────────────────────────

const MN_ICE_GRADIENT = 'linear-gradient(to right, #cde9f0, #6cb8d8, #0c6a9e, #092651, #060d35)';

function renderMetaNetworkLegend() {
    if (appMode !== 'metanetwork' || !metaNetwork) return;
    legendPanel.innerHTML = '';
    const nodes = metaNetwork._mnNodes;
    if (!nodes.length) return;

    const { colorBy, sizeBy } = metaNetwork.settings;
    const ATTR_LABELS = { participation: 'Participation', metaDegree: 'Meta-degree', uniform: 'Uniform' };

    // Ensure meta-network legend items are always shown expanded
    expandedLegends.add('mnColor');
    expandedLegends.add('mnSize');

    // ── Color legend
    if (colorBy !== 'uniform') {
        const vals = nodes.map(n => colorBy === 'participation' ? n.participation : n.metaDegree);
        const min  = Math.min(...vals), max = Math.max(...vals);
        const colorScale = {
            type: 'continuous', attrName: ATTR_LABELS[colorBy],
            min, max, canToggle: false,
            gradient: MN_ICE_GRADIENT,
        };
        renderScaleLegend(colorScale, 'mnColor', 'Node Color');
    }

    // ── Size legend
    if (sizeBy !== 'uniform') {
        const vals = nodes.map(n => sizeBy === 'participation' ? n.participation : n.metaDegree);
        const min  = Math.min(...vals), max = Math.max(...vals);
        const sizeScale = {
            type: 'size', attrName: ATTR_LABELS[sizeBy],
            min, max, canToggle: false,
        };
        renderScaleLegend(sizeScale, 'mnSize', 'Node Size');
    }
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
        toggleBtn.className = 'ltp-pill';
        const lv0 = renderer.layerView;
        const isCont = lv0 && lv0.settings.colorLegendType === 'continuous';
        toggleBtn.innerHTML = `<span class="ltp-opt${isCont ? ' ltp-active' : ''}">Continuous</span><span class="ltp-opt${!isCont ? ' ltp-active' : ''}">Discrete</span>`;
        toggleBtn.title = 'Switch between Continuous and Discrete display';
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

// ---- Tour ----
const tourBtn = document.getElementById('tourBtn');
tourBtn.addEventListener('click', startTour);
setTimeout(() => showBounceArrow(tourBtn, 'up'), 1200);

function showBounceArrow(el, dir) {
    if (dir === 'up') {
        const rect = el.getBoundingClientRect();
        const span = document.createElement('span');
        span.className = 'bounce-arrow-fixed';
        span.textContent = '⬆';
        span.style.left = `${rect.left + rect.width / 2 - 10}px`;
        span.style.top  = `${rect.bottom + 4}px`;
        document.body.appendChild(span);
        span.addEventListener('animationend', () => span.remove(), { once: true });
    } else {
        const span = document.createElement('span');
        span.className = 'bounce-arrow-inline';
        span.textContent = '⬅';
        el.appendChild(span);
        span.addEventListener('animationend', () => span.remove(), { once: true });
    }
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
  <li><b>Click a marker</b> to pop that layer into 3D space.</li>
  <li><b>Click ✕</b> on a popped layer to return it to the map.</li>
    <li><b>Scroll or click + / -</b> to zoom the map.</li>
  <li><b>Click+drag</b> to pan the map (carries 3D layers with it)</li>
  <li>Use the <b>Map</b> control strip below to adjust map settings.</li>
</ul>`,
    },
    layer: {
        title: '🔵 Layer Mode',
        body: `<p>Each layer is a bubble in a force-directed meta-graph with a micro-graph preview inside.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Click</b> a bubble — layer statistics panel</li>
  <li><b>Cmd/Ctrl + click</b> a second bubble — side-by-side comparison</li>
  <li><b>Drag</b> a bubble to pin it; <b>Reset</b> to unpin all</li>
  <li><b>Scroll or click + / -</b> to zoom the map.</li>
  <li><b>Click+drag</b> to pan the map.</li>
</ul>
<p><b>Blue lines</b> = interlayer links &nbsp;·&nbsp; <b>Gray lines</b> = shared nodes</p>`,
    },
    metanetwork: {
        title: 'Σ Meta-network Mode',
        body: `<p>All intralayer links are aggregated into a single flat network of unique nodes.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Click</b> a node — ego-network highlight + info panel</li>
  <li><b>Click</b> an edge — per-layer weight bar chart</li>
  <li><b>Scroll or click +/-</b> to zoom; drag background to pan</li>
  <li><b>Click+drag</b>to pan</li>
  <li>Use <b>Filter Layers</b> panel to show only links from selected layers</li>
</ul>
<p>Use the left panel to change aggregation, layout, color, and size.</p>`,
    },
    data: {
        title: '📋 Data Mode',
        body: `<p>Inspect raw data tables and create subsets that propagate to all visualization modes.</p>
<ul style="padding-left:16px;margin:8px 0;">
  <li><b>Tabs</b> — Nodes, State Nodes, Links, Layers</li>
  <li><b>Click a column header</b> — sort ascending/descending/reset</li>
  <li><b>Filter inputs</b> — text columns: substring match; numeric: <code>&gt;5</code>, <code>&lt;10</code>, <code>=3</code></li>
  <li><b>Click a row</b> to select it (highlights the node/layer in other modes)</li>
  <li><b>Export CSV</b> — downloads the currently filtered rows</li>
</ul>
<p>Active filters create a <b>subset</b> visible across all modes (yellow banner).</p>`,
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
<p></p>`,
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

// ---- Citation Dialog ----
const citeBtn         = document.getElementById('citeBtn');
const citeDialog      = document.getElementById('citeDialog');
const citeDialogClose = document.getElementById('citeDialogClose');
const citeDialogDone  = document.getElementById('citeDialogDone');

const openCiteDialog  = () => { citeDialog.style.display = 'flex'; };
const closeCiteDialog = () => { citeDialog.style.display = 'none'; };

citeBtn.addEventListener('click', openCiteDialog);
citeDialogClose.addEventListener('click', closeCiteDialog);
citeDialogDone.addEventListener('click', closeCiteDialog);
citeDialog.addEventListener('click', e => {
    if (e.target === citeDialog) closeCiteDialog();
});

const copyTextToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
    } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (__) {}
        document.body.removeChild(ta);
    }
};

citeDialog.querySelectorAll('.cite-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const which = btn.dataset.citeCopy;
        const block = citeDialog.querySelector(`.cite-block[data-cite-content="${which}"]`);
        if (!block) return;
        await copyTextToClipboard(block.textContent);
        const label = btn.querySelector('.cite-copy-label');
        btn.classList.add('copied');
        if (label) label.textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            if (label) label.textContent = 'Copy';
        }, 1500);
    });
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && citeDialog.style.display !== 'none') closeCiteDialog();
});

// ---- Legend Visibility Toggle ----
const toggleLegendBtn = document.getElementById('toggleLegendBtn');
let legendVisible = true;
toggleLegendBtn.addEventListener('click', () => {
    legendVisible = !legendVisible;
    legendPanel.style.display = legendVisible ? 'flex' : 'none';
    toggleLegendBtn.classList.toggle('active', !legendVisible);
});

// ---- Export dialog (PNG / JPG / PDF) ----
initExportManager({
    getRenderer: () => renderer,
    getAppMode:  () => appMode,
});


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
            crossModeSelectedNode = null;
            hideNodeInfo();
        }
        _updateFilterBanner();
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
    crossModeSelectedNode = firstLayer ? name : null;
    _nodeSelectedBySearch = true;
    if (firstLayer) showNodeInfo({ layerName: firstLayer, nodeName: name });
    _updateFilterBanner();
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

// ---- Session Save / Load ----

function getSessionState() {
    const rawData = model ? {
        directed: model.directed,
        directedInterlayer: model.directedInterlayer,
        layers: model.layers,
        nodes: model.nodes,
        extended: model.extended,
        state_nodes: model.stateNodes,
    } : null;

    const positionsArray = positions
        ? [...positions.entries()].map(([layerName, nodeMap]) => [layerName, [...nodeMap.entries()]])
        : null;

    return {
        version: 1,
        appMode,
        selectedNode: crossModeSelectedNode,
        rawData,
        positions: positionsArray,
        renderer: {
            skewX: renderer.skewX,
            skewY: renderer.skewY,
            scale: renderer.scale,
            offsetX: renderer.offsetX,
            offsetY: renderer.offsetY,
            layerSpacing: renderer.layerSpacing,
            stackMode: renderer.stackMode,
            nodeRadius: renderer.nodeRadius,
            showLabels: renderer.showLabels,
            transformNodes: renderer.transformNodes,
            labelSizePx: parseInt(labelSizeSlider.value),
            showLayerNames: renderer.showLayerNames,
            layerNameFontSize: renderer.layerNameFontSize,
            showSetNames: renderer.showSetNames,
            showInterlayerLinks: renderer.showInterlayerLinks,
            arrowheadSize: renderer.arrowheadSize,
            interlayerCurvature: renderer.interlayerCurvature,
            interlayerMinWeight: renderer.interlayerMinWeight,
            intraMinWeight: renderer.intraMinWeight,
            defaultIntraColor: renderer.defaultIntraColor,
            defaultInterColor: renderer.defaultInterColor,
            layerOffsets: [...renderer.layerOffsets.entries()],
            gridColumns: parseInt(gridColumnsSlider.value),
        },
        ui: {
            nodeColorSelect: nodeColorSelect.value,
            nodeColorSelectSetA: nodeColorSelectSetA.value,
            nodeColorSelectSetB: nodeColorSelectSetB.value,
            nodeSizeSelect: nodeSizeSelect.value,
            nodeSizeSelectSetA: nodeSizeSelectSetA.value,
            nodeSizeSelectSetB: nodeSizeSelectSetB.value,
            intraLinkColorSelect: intraLinkColorSelect.value,
            interLinkColorSelect: interLinkColorSelect.value,
            layerColorSelect: layerColorSelect.value,
            layerColorPicker: layerColorPicker.value,
            nodeColorPicker: nodeColorPicker.value,
            intraLinkColorPicker: intraLinkColorPicker.value,
            interLinkColorPicker: interLinkColorPicker.value,
            nodeSizeSlider: parseInt(nodeSizeSlider.value),
            layoutSelect: layoutSelect.value,
            bipartiteNestedCheckbox: bipartiteNestedCheckbox.checked,
            colorScaleOverrides: [...colorScaleOverrides.entries()],
            categoryColorOverrides: [...categoryColorOverrides.entries()].map(
                ([k, m]) => [k, [...m.entries()]]
            ),
            layerColors: [...layerColors.entries()],
        },
        layerView: renderer.layerView ? {
            settings: { ...renderer.layerView.settings },
            viewScale: renderer.layerView.viewScale,
            viewOffsetX: renderer.layerView.viewOffsetX,
            viewOffsetY: renderer.layerView.viewOffsetY,
            geoMode: renderer.layerView.geoMode,
        } : null,
        meta: {
            aggregation: mnAggregationSelect.value,
            layout: mnLayoutSelect.value,
            colorBy: mnColorBySelect.value,
            sizeBy: mnSizeBySelect.value,
            baseSize: parseFloat(mnBaseSizeSlider.value),
            minWeight: parseFloat(mnMinWeightSlider.value),
            nestedSort: mnNestedSortCheckbox.checked,
            showLabels: mnShowLabelsCheckbox.checked,
            labelSize: parseInt(mnLabelSizeSlider.value),
            uniformColor: mnUniformColorPicker.value,
            colorSetA: mnColorSetA.value,
            colorSetB: mnColorSetB.value,
            viewScale: metaNetwork ? metaNetwork.viewScale : 1,
            viewOffsetX: metaNetwork ? metaNetwork.viewOffsetX : 0,
            viewOffsetY: metaNetwork ? metaNetwork.viewOffsetY : 0,
        },
        map: {
            activeMapLayers: [...activeMapLayers],
            mapOpacity: parseFloat(mapOpacitySlider.value),
            showMapImage: showMapImageCheckbox.checked,
            showLocations: showLocationsCheckbox.checked,
            streetMap: streetMapCheckbox.checked,
            mapCenter: bgMap.getCenter(),
            mapZoom: bgMap.getZoom(),
            lvMapOpacity: parseFloat(lvMapOpacitySlider.value),
            lvShowMapImage: lvShowMapImageCheckbox.checked,
            lvStreetMap: lvStreetMapCheckbox.checked,
            lvMapCenter: lvMap.getCenter(),
            lvMapZoom: lvMap.getZoom(),
        },
        legend: {
            expandedLegends: [...expandedLegends],
            lvExpandedLegends: [...lvExpandedLegends],
        },
        filter: {
            nodeNames: dataMode.filteredNodeNames ? [...dataMode.filteredNodeNames] : null,
            layerNames: dataMode.filteredLayerNames ? [...dataMode.filteredLayerNames] : null,
            linkKeys: dataMode.filteredLinkKeys ? [...dataMode.filteredLinkKeys] : null,
            interPairFilter: [..._interPairFilter],
        },
    };
}

function _restoreLayerViewDOM(s) {
    lvSizeBy.value = s.sizeBy;
    lvColorBy.value = s.colorBy;
    lvUniformColor.value = s.uniformColor;
    lvUniformColorContainer.style.display = s.colorBy === 'uniform' ? '' : 'none';
    lvShowEdges.checked = s.showEdges;
    lvEdgeOptionsContainer.style.display = s.showEdges ? '' : 'none';
    lvEdgeMetric.value = s.edgeMetric;
    lvMinEdgeWeight.value = s.minEdgeWeight;
    lvMinEdgeWeightLabel.textContent = s.minEdgeWeight;
    lvEdgeLabels.checked = s.showEdgeLabels;
    lvShowLabels.checked = s.showLabels;
    lvFontSize.value = s.labelFontSize;
    lvSizeMult.value = s.sizeMultiplier;
    lvSizeMultLabel.textContent = s.sizeMultiplier.toFixed(1) + '×';
    lvSpacing.value = s.bubbleSpacing;
    lvSpacingLabel.textContent = s.bubbleSpacing.toFixed(1) + '×';
}

function restoreSessionState(state) {
    if (!state.rawData) return;

    // 1. Load data — resets mode, visual options, computes fresh positions
    loadData(state.rawData);

    // 2. Override positions with saved ones to restore exact layout
    if (state.positions) {
        positions = new Map(
            state.positions.map(([layerName, entries]) => [layerName, new Map(entries)])
        );
        renderer.setData(model, positions);
    }

    // 3. Renderer properties
    const rv = state.renderer;
    renderer.skewX = rv.skewX;
    renderer.skewY = rv.skewY;
    renderer.layerSpacing = rv.layerSpacing;
    setStackMode(rv.stackMode); // calls centerView() internally — restore scale/offset after
    renderer.scale = rv.scale;
    renderer.offsetX = rv.offsetX;
    renderer.offsetY = rv.offsetY;
    renderer.nodeRadius = rv.nodeRadius;
    renderer.showLabels = rv.showLabels;
    renderer.transformNodes = rv.transformNodes;
    renderer.labelFont = `${rv.labelSizePx}px Inter, system-ui, sans-serif`;
    renderer.showLayerNames = rv.showLayerNames;
    renderer.layerNameFontSize = rv.layerNameFontSize ?? 14;
    renderer.showSetNames = rv.showSetNames;
    renderer.showInterlayerLinks = rv.showInterlayerLinks;
    renderer.arrowheadSize = rv.arrowheadSize;
    renderer.interlayerCurvature = rv.interlayerCurvature;
    renderer.interlayerMinWeight = rv.interlayerMinWeight;
    renderer.intraMinWeight = rv.intraMinWeight ?? 0;
    renderer.defaultIntraColor = rv.defaultIntraColor;
    renderer.defaultInterColor = rv.defaultInterColor;
    renderer.layerOffsets = new Map(rv.layerOffsets);

    // 4. DOM — checkboxes and sliders
    showLabelsCheckbox.checked = rv.showLabels;
    labelSizeRow.style.display = rv.showLabels ? '' : 'none';
    labelSizeSlider.value = rv.labelSizePx;
    labelSizeLabel.textContent = rv.labelSizePx + 'px';
    transformNodesCheckbox.checked = rv.transformNodes;
    showLayerNamesCheckbox.checked = rv.showLayerNames;
    layerNameSizeSlider.value = rv.layerNameFontSize ?? 14;
    layerNameSizeLabel.textContent = (rv.layerNameFontSize ?? 14) + 'px';
    showSetNamesCheckbox.checked = rv.showSetNames;
    renderer.showInterlayerLinks = rv.showInterlayerLinks ?? false;
    showInterlayerCheckbox.checked = renderer.showInterlayerLinks;
    layerSpacingSlider.value = rv.layerSpacing;
    nodeSizeSlider.value = rv.nodeRadius;
    arrowheadSizeSlider.value = rv.arrowheadSize;
    interlayerCurvatureSlider.value = rv.interlayerCurvature;
    interlayerWeightSlider.value = rv.interlayerMinWeight;
    interlayerWeightLabel.textContent = rv.interlayerMinWeight.toFixed(2);
    intraLinkWeightSlider.value = rv.intraMinWeight ?? 0;
    intraLinkWeightLabel.textContent = (rv.intraMinWeight ?? 0).toFixed(2);

    // 5. DOM — color pickers
    const ui = state.ui;
    layerColorPicker.value = ui.layerColorPicker;
    nodeColorPicker.value = ui.nodeColorPicker;
    intraLinkColorPicker.value = ui.intraLinkColorPicker;
    interLinkColorPicker.value = ui.interLinkColorPicker;

    // 6. Layout
    layoutSelect.value = ui.layoutSelect;
    layout.layoutType = ui.layoutSelect;
    bipartiteNestedCheckbox.checked = ui.bipartiteNestedCheckbox;
    layout.bipartiteNested = ui.bipartiteNestedCheckbox;

    // 7. Color scale overrides
    colorScaleOverrides.clear();
    for (const [k, v] of ui.colorScaleOverrides) colorScaleOverrides.set(k, v);
    categoryColorOverrides.clear();
    for (const [k, entries] of ui.categoryColorOverrides) categoryColorOverrides.set(k, new Map(entries));
    // Per-layer color overrides set via Data Mode (defaults already populated by initLayerColors on load)
    if (ui.layerColors) {
        for (const [name, hex] of ui.layerColors) layerColors.set(name, hex);
    }

    // 8. Color/size dropdowns → rebuild render functions
    nodeColorSelect.value = ui.nodeColorSelect;
    nodeColorSelectSetA.value = ui.nodeColorSelectSetA;
    nodeColorSelectSetB.value = ui.nodeColorSelectSetB;
    nodeSizeSelect.value = ui.nodeSizeSelect;
    nodeSizeSelectSetA.value = ui.nodeSizeSelectSetA;
    nodeSizeSelectSetB.value = ui.nodeSizeSelectSetB;
    intraLinkColorSelect.value = ui.intraLinkColorSelect ?? '';
    interLinkColorSelect.value = ui.interLinkColorSelect ?? '';
    layerColorSelect.value = ui.layerColorSelect;
    updateNodeColors();
    updateNodeSizes();
    updateIntraLinkColors(); updateInterLinkColors();
    updateLayerColors();

    // 9. Restore cross-mode selected node
    crossModeSelectedNode = state.selectedNode ?? null;

    // 10. Legend
    expandedLegends.clear();
    for (const k of state.legend.expandedLegends) expandedLegends.add(k);
    lvExpandedLegends.clear();
    for (const k of state.legend.lvExpandedLegends) lvExpandedLegends.add(k);
    renderLegends();

    // 11. Meta-network DOM (takes effect next time it's opened)
    const mn = state.meta;
    mnAggregationSelect.value = mn.aggregation;
    mnLayoutSelect.value = mn.layout;
    mnColorBySelect.value = mn.colorBy;
    mnSizeBySelect.value = mn.sizeBy;
    mnBaseSizeSlider.value = mn.baseSize;
    mnBaseSizeLabel.textContent = mn.baseSize.toFixed(1) + '×';
    mnMinWeightSlider.value = mn.minWeight;
    mnMinWeightLabel.textContent = mn.minWeight.toFixed(2);
    mnNestedSortCheckbox.checked = mn.nestedSort;
    mnShowLabelsCheckbox.checked = mn.showLabels;
    mnLabelSizeSlider.value = mn.labelSize;
    mnLabelSizeLabel.textContent = mn.labelSize + 'px';
    if (mn.uniformColor) mnUniformColorPicker.value = mn.uniformColor;
    mnColorSetA.value = mn.colorSetA;
    mnColorSetB.value = mn.colorSetB;

    // 12. Map DOM
    const mp = state.map;
    mapOpacitySlider.value = mp.mapOpacity;
    showMapImageCheckbox.checked = mp.showMapImage;
    showLocationsCheckbox.checked = mp.showLocations;
    streetMapCheckbox.checked = mp.streetMap;
    lvMapOpacitySlider.value = mp.lvMapOpacity;
    lvShowMapImageCheckbox.checked = mp.lvShowMapImage;
    lvStreetMapCheckbox.checked = mp.lvStreetMap;

    // 13. Restore visualization mode
    if (state.appMode === 'map' && mapModeBtn.style.display !== 'none') {
        toggleMapMode();
        activeMapLayers.clear();
        for (const l of mp.activeMapLayers) activeMapLayers.add(l);
        updateMapModeViews();
        if (mp.mapZoom != null) bgMap.setView([mp.mapCenter.lat, mp.mapCenter.lng], mp.mapZoom, { animate: false });
    } else if (state.appMode === 'layer') {
        toggleLayerView();
        if (renderer.layerView && state.layerView) {
            const lv = renderer.layerView;
            Object.assign(lv.settings, state.layerView.settings);
            lv.viewScale = state.layerView.viewScale;
            lv.viewOffsetX = state.layerView.viewOffsetX;
            lv.viewOffsetY = state.layerView.viewOffsetY;
            _restoreLayerViewDOM(state.layerView.settings);
            if (state.layerView.geoMode) {
                _activateLvGeoMode();
                if (mp.lvMapZoom != null) lvMap.setView([mp.lvMapCenter.lat, mp.lvMapCenter.lng], mp.lvMapZoom, { animate: false });
            }
        }
    } else if (state.appMode === 'dashboard') {
        dashboardBtn.click();
    } else if (state.appMode === 'metanetwork') {
        metaNetworkBtn.click();
        if (metaNetwork) {
            // _syncMetaNetworkControls() inside toggleMetaNetwork() overwrites the DOM
            // with MetaNetwork defaults — apply saved settings directly to the object.
            metaNetwork.updateSetting('aggregation', mn.aggregation);
            metaNetwork.updateSetting('layout', mn.layout);
            metaNetwork.updateSetting('colorBy', mn.colorBy);
            metaNetwork.updateSetting('sizeBy', mn.sizeBy);
            metaNetwork.updateSetting('baseSize', mn.baseSize);
            metaNetwork.updateSetting('uniformColor', mn.uniformColor ?? metaNetwork.settings.uniformColor);
            metaNetwork.updateSetting('uniformColorA', mn.colorSetA);
            metaNetwork.updateSetting('uniformColorB', mn.colorSetB);
            metaNetwork.updateSetting('nestedSort', mn.nestedSort);
            metaNetwork.settings.minWeight = mn.minWeight;
            metaNetwork.settings.showLabels = mn.showLabels;
            metaNetwork.settings.labelFontSize = mn.labelSize;
            // Re-sync the DOM to reflect the restored settings
            _syncMetaNetworkControls();
            // _syncMetaNetworkControls resets minWeight slider to 0 — restore it
            mnMinWeightSlider.value = mn.minWeight;
            mnMinWeightLabel.textContent = mn.minWeight.toFixed(2);
            // Restore view transform (must be last — layout calls may call _fitView)
            if (mn.viewScale != null) {
                metaNetwork.viewScale = mn.viewScale;
                metaNetwork.viewOffsetX = mn.viewOffsetX;
                metaNetwork.viewOffsetY = mn.viewOffsetY;
            }
        }
    } else if (state.appMode === 'grid') {
        gridViewBtn.click();
        const cols = rv.gridColumns;
        if (cols && cols >= 1 && cols <= 8) {
            gridColumnsSlider.value = cols;
            gridColumnsLabel.textContent = cols;
            renderer._gridColumns = cols;
            renderer.render();
        }
    }

    // 14. Restore data filter
    if (state.filter) {
        dataMode.filteredNodeNames  = state.filter.nodeNames  ? new Set(state.filter.nodeNames)  : null;
        dataMode.filteredLayerNames = state.filter.layerNames ? new Set(state.filter.layerNames) : null;
        dataMode.filteredLinkKeys   = state.filter.linkKeys   ? new Set(state.filter.linkKeys)   : null;
        _updateFilterBanner();
        if (state.filter.interPairFilter?.length) {
            _interPairFilter = new Set(state.filter.interPairFilter);
            _applyInterPairFilter();
        }
    }

    _applyCrossModeSelectionToRenderer();
    _updateSelectedNodeBanner();
    renderer.render();
}

// ---- Session button wiring ----
const saveSessionBtn = document.getElementById('saveSessionBtn');
const loadSessionBtn = document.getElementById('loadSessionBtn');
const sessionFileInput = document.getElementById('sessionFileInput');

saveSessionBtn.addEventListener('click', () => {
    if (!model) { alert('No data loaded to save.'); return; }
    saveSession(getSessionState());
});

loadSessionBtn.addEventListener('click', () => sessionFileInput.click());

sessionFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const state = await loadSession(file);
        if (!state.version || !state.rawData) throw new Error('Invalid session file.');
        restoreSessionState(state);
    } catch (err) {
        alert('Failed to load session: ' + err.message);
    }
    e.target.value = '';
});

const loadSessionUrlBtn = document.getElementById('loadSessionUrlBtn');
loadSessionUrlBtn.addEventListener('click', async () => {
    const url = prompt('Paste session URL:');
    if (!url) return;
    try {
        const state = await loadSessionFromUrl(url.trim());
        if (!state.version || !state.rawData) throw new Error('Invalid session file.');
        restoreSessionState(state);
    } catch (err) {
        alert('Failed to load session from URL: ' + err.message);
    }
});

// ---- Auto-load session from ?session=<url> URL parameter ----
(async () => {
    const sessionUrl = new URLSearchParams(window.location.search).get('session');
    if (!sessionUrl) return;
    try {
        const state = await loadSessionFromUrl(sessionUrl);
        if (!state.version || !state.rawData) throw new Error('Invalid session file.');
        restoreSessionState(state);
    } catch (err) {
        console.error('Failed to load session from URL:', err);
        alert('Failed to load session from URL: ' + err.message);
    }
})();
