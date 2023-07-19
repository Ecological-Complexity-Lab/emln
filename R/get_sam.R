#' Convert a multilayer class to a supra-adjacency matrix
#'
#' This function creates a supra-adjacency matrix from a multilayer object.
#'
#' @param multilayer The multilayer object.
#' @param bipartite Is the network bipartite? Must be provided (no default
#'   value).
#' @param directed Is the network directed? Must be provided (no default value).
#' @param sparse Should the returned matrix be a sparse matrix (class Matrix)?
#'   Defaults to false.
#' @param remove_zero_rows_cols Should rows and columns that sum to 0 be
#'   removed? Defaults to false.
#'
#' @return A list:
#' \itemize{
#'   \item \code{M} The SAM. Can also be sparse.
#'   \item \code{nodes} A table of physical nodes, as in the multlayer object.
#'   \item \code{state_nodes_map} A table with state nodes to map the nodes to the row and columns of the SAM.
#' }
#'
#' @details By default, a SAM contains all the nodes in all the layers. However,
#'   not all nodes always occur in all layers. This will be reflected in the
#'   \code{state_nodes_map}: When layer and node ids are NA that means that the
#'   node did not occur in the layer.
#'
#'   A node may not have links across all
#'   the layers. In that case, its row or column sum will be zero. This can happen in a
#'   directed matrix (see toy example for unipartite network), or in
#'   diagonally-coupled networks (see toy bipartite example). The user can choose to remove rows and columns that sum to zero by setting \code{remove_zero_rows_cols} to \code{TRUE}.
#'
#' @examples
#'
#' # See examples in: https://ecological-complexity-lab.github.io/emln_package/multilayer.html#To_supra-adjacency_matrices
#'
#' @export
#' @import dplyr
#' @importFrom Matrix matrix

get_sam <- function(multilayer, bipartite, directed, sparse=F, remove_zero_rows_cols=F) {
  # Create a map of state nodes
  nodes <- multilayer$nodes
  layer_attributes <- multilayer$layers
  state_nodes_map <- expand.grid(node_name=nodes$node_name, layer_name=layer_attributes$layer_name)
  state_nodes_map$sn_id <- 1:nrow(state_nodes_map)
  state_nodes_map$tuple <- paste(state_nodes_map$layer_name,state_nodes_map$node_name,sep='_')

  if (!bipartite) {
    # See https://github.com/manlius/muxViz/blob/master/gui-old/theory/README.md#operatively-rank-4-tensors-can-be-mapped-into-rank-2-supra-adjacency-matrices-to-facilitate-operations-with-care

      # Use state node names (the layer-node tuple) in the extended link list
    ell_tuples <- multilayer$extended %>%
      dplyr::mutate(from=paste(layer_from,node_from,sep='_')) %>%
      dplyr::mutate(to=paste(layer_to,node_to,sep='_')) %>%
      dplyr::select(from,to,weight)
    # The partial mat only contains the state nodes for which an interaction has been recorded
    partial_mat <- list_to_matrix(ell_tuples, bipartite = F, directed = directed)$mat
    # Create the complete layer*nodes matrix
    M <- Matrix::matrix(0, nrow = nrow(state_nodes_map), ncol = nrow(state_nodes_map), dimnames = list(state_nodes_map$tuple, state_nodes_map$tuple))
    # Embed the partial matrix inside the full one
    M[rownames(partial_mat), colnames(partial_mat)] <- partial_mat
   }

  if (bipartite){
    M <- Matrix::matrix(0, nrow = nrow(state_nodes_map), ncol = nrow(state_nodes_map), dimnames = list(state_nodes_map$tuple, state_nodes_map$tuple))

    # Split the ell to layers
    intra <- multilayer$extended %>% dplyr::filter(layer_from==layer_to)
    # Need to convert to a factor to maintain the order of layers
    intra %<>% dplyr::mutate(layer_from = factor(layer_from, levels = unique(layer_from)))
    layers <- dplyr::group_split(intra, intra$layer_from)
    for (l in layers){
      layer_name <- l$layer_from[1]
      rect_matrix <- list_to_matrix(l[,c(2,4,5)], directed = F, bipartite = T)$mat
      # rect_matrix <- rect_matrix[sort(rownames(rect_matrix)),]
      # Get the dimensions of the rectangular matrix
      m <- nrow(rect_matrix)
      n <- ncol(rect_matrix)
      # Create a new square matrix with dimensions m+n
      rcnames <- c(colnames(rect_matrix),rownames(rect_matrix))
      rcnames <- paste(layer_name,rcnames,sep='_')
      square_matrix <- Matrix::matrix(0, nrow = m + n, ncol = m + n, dimnames = list(rcnames, rcnames))
      # Copy the values from the rectangular matrix into the appropriate positions in the square matrix
      square_matrix[(n+1):(n+m), 1:n] <- rect_matrix
      square_matrix[1:n, (n+1):(n+m)] <- t(rect_matrix)

      # Populate the SAM
      M[rownames(square_matrix), colnames(square_matrix)] <- square_matrix
    }

    # Identify and populate interlayer interactions
    inter <- multilayer$extended %>% dplyr::filter(layer_from!=layer_to)
    # If there are interlayer links
    if (nrow(inter)>0){
      # Use state node names (the layer-node tuple) in the extended link list
      inter_tuples <- inter %>%
        dplyr::mutate(from=paste(layer_from,node_from,sep='_')) %>%
        dplyr::mutate(to=paste(layer_to,node_to,sep='_')) %>%
        dplyr::select(from,to,weight)
      # The interlayer matrix
      inter_mat <- list_to_matrix(inter_tuples, bipartite = F, directed = directed)$mat
      # Populate the SAM with interlayer links
      M[rownames(inter_mat), colnames(inter_mat)] <- inter_mat
    }
  }

  # Some operations that are the same for the unipartite and bipartite

  # Change the row and column names to state node ids.
  colnames(M) <- state_nodes_map$sn_id[match(colnames(M),state_nodes_map$tuple)]
  rownames(M) <- state_nodes_map$sn_id[match(rownames(M),state_nodes_map$tuple)]
  # Create the full map. When layer and node ids are NA that means that the node did not occur in the layer
  state_nodes_map <- left_join(state_nodes_map, multilayer$state_nodes) %>%
    select(sn_id, layer_name, node_name, layer_id, node_id, tuple)

  if (directed==F & !isSymmetric(M)){warning('The SAM is not symmetric. Make sure this is what you expect because your network is not directed.')}

  if (remove_zero_rows_cols==T){
    # Remove rows and columns whose sum is zero
    rows_to_keep <- rowSums(M) != 0
    cols_to_keep <- colSums(M) != 0
    M <- M[rows_to_keep, cols_to_keep]
  }

  # Make sparse?
  if (sparse){M <- Matrix(M, sparse = T)}

  out <- list(M=M, nodes=nodes, state_nodes_map=state_nodes_map)

  return(out)
}
