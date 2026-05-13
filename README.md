![](https://img.shields.io/badge/R--CMD--CHK-Passed-green.svg)  [![Project Status: Active - The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active) ![](https://img.shields.io/badge/version-1.2.0-blue.svg) [![CRAN status](https://www.r-pkg.org/badges/version/emln)](https://CRAN.R-project.org/package=emln)  [![](https://img.shields.io/badge/lifecycle-stable-brightgreen.svg)](https://lifecycle.r-lib.org/articles/stages.html#stable) [![](https://img.shields.io/badge/doi-10.1111/2041--210X.14225-orange.svg)](https://doi.org/10.1111/2041-210X.14225) [![](https://img.shields.io/badge/MiRA-arXiv%3A2605.09597-b31b1b.svg)](https://doi.org/10.48550/arXiv.2605.09597)

# :wave: About
**This repository contains the code for the R package EMLN.** EMLN standardizes workflows for creating, storing, and converting multilayer network data, and ships with a collection of empirical ecological multilayer datasets ready for analysis. It also provides interactive, browser-based visualization through its integration with **[MiRA](https://mira.ecomplab.com/)**, launched directly from R via `plot_multilayer()`. Although designed with ecological data in mind, EMLN is flexible and can handle data from other research domains.

# :page_facing_up: Paper and citing
Frydman N, Freilikhman S, Talpaz I, Pilosof S. **Practical guidelines and the EMLN R package for handling ecological multilayer networks**. Methods in Ecology and Evolution. 2023. [DOI:10.1111/2041-210X.14225](https://besjournals.onlinelibrary.wiley.com/doi/10.1111/2041-210X.14225). Please cite the paper when implementing the guidelines we describe or when using the package, this helps us a lot!

# :package: Installation
EMLN is available on CRAN. Installation is as follows:
```R
install.packages("emln")
```


# :globe_with_meridians: Website
Detailed explanations on workflows accompanied by examples for handling monolayer and multilayer data using emln are in: [emln.ecomplab.com](https://emln.ecomplab.com/).

# :spider_web: Interactively visualizaing multilayer networks
EMLN integrates **[MiRA](https://mira.ecomplab.com/)** (Multilayer Interactive Rendering Application), a browser-based, installation-free visualizer launched from R via `plot_multilayer()`, or by exporting with `multilayer_to_json()` / `multilayer_to_csv()`. MiRA offers seven complementary modes — Network (3D), Map, Grid View, Layer View, Meta-Network, Dashboard, and Data — with interactive rotation, filtering, color/size mapping, and bipartite support, plus nine bundled empirical datasets.

If you use MiRA in your published research, please cite the MiRA preprint:

Nehoray SM, Bloch Y, Pilosof S (2026). **Interactively visualizing biological multilayer networks using MiRA**. *arXiv*:2605.09597 [cs.SI]. [https://doi.org/10.48550/arXiv.2605.09597](https://doi.org/10.48550/arXiv.2605.09597)
