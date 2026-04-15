test_that("search_emln with no arguments returns a data frame", {
  result <- search_emln()
  expect_true(is.data.frame(result))
  expect_gt(nrow(result), 0)
})

test_that("search_emln result contains required columns", {
  result <- search_emln()
  expect_true(all(c("network_id", "network_name", "ecological_network_type",
                    "multilayer_network_type") %in% names(result)))
})

test_that("search_emln result is sorted by network_id", {
  result <- search_emln()
  expect_false(is.unsorted(result$network_id))
})

test_that("search_emln filters by ecological_network_type", {
  result <- search_emln(ecological_network_type = "Pollination")
  expect_true(is.data.frame(result))
  expect_true(all(result$ecological_network_type == "Pollination"))
})

test_that("search_emln filters by multilayer_network_type", {
  result <- search_emln(multilayer_network_type = "Temporal")
  expect_true(is.data.frame(result))
  expect_true(all(result$multilayer_network_type == "Temporal"))
})

test_that("search_emln filters by weighted", {
  result <- search_emln(weighted = TRUE)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$weighted == TRUE))
  }
})

test_that("search_emln filters by directed", {
  result <- search_emln(directed = TRUE)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$directed == TRUE))
  }
})

test_that("search_emln filters by interlayer", {
  result <- search_emln(interlayer = TRUE)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$interlayer == TRUE))
  }
})

test_that("search_emln filters by state_nodes", {
  result <- search_emln(state_nodes = TRUE)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$state_nodes == TRUE))
  }
})

test_that("search_emln filters by layer_number_minimum", {
  min_layers <- 5
  result <- search_emln(layer_number_minimum = min_layers)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$layer_num >= min_layers))
  }
})

test_that("search_emln filters by node_number_minimum", {
  min_nodes <- 10
  result <- search_emln(node_number_minimum = min_nodes)
  if (is.data.frame(result) && nrow(result) > 0) {
    expect_true(all(result$node_num >= min_nodes))
  }
})

test_that("search_emln returns fewer networks with tighter filters", {
  all_networks     <- search_emln()
  spatial_networks <- search_emln(multilayer_network_type = "Spatial")
  expect_lt(nrow(spatial_networks), nrow(all_networks))
})

test_that("search_emln returns a character string when no networks match", {
  # Extremely restrictive combination that is unlikely to match anything
  result <- search_emln(
    ecological_network_type = "Pollination",
    directed = TRUE,
    interlayer = TRUE,
    layer_number_minimum = 200
  )
  # The function returns a character string when nrow == 0
  expect_true(is.character(result) ||
                (is.data.frame(result) && nrow(result) == 0))
})
