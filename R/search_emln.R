#' Search networks
#'
#'@name search_emln
#'
#' @description Search the database for networks depending on search parameters specified below.
#'
#' @param ecological_network_type One of: Seed-Dispersal, Pollination, Food-Web, Host-Parasite, Multiple, Plant-Herbivore, Anemone-Fish, Plant-Ant
#' @param multilayer_network_type Environment, Temporal, Multiplex, Perturbation, Spatial
#' @param state_nodes TRUE/FALSE
#' @param weighted TRUE/FALSE
#' @param directed TRUE/FALSE
#' @param interlayer TRUE/FALSE
#' @param layer_number_minimum The minimum number of layers wanted in the network
#' @param node_number_minimum The minimum number of layers wanted in the network
#'
#'
#' @return A tibble containing the network id, and all the search arguments for each of the networks that are compatible with the search.
#'
#'
#' @examples
#' \dontrun{
#' # See examples in: https://ecological-complexity-lab.github.io/emln_package/data.html#Browsing_the_data
#'
#' # Generates a tibble of all the networks in the package that are pollination networks
#' search_emln(ecological_network_type = 'Plant-Ant')
#'
#' # Generates a tibble of all the networks in the package that have state nodes and are temporal
#' search_emln(multilayer_network_type = 'Temporal', state_node = TRUE)
#'
#' }
#' @export search_emln
#' @import dplyr
#' @importFrom stringr str_to_title
#' @importFrom purrr compact
#' @importFrom magrittr %>% %<>%



search_emln <- function(ecological_network_type=NULL,multilayer_network_type=NULL,
                        state_nodes=NULL,node_number_minimum=NULL,layer_number_minimum=NULL,
                        weighted = NULL, interlayer = NULL, directed =NULL){


  #load the large tibble that contains all the descriptions for it to be filtered

  #desc <- loadRData('./data/descriptions.rda')
  desc <- descriptions


  #check which arguments were entered so I can loop over it.

  attributes_entered <- purrr::compact(as.list(match.call()))[-1]

  for (i in names(attributes_entered)) {
      if (i == 'ecological_network_type') {
        desc <- desc %>%
          dplyr::filter(ecological_network_type == stringr::str_to_title(attributes_entered[['ecological_network_type']]))
        next
      } else if (i == 'multilayer_network_type') {
        desc <- desc %>%
          dplyr::filter(multilayer_network_type == stringr::str_to_title(attributes_entered[['multilayer_network_type']]))
        next
      } else if (i == 'state_nodes') {
        desc <- desc %>%
          dplyr::filter(state_nodes == attributes_entered[['state_nodes']])
        next
      } else if (i == 'node_number_minimum') {
        desc <- desc %>%
          dplyr::filter(node_num >= attributes_entered[['node_number_minimum']])
        next
      } else if (i == 'layer_number_minimum') {
        desc <- desc %>%
          dplyr::filter(layer_num >= attributes_entered[['layer_number_minimum']])
        next
      } else if (i == 'weighted') {
        desc <- desc %>%
          dplyr::filter(weighted == attributes_entered[['weighted']])
        next
      } else if (i == 'directed') {
        desc <- desc %>%
          dplyr::filter(directed == attributes_entered[['directed']])
        next
      } else if (i == 'interlayer') {
        desc <- desc %>%
          dplyr::filter(interlayer == attributes_entered[['interlayer']])
        }
        next
      }

  #sort the tibble

  desc <- desc %>%
    dplyr::group_by(network_id,network_name)  %>%
    dplyr::arrange(network_id,network_name)

  if (nrow(desc) == 0) {return('There are no Networks with that combination of attributes')}

  return(desc)

  }

