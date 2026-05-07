emlnFunctions
================

# emln Functions

In this Rmd, I will show how I built the functions that query the
database.

First, there is a folder called “datasets”, where all the networks are
stored by the name format ‘id_type_author_yearPublished’ or if its a
network comprised of several papers published at different years, the
format is ‘id_type_author’

Second, I will create lists that contain all of the information that is
available from each network by layers, nodes and general information
about the network

``` r
library(ggplot2)
library(readr)
library(tibble)
library(dplyr)
```

    ## 
    ## Attaching package: 'dplyr'

    ## The following objects are masked from 'package:stats':
    ## 
    ##     filter, lag

    ## The following objects are masked from 'package:base':
    ## 
    ##     intersect, setdiff, setequal, union

``` r
library(readr)
library(stringr)
library(ggsci)
library(ggbreak)
```

    ## ggbreak v0.1.1
    ## 
    ## If you use ggbreak in published research, please cite the following
    ## paper:
    ## 
    ## S Xu, M Chen, T Feng, L Zhan, L Zhou, G Yu. Use ggbreak to effectively
    ## utilize plotting space to deal with large datasets and outliers.
    ## Frontiers in Genetics. 2021, 12:774846. doi: 10.3389/fgene.2021.774846

``` r
#the lab ggplot2 theme
paper_figs_theme <- 
  theme_bw()+
  theme(panel.grid = element_blank(),
        panel.border = element_rect(color = "black",fill = NA,size = 1),
        panel.spacing = unit(0.5, "cm", data = NULL),
        axis.text = element_text(size=14, color='black'),
        axis.title = element_text(size=14, color='black'),
        axis.line = element_blank())
```

    ## Warning: The `size` argument of `element_rect()` is deprecated as of ggplot2 3.4.0.
    ## ℹ Please use the `linewidth` argument instead.

``` r
paper_figs_theme_no_legend <- 
  paper_figs_theme +
  theme(legend.position = 'none')

## creation of the lists
#read the file path
parent.folder <- "~/GitHub/ecomplab/emln_package/data-raw/"

#setwd("~/GitHub/emln_db/EMLN_Datasets/datasets") ##in this chunk, we want the working directory to be the one with all the networks in order to read them

sub.folders.short <- list.dirs(path = parent.folder, recursive = F, full.names = F)
sub.folders.long <- list.dirs(path = parent.folder, recursive = F, full.names = T)

#order the sub folders according to the id, using the short sub folders so I can use the id, but I eventually need the long to read the csvs
sub.folders.long <- sub.folders.long[str_order(sub.folders.short, numeric = T)]

## the number of multilayer networks in the database
number_of_networks <- length(sub.folders.long)

##a dataframe that connects the id to the network folder
id_readout <- data.frame(id = 1:81, network_name = sub.folders.short[str_order(sub.folders.short, numeric = T)], network_path = sub.folders.long)

#create big lists that each contain the nodes/layers/description/references csv
#NOTE! not all networks have a references csv
all_layers<-list()
all_interactions<-list()
all_nodes<-list()
all_references<-list()
all_descriptions<-list()
all_state_nodes <- list()

##read the relevant csv's in each netowrk to retrieve the information
for(i in 1:number_of_networks) {
    all_layers[[i]]<-read.csv(paste0(sub.folders.long[i],"/layers.csv"))
    all_interactions[[i]]<-read.csv(paste0(sub.folders.long[i],"/interactions.csv"))
    all_nodes[[i]]<-read.csv(paste0(sub.folders.long[i],"/nodes.csv"))
    all_descriptions[[i]]<-read.csv(paste0(sub.folders.long[i],"/description.csv"))
  if (file.exists(paste0(sub.folders.long[i],"/references.csv"))) {
    all_references[[i]]<-read.csv(paste0(sub.folders.long[i],"/references.csv"))
  } else {
    all_references[[i]] <- NA #if the network doesn't have a reference csv (it was not published)
  }
  if (file.exists(paste0(sub.folders.long[i],"/state_nodes.csv"))) {
    all_state_nodes[[i]] <- read.csv(paste0(sub.folders.long[i],"/state_nodes.csv"))
  } else {
    all_state_nodes[[i]] <- NA
  }
}


## lists that contain the type of interactions, nodes, networks and layers
layer_type<-NULL 
node_type<-NULL
interaction_type<-NULL
multilayer_type<-NULL

## lists that contain the number of interactions, nodes, and layers per network
num_of_layers<-c()
num_of_nodes<-c()
num_of_interactions<-c()

## lists that contain the unique attributes of interactions, nodes and layers
layer_attribute<-NULL
attributes_interactions<-NULL
attributes_nodes<-NULL

##create the lists using the files that contain the types, number, ettributes etc...##
for(i in 1:number_of_networks){ 
    layer_type<-rbind(layer_type,tibble(network_id=i,filter(all_layers[[i]],attribute=="type")))
    node_type<-rbind(node_type,tibble(network_id=i,filter(all_nodes[[i]],attribute =="type")))
    interaction_type<-rbind(interaction_type,tibble(network_id=i,filter(all_interactions[[i]],attribute=="type")))
    num_of_layers<-append(num_of_layers,max(all_layers[[i]]$layer))
    num_of_nodes<-append(num_of_nodes,max(all_nodes[[i]]$node_id))
    num_of_interactions<-append(num_of_interactions,max(all_interactions[[i]]$interaction_id))
    layer_attribute<-rbind(layer_attribute,tibble(network_id=i,att=all_layers[[i]][["attribute"]]))
    attributes_interactions<-rbind(attributes_interactions,tibble(network_id=i,att=all_interactions[[i]][["attribute"]]))
    attributes_nodes<-rbind(attributes_nodes,tibble(network_id=i,att=all_nodes[[i]][["attribute"]]))
    #multilayer_type<-rbind(network_type,tibble(network_id=i,filter(all_descriptions[[i]],attribute=="type")))
    
  }
```

