## code to prepare `DATASET` dataset goes here


# Copy files from Datasets folder to Data-Raw folder ----------------------
setwd('~')
x <- list.dirs('./GitHub/emln_package/data/emln_db_datasets/', full.names = F, recursive = F)
sub.folders.short <- list.dirs(path = './GitHub/emln_package/data/emln_db_datasets/', recursive = F, full.names = F)
sub.folders.long <- list.dirs(path = './GitHub/emln_package/data/emln_db_datasets/', recursive = F, full.names = T)


#order the sub folders according to the id, using the short sub folders so I can use the id, but I eventually need the long to read the csvs
sub.folders.long <- sub.folders.long[str_order(sub.folders.short, numeric = T)]
sub.folders.short <- sub.folders.short[str_order(sub.folders.short, numeric = T)]


for (i in 1:length(sub.folders.short)) {
  dir.create(path = paste0("./GitHub/emln/data-raw/", sub.folders.short[i]))
}


#copy them to the new directory
for (i in 1:length(sub.folders.long)) {
  list_of_files <- NULL
  current_folder <- paste0("./GitHub/emln_package/data/emln_db_datasets/",sub.folders.short[i])
  new_folder <- paste0("./GitHub/emln/data-raw/",sub.folders.short[i])
  list_of_files <- list.files(current_folder, pattern =  "state_nodes.csv|interactions.csv|nodes.csv|layers.csv|references.csv|description.csv")
  file.copy(file.path(current_folder,list_of_files), new_folder, overwrite = T)
}



# Turn the Data-Raw folder contents into rdata files ----------------------


#usethis::use_data(DATASET, overwrite = TRUE)

library(ggplot2)
library(readr)
library(tibble)
library(dplyr)
library(readr)
library(stringr)
library(usethis)

# generate the Rdata for the DATA folder ----------------------------------

#set working directory to data-raw
setwd('./GitHub/emln/data-raw/')

#set the path to the package (CHANGES FROM USER TO USER)
package_path <- '/Users/noni/GitHub/emln'

#read the file path
parent.folder <- '~/GitHub/emln/data-raw'
parent_data.folder <- paste0(package_path,"/data")

sub.folders.short <- list.dirs(path = parent.folder, recursive = F, full.names = F)
sub.folders.long <- list.dirs(path = parent.folder, recursive = F, full.names = T)

#order the sub folders according to the id, using the short sub folders so I can use the id, but I eventually need the long to read the csvs
sub.folders.long <- sub.folders.long[str_order(sub.folders.short, numeric = T)]
sub.folders.short <- sub.folders.short[str_order(sub.folders.short, numeric = T)]


