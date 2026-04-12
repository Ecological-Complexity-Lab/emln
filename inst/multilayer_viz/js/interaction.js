/**
 * interaction.js — Handles user input: zoom, 3D rotation, pan, click, hover
 *
 * Controls:
 *   Left-drag on empty space → 3D rotation (adjust skewX/skewY)
 *   Shift + Left-drag → Pan
 *   Mouse wheel → Zoom
 *   Left-click on node → Select node
 *   Double-click empty → Deselect
 */

export class InteractionHandler {
    constructor(canvas, renderer, callbacks = {}) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.callbacks = callbacks; // { onNodeSelect, onNodeHover }

        this.isPanning = false;
        this.isRotating = false;
        this.isDraggingLayer = false;
        this.dragLayerIndex = -1;
        this.dragStartX = 0;
        this.dragStartY = 0;

        // Per-frame delta tracking
        this.prevX = 0;
        this.prevY = 0;

        // Pan state
        this.panStartOffsetX = 0;
        this.panStartOffsetY = 0;

        // Rotation state
        this.rotStartSkewX = 0;
        this.rotStartSkewY = 0;

        // Layer drag state
        this.layerDragStartDx = 0;
        this.layerDragStartDy = 0;

        this._bindEvents();
    }

    _bindEvents() {
        // Prevent context menu on right-click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Mouse wheel → zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;

            if (this.renderer.layerViewMode && this.renderer.layerView) {
                const lv = this.renderer.layerView;
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                const oldScale = lv.viewScale;
                const newScale = Math.max(0.1, Math.min(10, oldScale * zoomFactor));
                lv.viewOffsetX = (mx - cx) - (mx - cx - lv.viewOffsetX) * (newScale / oldScale);
                lv.viewOffsetY = (my - cy) - (my - cy - lv.viewOffsetY) * (newScale / oldScale);
                lv.viewScale = newScale;
                this.renderer.render();
                return;
            }

            // Zoom toward cursor (network mode)
            const oldScale = this.renderer.scale;
            const newScale = Math.max(0.2, Math.min(5, oldScale * zoomFactor));

            this.renderer.offsetX = mx - (mx - this.renderer.offsetX) * (newScale / oldScale);
            this.renderer.offsetY = my - (my - this.renderer.offsetY) * (newScale / oldScale);
            this.renderer.scale = newScale;

            this.renderer.render();
        }, { passive: false });

        // Mouse down → start rotation, pan, layer drag, or select
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.renderer.layerViewMode) return;
            if (e.button !== 0) return; // only handle left-click

            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Record start position for drag detection
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;

            // Record previous position for delta panning
            this.prevX = e.clientX;
            this.prevY = e.clientY;

            // Cmd+click (Mac) or Ctrl+click (Win/Linux) → drag layer
            if (e.metaKey || e.ctrlKey) {
                const layerIdx = this.renderer.hitTestLayer(mx, my);
                if (layerIdx >= 0) {
                    this.isDraggingLayer = true;
                    this.dragLayerIndex = layerIdx;
                    const existing = this.renderer.layerOffsets.get(layerIdx) || { dx: 0, dy: 0 };
                    this.layerDragStartDx = existing.dx;
                    this.layerDragStartDy = existing.dy;
                    this.canvas.style.cursor = 'grabbing';
                    e.preventDefault();
                    return;
                }
            }

            // Check if clicking a node or link
            const downHit = this.renderer.konvaHitAt(mx, my);
            if (downHit.type === 'node') {
                this.renderer.selectedNode = downHit.data;
                this.renderer.selectedLink = null;
                this.renderer.selectedLayer = null;
                if (this.callbacks.onNodeSelect) {
                    this.callbacks.onNodeSelect(downHit.data);
                }
                this.renderer.render();
                return;
            }
            if (downHit.type === 'link') {
                this.renderer.selectedNode = null;
                this.renderer.selectedLink = downHit.data;
                this.renderer.selectedLayer = null;
                if (this.callbacks.onLinkSelect) {
                    this.callbacks.onLinkSelect(downHit.data);
                }
                this.renderer.render();
                return;
            }

            // Shift+drag → pan
            if (e.shiftKey) {
                this.isPanning = true;
                this.isRotating = false;
                this.panStartOffsetX = this.renderer.offsetX;
                this.panStartOffsetY = this.renderer.offsetY;
                this.canvas.style.cursor = 'grabbing';
                return;
            }

            // Normal drag → 3D rotation
            this.isRotating = true;
            this.isPanning = false;
            this.rotStartSkewX = this.renderer.skewX;
            this.rotStartSkewY = this.renderer.skewY;
            this.canvas.style.cursor = 'move';
        });

        // Mouse up → stop rotation, pan, or layer drag; also detect layer clicks
        this.canvas.addEventListener('mouseup', (e) => {
            if (this.renderer.layerViewMode) return;
            const wasDragging = this.isRotating || this.isPanning || this.isDraggingLayer;
            this.isRotating = false;
            this.isPanning = false;
            this.isDraggingLayer = false;
            this.dragLayerIndex = -1;
            this.canvas.style.cursor = 'grab';

            // Check if this was a click (not a drag) — for layer selection
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            if (dx * dx + dy * dy < 100) { // 10px threshold
                const rect = this.canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                // Don't fire layer select if a node or link was clicked
                const upHit = this.renderer.konvaHitAt(mx, my);
                if (upHit.type !== 'node' && upHit.type !== 'link') {
                    const layerIdx = this.renderer.hitTestLayer(mx, my);
                    if (layerIdx >= 0) {
                        this.renderer.selectedNode = null;
                        this.renderer.selectedLink = null;
                        this.renderer.selectedLayer = layerIdx;
                        if (this.callbacks.onLayerSelect) {
                            this.callbacks.onLayerSelect(layerIdx);
                        }
                        this.renderer.render();
                    }
                }
            }
        });

        // Mouse move → rotate, pan, layer drag, or hover
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.renderer.layerViewMode) return;
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Layer dragging
            if (this.isDraggingLayer) {
                const ddx = e.clientX - this.dragStartX;
                const ddy = e.clientY - this.dragStartY;
                this.renderer.layerOffsets.set(this.dragLayerIndex, {
                    dx: this.layerDragStartDx + ddx,
                    dy: this.layerDragStartDy + ddy,
                });
                this.renderer.render();
                return;
            }

            // 3D rotation drag
            if (this.isRotating) {
                const dx = e.clientX - this.dragStartX;
                const dy = e.clientY - this.dragStartY;

                // Map horizontal drag to skewX, vertical drag to skewY
                const sensitivity = 0.003;
                this.renderer.skewX = this.rotStartSkewX + dx * sensitivity;
                this.renderer.skewY = Math.max(-0.8, Math.min(0.8,
                    this.rotStartSkewY - dy * sensitivity));

                this.renderer.render();
                return;
            }

            // Panning drag
            if (this.isPanning) {
                if (this.renderer.isMapMode && this.renderer.bgMap) {
                    const dx = e.clientX - this.dragStartX;
                    const dy = e.clientY - this.dragStartY;
                    this.renderer.bgMap.panBy([-dx, -dy], { animate: false });
                    this.dragStartX = e.clientX;
                    this.dragStartY = e.clientY;
                } else {
                    this.renderer.offsetX = this.panStartOffsetX + (e.clientX - this.dragStartX);
                    this.renderer.offsetY = this.panStartOffsetY + (e.clientY - this.dragStartY);
                    this.renderer.render();
                }
                return;
            }

            // Hover detection
            const prevHoveredNode = this.renderer.hoveredNode;
            const prevHoveredLink = this.renderer.hoveredLink;

            const hoverHit = this.renderer.konvaHitAt(mx, my);
            const hitNode = hoverHit.type === 'node' ? hoverHit.data : null;
            const hitLink = hoverHit.type === 'link' ? hoverHit.data : null;

            this.renderer.hoveredNode = hitNode;
            this.renderer.hoveredLink = hitLink;

            if (hitNode || hitLink) {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.canvas.style.cursor = 'grab';
            }

            // Only re-render if hover state changed
            let changed = false;
            if (hitNode !== prevHoveredNode) {
                if (!hitNode || !prevHoveredNode || hitNode.layerName !== prevHoveredNode.layerName || hitNode.nodeName !== prevHoveredNode.nodeName) {
                    changed = true;
                }
            }
            if (hitLink !== prevHoveredLink) {
                changed = true;
            }

            if (changed) {
                if (this.callbacks.onNodeHover) {
                    this.callbacks.onNodeHover(hitNode);
                }
                this.renderer.render();
            }

            this.prevX = e.clientX;
            this.prevY = e.clientY;
        });

        this.canvas.addEventListener('mouseleave', () => {
            if (this.renderer.layerViewMode) return;
            this.isPanning = false;
            this.isRotating = false;
            this.isDraggingLayer = false;
            this.dragLayerIndex = -1;
            this.renderer.hoveredNode = null;
            this.renderer.hoveredLink = null;
            this.canvas.style.cursor = 'grab';
            this.renderer.render();
        });

        // Double-click on empty space to deselect
        this.canvas.addEventListener('dblclick', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const dblHit = this.renderer.konvaHitAt(mx, my);
            if (dblHit.type !== 'node' && dblHit.type !== 'link') {
                this.renderer.selectedNode = null;
                this.renderer.selectedLink = null;
                if (this.callbacks.onNodeSelect) {
                    this.callbacks.onNodeSelect(null);
                }
                if (this.callbacks.onLinkSelect) {
                    this.callbacks.onLinkSelect(null);
                }
                this.renderer.render();
            }
        });
    }
}
