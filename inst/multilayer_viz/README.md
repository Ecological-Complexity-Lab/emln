# MultilayerViz

[![Project Status: Active](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![Lifecycle: beta](https://img.shields.io/badge/lifecycle-beta-orange.svg)](https://lifecycle.r-lib.org/articles/stages.html)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![R package: emln](https://img.shields.io/badge/R%20package-emln-blue.svg)](https://github.com/Ecological-Complexity-Lab/emln)
[![Paper coming soon](https://img.shields.io/badge/paper-coming%20soon-yellow.svg)](#)

An interactive, browser-based visualization tool for multilayer networks. Fully integrated into the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package via `plot_multilayer()`, and available as a standalone web app.

> **Beta notice:** MultilayerViz is currently in beta (development). A dedicated paper is forthcoming. Feedback and bug reports are welcome at [GitHub Issues](https://github.com/Ecological-Complexity-Lab/multilayer_viz/issues).

## ✨ Features

- **Network Mode** — 3D stacked-layer canvas with rotate, pan, drag, hover, and selection.
- **Map Mode** — layers placed on an interactive Leaflet world map using geographic coordinates. A draggable *Select Layers* panel handles datasets where multiple layers share the same location.
- **Layer View** — meta-graph where each layer is a force-directed bubble with micro-graph previews and side-by-side comparison panels. Geographic mode pins bubbles to real-world coordinates.
- **Dashboard Mode** — analytics panels: KPI cards, per-layer charts, presence matrix, Jaccard similarity heatmaps, degree distributions, link weight distributions, node participation, and bipartite set-size ratios.

## 🚀 Getting Started

### 🌐 Online
Use the live version at [https://ecological-complexity-lab.github.io/multilayer_viz/](https://ecological-complexity-lab.github.io/multilayer_viz/).

### 💻 Locally
The app uses ES Modules and must be served over HTTP — it cannot be opened via `file://`.

```bash
git clone https://github.com/Ecological-Complexity-Lab/multilayer_viz.git
cd multilayer_viz
python3 -m http.server 8000
# Open http://localhost:8000
```

## 🗂️ Built-in Example Datasets

Six empirical ecological multilayer networks are bundled for immediate exploration, covering pollination, seed dispersal, food webs, and host–parasite systems. See the full list and references in the [manual](docs/manual.html).

## 📥 Import Your Own Multilayer Network

- **JSON** — native format; see the [manual](docs/manual.html) for the schema.
- **CSV** — extended edge list + optional layer and node attribute files, matching the output of `emln::create_multilayer_network()`.

## 📖 Documentation

Full feature reference, JSON/CSV data format, and controls guide: **[docs/manual.html](docs/manual.html)** (also accessible via the **?** button inside the app).

## 🔗 Integration with the R Package `emln`

This visualizer is bundled inside the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package. Launch directly from R with:

```r
plot_multilayer(net, bipartite = TRUE, directed = FALSE)
```

Or export to JSON/CSV for manual loading:

```r
multilayer_to_json(net, file = "my_network.json", bipartite = TRUE)
multilayer_to_csv(net, path = "my_network/")
```
