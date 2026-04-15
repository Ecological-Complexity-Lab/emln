# --- shared test fixtures ---

mat1 <- matrix(
  c(0, 1, 0,
    0, 0, 1,
    0, 0, 0),
  nrow = 3, byrow = TRUE,
  dimnames = list(c("A", "B", "C"), c("A", "B", "C"))
)
mat2 <- matrix(
  c(0, 0, 1,
    1, 0, 0,
    0, 1, 0),
  nrow = 3, byrow = TRUE,
  dimnames = list(c("A", "B", "C"), c("A", "B", "C"))
)

bip1 <- matrix(
  c(1, 0, 1,
    0, 1, 1),
  nrow = 2, byrow = TRUE,
  dimnames = list(c("Plant1", "Plant2"), c("Bee1", "Bee2", "Bee3"))
)
bip2 <- matrix(
  c(0, 1, 1,
    1, 0, 1),
  nrow = 2, byrow = TRUE,
  dimnames = list(c("Plant1", "Plant2"), c("Bee1", "Bee2", "Bee3"))
)

ml_unip <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
ml_bip  <- create_multilayer_network(list(bip1, bip2),
                                      bipartite = TRUE,  directed = FALSE)

# --- tests ---

test_that("get_igraph returns a list with layers_igraph, nodes, state_nodes_map", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_named(result, c("layers_igraph", "nodes", "state_nodes_map"))
})

test_that("get_igraph returns one igraph object per layer", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_equal(length(result$layers_igraph), nrow(ml_unip$layers))
})

test_that("get_igraph every element of layers_igraph is an igraph", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_true(all(sapply(result$layers_igraph, inherits, what = "igraph")))
})

test_that("get_igraph layer names match multilayer layer names", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_equal(names(result$layers_igraph), ml_unip$layers$layer_name)
})

test_that("get_igraph state_nodes_map has required columns", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_true(all(c("sn_id", "layer_name", "node_name") %in%
                    names(result$state_nodes_map)))
})

test_that("get_igraph nodes in output match nodes in multilayer", {
  result <- get_igraph(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_equal(result$nodes, ml_unip$nodes)
})

test_that("get_igraph works for bipartite network", {
  result <- get_igraph(ml_bip, bipartite = TRUE, directed = FALSE)
  expect_named(result, c("layers_igraph", "nodes", "state_nodes_map"))
  expect_equal(length(result$layers_igraph), nrow(ml_bip$layers))
  expect_true(all(sapply(result$layers_igraph, inherits, what = "igraph")))
})
