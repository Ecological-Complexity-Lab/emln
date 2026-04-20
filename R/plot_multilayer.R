#' Plot a multilayer network in the browser
#'
#' Converts an EMLN \code{multilayer} object to JSON and opens the Multilayer
#' Network Visualizer in the default web browser.
#'
#' @param multilayer A multilayer object (created by \code{create_multilayer_network}
#'   or \code{load_emln}).
#' @param bipartite Logical. Whether the network is bipartite. Defaults to
#'   \code{FALSE}. Bipartite is not auto-detected. When \code{TRUE}, the nodes table must contain a
#'   \code{node_type} (or legacy \code{node_group}) column with exactly two
#'   distinct values across the network.
#' @param directed Logical or NULL. Whether the network is directed. If NULL
#'   (default), auto-detected by checking intralayer edge symmetry.
#' @param port Integer. Port for the local HTTP server. Default is 8080.
#' @param viz_path Character. Path to the multilayer_viz directory. If NULL
#'   (default), uses the \code{viz} directory bundled with the package.
#' @param browser Choose the specific browser to open the visualizer.
#'  Defaults to the system default via \code{getOption("browser")}.
#'  Can be a browser name (e.g. "chrome", "firefox") or a command (e.g. "open -a 'Google Chrome'").
#'
#' @note The Multilayer Network Visualizer that this function targets is
#'   currently in beta. Feedback and bug reports are welcome at
#'   \url{https://github.com/Ecological-Complexity-Lab/emln/issues}.
#'
#' @return Invisibly returns the server handle. Use
#'   \code{httpuv::stopServer(handle)} to stop the server when done.
#'
#' @details
#' The function:
#' \enumerate{
#'   \item Converts the multilayer object to JSON via \code{multilayer_to_json}
#'   \item Starts a local HTTP server (using \code{httpuv}) that serves the
#'     visualizer app and the network JSON
#'   \item Opens the browser with auto-load enabled
#' }
#'
#' The server runs in the background. Call \code{httpuv::stopServer(handle)} or
#' close R to stop it. The JSON data is kept in memory and never written to disk.
#'
#' @seealso \code{multilayer_to_json, create_multilayer_network, load_emln}
#'
#' @export
#'
#' @examples
#' \dontrun{
#' net <- load_emln(60)
#' srv <- plot_multilayer(net, bipartite = TRUE)
#'
#' # When done:
#' httpuv::stopServer(srv)
#' }
plot_multilayer <- function(multilayer, bipartite = FALSE, directed = NULL,
                            port = 8080, viz_path = NULL,
                            browser = getOption("browser")) {
  message("Note: The Multilayer Network Visualizer is currently in beta. ",
          "Please report issues at https://github.com/Ecological-Complexity-Lab/emln/issues")

  # Convert to JSON
  json_str <- multilayer_to_json(multilayer, bipartite = bipartite, directed = directed)

  # Resolve visualizer path
  viz_path <- .resolve_viz_path(viz_path)
  message(sprintf("Serving visualizer from: %s", viz_path))

  # Create the httpuv app
  app <- list(
    call = function(req) {
      # Serve the network JSON at a special endpoint
      if (req$PATH_INFO == "/api/network.json") {
        return(list(
          status = 200L,
          headers = list(
            "Content-Type" = "application/json",
            "Access-Control-Allow-Origin" = "*",
            "Cache-Control" = "no-cache"
          ),
          body = json_str
        ))
      }

      # Serve static files from the visualizer directory
      # Map URL path to file system
      url_path <- req$PATH_INFO
      if (url_path == "/" || url_path == "") url_path <- "/index.html"

      file_path <- file.path(viz_path, gsub("^/", "", url_path))
      file_path <- normalizePath(file_path, mustWork = FALSE)

      # Security: ensure the path is within viz_path
      if (!startsWith(file_path, viz_path)) {
        return(list(status = 403L, headers = list(), body = "Forbidden"))
      }

      if (!file.exists(file_path) || dir.exists(file_path)) {
        return(list(status = 404L, headers = list(), body = "Not Found"))
      }

      # Determine content type
      ext <- tolower(tools::file_ext(file_path))
      content_types <- c(
        html = "text/html; charset=utf-8",
        htm = "text/html; charset=utf-8",
        js = "application/javascript; charset=utf-8",
        mjs = "application/javascript; charset=utf-8",
        css = "text/css; charset=utf-8",
        json = "application/json; charset=utf-8",
        png = "image/png",
        jpg = "image/jpeg",
        jpeg = "image/jpeg",
        svg = "image/svg+xml",
        gif = "image/gif",
        ico = "image/x-icon",
        woff = "font/woff",
        woff2 = "font/woff2"
      )
      ctype <- if (ext %in% names(content_types)) content_types[[ext]] else "application/octet-stream"

      # Read file
      if (ext %in% c("png", "jpg", "jpeg", "gif", "ico", "woff", "woff2")) {
        body <- readBin(file_path, "raw", file.info(file_path)$size)
      } else {
        body <- paste(readLines(file_path, warn = FALSE), collapse = "\n")
      }

      list(
        status = 200L,
        headers = list("Content-Type" = ctype, "Cache-Control" = "no-cache"),
        body = body
      )
    },
    onWSOpen = function(ws) {
      ws$close()
    } # No WebSocket support needed
  )

  # Start server on an available port
  max_attempts <- 50
  attempts <- 0
  server <- NULL

  while (is.null(server) && attempts < max_attempts) {
    tryCatch(
      {
        server <- httpuv::startServer("127.0.0.1", port, app)
      },
      error = function(e) {
        # Port in use, silently continue to the next one
      }
    )
    if (is.null(server)) {
      port <- port + 1
      attempts <- attempts + 1
    }
  }

  if (is.null(server)) {
    stop("Could not find an available port to start the server after ", max_attempts, " attempts.")
  }

  url <- sprintf("http://localhost:%d?autoload=true", port)
  message(sprintf("Server running at: %s", url))
  message("Call httpuv::stopServer(handle) to stop the server when done.")

  # Handle special case for Chrome on Mac
  if (!is.null(browser) && is.character(browser) &&
      tolower(browser) %in% c("chrome", "google chrome") &&
      Sys.info()["sysname"] == "Darwin") {
    browser <- "open -a 'Google Chrome'"
  }

  # Open browser
  utils::browseURL(url, browser = browser)

  invisible(server)
}


