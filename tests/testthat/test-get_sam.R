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

test_that("get_sam returns a list with M, nodes, state_nodes_map", {
  result <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_named(result, c("M", "nodes", "state_nodes_map"))
})

test_that("get_sam M is a base matrix by default", {
  result <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_true(is.matrix(result$M))
})

test_that("get_sam M dimensions equal nodes * layers for unipartite network", {
  result    <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expected  <- nrow(ml_unip$nodes) * nrow(ml_unip$layers)
  expect_equal(nrow(result$M), expected)
  expect_equal(ncol(result$M), expected)
})

test_that("get_sam sparse=TRUE returns a sparseMatrix", {
  result <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE, sparse = TRUE)
  expect_true(inherits(result$M, "sparseMatrix"))
})

test_that("get_sam remove_zero_rows_cols trims empty rows and cols", {
  result_full <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE,
                          remove_zero_rows_cols = FALSE)
  result_trim <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE,
                          remove_zero_rows_cols = TRUE)
  expect_true(nrow(result_trim$M) <= nrow(result_full$M))
  expect_true(ncol(result_trim$M) <= ncol(result_full$M))
})

test_that("get_sam state_nodes_map has required columns", {
  result <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_true(all(c("sn_id", "layer_name", "node_name", "tuple") %in%
                    names(result$state_nodes_map)))
})

test_that("get_sam state_nodes_map row count equals nodes * layers", {
  result   <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expected <- nrow(ml_unip$nodes) * nrow(ml_unip$layers)
  expect_equal(nrow(result$state_nodes_map), expected)
})

test_that("get_sam works for bipartite network", {
  result <- get_sam(ml_bip, bipartite = TRUE, directed = FALSE)
  expect_named(result, c("M", "nodes", "state_nodes_map"))
  expect_true(is.matrix(result$M))
})

test_that("get_sam bipartite M dimensions equal nodes * layers", {
  result   <- get_sam(ml_bip, bipartite = TRUE, directed = FALSE)
  expected <- nrow(ml_bip$nodes) * nrow(ml_bip$layers)
  expect_equal(nrow(result$M), expected)
  expect_equal(ncol(result$M), expected)
})

test_that("get_sam nodes in output match nodes in multilayer", {
  result <- get_sam(ml_unip, bipartite = FALSE, directed = TRUE)
  expect_equal(result$nodes, ml_unip$nodes)
})
