![](https://img.shields.io/badge/R--CMD--CHK-Passed-green.svg)  [![Project Status: Active - The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active) ![](https://img.shields.io/badge/devtools%20installation-v1.0-yellow.svg)  [![](https://img.shields.io/badge/lifecycle-stable-brightgreen.svg)](https://lifecycle.r-lib.org/articles/stages.html#stable) [![](https://img.shields.io/badge/doi-10.1111/2041--210X.14225-orange.svg)](https://doi.org/10.1111/2041-210X.14225)

# :wave: About
**This repository contains the code for the R package EMLN.** EMLN is an R package that standardizes workflows for creating, storing and converting mulilayer network data. It also contains data sets of ecological multilayer networks for analysis. Although designed with ecological dcata in mind, it is flexible and can handle data from other research domains.

# :page_facing_up: Paper and citing
Frydman N, Freilikhman S, Talpaz I, Pilosof S. **Practical guidelines and the EMLN R package for handling ecological multilayer networks**. Methods in Ecology and Evolution. 2023. [DOI:10.1111/2041-210X.14225](https://besjournals.onlinelibrary.wiley.com/doi/10.1111/2041-210X.14225). Please cite the paper when implementing the guidelines we describe or when using the package, this helps us a lot!

# :package: Installation
Current installation uses devtools. CRAN version will come next.

```R
package.list=c("tidyverse", "magrittr","igraph","Matrix","DT","hablar","devtools")
loaded <-  package.list %in% .packages()
package.list <-  package.list[!loaded]
installed <-  package.list %in% .packages(TRUE)
if (!all(installed)) install.packages(package.list[!installed],repos="http://cran.rstudio.com/")

devtools::install_github('Ecological-Complexity-Lab/emln', force=T)
library(emln)
```


# :globe_with_meridians: Website
Detailed explanations on workflows accomanied by examples for handling monolayer and multilayer data using emln are in: [https://ecological-complexity-lab.github.io/emln_package/](https://ecological-complexity-lab.github.io/emln_package/).
