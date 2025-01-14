#' Create Multilayer Network
#'
#' This function creates a multilayer network from multiple matrices / link
#' lists.
#'
#' @param list_of_layers List of matrices or list of link lists (format
#'   \code{from to weight}; see description). These are the intralayer links.
#' @param bipartite Is the network bipartite? Must be provided (no default
#'   value).
#' @param directed Is the network directed? Must be provided (no default value).
#' @param interlayer_links Interlayer extended edge list of the format
#'   \code{layer_from node_from layer_to node_to weight}. Default is NULL,
#'   assuming no interlayer links.
#' @param layer_attributes Optional. A data frame with layer attributes. The
#'   first column must be \code{layer_id} and the second \code{layer_name}.  The
#'   order of the rows and layer_id should be the same as in
#'   \code{list_of_layers}.
#' @param state_node_attributes Optional. Additional information on physical nodes in
#'   layers. Must contain columns \code{layer_name} and \code{node_name}.
#' @param physical_node_attributes Optional. Additional information on physical nodes. Must contain column \code{node_name}.
#'
#' @return A multilayer object (see ?multilayer).
#'
#' @details Input of \code{list_of_layers} is handled by the function
#'   \code{create_monolayer_network}; see it's description for details on input.
#'   If using matrices as input, they should contain row and column names. If link lists are provided as input column names should be
#'   \code{from to weight}.
#'
#'   When using link lists, it is possible to include link
#'   attributes. In that case the headers of all the link lists and, if
#'   included, the interlayer links, must be the same (after the weight), even if some attributes
#'   are included in only some layers (see detailed example in the code accompanying the package). Missing link attributes can be set to \code{NA}.
#'
#'   If interlayer links are provided, then layer_attributes must also be
#'   provided. Specify layer and nodes by UNIQUE names (not IDs). Layer names should
#'   correspond to those provided in layer_attributes.
#'
#'   Attributes of state nodes can be provided with \code{state_node_attributes}. If
#'   provided, then columns \code{layer_name} and \code{node_name} must be
#'   included.
#'
#'   For compatibility with function \code{load_emln} the output contains
#'   \code{description} and \code{references}. The value of any missing data
#'   frames in the multilayer object will be set to NULL.
#'
#'   See multiple example in the code accompanying the package
#'
#' @seealso \code{multilayer, create_monolayer_network}
#'
#' @export
#'
#' @examples
#' \dontrun{
#' pond_1 <- matrix(c(0,1,1,0,0,1,0,0,0), byrow = T,
#' nrow = 3, ncol = 3, dimnames = list(c('pelican','fish','crab'),
#' c('pelican','fish','crab')))
#' pond_2 <- matrix(c(0,1,0,0,0,1,0,0,0), byrow = T,
#' nrow = 3, ncol = 3, dimnames = list(c('pelican','fish','crab'),
#' c('pelican','fish','crab')))
#' pond_3 <- matrix(c(0,1,1,0,0,1,0,0,0), byrow = T,
#' nrow = 3, ncol = 3, dimnames = list(c('pelican','fish','tadpole'),
#' c('pelican','fish','tadpole')))
#'
#' layer_attrib <- tibble(layer_id=1:3,
#'                        layer_name=c('pond_1','pond_2','pond_3'),
#'                        location=c('valley','mid-elevation','uphill'))
#'
#' # Create the ELL tibble with interlayer links.
#' interlayer <- tibble(layer_from=c('pond_1','pond_1','pond_1'),
#'                      node_from=c('pelican','crab','pelican'),
#'                      layer_to=c('pond_2','pond_2','pond_3'),
#'                     node_to=c('pelican','crab','pelican'),
#'                      weight=1)
#'
#' # This is a directed network so the links should go both ways,
#' # even though they are symmetric.
#' interlayer_2 <- interlayer[,c(3,4,1,2,5)]
#' names(interlayer_2) <- names(interlayer)
#' interlayer <- rbind(interlayer, interlayer_2)
#'
#' multilayer <- create_multilayer_network(list_of_layers =
#' list(pond_1, pond_2, pond_3), layer_attributes = layer_attrib,
#' interlayer_links = interlayer, bipartite = F, directed = T)
#' }

