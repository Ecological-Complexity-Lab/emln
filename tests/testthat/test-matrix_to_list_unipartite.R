mat_directed <- matrix(
  c(0, 1, 0,
    0, 0, 1,
    1, 0, 0),
  nrow = 3, byrow = TRUE,
  dimnames = list(c("A", "B", "C"), c("A", "B", "C"))
)

mat_undirected <- matrix(
  c(0, 1, 1,
    1, 0, 1,
    1, 1, 0),
  nrow = 3, byrow = TRUE,
  dimnames = list(c("A", "B", "C"), c("A", "B", "C"))
)

mat_nonames <- matrix(
  c(0, 1, 0,
    0, 0, 1,
    1, 0, 0),
  nrow = 3, byrow = TRUE
)

test_that("matrix_to_list_unipartite returns a monolayer object", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_s3_class(result, "monolayer")
})

test_that("matrix_to_list_unipartite sets mode to U", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_equal(result$mode, "U")
})

test_that("matrix_to_list_unipartite reports directed correctly", {
  result_dir <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  result_und <- matrix_to_list_unipartite(mat_undirected, directed = FALSE)
  expect_true(result_dir$directed)
  expect_false(result_und$directed)
})

test_that("matrix_to_list_unipartite has all required list elements", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_named(result, c("mode", "directed", "nodes", "mat", "edge_list", "igraph_object"))
})

test_that("matrix_to_list_unipartite nodes table has correct columns and row count", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_true(all(c("node_id", "node_name") %in% names(result$nodes)))
  expect_equal(nrow(result$nodes), 3)
})

test_that("matrix_to_list_unipartite node names match matrix row/col names", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_setequal(result$nodes$node_name, rownames(mat_directed))
})

test_that("matrix_to_list_unipartite edge list has from, to, weight columns", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_true(all(c("from", "to", "weight") %in% names(result$edge_list)))
})

test_that("matrix_to_list_unipartite preserves the input matrix", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_equal(result$mat, mat_directed)
})

test_that("matrix_to_list_unipartite assigns names when both are missing", {
  result <- matrix_to_list_unipartite(mat_nonames, directed = TRUE)
  expect_s3_class(result, "monolayer")
  expect_equal(nrow(result$nodes), 3)
  expect_false(is.null(result$nodes$node_name))
})

test_that("matrix_to_list_unipartite igraph_object is an igraph", {
  result <- matrix_to_list_unipartite(mat_directed, directed = TRUE)
  expect_true(inherits(result$igraph_object, "igraph"))
})
