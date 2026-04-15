el_unip <- data.frame(
  from   = c("A", "B", "C"),
  to     = c("B", "C", "A"),
  weight = c(1, 2, 3)
)

el_bip <- data.frame(
  from   = c("Plant1", "Plant1", "Plant2"),
  to     = c("Bee1", "Bee2", "Bee2"),
  weight = c(1, 2, 3)
)

test_that("list_to_matrix returns a monolayer for unipartite edge list", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  expect_s3_class(result, "monolayer")
})

test_that("list_to_matrix sets mode U for unipartite", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  expect_equal(result$mode, "U")
})

test_that("list_to_matrix returns a monolayer for bipartite edge list", {
  result <- list_to_matrix(el_bip, directed = FALSE, bipartite = TRUE)
  expect_s3_class(result, "monolayer")
})

test_that("list_to_matrix sets mode B for bipartite", {
  result <- list_to_matrix(el_bip, directed = FALSE, bipartite = TRUE)
  expect_equal(result$mode, "B")
})

test_that("list_to_matrix unipartite matrix is square", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  expect_equal(nrow(result$mat), ncol(result$mat))
})

test_that("list_to_matrix bipartite matrix has correct dimensions", {
  result <- list_to_matrix(el_bip, directed = FALSE, bipartite = TRUE)
  n_from <- length(unique(el_bip$from))
  n_to   <- length(unique(el_bip$to))
  # incidence matrix: rows are one set, cols are the other
  expect_true(setequal(dim(result$mat), c(n_from, n_to)))
})

test_that("list_to_matrix has all required list elements", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  expect_named(result, c("mode", "directed", "nodes", "mat", "edge_list", "igraph_object"))
})

test_that("list_to_matrix bipartite nodes table includes node_group", {
  result <- list_to_matrix(el_bip, directed = FALSE, bipartite = TRUE,
                            group_names = c("Plants", "Bees"))
  expect_true("node_group" %in% names(result$nodes))
  expect_setequal(unique(result$nodes$node_group), c("Plants", "Bees"))
})

test_that("list_to_matrix nodes table contains all unique nodes", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  all_nodes <- unique(c(el_unip$from, el_unip$to))
  expect_setequal(result$nodes$node_name, all_nodes)
})

test_that("list_to_matrix igraph_object is an igraph", {
  result <- list_to_matrix(el_unip, directed = TRUE, bipartite = FALSE)
  expect_true(inherits(result$igraph_object, "igraph"))
})