Now, there are variables that hold -

Types: - nodes (e.g., plant)

- multilayer network (e.g., multiplex)

- layer (e.g., space)

- interaction type (e.g., frugivory)

Attributes:

- layer attributes (e.g., habitat)

- node attributes (e.g abundance)

Numbers of:

- layers

- interaction

- nodes

# Node inforamtion

``` r
#num of nodes per paper
num_of_nodes <- data.frame()
for (i in 1:length(all_nodes)) {
  num_of_nodes <- rbind(num_of_nodes, data.frame(network_id = i, num_nodes = max(all_nodes[[i]]$node_id)))
}

#as histogram
p0 <- ggplot(num_of_nodes, aes(x=num_nodes, color=num_nodes)) +
               geom_histogram(alpha=0.5, color='black',fill=pal_nejm(palette = 'default')(8)[4]) +
  paper_figs_theme_no_legend +
  theme(axis.text.x = element_text(angle = 90, vjust = 0.5, hjust=1, size = 10)) + 
               scale_x_continuous(breaks = round(seq(0, 3500, by = 500),1)) + 
  xlab('Number of nodes') + scale_color_nejm()
 # + scale_x_break(1000,3000)
p0
```

    ## `stat_bin()` using `bins = 30`. Pick better value with `binwidth`.

![](emlnFunctions_files/figure-gfm/Nodes%20Information-1.png)<!-- -->

``` r
#i will add some attributes to the num_of_nodes and color the histogram accordingly
# num_of_nodes <- merge_

#save the plot
ggsave("~/GitHub/ecomplab/emln_package/data-raw//num_nodes_plot.pdf",plot = p0,width =  10, height = 6)
```

    ## `stat_bin()` using `bins = 30`. Pick better value with `binwidth`.

``` r
#abundance
###a function that returns a dataframe with the networks that have an abundance attribute in their nodes.csv or state_nodes.csv
abundance.physical <- function() { 
  abund <- data.frame()
  for (i in 1:length(all_nodes)) {
    if (TRUE %in% grepl('.*abundance.*', all_nodes[[i]]$attribute)) {
      abund <- rbind(abund, data.frame(network_id = i, network_name = id_readout[i,]$network_name))
    }
  }
  for (i in 1:length(all_state_nodes)) {
    if (!length(all_state_nodes[[i]]) == 1) {
      if (TRUE %in% grepl('.*abundance.*', all_state_nodes[[i]]$attribute)) {
      abund <- rbind(abund, data.frame(network_id = i, network_name = id_readout[i,]$network_name))
    }
    }
  }
  return(abund)
}

abundance.physical()
```

    ##   network_id             network_name
    ## 1         27  27_Spatial_Chacoff_2020
    ## 2         68 68_Temporal_Chacoff_2020

Check if there is an abundance attribute in the state nodes

``` r
abundance.state <- function() { ###a function that returns a dataframe with the networks that have an abundance attribute in their nodes.csv 
  abund <- data.frame()
  for (i in 1:length(all_state_nodes)) {
    if (!length(all_state_nodes[[i]]) == 1) {
      if (TRUE %in% grepl('.*abundance.*', all_state_nodes[[i]]$attribute)) {
      abund <- rbind(abund, data.frame(network_id = i, network_name = id_readout[i,]$network_name))
    }
  }
    }
    
  return(abund)
}

abundance.state()
```

    ## data frame with 0 columns and 0 rows

