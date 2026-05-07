#####
# This R file is to create the dataset documentation to all the datasets
#####


library(ggplot2)
library(readr)
library(tibble)
library(dplyr)
library(readr)
library(stringr)
library(usethis)
library(tidyverse)
library(kableExtra)

##
#helper function
##

loadRData <- function(fileName){
  #loads an RData file, and returns it
  load(fileName)
  get(ls()[ls() != "fileName"])
}


##
#main function
##
generate_data_description <- function(folders){
  for (i in folders) {
  dataset <- loadRData(paste0('~/GitHub/emln_package/data/',i)) #load the networks by order
  dataset_name <- gsub(i,pattern = '\\.rda',replacement = '')
  description <- dataset$description
  f <- paste('~/GitHub/emln_package/R/',dataset_name,'.R',sep='')
  desc <- description %>%
    filter(!attribute %in% c('source', 'data_url', 'description', 'data_entry')) %>% pivot_wider(values_from = 'value', names_from = 'attribute', values_fn = list)
  desc <- knitr::kable(cbind(tibble(network_id = as.numeric(gsub(dataset_name, pattern = '^emln|_.+$', replacement = '')),desc)),align = 'c', format = 'pipe')
  write_lines(x = "#'",file =  f, append = F) # Append=F means that the file will be created. If there is an existing file it will be overwritten.
  write_lines(paste0("#' @docType ",'data'), f, append = T)
  write_lines(paste0("#' @title ",tolower(dataset_name)), f, append = T)
  write_lines(paste0("#' "), f, append = T)
  write_lines(paste0("#' @description ", 'Network Description:'), f, append = T)
  write_lines(paste0("#' "), f, append = T)
  write_lines(paste0("#' ",desc), f, append = T)
  write_lines(paste0("#' "), f, append = T)
  write_lines(paste0("#' @format ",'NULL'), f, append = T)
  write_lines(paste0("#' @usage ",'NULL'), f, append = T)
  write_lines(paste0("#' @source ",unlist(description[description$attribute == 'source','value'])), f, append = T)
  write_lines(paste0("#' @source ",unlist(description[description$attribute == 'data_url','value'])), f, append = T)
  write_lines("#' @md", f, append = T)
  write_lines(paste0("#' @keywords", ' internal'), f, append = T)
  write_lines(paste0("\'",tolower(dataset_name),"\'"), f, append = T)


  rm(dataset)
  }
}

##
#execute function
##
folders <-  list.files(path = '~/GitHub/emln_package/data/',full.names = F, recursive = FALSE)[-1]

generate_data_description(folders)

