#' Edge list to matrix conversion
#'
#' Convert an edge list to a matrix. Can handle unipartite and bipartite
#' networks.
#'
#' @details It is also possible to add node attributes. For this, it uses
#' igraph. The first column in the \code{node_metadata} data frame should have
#' the names of the nodes in the edge list.
#'
#' @param x An edge list of the format \code{from to weight}.
#' @param directed Is the network directed?
#' @param bipartite Is network bipartite?
#' @param group_names For bipartite networks: name of the groups in the columns
#'   and rows, respectively (e.g., parasites and hosts).
#' @param node_metadata Following the igraph method of \code{graph.data.frame}.
#'   Must have a column called node_name with names matching those in x.
#'
#' @return A \code{monolayer} object.
#' @seealso Functions \code{create_monolayer_network, monolayer} and \code{graph.data.frame} from igraph.
#'
#' @examples
#' \dontrun{
#' network <- load_emln(17)
#' nodes <- network$nodes
#' links<-subset(network$extended_ids %>% filter(layer_from==1), select=c(node_from, node_to, weight))
#'
#' list_to_matrix(links, directed = TRUE, bipartite = FALSE, node_metadata = nodes)
#'
#'
#' # See examples in: https://ecological-complexity-lab.github.io/emln_package/monolayer.html#Unipartite
#' }
#' @export
#' @import dplyr
#' @importFrom igraph graph.data.frame V as_incidence_matrix as_adjacency_matrix

list_to_matrix <- function(x, directed=F, bipartite=T, group_names=c('set_cols','set_rows'), node_metadata=NULL){
  names(x)[3] <- 'weight'
  g <- igraph::graph.data.frame(x, directed = directed, vertices = node_metadata)
  if(bipartite){
    igraph::V(g)$type <- igraph::V(g)$name %in% as.data.frame(x)[,1] # As.data.frame is necessary because if x is a tibble then x[,1] does not work
    output_mat <- igraph::as_incidence_matrix(g, names = T, attr = 'weight', sparse = F)
  } else {
    output_mat <- igraph::as_adjacency_matrix(g, names = T, sparse = F, attr = 'weight')
    output_mat <- t(output_mat) # This is needed so from will be in columns and to in rows
  }

  # Create a table with node data
  nodes <- igraph::V(g)$name
  if (bipartite){
    node_list <- tibble::tibble(node_id=1:length(nodes),
                        node_group=c(rep(group_names[1],ncol(output_mat)),rep(group_names[2],nrow(output_mat))),
                        node_name=nodes)
  } else {
    node_list <- tibble::tibble(node_id=1:length(nodes),
                        node_name=nodes)
  }

  # print(dim(output_mat))
  if(any(rowSums(output_mat)==0)){message('Warning: One or more rows sum to 0. This may be ok if you expect some links with only outgoing links (e.g., basal species in a food web)')}
  if(any(colSums(output_mat)==0)){message('Warning: One or more columns sum to 0. This may be ok if you expect some links with only incoming links (e.g., top predators in a food web)')}

  out <- list(mode=ifelse(bipartite,'B','U'),
              directed=directed,
              nodes=node_list,
              mat=output_mat,
              edge_list=x,
              igraph_object=g)
  class(out) <- "monolayer"
  return(out)
}
