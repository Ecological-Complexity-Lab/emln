install.packages("emln")
remotes::install_github("rlesur/klippy")

# Make the website
rmarkdown::render_site(input = './website/website_source')

# Remove unnecesary files
unlink('./website/docs/', recursive = TRUE, force = FALSE) # delete old one
file.copy('./website/website_source/docs/', './website', recursive = TRUE)
unlink('./website/website_source/analysis_example_files/', recursive = TRUE, force = FALSE)
unlink('./website/website_source/docs/', recursive = TRUE, force = FALSE)
