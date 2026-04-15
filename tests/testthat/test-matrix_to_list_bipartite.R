mat_bip <- matrix(
  c(1, 0, 1,
    0, 1, 1),
  nrow = 2, byrow = TRUE,
  dimnames = list(c("Plant1", "Plant2"), c("Bee1", "Bee2", "Bee3"))
)

mat_bip_nonames <- matrix(
  c(1, 0, 1,
    0, 1, 1),
  nrow = 2, byrow = TRUE
)

mat_bip_overlap <- matrix(
  c(1, 0, 1,
    0, 1, 1),
  nrow = 2, byrow = TRUE,
  dimnames = list(c("A", "B"), c("A", "C", "D"))  # "A" overlaps
)

test_that("matrix_to_list_bipartite returns a monolayer object", {
  result <- matrix_to_list_bipartite(mat_bip, group_names = c("Bees", "Plants"))
  expect_s3_class(result, "monolayer")
})

test_that("matrix_to_list_bipartite sets mode to B and is undirected", {
  result <- matrix_to_list_bipartite(mat_bip)
  expect_equal(result$mode, "B")
  expect_false(result$directed)
})

test_that("matrix_to_list_bipartite has all required list elements", {
  result <- matrix_to_list_bipartite(mat_bip)
  expect_named(result, c("mode", "directed", "nodes", "mat", "edge_list", "igraph_object"))
})

test_that("matrix_to_list_bipartite nodes table has node_group column", {
  result <- matrix_to_list_bipartite(mat_bip, group_names = c("Bees", "Plants"))
  expect_true("node_group" %in% names(result$nodes))
})

test_that("matrix_to_list_bipartite nodes table has correct total count", {
  result <- matrix_to_list_bipartite(mat_bip)
  # 2 row nodes + 3 col nodes
  expect_equal(nrow(result$nodes), 5)
})

test_that("matrix_to_list_bipartite assigns custom group names correctly", {
  result <- matrix_to_list_bipartite(mat_bip, group_names = c("Bees", "Plants"))
  expect_setequal(unique(result$nodes$node_group), c("Bees", "Plants"))
})

test_that("matrix_to_list_bipartite edge list has from, to, weight columns", {
  result <- matrix_to_list_bipartite(mat_bip)
  expect_true(all(c("from", "to", "weight") %in% names(result$edge_list)))
})

test_that("matrix_to_list_bipartite errors when row and col names overlap", {
  expect_error(matrix_to_list_bipartite(mat_bip_overlap))
})

test_that("matrix_to_list_bipartite assigns names when missing", {
  result <- matrix_to_list_bipartite(mat_bip_nonames)
  expect_s3_class(result, "monolayer")
  expect_equal(nrow(result$nodes), 5)
})

test_that("matrix_to_list_bipartite igraph_object is an igraph", {
  result <- matrix_to_list_bipartite(mat_bip)
  expect_true(inherits(result$igraph_object, "igraph"))
})