create_multilayer_network <- function(list_of_layers, bipartite, directed, interlayer_links = NULL, layer_attributes = NULL, state_node_attributes = NULL, physical_node_attributes = NULL) {

  # When link lists are used then it is possible to add link attributes. Check if all the headers are the same for all layers.
  if ("data.frame" %in% class(list_of_layers[[1]])){
    headers <- lapply(list_of_layers, names)
    all_identical <- all(sapply(headers, function(x) identical(x, headers[[1]])))
    if (all_identical==F){stop('The headers of all the link lists in list_of_layers must be identical')}

    # To compare with interlayer links take only the headers after the weight
    if (!is.null(interlayer_links)){
      intralayer_headers <- names(list_of_layers[[1]])
      intralayer_headers <- intralayer_headers[4:length(intralayer_headers)]
      interlayer_headers <- names(interlayer_links)[6:length(interlayer_links)]
      if(!identical(interlayer_headers, intralayer_headers)){stop('The link attributes of intralayer andinterlayer links must be identical')}
    }
  }

  # Initialize
  extended_edge_list <- NULL
  state_nodes <- NULL

  # Check validity of layer attribute table
  if (is.null(layer_attributes)) {
    print('Layer attributes not provided, I added them (see layer_attributes in the final object)')
    layer_attributes <- data.frame(layer_id = 1:length(list_of_layers), layer_name=paste('layer_',1:length(list_of_layers),sep = ''))
  } else {
    layer_attributes <- data.frame(layer_attributes) # working with data frame is easier than with tibbles.
    if (names(layer_attributes)[1]!='layer_id') {stop('First column in layer attributes should be layer_id, and the order should be as provied in the list of layers.')}
    if (names(layer_attributes)[2]!='layer_name') {stop('Second column in layer attributes should be layer_name.')}
    if (nrow(layer_attributes)!=length(list_of_layers)) {stop('The number of layers between list_of_layers and layer_attributes should be consistent.')}
  }

  #Loop over the list of layers, creating an edge list for each network separately.
  for (layer_id in 1:length(list_of_layers)) {
    # get the layer network
    the_layer <- list_of_layers[[layer_id]]
    l_name <- layer_attributes[layer_id,'layer_name']
    print(sprintf('Layer #%s processing.', layer_id))

    ###  edge list  ###
    if (bipartite) {igraph_network <- create_monolayer_network(x = the_layer, directed = directed, bipartite = T, group_names = c('set_cols','set_rows'))
                    edge_list <- igraph_network$edge_list
                    print('Done.')}
    if (!bipartite) {#Expected a symmetric matrix in an undirected network. Otherwise, throw the warning.
                     if ((directed == FALSE) && (isSymmetric(the_layer) ==FALSE)){
                       warning('WARNING: In an undirected network a symmetric matrix is expected. Proceed with caution!')
                     }
                     l_n_attrib <- state_node_attributes
                     if ('data.frame'%in%class(the_layer) & is.null(l_n_attrib)){ # no explicit node data provided
                        # get nodes from the edge list
                        nodes <- unique(c(the_layer$from, the_layer$to))

                        # get nodes from interlayer edge list
                        if (!is.null(interlayer_links)){
                          # filter links relevant to this layer
                          f_inter <- interlayer_links %>% filter(layer_from == layer_id | layer_from == l_name)
                          t_inter <- interlayer_links %>% filter(layer_to == layer_id | layer_to == l_name)
                          more_nodes <- unique(c(f_inter$node_from, t_inter$node_to)) # get layer nodes present in the interlayer edges

                          nodes <- unique(c(nodes, more_nodes))
                        }
                        l_n_attrib <- tibble(node_name = nodes, layer_name = layer_id)
                     } # find node data so we don't lose singletons
                     else if (!is.null(state_node_attributes)) {
                       l_n_attrib <- state_node_attributes %>% filter(layer_name == l_name)
                     }

                     igraph_network <- create_monolayer_network(x = the_layer, directed = directed, bipartite = F, node_metadata = l_n_attrib)
                     edge_list <- igraph_network$edge_list
                     print('Done.')
                     }

    #add the current edge list to the extended_edge_list
    ELL_layer <- edge_list
    ELL_layer$layer <- layer_to <- layer_attributes[layer_id,'layer_name']
    ELL_layer %<>% select(layer_from=layer, node_from=from, layer_to=layer, node_to=to, everything())
    extended_edge_list <- rbind(extended_edge_list,ELL_layer)

    ###  state nodes  ###
    state_nodes <- rbind(state_nodes, data.frame(layer_id=layer_id, node_name=igraph_network$nodes$node_name))
  }

  # Handle interlayer links
  if (!is.null(interlayer_links)){
    # If some nodes do not appear in the list of provided layers, interlayer_links will not be added to the extended edge list
    nodes_in_interlayer <- unique(c(interlayer_links$node_from, interlayer_links$node_to))
    nodes_in_layers <- unique(c(extended_edge_list$node_from, extended_edge_list$node_to))
    if (any(nodes_in_interlayer %in% nodes_in_layers)==F){
      stop('STOPPING: Check node names in the interlayer_links dataframe. Some nodes do not appear in the list of provided layers')
    }
    # If some layers do not appear in the list of provided layers, interlayer_links will not be added to the extended edge list
    layers_in_interlayer <- unique(c(interlayer_links$layer_from, interlayer_links$layer_to))
    layers_in_intralayer <- unique(c(extended_edge_list$layer_from, extended_edge_list$layer_to))
    if (any(layers_in_interlayer %in% layers_in_intralayer)==F){
      stop('STOPPING: Check layer names in the interlayer_links dataframe. Some layers do not appear in the list of provided layer attributes. You must provide a layer attributes table that include layer names.')
    }

    # Add the interlayer links
    extended_edge_list <- rbind(extended_edge_list, interlayer_links)
  }

  # This is necessary for making the IDs
  extended_edge_list <- as.data.frame(extended_edge_list)

  # Create physical nodes table
  physical_nodes <- unique(state_nodes$node_name)
  physical_nodes <- data.frame(node_id = 1:length(physical_nodes), node_name = sort(physical_nodes))
  # Add user-provided attributes
  if (!is.null(physical_node_attributes)){
    print('Organizing state nodes')
    suppressMessages(physical_nodes %<>% left_join(physical_node_attributes))
  }

  ###  conversion of the node names to node ids in the edge list  ###
  print('Creating extended link list with node IDs')
  extended_edge_list_ids <- extended_edge_list
  for (i in 1:nrow(extended_edge_list)) {
    extended_edge_list_ids[i,2] <- physical_nodes[physical_nodes$node_name == extended_edge_list[i,2],]$node_id
    extended_edge_list_ids[i,4] <- physical_nodes[physical_nodes$node_name == extended_edge_list[i,4],]$node_id
    # Change layer names for ids
    extended_edge_list_ids[i,1] <- layer_attributes[layer_attributes$layer_name == extended_edge_list[i,1],]$layer_id
    extended_edge_list_ids[i,3] <- layer_attributes[layer_attributes$layer_name == extended_edge_list[i,3],]$layer_id
  }

  # Make IDs integer instead of character
  # extended_edge_list_ids[1:4,] <- apply(extended_edge_list_ids[1:4,], MARGIN = 2, FUN = as.integer) # This does not work well when link attreibutes are provided.
  extended_edge_list_ids$layer_from <- as.integer(extended_edge_list_ids$layer_from)
  extended_edge_list_ids$node_from <- as.integer(extended_edge_list_ids$node_from)
  extended_edge_list_ids$layer_to <- as.integer(extended_edge_list_ids$layer_to)
  extended_edge_list_ids$node_to <- as.integer(extended_edge_list_ids$node_to)

  # Organized the layer_attributes and state_nodes
  print('Organizing state nodes')
  state_nodes <- as_tibble(state_nodes)
  suppressMessages(
  state_nodes %<>% left_join(layer_attributes) %>%
    left_join(as_tibble(physical_nodes)) %>%
    select(layer_id, node_id, layer_name, node_name)
  )
  if (!is.null(state_node_attributes)){
    print('Joining with user-provided state nodes')
    state_nodes %<>% left_join(state_node_attributes)
  }

  # Output
  out <- list(nodes=as_tibble(physical_nodes),
              layers = as_tibble(layer_attributes),
              extended=as_tibble(extended_edge_list),
              extended_ids=as_tibble(extended_edge_list_ids),
              state_nodes=as_tibble(state_nodes),
              description=NULL,
              references=NULL)

  class(out) <- 'multilayer'

  return(out)
}