#' Resolve path to the bundled multilayer_viz web app
#'
#' Looks first for an installed copy at
#' \code{system.file("multilayer_viz", package = "emln")}, then falls back to
#' sibling/dev locations for in-source development.
#' @keywords internal
.resolve_viz_path <- function(viz_path = NULL) {
  if (!is.null(viz_path)) {
    if (!file.exists(file.path(viz_path, "index.html"))) {
      stop(sprintf(
        "`viz_path` does not contain index.html: %s", viz_path
      ))
    }
    return(normalizePath(viz_path, mustWork = TRUE))
  }

  # 1. Installed package: inst/multilayer_viz
  installed <- system.file("multilayer_viz", package = "emln")
  if (nzchar(installed) &&
      file.exists(file.path(installed, "index.html"))) {
    return(normalizePath(installed, mustWork = TRUE))
  }

  # 2. Dev fallbacks (running from emln source tree or a sibling checkout)
  cwd <- getwd()
  candidates <- c(
    file.path(cwd, "inst", "multilayer_viz"),
    file.path(cwd, "..", "emln", "inst", "multilayer_viz"),
    file.path(cwd, "..", "multilayer_viz"),
    file.path(dirname(cwd), "multilayer_viz")
  )
  for (cand in candidates) {
    if (file.exists(file.path(cand, "index.html"))) {
      return(normalizePath(cand, mustWork = TRUE))
    }
  }

  stop(
    "Could not find the multilayer_viz web app.\n",
    "Looked in: system.file('multilayer_viz', package = 'emln') and: ",
    paste(candidates, collapse = ", "), "\n",
    "If you are developing from source, pass `viz_path = ",
    "'path/to/multilayer_viz'` explicitly, or ensure ",
    "inst/multilayer_viz/index.html exists in your emln checkout."
  )
}
