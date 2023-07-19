#' Convert a multilayer class to a a list of igraph objects
#'
#' This function creates a list of igraph objects from the network layers. Interlayer links are not included.
#'
#' @param multilayer The multilayer object.
#' @param bipartite Is the network bipartite? Must be provided (no default
#'   value).
#' @param directed Is the network directed? Must be provided (no default value).
#'
#' @return A list:
#' \itemize{
#'   \item \code{layers_igraph} A list of igraph objects, one per layer
#'   \item \code{nodes} A table of physical nodes, as in the multlayer object.
#'   \item \code{state_nodes_map} A table with state nodes.
#' }
#'
#' @details If link, physical node or state node attributes are included in the multilayer network they are passed to the igraph objects.
#'
#' @examples
#'
#' # See examples in: https://ecological-complexity-lab.github.io/emln_package/multilayer.html#To_igraph_objects
#'
#' @export
#' @importFrom igraph delete_vertex_attr
#' @import dplyr

get_igraph <- function(multilayer, bipartite, directed) {
  # Create the SAM with all the state nodes
  nodes <- multilayer$nodes
  layer_attributes <- multilayer$layers
  state_nodes_map <- expand.grid(node_name=nodes$node_name, layer_name=layer_attributes$layer_name)
  state_nodes_map$sn_id <- 1:nrow(state_nodes_map)
  state_nodes_map$tuple <- paste(state_nodes_map$layer_name,state_nodes_map$node_name,sep='_')
  # Create the full map. When layer and node ids are NA that means that the node did not occur in the layer
  state_nodes_map <-
    dplyr::left_join(state_nodes_map, multilayer$state_nodes) %>%
    dplyr::select(sn_id, layer_name, node_name, layer_id, node_id, tuple) %>%
    dplyr::left_join(nodes)
  # Split the ell to layers
  intra <- multilayer$extended %>% filter(layer_from==layer_to)
  # Need to convert ot a factor to maintain the order of layers
  intra %<>% dplyr::mutate(layer_from = factor(layer_from, levels = unique(layer_from)))
  layers <- dplyr::group_split(intra, intra$layer_from)


  layers_igraph <- NULL
  # Work on each layer
  for (l in 1:length(layers)){
    lname <- layer_attributes$layer_name[l]
    net <- layers[[l]][,c(-1,-3)]
    if ("intra$layer_from" %in% names(net)) {net %<>% dplyr::select(-"intra$layer_from")} # this can be caused by the splitting
    # The next line was developed with the user-provided network examples
    nodes_in_layer <-
      state_nodes_map %>%
      dplyr::filter(layer_name==lname) %>%
      # drop_na() %>% # Dropping NA may remove state nodes that are supposed to be in the layer
      dplyr::select(node_name, everything())

    # Get the igraph object
    g <- list_to_matrix(x = net, directed = directed, bipartite = bipartite, node_metadata = nodes_in_layer)$igraph
    g <- igraph::delete_vertex_attr(g, "layer_name")
    g <- igraph::delete_vertex_attr(g, "layer_id")
    g <- igraph::delete_vertex_attr(g, "tuple")
    # Get the state node ids in addition to the physical node names
    layers_igraph[[l]] <- g
  }
  names(layers_igraph) <- layer_attributes$layer_name

  out <- list(layers_igraph=layers_igraph, nodes=nodes, state_nodes_map=state_nodes_map)

  return(out)
}
