#' Incidence matrix to edge list conversion
#'
#' Convert an incidence matrix to an edge list.
#'
#' @details Assigns column and row names if those do not exist.
#' Cannot handle node attributes/metadata. Always assumes an undirected network.
#'
#' @param x An incidence matrix.
#' @param group_names Name of the groups in the columns and rows, respectively (e.g., parasites and hosts).
#'
#' @return A \code{monolayer} object.
#' @seealso \code{create_monolayer_network, monolayer}
#'
#' @examples
#'
#' # See examples in: https://ecological-complexity-lab.github.io/emln_package/monolayer.html#Bipartite
#'
#'\dontrun{
#' matrix_to_list_bipartite(bipartite::memmott1999, group_names = c('Animals', 'Plants'))
#'}
#'
#' @export
#' @import dplyr
#' @importFrom igraph graph.incidence degree

matrix_to_list_bipartite <- function(x, group_names=c('set_cols','set_rows')){
  # Assign column and row names
  if (is.null(rownames(x))) {print('Assigning missing row names'); rownames(x) <- paste('R',1:nrow(x),sep='')}
  if (is.null(colnames(x))) {print('Assigning missing column names'); colnames(x) <- paste('C',1:ncol(x),sep='')}

  #Check that in the bipartite network no overlap between the sets of nodes.
  if (length(intersect(rownames(x),colnames(x)))>0)  {stop('ERROR: Check that there is no overlap between communities in the bipartite network.')}

  g <- igraph::graph.incidence(t(x), weighted = T) # transposing ensures that "from" is at the columns and "to" is the rows
  l_bip <- as_tibble(igraph::as_data_frame(g, 'edges'))
  # summary(g)
  if(any(igraph::degree(g)==0)){print('Some node have no interactions. They will appear in the node table but not in the edge list')}
  nodes <- c((colnames(x)),(rownames(x)))
  node_list <- tibble(node_id=1:length(nodes),
                      node_group=c(rep(group_names[1],ncol(x)),rep(group_names[2],nrow(x))),
                      node_name=nodes)
  out <- list(mode='B', directed=F, nodes=node_list, mat=x, edge_list=l_bip, igraph_object=g)
  class(out) <- "monolayer"
  return(out)
}
