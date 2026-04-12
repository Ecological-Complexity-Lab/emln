#' Export a multilayer network to JSON
#'
#' Converts an EMLN \code{multilayer} object to JSON format compatible with the
#' Multilayer Network Visualizer web app.
#'
#' @param multilayer A multilayer object (created by \code{create_multilayer_network}
#'   or \code{load_emln}).
#' @param file Optional file path to write the JSON to. If NULL, returns the JSON
#'   string.
#' @param bipartite Logical. Whether the network is bipartite. Defaults to
#'   \code{FALSE}. The visualizer no longer auto-detects bipartite structure —
#'   you must set this to \code{TRUE} explicitly. When \code{TRUE}, the nodes
#'   table must contain a \code{node_type} (or legacy \code{node_group}) column
#'   with exactly two distinct values across the network. Any \code{node_group}
#'   column is renamed to \code{node_type} in the output regardless of the
#'   bipartite flag (canonical name for the visualizer).
#' @param directed Logical or NULL. Whether the network is directed. If NULL
#'   (default), auto-detected by checking edge list symmetry.
#'
#' @note The Multilayer Network Visualizer that this function targets is
#'   currently in beta. Feedback and bug reports are welcome at
#'   \url{https://github.com/ecomplab/emln/issues}.
#'
#' @return If \code{file} is NULL, returns the JSON string invisibly.
#'   If \code{file} is specified, writes JSON to disk and returns the file path
#'   invisibly.
#'
#' @details
#' The JSON output contains four arrays matching the visualizer's expected format:
#' \itemize{
#'   \item \code{nodes}: Physical nodes with \code{node_id}, \code{node_name}, and
#'     any extra attributes. For bipartite networks, \code{node_group} is mapped to
#'     \code{node_type}.
#'   \item \code{layers}: Layer metadata with \code{layer_id}, \code{layer_name},
#'     and extra attributes. For bipartite networks, a \code{bipartite: true} flag
#'     is added.
#'   \item \code{extended}: The extended edge list with \code{layer_from},
#'     \code{node_from}, \code{layer_to}, \code{node_to}, \code{weight}, and any
#'     link attributes. For directed networks, a \code{directed: true} flag is
#'     added to each link.
#'   \item \code{state_nodes}: State node map with \code{layer_id}, \code{node_id},
#'     \code{layer_name}, \code{node_name}.
#' }
#'
#' @seealso \code{plot_multilayer, create_multilayer_network, load_emln}
#'
#' @export
#' @import dplyr
#' @import tibble
#'
#' @examples
#' \dontrun{
#' # Export to file
#' net <- load_emln(14)
#' multilayer_to_json(net, file = "my_network.json", bipartite = TRUE)
#'
#' # Get JSON string
#' json_str <- multilayer_to_json(net)
#' }

