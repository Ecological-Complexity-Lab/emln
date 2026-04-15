mat_unip <- matrix(
  c(0, 1, 0,
    0, 0, 1,
    0, 0, 0),
  nrow = 3, byrow = TRUE,
  dimnames = list(c("A", "B", "C"), c("A", "B", "C"))
)

mat_bip <- matrix(
  c(1, 0, 1,
    0, 1, 1),
  nrow = 2, byrow = TRUE,
  dimnames = list(c("Plant1", "Plant2"), c("Bee1", "Bee2", "Bee3"))
)

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

test_that("create_monolayer_network handles unipartite matrix input", {
  result <- create_monolayer_network(mat_unip, directed = TRUE, bipartite = FALSE)
  expect_s3_class(result, "monolayer")
  expect_equal(result$mode, "U")
})

test_that("create_monolayer_network handles bipartite matrix input", {
  result <- create_monolayer_network(mat_bip, directed = FALSE, bipartite = TRUE,
                                     group_names = c("Bees", "Plants"))
  expect_s3_class(result, "monolayer")
  expect_equal(result$mode, "B")
})

test_that("create_monolayer_network handles unipartite edge list input", {
  result <- create_monolayer_network(el_unip, directed = TRUE, bipartite = FALSE)
  expect_s3_class(result, "monolayer")
  expect_equal(result$mode, "U")
})

test_that("create_monolayer_network handles bipartite edge list input", {
  result <- create_monolayer_network(el_bip, directed = FALSE, bipartite = TRUE)
  expect_s3_class(result, "monolayer")
  expect_equal(result$mode, "B")
})

test_that("create_monolayer_network returns edge_list_ids with integer IDs", {
  result <- create_monolayer_network(mat_unip, directed = TRUE, bipartite = FALSE)
  expect_true("edge_list_ids" %in% names(result))
  expect_true(all(c("from", "to", "weight") %in% names(result$edge_list_ids)))
  expect_true(is.numeric(result$edge_list_ids$from))
  expect_true(is.numeric(result$edge_list_ids$to))
})

test_that("create_monolayer_network handles igraph object input", {
  g <- igraph::graph_from_adjacency_matrix(mat_unip, mode = "directed", weighted = TRUE)
  result <- create_monolayer_network(g)
  expect_s3_class(result, "monolayer")
  expect_equal(result$mode, "U")
})

test_that("create_monolayer_network node_metadata is joined into nodes table", {
  meta <- data.frame(node_name = c("A", "B", "C"), trait = c("x", "y", "z"),
                     stringsAsFactors = FALSE)
  result <- suppressMessages(
    create_monolayer_network(el_unip, directed = TRUE, bipartite = FALSE,
                             node_metadata = meta)
  )
  expect_true("trait" %in% names(result$nodes))
  expect_equal(nrow(result$nodes), 3)
})

test_that("create_monolayer_network directed flag propagates correctly", {
  result_dir <- create_monolayer_network(mat_unip, directed = TRUE, bipartite = FALSE)
  result_und <- create_monolayer_network(
    matrix(c(0, 1, 1, 1, 0, 1, 1, 1, 0), nrow = 3,
           dimnames = list(c("A", "B", "C"), c("A", "B", "C"))),
    directed = FALSE, bipartite = FALSE
  )
  expect_true(result_dir$directed)
  expect_false(result_und$directed)
})