### examples ###

# x <- matrix(rbinom(n = 15, size = 1, prob = 0.5),nrow=3, ncol = 5)
# y <- matrix(rbinom(n = 15, size = 1, prob = 0.5),nrow=3, ncol = 5)
#
# matrix1 <- as.matrix(create_multilayer_network(list(x,y), bipartite = T, directed = T,
#                                                get_sam = T))
# matrix2 <- as.matrix(create_multilayer_network(list(bipartite::olesen2002aigrettes,bipartite::olesen2002flores),
#                                                get_sam = T, bipartite = T, directed = F, interlayer_links = data.frame(node_from = 'Protaetia.aurichalcea', layer_from = 1, node_to = 'Reseda:luteola', layer_to = 2, weight = 234)))
#
#
#
#
# image(x = matrix2, useRaster=TRUE, axes=F)


#### QA ### Shirly
#
# x_binary_Nonames_square<-matrix(rbinom(16, 1, 0.6), 4, 4)
# x_Nobinary_Nonames_square <- x_binary_Nonames_square*round(runif(16,1,4),0)
#
# x_Nobinary_names_square<-x_Nobinary_Nonames_square
# rownames(x_Nobinary_names_square)<-c('Orange', 'Blue', 'Red', 'Green')
# colnames(x_Nobinary_names_square)<-c('Orange', 'Blue', 'Red', 'Green')
#
# x2_Nobinary_names_square<-x_Nobinary_Nonames_square
# rownames(x2_Nobinary_names_square)<-c('Red', 'Purple', 'Green', 'White')
# colnames(x2_Nobinary_names_square)<-c('Red', 'Purple', 'Green', 'White')
#
# x3_Nobinary_names_square<-x_Nobinary_Nonames_square
# rownames(x3_Nobinary_names_square)<-c('Orange', 'Purple', 'Red', 'White')
# colnames(x3_Nobinary_names_square)<-c('Orange', 'Purple', 'Red', 'White')
#
#
# xy_Nobinary_namesColRow_square<-x_Nobinary_names_square
# colnames(xy_Nobinary_namesColRow_square) <-c("Xx", "Gg","Aa","Bb")