multilayer_to_json <- function(multilayer, file = NULL, bipartite = FALSE, directed = NULL) {

  if (!inherits(multilayer, "multilayer")) {
    stop("Input must be a multilayer object (class 'multilayer').")
  }

  if (!is.logical(bipartite) || length(bipartite) != 1) {
    stop("`bipartite` must be a single TRUE/FALSE value (auto-detection has been removed).")
  }

  message("Note: The Multilayer Network Visualizer is currently in beta. ",
          "Please report issues at https://github.com/ecomplab/emln/issues")

  # Resolve canonical type column. Precedence: node_type > node_group > type.
  # node_group and type are legacy names from older emln data.
  nodes_names <- names(multilayer$nodes)
  type_col <- if ("node_type" %in% nodes_names) "node_type"
              else if ("node_group" %in% nodes_names) "node_group"
              else if ("type" %in% nodes_names) "type"
              else NA_character_

  if (isTRUE(bipartite)) {
    if (is.na(type_col)) {
      stop("bipartite = TRUE but the nodes table has no `node_type` ",
           "(or legacy `node_group` / `type`) column.")
    }
    distinct_types <- unique(multilayer$nodes[[type_col]])
    distinct_types <- distinct_types[!is.na(distinct_types)]
    if (length(distinct_types) != 2) {
      stop(sprintf(
        paste0("bipartite = TRUE requires exactly 2 distinct values in `%s`",
               " (found %d: %s).\n",
               "If this network is not bipartite, use bipartite = FALSE."),
        type_col,
        length(distinct_types),
        paste(utils::head(distinct_types, 5), collapse = ", ")
      ))
    }
  }

  # ---- Auto-detect directed ----
  if (is.null(directed)) {
    # Check intralayer edge symmetry: if every (a->b) has a matching (b->a), it's undirected
    intra <- multilayer$extended %>%
      dplyr::filter(layer_from == layer_to)
    if (nrow(intra) > 0) {
      # Create a set of "layer|from|to" keys
      fwd_keys <- paste(intra$layer_from, intra$node_from, intra$node_to, sep = "|")
      rev_keys <- paste(intra$layer_from, intra$node_to, intra$node_from, sep = "|")
      directed <- !all(fwd_keys %in% rev_keys)
    } else {
      directed <- FALSE
    }
    message(sprintf("Auto-detected %s network.", ifelse(directed, "directed", "undirected")))
  }

  # ---- Build nodes array ----
  nodes_df <- as.data.frame(multilayer$nodes)
  # Canonicalize legacy names -> node_type (visualizer's canonical name).
  # Precedence: node_type > node_group > type.
  if (!("node_type" %in% names(nodes_df))) {
    if ("node_group" %in% names(nodes_df)) {
      names(nodes_df)[names(nodes_df) == "node_group"] <- "node_type"
    } else if ("type" %in% names(nodes_df)) {
      names(nodes_df)[names(nodes_df) == "type"] <- "node_type"
    }
  }
  # Dedupe by node_name — the visualizer expects one physical node per row
  if ("node_name" %in% names(nodes_df)) {
    nodes_df <- nodes_df[!duplicated(nodes_df$node_name), , drop = FALSE]
  }
  # Ensure node_id column exists
  if (!("node_id" %in% names(nodes_df))) {
    nodes_df$node_id <- seq_len(nrow(nodes_df))
  }

  # ---- Build layers array ----
  layers_df <- as.data.frame(multilayer$layers)
  # Drop legacy 'name' column — layer_name is canonical
  layers_df <- layers_df[, names(layers_df) != "name", drop = FALSE]
  # Add bipartite flag
  if (bipartite) {
    layers_df$bipartite <- TRUE
  }

  # ---- Build extended edge list ----
  extended_df <- as.data.frame(multilayer$extended)
  # Ensure layer_from/layer_to use layer names (not IDs)
  # The extended edge list from create_multilayer_network already uses names.
  # From load_emln it also uses names (layer_1, layer_2, etc.)

  # Directed flag is set at the top level of the JSON (see below); no need
  # to tag each link individually.

  # ---- Build state_nodes array ----
  state_nodes_df <- as.data.frame(multilayer$state_nodes)
  # Backfill layer_name from layer_id if missing (older multilayer objects
  # sometimes store only the id)
  if (!("layer_name" %in% names(state_nodes_df)) &&
      "layer_id" %in% names(state_nodes_df) &&
      "layer_name" %in% names(layers_df)) {
    state_nodes_df$layer_name <- layers_df$layer_name[
      match(state_nodes_df$layer_id, layers_df$layer_id)
    ]
  }
  # Backfill node_id from node_name via the deduped nodes table
  if (!("node_id" %in% names(state_nodes_df)) &&
      "node_name" %in% names(state_nodes_df)) {
    state_nodes_df$node_id <- nodes_df$node_id[
      match(state_nodes_df$node_name, nodes_df$node_name)
    ]
  }
  # Backfill layer_id from layer_name
  if (!("layer_id" %in% names(state_nodes_df)) &&
      "layer_name" %in% names(state_nodes_df) &&
      "layer_id" %in% names(layers_df)) {
    state_nodes_df$layer_id <- layers_df$layer_id[
      match(state_nodes_df$layer_name, layers_df$layer_name)
    ]
  }
  core_cols <- c("layer_id", "node_id", "layer_name", "node_name")
  available_cols <- intersect(core_cols, names(state_nodes_df))
  state_nodes_df <- state_nodes_df[, available_cols, drop = FALSE]

  # ---- Assemble JSON ----
  json_list <- list(
    directed = directed,
    nodes = .df_to_list_of_rows(nodes_df),
    layers = .df_to_list_of_rows(layers_df),
    extended = .df_to_list_of_rows(extended_df),
    state_nodes = .df_to_list_of_rows(state_nodes_df)
  )

  json_str <- .to_json(json_list)

  # ---- Output ----
  if (!is.null(file)) {
    writeLines(json_str, con = file)
    message(sprintf("JSON written to: %s", file))
    return(invisible(file))
  }

  return(invisible(json_str))
}


# ---- Internal helpers (no external JSON dependency) ----

#' Convert a data.frame to a list of named lists (one per row)
#' @keywords internal
.df_to_list_of_rows <- function(df) {
  lapply(seq_len(nrow(df)), function(i) {
    row <- as.list(df[i, , drop = FALSE])
    # Remove NA values to keep JSON clean
    row <- row[!sapply(row, function(x) is.na(x) || length(x) == 0)]
    row
  })
}

#' Minimal JSON serializer (no dependency on jsonlite)
#'
#' Converts an R list structure to a JSON string.
#' Supports: lists, vectors, strings, numbers, logicals, NULL.
#' @keywords internal
.to_json <- function(x, indent = 0) {
  pad <- function(n) paste(rep("  ", n), collapse = "")

  if (is.null(x)) {
    return("null")
  }

  if (is.logical(x) && length(x) == 1) {
    return(ifelse(x, "true", "false"))
  }

  if (is.numeric(x) && length(x) == 1) {
    # Use integer format when possible
    if (x == floor(x) && abs(x) < 1e15) {
      return(format(x, scientific = FALSE))
    }
    return(as.character(x))
  }

  if (is.character(x) && length(x) == 1) {
    # Escape special characters
    escaped <- gsub("\\\\", "\\\\\\\\", x)
    escaped <- gsub('"', '\\\\"', escaped)
    escaped <- gsub("\n", "\\\\n", escaped)
    escaped <- gsub("\r", "\\\\r", escaped)
    escaped <- gsub("\t", "\\\\t", escaped)
    return(paste0('"', escaped, '"'))
  }

  # Named list -> JSON object
  if (is.list(x) && !is.null(names(x))) {
    entries <- mapply(function(key, val) {
      paste0(pad(indent + 1), .to_json(key), ": ", .to_json(val, indent + 1))
    }, names(x), x, SIMPLIFY = FALSE, USE.NAMES = FALSE)
    return(paste0("{\n", paste(entries, collapse = ",\n"), "\n", pad(indent), "}"))
  }

  # Unnamed list -> JSON array
  if (is.list(x)) {
    entries <- lapply(x, function(item) {
      paste0(pad(indent + 1), .to_json(item, indent + 1))
    })
    return(paste0("[\n", paste(entries, collapse = ",\n"), "\n", pad(indent), "]"))
  }

  # Fallback: convert to string
  return(.to_json(as.character(x), indent))
}
