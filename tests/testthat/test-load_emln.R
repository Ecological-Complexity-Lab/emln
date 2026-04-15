test_that("load_emln returns a multilayer object", {
  result <- load_emln(1)
  expect_s3_class(result, "multilayer")
})

test_that("load_emln has all required element names", {
  result <- load_emln(1)
  expect_named(result, c("nodes", "layers", "extended", "extended_ids",
                          "state_nodes", "description", "references"))
})

test_that("load_emln nodes table has required columns", {
  result <- load_emln(1)
  expect_true(all(c("node_id", "node_name") %in% names(result$nodes)))
  expect_gt(nrow(result$nodes), 0)
})

test_that("load_emln layers table has required columns", {
  result <- load_emln(1)
  expect_true(all(c("layer_id", "layer_name") %in% names(result$layers)))
  expect_gt(nrow(result$layers), 0)
})

test_that("load_emln extended edge list has required columns", {
  result <- load_emln(1)
  expect_true(all(c("layer_from", "node_from", "layer_to", "node_to", "weight") %in%
                    names(result$extended)))
  expect_gt(nrow(result$extended), 0)
})

test_that("load_emln extended_ids uses numeric IDs for layers and nodes", {
  result <- load_emln(1)
  expect_true(is.numeric(result$extended_ids$layer_from))
  expect_true(is.numeric(result$extended_ids$node_from))
  expect_true(is.numeric(result$extended_ids$layer_to))
  expect_true(is.numeric(result$extended_ids$node_to))
})

test_that("load_emln state_nodes table has layer_id and node_id", {
  result <- load_emln(1)
  expect_true(all(c("layer_id", "node_id", "layer_name", "node_name") %in%
                    names(result$state_nodes)))
})

test_that("load_emln returns a character string for an invalid network_id", {
  result <- load_emln(9999)
  expect_true(is.character(result))
})

test_that("load_emln node IDs in nodes table are unique", {
  result <- load_emln(1)
  expect_equal(length(unique(result$nodes$node_id)), nrow(result$nodes))
})

test_that("load_emln layer IDs in layers table are unique", {
  result <- load_emln(1)
  expect_equal(length(unique(result$layers$layer_id)), nrow(result$layers))
})
