Architecture
============

Request path
------------

The browser makes a same-origin request to the main Express application:

.. code-block:: text

   /api/apps/graph/proxy/v1/graph/subgraph/{entity_id}

The service-manager registry resolves the internal graph service URL and
proxies the request. This keeps container names, ports, and private addresses
out of browser code. A failed upstream response becomes a safe gateway error
that the platform graph page renders as an unavailable state.

Focused graph assembly
----------------------

Focused graphs begin with one entity root. PostgreSQL performs a recursive
traversal with an ordered, per-node relationship slice. Relationships are
ordered by descending weight and ascending relation id, producing stable
results. The service then applies node and edge caps *before* serializing a
response.

The first platform request uses depth one. If the response advertises
``canExpand: true``, the user may request ``nextDepth``. Replacing focus cancels
the earlier browser request so an old response cannot overwrite a newer choice.

Community summaries
-------------------

When a focused view exceeds the display threshold or was truncated, the service
runs Louvain only on the already bounded focused nodes and edges. The response
contains membership assignments and compact community summaries. Full-graph
clustering follows the same policy: it samples a bounded, deterministic entity
set and bounded relation set before invoking igraph.