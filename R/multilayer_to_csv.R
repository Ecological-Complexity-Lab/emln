#' Export a multilayer network to CSV files
#'
#' Writes an EMLN \code{multilayer} object as a set of CSV files consumed
#' by MiRA's CSV importer. Three files are always written; a fourth
#' (\code{<prefix>_state_nodes.csv}) is added when per-(layer, node)
#' attributes are present.
#'
#' @param multilayer A multilayer object (created by
#'   \code{create_multilayer_network} or \code{load_emln}).
#' @param dir Directory to write the CSV files to. Created if it does not
#'   already exist.
#' @param prefix Character. File name prefix. Defaults to \code{"network"}.
#'   Three files are always written:
#'   \code{<prefix>_edges.csv}, \code{<prefix>_layers.csv},
#'   \code{<prefix>_nodes.csv}.
#'   A fourth file \code{<prefix>_state_nodes.csv} is written when the
#'   multilayer object contains per-(layer, node) attributes beyond
#'   \code{layer_name} and \code{node_name} (e.g. abundance,
#'   module).
#' @param bipartite Logical. Whether the network is bipartite. Defaults to
#'   \code{FALSE}. When \code{TRUE}, the nodes table must contain a
#'   \code{node_type} (or legacy \code{node_group}) column with exactly two
#'   distinct values across the network, and a \code{bipartite} column is
#'   written to the layers CSV.
#' @param setA_type Optional character. The \code{node_type} value to render
#'   as Set A (top row) in MiRA's bipartite layout. By ecological convention
#'   this is the higher trophic level (e.g. \code{"pollinator"},
#'   \code{"parasite"}, \code{"disperser"}). Only used when
#'   \code{bipartite = TRUE}; written as a \code{setA_type} column in the
#'   layers CSV. If \code{NULL} (default), MiRA falls back to alphabetical
#'   ordering of the two types.
#' @param directed Logical or NULL. Whether the network is directed. If NULL
#'   (default), auto-detected by checking intralayer edge symmetry.
#'
#' @note
#' MiRA (Multilayer Interactive Rendering Application) is a browser-based
#' interactive visualization tool for multilayer networks, available at
#' \url{https://mira.ecomplab.com/}.
#'
#' If you use MiRA in published research, please cite:
#' Nehorai S, Bloch Y and Pilosof S. Interactively visualizing biological
#' multilayer networks using MiRA. (forthcoming)
#'
#' Feedback and bug reports:
#' \url{https://github.com/Ecological-Complexity-Lab/MiRA/issues}.
#'
#' @return Invisibly returns a named character vector of file paths written
#'   (\code{edges}, \code{layers}, \code{nodes}, and optionally
#'   \code{state_nodes}).
#'
#' @details
#' The CSV files follow the schema accepted by MiRA's CSV importer:
#' \itemize{
#'   \item \strong{edges}: \code{layer_from, node_from, layer_to, node_to,
#'     weight} (+ any extra link attributes).
#'   \item \strong{layers}: \code{layer_id, layer_name} (+ \code{latitude,
#'     longitude, bipartite} and any extra layer attributes).
#'   \item \strong{nodes}: \code{node_name} (+ \code{node_type} and any extra
#'     physical node attributes, same across all layers).
#'     \code{node_group} is renamed to \code{node_type}.
#'   \item \strong{state_nodes} (written only when extra per-(layer, node)
#'     attributes exist): \code{layer_name, node_name} + extra columns.
#'     Use this when the same node has different attribute values in
#'     different layers (e.g. abundance, module membership).
#' }
#' The \code{directed} flag is not written to the CSV files; it is a property
#' you specify in MiRA's CSV import dialog at load time.
#'
#' @seealso \code{\link{multilayer_to_json}}, \code{\link{plot_multilayer}}
#'
#' @export
#'
#' @examples
#' \donttest{
#' net <- load_emln(14)
#' multilayer_to_csv(net, dir = "tests/out/", prefix = "kefi", bipartite = TRUE)
#' }
multilayer_to_csv <- function(multilayer, dir, prefix = "network",
                              bipartite = FALSE, setA_type = NULL,
                              directed = NULL) {

  if (!inherits(multilayer, "multilayer")) {
    stop("Input must be a multilayer object (class 'multilayer').")
  }
  if (!is.logical(bipartite) || length(bipartite) != 1) {
    stop("`bipartite` must be a single TRUE/FALSE value.")
  }
  if (!is.character(dir) || length(dir) != 1) {
    stop("`dir` must be a single directory path.")
  }
  if (!is.null(setA_type)) {
    if (!is.character(setA_type) || length(setA_type) != 1 || is.na(setA_type)) {
      stop("`setA_type` must be a single character string or NULL.")
    }
    if (!isTRUE(bipartite)) {
      warning("`setA_type` is only used when bipartite = TRUE; ignoring.")
      setA_type <- NULL
    }
  }

  message("Please report issues at ",
          "https://github.com/Ecological-Complexity-Lab/MiRA/issues")

  if (!dir.exists(dir)) {
    dir.create(dir, recursive = TRUE)
  }

  # ---- Nodes ----
  nodes_df <- as.data.frame(multilayer$nodes)
  # Canonicalize legacy names -> node_type.
  # Precedence: node_type > node_group > type.
  if (!("node_type" %in% names(nodes_df))) {
    if ("node_group" %in% names(nodes_df)) {
      names(nodes_df)[names(nodes_df) == "node_group"] <- "node_type"
    } else if ("type" %in% names(nodes_df)) {
      names(nodes_df)[names(nodes_df) == "type"] <- "node_type"
    }
  }
  # Dedupe by node_name
  if ("node_name" %in% names(nodes_df)) {
    nodes_df <- nodes_df[!duplicated(nodes_df$node_name), , drop = FALSE]
  }

  # Bipartite validation (match multilayer_to_json semantics)
  if (isTRUE(bipartite)) {
    if (!("node_type" %in% names(nodes_df))) {
      stop("bipartite = TRUE but the nodes table has no `node_type` ",
           "(or legacy `node_group`) column.")
    }
    distinct_types <- unique(nodes_df$node_type)
    distinct_types <- distinct_types[!is.na(distinct_types)]
    if (length(distinct_types) != 2) {
      stop(sprintf(
        "bipartite = TRUE requires exactly 2 distinct values in `node_type` (found %d).",
        length(distinct_types)
      ))
    }
  }

  # ---- Layers ----
  layers_df <- as.data.frame(multilayer$layers)
  layers_df <- layers_df[, names(layers_df) != "name", drop = FALSE]
  if (isTRUE(bipartite)) {
    layers_df$bipartite <- TRUE
    if (!is.null(setA_type)) {
      type_values <- unique(nodes_df$node_type)
      type_values <- type_values[!is.na(type_values)]
      if (!(setA_type %in% type_values)) {
        stop(sprintf(
          paste0("`setA_type = \"%s\"` does not match any node_type in the ",
                 "network (found: %s)."),
          setA_type, paste(type_values, collapse = ", ")
        ))
      }
      layers_df$setA_type <- setA_type
    }
  }

  # ---- Edges (extended list) ----
  edges_df <- as.data.frame(multilayer$extended)

  # ---- State nodes (optional) ----
  # Write a state_nodes CSV when the multilayer object carries per-(layer, node)
  # attributes beyond the identity columns (layer_name, node_name, layer_id,
  # node_id).  These differ from physical node attributes because the same node
  # can have different values in different layers (e.g. abundance, module).
  state_nodes_path <- NULL
  state_nodes_df   <- NULL
  if (!is.null(multilayer$state_nodes)) {
    sn <- as.data.frame(multilayer$state_nodes)
    core_cols <- c("layer_id", "node_id", "layer_name", "node_name")
    extra_cols <- setdiff(names(sn), core_cols)
    if (length(extra_cols) > 0) {
      keep <- intersect(c("layer_name", "node_name", extra_cols), names(sn))
      state_nodes_df   <- sn[, keep, drop = FALSE]
      state_nodes_path <- file.path(dir, paste0(prefix, "_state_nodes.csv"))
    }
  }

  # ---- Write files ----
  edges_path  <- file.path(dir, paste0(prefix, "_edges.csv"))
  layers_path <- file.path(dir, paste0(prefix, "_layers.csv"))
  nodes_path  <- file.path(dir, paste0(prefix, "_nodes.csv"))

  utils::write.csv(edges_df,  edges_path,  row.names = FALSE, na = "")
  utils::write.csv(layers_df, layers_path, row.names = FALSE, na = "")
  utils::write.csv(nodes_df,  nodes_path,  row.names = FALSE, na = "")

  paths <- c(edges = edges_path, layers = layers_path, nodes = nodes_path)

  if (!is.null(state_nodes_path)) {
    utils::write.csv(
      state_nodes_df, state_nodes_path, row.names = FALSE, na = ""
    )
    paths <- c(paths, state_nodes = state_nodes_path)
    message(sprintf("Wrote:\n  %s\n  %s\n  %s\n  %s",
                    edges_path, layers_path, nodes_path, state_nodes_path))
  } else {
    message(sprintf("Wrote:\n  %s\n  %s\n  %s",
                    edges_path, layers_path, nodes_path))
  }

  if (!is.null(directed)) {
    message(sprintf(
      "Note: directed=%s is not stored in the CSV files; set it in ",
      directed
    ), "MiRA's CSV import dialog at load time.")
  }

  invisible(paths)
}
