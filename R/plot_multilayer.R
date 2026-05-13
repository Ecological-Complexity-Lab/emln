#' Plot a multilayer network in the browser
#'
#' Converts an EMLN \code{multilayer} object to JSON and opens MiRA, the
#' multilayer interactive R-network app, in the default web browser.
#'
#' @param multilayer A multilayer object (created by \code{create_multilayer_network}
#'   or \code{load_emln}).
#' @param bipartite Logical. Whether the network is bipartite. Defaults to
#'   \code{FALSE}. Bipartite is not auto-detected. When \code{TRUE}, the nodes
#'   table must contain a \code{node_type} (or legacy \code{node_group})
#'   column with exactly two distinct values across the network.
#' @param setA_type Optional character. The \code{node_type} value to render
#'   as Set A (top row) in MiRA's bipartite layout. By ecological convention
#'   this is the higher trophic level (e.g. \code{"pollinator"},
#'   \code{"parasite"}, \code{"disperser"}). Only used when
#'   \code{bipartite = TRUE}. Forwarded to \code{multilayer_to_json}.
#' @param directed Logical or NULL. Whether intralayer links are directed.
#'   If NULL (default), auto-detected by checking intralayer edge symmetry.
#' @param directed_interlayer Logical or NULL. Whether interlayer links are
#'   directed. If NULL (default), inherits from \code{directed}.
#' @param port Integer. Port for the local HTTP server. Default is 8080.
#' @param mira_path Character. Path to the MiRA web-app directory. If NULL
#'   (default), uses the copy bundled with the package
#'   (\code{system.file("MiRA", package = "emln")}).
#' @param browser Choose the specific browser to open MiRA in. Defaults to
#'   the system default via \code{getOption("browser")}. Can be a browser
#'   name (e.g. "chrome", "firefox") or a command
#'   (e.g. "open -a 'Google Chrome'").
#'
#' @note
#' MiRA (Multilayer Interactive Rendering Application) is a browser-based
#' interactive visualization tool for multilayer networks, available at
#' \url{https://mira.ecomplab.com/}.
#'
#' If you use MiRA in published research, please cite:
#'
#' Nehoray SM, Bloch Y, Pilosof S (2026). Interactively visualizing biological
#' multilayer networks using MiRA. \emph{arXiv}:2605.09597 [cs.SI].
#' \doi{doi:10.48550/arXiv.2605.09597}
#'
#' Feedback and bug reports:
#' \url{https://github.com/Ecological-Complexity-Lab/MiRA/issues}.
#'
#' @return Invisibly returns the server handle. Use
#'   \code{httpuv::stopServer(handle)} to stop the server when done.
#'
#' @details
#' The function:
#' \enumerate{
#'   \item Converts the multilayer object to JSON via \code{multilayer_to_json}
#'   \item Starts a local HTTP server (using \code{httpuv}) that serves the
#'     MiRA app and the network JSON
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
#' if (interactive()){
#' net <- load_emln(60)
#' srv <- plot_multilayer(net, bipartite = TRUE, setA_type = "pollinator")
#'
#' # When done:
#' httpuv::stopServer(srv)
#' }
plot_multilayer <- function(multilayer, bipartite = FALSE, setA_type = NULL,
                            directed = NULL, directed_interlayer = NULL,
                            port = 8080, mira_path = NULL,
                            browser = getOption("browser")) {
  message("Please report issues at ",
          "https://github.com/Ecological-Complexity-Lab/MiRA/issues")

  # Convert to JSON
  json_str <- multilayer_to_json(
    multilayer,
    bipartite           = bipartite,
    setA_type           = setA_type,
    directed            = directed,
    directed_interlayer = directed_interlayer
  )

  # Resolve MiRA path
  mira_path <- .resolve_mira_path(mira_path)
  message(sprintf("Serving MiRA from: %s", mira_path))

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

      # Serve static files from the MiRA directory
      # Map URL path to file system
      url_path <- req$PATH_INFO
      if (url_path == "/" || url_path == "") url_path <- "/index.html"

      file_path <- file.path(mira_path, gsub("^/", "", url_path))
      file_path <- normalizePath(file_path, mustWork = FALSE)

      # Security: ensure the path is within mira_path
      if (!startsWith(file_path, mira_path)) {
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


#' Resolve path to the bundled MiRA web app
#'
#' Looks first for an installed copy at
#' \code{system.file("MiRA", package = "emln")}, then falls back to
#' sibling/dev locations for in-source development.
#' @keywords internal
.resolve_mira_path <- function(mira_path = NULL) {
  if (!is.null(mira_path)) {
    if (!file.exists(file.path(mira_path, "index.html"))) {
      stop(sprintf(
        "`mira_path` does not contain index.html: %s", mira_path
      ))
    }
    return(normalizePath(mira_path, mustWork = TRUE))
  }

  # 1. Installed package: inst/MiRA
  installed <- system.file("MiRA", package = "emln")
  if (nzchar(installed) &&
      file.exists(file.path(installed, "index.html"))) {
    return(normalizePath(installed, mustWork = TRUE))
  }

  # 2. Dev fallbacks (running from emln source tree or a sibling checkout)
  cwd <- getwd()
  candidates <- c(
    file.path(cwd, "inst", "MiRA"),
    file.path(cwd, "..", "emln", "inst", "MiRA"),
    file.path(cwd, "..", "MiRA"),
    file.path(dirname(cwd), "MiRA")
  )
  for (cand in candidates) {
    if (file.exists(file.path(cand, "index.html"))) {
      return(normalizePath(cand, mustWork = TRUE))
    }
  }

  stop(
    "Could not find the MiRA web app.\n",
    "Looked in: system.file('MiRA', package = 'emln') and: ",
    paste(candidates, collapse = ", "), "\n",
    "If you are developing from source, pass `mira_path = ",
    "'path/to/MiRA'` explicitly, or ensure ",
    "inst/MiRA/index.html exists in your emln checkout."
  )
}