#create the data file for each network where its format is a list that contains description, references, nodes, state_nodes, interactions and layers for each network.
for (i in 1:length(sub.folders.long)) {
  if (file.exists(paste(sub.folders.long[[i]],'references.csv',sep = '/'))) {
    if (file.exists(paste(sub.folders.long[[i]],'state_nodes.csv',sep = '/'))) {
      network <- list(description = read_csv(paste(sub.folders.long[[i]],'description.csv',sep = '/')),
                      references = read_csv(paste(sub.folders.long[[i]],'references.csv',sep = '/')),
                      nodes = read_csv(paste(sub.folders.long[[i]],'nodes.csv',sep = '/')),
                      state_nodes = read_csv(paste(sub.folders.long[[i]],'state_nodes.csv',sep = '/')),
                      interactions = read_csv(paste(sub.folders.long[[i]],'interactions.csv',sep = '/')),
                      layers = read_csv(paste(sub.folders.long[[i]],'layers.csv',sep = '/')))
      class(network) <- 'EMLN'
      network_name <- tolower(paste0('emln',gsub(sub.folders.short[i],pattern = '-|\\.',replacement = '_'))) #hanging network name
      assign(network_name, network) #assign it to the network variable
      do.call("use_data", list(as.name(network_name), overwrite = TRUE)) #save it with said name
    } else {
      network <- list(description = read_csv(paste(sub.folders.long[[i]],'description.csv',sep = '/')),
                      references = read_csv(paste(sub.folders.long[[i]],'references.csv',sep = '/')),
                      nodes = read_csv(paste(sub.folders.long[[i]],'nodes.csv',sep = '/')),
                      interactions = read_csv(paste(sub.folders.long[[i]],'interactions.csv',sep = '/')),
                      layers = read_csv(paste(sub.folders.long[[i]],'layers.csv',sep = '/')))
      class(network) <- 'EMLN'
      network_name <- tolower(paste0('emln',gsub(sub.folders.short[i],pattern = '-|\\.',replacement = '_'))) #hanging network name
      assign(network_name, network) #assign it to the network variable
      do.call("use_data", list(as.name(network_name), overwrite = TRUE)) #save it with said name
    }
  } else {
    if (file.exists(paste(sub.folders.long[[i]],'state_nodes.csv',sep = '/'))) {
      network <- list(description = read_csv(paste(sub.folders.long[[i]],'description.csv',sep = '/')),
                      nodes = read_csv(paste(sub.folders.long[[i]],'nodes.csv',sep = '/')),
                      state_nodes = read_csv(paste(sub.folders.long[[i]],'state_nodes.csv',sep = '/')),
                      interactions = read_csv(paste(sub.folders.long[[i]],'interactions.csv',sep = '/')),
                      layers = read_csv(paste(sub.folders.long[[i]],'layers.csv',sep = '/')))
      class(network) <- 'EMLN'
      network_name <- tolower(paste0('emln',gsub(sub.folders.short[i],pattern = '-|\\.',replacement = '_'))) #hanging network name
      assign(network_name, network) #assign it to the network variable
      do.call("use_data", list(as.name(network_name), overwrite = TRUE)) #save it with said name
    } else {
      network <- list(description = read_csv(paste(sub.folders.long[[i]],'description.csv',sep = '/')),
                      nodes = read_csv(paste(sub.folders.long[[i]],'nodes.csv',sep = '/')),
                      interactions = read_csv(paste(sub.folders.long[[i]],'interactions.csv',sep = '/')),
                      layers = read_csv(paste(sub.folders.long[[i]],'layers.csv',sep = '/')))
      class(network) <- 'EMLN'
      network_name <- tolower(paste0('emln',gsub(sub.folders.short[i],pattern = '-|\\.',replacement = '_'))) #hanging network name
      assign(network_name, network) #assign it to the network variable
      do.call("use_data", list(as.name(network_name), overwrite = TRUE)) #save it with said name
    }
  }
}




# Create dataset that contains all the description files  -----------------


#run this helper function so the next function will be able to work
loadRData <- function(fileName){
  load(fileName)
  get(ls()[ls() != "fileName"])
}



#loading all the networks description file and creating a big description dataframe that connects all the data to the releven networks.
descriptions <- tibble()
#for (i in list.files("data")) {
for (i in list.files(parent_data.folder)) {
  if (i == 'descriptions.rda') {next} #we don't want it to loop on itself
  #theloadedobjects <- loadRData(paste0('data/',i)) #load the network
  theloadedobjects <- loadRData(paste0(parent_data.folder,'/',i)) #load the network
  descriptions <- rbind(descriptions, tibble(network_id = as.numeric(gsub(i, pattern = '^emln|_.+$', replacement = '')),
                                               #network_name =  gsub(i,pattern = '.rda',replacement = ''),
                                               network_name =  sub("\\.rda$", "", i),
                                               ecological_network_type = filter(theloadedobjects$description, attribute == 'ecological_network_type')$value,
                                               multilayer_network_type = filter(theloadedobjects$description, attribute == 'multilayer_network_type')$value,
                                               state_nodes = filter(theloadedobjects$description, attribute == 'state_nodes')$value,
                                               weighted = if_else(all(grepl(filter(theloadedobjects$interactions, attribute == 'weight')$value, pattern = '1')),true = FALSE, false = TRUE),
                                               directed = if_else('directed' %in% theloadedobjects$layers$attribute, true = TRUE, false = FALSE),
                                               interlayer = if_else('interlayer' %in% filter(theloadedobjects$interactions,attribute == 'type')$value, true = TRUE, false = FALSE),
                                               layer_num = max(theloadedobjects$layers$layer),
                                               node_num = max(theloadedobjects$nodes$node_id)
  ))
  rm(theloadedobjects) #delete the object that was loaded so there won't be 81 datasets loaded
}


use_data(descriptions, overwrite =  TRUE) #create the descriptions.rda in the data folder
