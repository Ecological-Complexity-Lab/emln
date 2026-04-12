# MultilayerViz

[![Project Status: Active](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)

An interactive, browser-based visualization tool for multilayer networks. Fully integrated into the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package via `plot_multilayer()`, and available as a standalone web app.

## Features

- **Network Mode** — 3D stacked-layer canvas with rotate, pan, drag, hover, and selection.
- **Map Mode** — layers placed on an interactive Leaflet world map using geographic coordinates.
- **Layer Mode** — meta-graph where each layer is a force-directed bubble with micro-graph previews and side-by-side comparison panels.
- **Dashboard Mode** — analytics panels: KPI cards, per-layer charts, presence matrix, Jaccard similarity heatmaps, degree distributions, node participation, and set-size ratio (bipartite).

## Getting Started

The app uses ES Modules and must be served over HTTP — it cannot be opened via `file://`.

```bash
git clone https://github.com/Ecological-Complexity-Lab/multilayer_viz.git
cd multilayer_viz
python3 -m http.server 8000
# Open http://localhost:8000
```

Or use the live version at [https://ecological-complexity-lab.github.io/multilayer_viz/](https://ecological-complexity-lab.github.io/multilayer_viz/).

## Documentation

Full feature reference, JSON data format, and CSV import guide: **[docs/manual.html](docs/manual.html)** (also accessible via the **?** button inside the app).

## R Package Integration

This visualizer is bundled inside the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package. Export a multilayer object directly to the visualizer format with:

```r
multilayer_to_json(net, file = "my_network.json", bipartite = TRUE)
```

| Dataset | Type | Layers | Notes |
|---|---|---|---|
| Directed | Directed unipartite | 3 | Minimal directed example |
| Large Scale | Undirected | 3 | High node count stress test |
| Simple Bipartite | Undirected bipartite | 2 | Minimal bipartite example |
| Complex Bipartite (Bartomeus) | Undirected bipartite | 4 | Real pollination network |
| Pond Ecosystem | Undirected | 4 | Multi-trophic food-web |
| **Synthetic Bipartite** | Undirected bipartite | **10** | Generated pollinator-plant network with clustered layers and one isolated layer |
| **Synthetic Unipartite** | Directed unipartite | **10** | Generated social/influence network with overlapping actor groups, a bridging layer, and one isolated layer |

The two synthetic 10-layer datasets are specifically designed to showcase **Layer View** with interlayer structure, shared nodes, and disconnected components.
