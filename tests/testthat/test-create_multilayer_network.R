# Unipartite directed matrices: A->B, B->C in layer 1; A->C, B->A, C->B in layer 2
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

# Bipartite matrices: plants x pollinators
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

test_that("create_multilayer_network returns a multilayer object", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_s3_class(result, "multilayer")
})

test_that("create_multilayer_network has all required element names", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_named(result, c("nodes", "layers", "extended", "extended_ids",
                          "state_nodes", "description", "references"))
})

test_that("create_multilayer_network layers table has correct row count", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_equal(nrow(result$layers), 2)
})

test_that("create_multilayer_network nodes contains all physical nodes", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_equal(nrow(result$nodes), 3)
  expect_setequal(result$nodes$node_name, c("A", "B", "C"))
})

test_that("create_multilayer_network auto-generates layer_id and layer_name", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_true("layer_id"   %in% names(result$layers))
  expect_true("layer_name" %in% names(result$layers))
})

test_that("create_multilayer_network uses custom layer attributes", {
  layer_attrib <- data.frame(layer_id = 1:2,
                              layer_name = c("pond_1", "pond_2"))
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE,
                                      layer_attributes = layer_attrib)
  expect_equal(result$layers$layer_name, c("pond_1", "pond_2"))
})

test_that("create_multilayer_network extended edge list has required columns", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_true(all(c("layer_from", "node_from", "layer_to", "node_to", "weight") %in%
                    names(result$extended)))
})

test_that("create_multilayer_network extended_ids has integer layer and node IDs", {
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE)
  expect_true(is.integer(result$extended_ids$layer_from))
  expect_true(is.integer(result$extended_ids$node_from))
})

test_that("create_multilayer_network interlayer links are added to extended edge list", {
  layer_attrib <- data.frame(layer_id = 1:2,
                              layer_name = c("layer_1", "layer_2"))
  interlayer <- data.frame(
    layer_from = "layer_1", node_from = "A",
    layer_to   = "layer_2", node_to   = "A",
    weight     = 1
  )
  result <- create_multilayer_network(list(mat1, mat2),
                                      bipartite = FALSE, directed = TRUE,
                                      layer_attributes = layer_attrib,
                                      interlayer_links = interlayer)
  inter_rows <- result$extended[result$extended$layer_from != result$extended$layer_to, ]
  expect_gt(nrow(inter_rows), 0)
})

test_that("create_multilayer_network works with bipartite matrices", {
  result <- create_multilayer_network(list(bip1, bip2),
                                      bipartite = TRUE, directed = FALSE)
  expect_s3_class(result, "multilayer")
  expect_equal(nrow(result$layers), 2)
  # All plants and bees are physical nodes
  expect_setequal(result$nodes$node_name,
                  c("Plant1", "Plant2", "Bee1", "Bee2", "Bee3"))
})

test_that("create_multilayer_network errors when first column is not layer_id", {
  wrong_attrib <- data.frame(id = 1:2, layer_name = c("p1", "p2"))
  expect_error(
    create_multilayer_network(list(mat1, mat2),
                               bipartite = FALSE, directed = TRUE,
                               layer_attributes = wrong_attrib)
  )
})

test_that("create_multilayer_network errors on mismatched layer count", {
  layer_attrib_3 <- data.frame(layer_id = 1:3,
                                 layer_name = c("l1", "l2", "l3"))
  expect_error(
    create_multilayer_network(list(mat1, mat2),
                               bipartite = FALSE, directed = TRUE,
                               layer_attributes = layer_attrib_3)
  )
})

test_that("create_multilayer_network errors when layer_name column has duplicates", {
  dup_attrib <- data.frame(layer_id = 1:2, layer_name = c("same", "same"))
  expect_error(
    create_multilayer_network(list(mat1, mat2),
                               bipartite = FALSE, directed = TRUE,
                               layer_attributes = dup_attrib)
  )
})