# layer information

``` r
num_of_layers <- data.frame()
for (i in 1:length(all_layers)) {
  num_of_layers <- rbind(num_of_layers, data.frame(network_id = i, num_layers = max(all_layers[[i]]$layer)))
}
#as histogram
p_layers <- ggplot(num_of_layers, aes(x=num_layers)) +
               geom_histogram(alpha=0.5, color='black',fill=pal_nejm(palette = 'default')(8)[5]) +
  paper_figs_theme_no_legend +
  theme(axis.text.x = element_text(angle = 90, vjust = 0.5, hjust=1, size = 10)) + 
               # scale_x_continuous(breaks = round(seq(0, 3500, by = 500),1)) + 
  xlab('Number of layers') + scale_color_nejm()
p_layers
```

    ## `stat_bin()` using `bins = 30`. Pick better value with `binwidth`.

![](emlnFunctions_files/figure-gfm/Layer%20Information-1.png)<!-- -->

``` r
#i will add some attributes to the num_of_nodes and color the histogram accordingly
# num_of_nodes <- merge_
```

# network information

``` r
###multilayer network types###
multi <- data.frame()
for (i in 1:length(all_descriptions)) {
  multi <- rbind(multi, data.frame(network_id = i,
                 multi_type = all_descriptions[[i]][all_descriptions[[i]]$attribute == 'multilayer_network_type',]$value))
}


#count the number of types present in all the networks
counted_multi_types<-count(x = multi,multi_type)
colnames(counted_multi_types) = c('multi_type','count')

##create a dataframe that contains the proportion of each multi type for visualization
counted_multi_types <- counted_multi_types %>% 
  arrange(desc(multi_type)) %>%
  mutate(prop = count / sum(counted_multi_types$count) *100) %>%
  mutate(ypos = cumsum(prop)- 0.5*prop )


p2 <- ggplot(counted_multi_types, aes(x="",y=prop, fill=multi_type)) +
 geom_bar(stat="identity", width=1, color="black") + coord_polar("y", start = 0) +
 paper_figs_theme + ylab('') + xlab('')+ guides(fill=guide_legend(title=NULL)) + scale_fill_nejm()
p2
```

![](emlnFunctions_files/figure-gfm/Network%20Information-1.png)<!-- -->

``` r
###ecological layer types###
eco <- data.frame()
for (i in 1:length(all_descriptions)) {
  eco <- rbind(eco, data.frame(network_id = i,
                 eco_type = all_descriptions[[i]][all_descriptions[[i]]$attribute == 'ecological_network_type',]$value))
}

#count the number of types present in all the networks
counted_eco_types<-count(x = eco,eco_type)
colnames(counted_eco_types) = c('eco_type','count')

##create a dataframe that contains the proportion of each multi type for visualization
counted_eco_types <- counted_eco_types %>% 
  arrange(desc(eco_type)) %>%
  mutate(prop = count / sum(counted_eco_types$count) *100) %>%
  mutate(ypos = cumsum(prop)- 0.5*prop )


p3 <- ggplot(counted_eco_types, aes(x="",y=prop, fill=eco_type)) +
 geom_bar(stat="identity", width=1, color="black") + coord_polar("y", start = 0) +
 paper_figs_theme + ylab('') + xlab('') + guides(fill=guide_legend(title=NULL)) + scale_fill_nejm()
p3
```

![](emlnFunctions_files/figure-gfm/Network%20Information-2.png)<!-- -->

``` r
#save multilayer types
ggsave("~/GitHub/ecomplab/emln_package/data-raw//pie_multi_types.pdf",plot = p2,width =  10, height = 6)

#save ecological types
ggsave("~/GitHub/ecomplab/emln_package/data-raw//pie_eco_types.pdf",plot = p3,width =  10, height = 6)


#array of the types
library(ggpubr)
p5 <- ggarrange(plotlist = list(p2,p3), labels = list('(A)','(B)'), vjust = 7)

ggsave("~/GitHub/ecomplab/emln_package/data-raw//net_types_array.pdf",plot = p5,width =  10, height = 6)
```

