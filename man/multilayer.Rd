\name{multilayer class}
\alias{multilayer}
\title{An object of class multilayer}

\value{
A list with:
\itemize{
   \item \code{nodes} Physical nodes. First column is a unique node id. Node attributes are included if provided as input.
   \item \code{layers} Information on layers.
   \item \code{extended} An extended link list of the format \code{layer_from node_from layer_to node_to weight}. All nodes and layers are identified by names.
   \item \code{extended_ids} An extended link list of the format \code{layer_from node_from layer_to node_to weight}. All nodes and layers are identified by unique IDs automoatically generated.
   \item \code{state_nodes} List of state nodes of the format \code{layer_id node_id layer_name node_name}. Also includes state node attributes if provided as input.
   \item \code{description} For compatibility with \code{load_emln}.
   \item \code{references} For compatibility with \code{load_emln}.
}
}
\description{
A network object of class multilayer contains all the necessary information and R objects that define a multilayer network.
}
\seealso{
\code{create_multilayer_network}
}

