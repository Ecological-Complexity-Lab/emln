![](https://img.shields.io/badge/devtools%20installation-v1.0-blue.svg)  ![](https://img.shields.io/badge/R--CMD--CHK-Passed-green.svg)  [![Project Status: Active - The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)

# :wave: About
**This repository contains the code for the R package EMLN.** EMLN is an R package that standardizes workflows for creating, storing and converting mulilayer network data. It also contains data sets of ecological multilayer networks for analysis. Although designed with ecological dcata in mind, it is flexible and can handle data from other research domains.

# :page_facing_up: Paper and citing
TITLE/DOI. Please cite it when using the package.

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