``` r
#layer plot - how many layers of what types I have
p4 <- ggplot(counted_eco_types, aes(x=eco_type,y=count)) + 
  geom_bar(stat = 'identity', color='black',fill="gray") + xlab('Layer Type') + paper_figs_theme +
  theme(axis.text.x = element_text(angle = 75, vjust = 0.5, size = 12))

ggsave("~/GitHub/ecomplab/emln_package/data-raw//layer_types.pdf",plot = p4,width =  10, height = 6)


#combination of layer type and network type
multi_eco <- merge(multi,eco,by = 'network_id')

multi_eco <- count(multi_eco, multi_type, eco_type)

multi_eco$multi_type <- factor(multi_eco$multi_type , levels=c("Spatial","Temporal","Environment", "Multiplex","Perturbation"))

p10 <- ggplot(multi_eco, aes(x=multi_type,y=n, fill=eco_type)) + 
  geom_bar(stat = 'identity', color='black') + xlab('Multilayer Network Type') + paper_figs_theme +
  theme(axis.text.x = element_text(angle = 75, vjust = 0.5, size = 12)) + ylab('Count')  + scale_fill_nejm(name = 'Ecological Network Type')
p10 
```

![](emlnFunctions_files/figure-gfm/Layers%20Information-1.png)<!-- -->

``` r
ggsave("~/GitHub/ecomplab/emln_package/data-raw//multi_layer_types.pdf",plot = p10,width =  10, height = 6)
```

``` r
latitudes<-NULL
longitudes<-NULL
coord <- NULL
for(i in 1:81){
  if ('latitude' %in% all_layers[[i]]$attribute) {
    coord <- rbind(coord, data.frame(network_id = i,
                                     latitude = as.numeric(unlist(strsplit(filter(all_layers[[i]],
                                                                       attribute == 'latitude')$value,split = ','))),
                                     longitude = as.numeric(unlist(strsplit(filter(all_layers[[i]],
                                                                        attribute == 'longitude')$value, split =',')))
    ))
    latitudes<-c(latitudes,all_layers[[i]] %>% filter(attribute=="latitude") %>% unique)
    longitudes<-c(longitudes,all_layers[[i]] %>% filter(attribute=="longitude") %>% unique) 
  }
}

coord <- coord %>%
  group_by(latitude, longitude) %>%
  distinct() %>% 
  na.omit()


#there is a problem with the coordinates of network 39
coord <- coord[!coord$network_id==39,]

#add attributes to the map
coord <- merge(coord,multi[,c('network_id','multi_type')], by = 'network_id')

worldmap <- map_data("world")
p6 <- ggplot(worldmap) +
  geom_map(
    data = worldmap, map = worldmap,
    aes(long, lat, map_id = region),
    color = "white", fill = "lightgray", size = 0.1
  ) +
  geom_point(
    data = coord,
    aes(longitude, latitude, color = multi_type),
    alpha = 0.6) + expand_limits(x = worldmap$long, y = worldmap$lat) +
  theme_void() + theme(title = NULL)  + scale_color_nejm()
```

    ## Warning: Using `size` aesthetic for lines was deprecated in ggplot2 3.4.0.
    ## ℹ Please use `linewidth` instead.

    ## Warning in geom_map(data = worldmap, map = worldmap, aes(long, lat, map_id =
    ## region), : Ignoring unknown aesthetics: x and y

``` r
p6
```

![](emlnFunctions_files/figure-gfm/Map%20Visualization-1.png)<!-- -->

``` r
ggsave("~/GitHub/ecomplab/emln_package/data-raw//worldmap_plot_new.pdf",width = 25,height =15) 

p7 <- ggplot() +
  geom_map(
    data = worldmap, map = worldmap,
    aes(long, lat, map_id = region),
    color = "white", fill = "lightgray", size = 0.1
  ) +
  geom_point(
    data = coord,
    aes(longitude, latitude, color = network_id),
    alpha = 0.6
  ) + theme_void() +
  theme(legend.position = "none") 
```

    ## Warning in geom_map(data = worldmap, map = worldmap, aes(long, lat, map_id =
    ## region), : Ignoring unknown aesthetics: x and y

``` r
# grid <- ggpubr::ggarrange(plotlist = list(p0,p10,p_layers,p6), labels = list('(A)','(B)','(C)','(D)'))
# grid

grid <- ggpubr::ggarrange(
          ggpubr::ggarrange(p0,p_layers, ncol = 2, labels = c("(A)", "(B)")), 
          ggpubr::ggarrange(p10, labels = "(C)"), 
          ggpubr::ggarrange(p6, labels = "(D)"), 
          nrow = 3)
```

    ## `stat_bin()` using `bins = 30`. Pick better value with `binwidth`.
    ## `stat_bin()` using `bins = 30`. Pick better value with `binwidth`.

``` r
grid
```

![](emlnFunctions_files/figure-gfm/Map%20Visualization-2.png)<!-- -->

``` r
ggsave('~/GitHub/ecomplab/emln_package/data-raw//emln_metadata_figure.pdf', width =  10, height = 15, plot=grid)
```
