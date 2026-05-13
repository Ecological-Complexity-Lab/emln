# *News*

# emln 1.2.0 (2026-05-13)

## changes
* Includes latest MiRA code (v1.0.0) 
* Updated MiRA citation across `plot_multilayer()`, `multilayer_to_json()`, and `multilayer_to_csv()` to reference the arXiv preprint (Nehoray et al. 2026, [arXiv:2605.09597](https://doi.org/10.48550/arXiv.2605.09597)).
* README refresh: dropped the devtools-installation badge in favor of a CRAN status badge, added a MiRA preprint badge, and expanded the visualizer section to describe MiRA's seven modes.
* Consolidate EMLN package website code to be in the same repo as the package.


# emln 1.1.0 (2026-04-20)

## Changes
* Code standards changes and unit testing, to prepare for CRAN release.

# emln 1.0.3 (2026-03-24)

## Changes

* Change layer_attributes argument in create_multilayer_network to be more flexible. 
  also ban column name "name" to avoid confusion with "layer_name".

# emln 1.0.2 (2025-01-19)

## Bug fixes

* Now supports layers without intralayer edges.
* `get_igraph` now returns for each layer only nodes existing in that layer.

# emln 1.0.1 (2023-09-21)

Initial Release to GitHub.

