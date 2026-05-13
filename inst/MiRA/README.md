# MiRA — Multilayer Interactive Rendering Application

[![Project Status: Active](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![Lifecycle: stable](https://img.shields.io/badge/lifecycle-stable-brightgreen.svg)](https://lifecycle.r-lib.org/articles/stages.html)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![R package: emln](https://img.shields.io/badge/R%20package-emln-blue.svg)](https://github.com/Ecological-Complexity-Lab/emln)
[![arXiv](https://img.shields.io/badge/arXiv-2605.09597-b31b1b.svg)](https://doi.org/10.48550/arXiv.2605.09597)

An interactive, browser-based visualization tool for multilayer networks. While developed with biology in mind, MiRA can render any multilayer network. Available as a standalone web app and also fully integrated into the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package.


## 📝 Citation
If you use MiRA to explore your networks as part of your published research or to produce figures, please cite our preprint:

Nehoray SM, Bloch Y and Pilosof S (2026). **Interactively visualizing biological multilayer networks using MiRA**. _arXiv_:2605.09597 [cs.SI]. [https://doi.org/10.48550/arXiv.2605.09597](https://doi.org/10.48550/arXiv.2605.09597)

<details>
<summary>BibTeX</summary>

```bibtex
@article{Nehoray2026,
  title        = {Interactively visualizing biological multilayer networks using {MiRA}},
  author       = {Nehoray, Shir Miryam and Bloch, Yuval and Pilosof, Shai},
  journal      = {arXiv [cs.SI]},
  year         = {2026},
  eprint       = {2605.09597},
  archivePrefix= {arXiv},
  primaryClass = {cs.SI},
  doi          = {10.48550/arXiv.2605.09597},
  url          = {https://doi.org/10.48550/arXiv.2605.09597}
}
```
</details>

## 📄 Documentation and help

Full feature reference, data format guide, and controls reference: **[mira.ecomplab.com/docs/manual.html](https://mira.ecomplab.com/docs/manual.html)** (also accessible via the **?** button inside the app).

## ✨ Visualization modes

- **Network Mode** — 3D stacked-layer canvas with rotate, pan, drag, hover, and selection.
- **Map Mode** — layers placed on an interactive Leaflet world map using geographic coordinates.
- **Grid View** — small-multiples matrix layout: each layer in its own panel, all sharing the same color and selection state. Ideal for comparing intralayer structure across many layers simultaneously.
- **Layer View** — meta-graph where each layer is a force-directed bubble with micro-graph previews and side-by-side comparison panels.
- **Meta-Network Mode** — aggregated single-layer view of cross-layer connectivity.
- **Dashboard Mode** — analytics panels: KPI cards, per-layer charts, presence matrix, Jaccard similarity heatmaps, degree distributions, link weight distributions, node participation, and bipartite set-size ratios.
- **Data Mode** — tabular inspection and subsetting of nodes, links, and layer attributes.

### Best visualization practices:
Multilayer networks are inherently complex. Unlike monolayer networks, which can be visualized in 2D, the 3D representation of multilayer networks adds visual complexity. Therefore, while it is possible to load large networks, visualizing small to medium-sized networks is more effective. The more layers and interlayer links present, the more entangled the visualization will be. Furthermore, visualizations heavily loaded with links will be slower to interact with (e.g., dragging and navigating the network). **MiRA** is designed to help you manage this complexity — for example, by allowing you to set thresholds on visualized links, apply different layouts, and by using summary visualizations such as *Layer View*, *Grid View*, and *Meta-Network* modes, and by filtering layers, nodes, and links in Data mode. For detailed guidance on choosing the right mode and managing visual complexity, see the [Visualization Guidelines](https://mira.ecomplab.com/docs/manual.html#guidelines) section of the manual.

## 🚀 Loading MiRA

### 🌐 Online
Use the live version at [https://mira.ecomplab.com/](https://mira.ecomplab.com/).

### 💻 Locally
The app uses ES Modules and must be served over HTTP — it cannot be opened via `file://`.

```bash
git clone https://github.com/Ecological-Complexity-Lab/MiRA.git
cd MiRA
python3 -m http.server 8000
# Open http://localhost:8000
```

## 🗂️ Built-in Example Datasets

Nine empirical multilayer networks are bundled for immediate exploration, from six biological domains, covering pollination, host–parasite interactions, seed dispersal, gene recombination, human disease, brain connectivity, plasmid sharing, and protein–protein interactions. See the full list and references in the [manual](https://mira.ecomplab.com/docs/manual.html).

## 📥 Import Your Own Multilayer Network

- **JSON** — native format.
- **CSV** — extended edge list + optional layer and node attribute files.

See the [manual](https://mira.ecomplab.com/docs/manual.html#data-import) for schemas.

## 🔗 Integration with the R Package `emln`

MiRA is bundled inside the [`emln`](https://github.com/Ecological-Complexity-Lab/emln) R package. Launch directly from R with:

```r
plot_multilayer(net, bipartite = TRUE, directed = FALSE)
```

Or export to JSON/CSV for manual loading:

```r
multilayer_to_json(net, file = "my_network.json", bipartite = TRUE)
multilayer_to_csv(net, path = "my_network/")
```

## App development process
We developed the MiRA codebase using an AI-assisted workflow. Initial scaffolding and iterative feature implementation were carried out using Claude Code (Anthropic), an agentic AI programming tool, with Claude Sonnet~4.6 used for routine implementation tasks and Claude Opus~4 used for complex architectural decisions and refactoring. Human oversight was applied throughout: all AI-generated code was reviewed, debugged, and revised. We paid particular attention to calculation of properties, domain-specific logic, including bipartite layout computation, geographic placement of layers, multilayer data structure validation, and EMLN integration. The codebase was audited periodically to identify inconsistencies between behavior and documentation, to enforce modularity via refactoring, and to remove redundancy introduced during iterative development.

## Feedback and issues

Feedback and bug reports are welcome at [GitHub Issues](https://github.com/Ecological-Complexity-Lab/MiRA/issues).

## 📄 License

MiRA is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

You are free to share and adapt this work for **non-commercial purposes**, provided you give appropriate credit and distribute any derivative works under the same license.
