#' Internal function - loads an RData file, and returns it
#'
#' @param fileName file to be downloaded
#' @keywords internal
#' @import tibble

loadRData <- function(fileName){
load(fileName)
get(ls()[ls() != "fileName"])
}
