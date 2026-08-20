Setup
=====

Local service development
-------------------------

Install the graph service with its development and documentation dependencies:

.. code-block:: console

   cd nexus-graph
   pip install -e ".[dev,docs]"
   uvicorn app.main:app --port 8006 --reload

The standalone frontend is optional for service development. The supported
product experience is the main platform route at ``/graph``. It calls the
same-origin gateway path ``/api/apps/graph/proxy/v1/graph/...``.

Build the documentation
-----------------------

.. code-block:: console

   cd nexus-graph/docs
   make html
   make linkcheck

The generated site is written to ``nexus-graph/docs/build/html``. Both commands
use warnings as errors so broken references fail CI.

Configuration
-------------

``CLUSTER_CACHE_TTL`` controls the in-process Louvain cache in seconds. Graph
read limits are server settings, not browser-controlled policy:

* ``GRAPH_MAX_SEARCH_LIMIT`` (default ``500``)
* ``GRAPH_MAX_EDGE_IDS`` (default ``200``)
* ``GRAPH_MAX_SUBGRAPH_DEPTH`` (default ``2``)
* ``GRAPH_MAX_SUBGRAPH_DEGREE`` (default ``40``)
* ``GRAPH_MAX_SUBGRAPH_NODES`` (default ``200``)
* ``GRAPH_MAX_SUBGRAPH_EDGES`` (default ``400``)
* ``GRAPH_DISPLAY_THRESHOLD`` (default ``80``)
* ``GRAPH_CLUSTER_MAX_NODES`` (default ``1000``)
* ``GRAPH_CLUSTER_MAX_EDGES`` (default ``3000``)