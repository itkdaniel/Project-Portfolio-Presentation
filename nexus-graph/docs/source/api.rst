Graph API
=========

All endpoints below are graph-service paths. Product clients prepend the
service-manager gateway prefix
``/api/apps/graph/proxy``.

Entity search
-------------

``GET /v1/graph/nodes?search=&type=&limit=&offset=``

Returns ``nodes``, ``total``, ``returned``, ``hasMore``, ``nextOffset``, and
``truncated``. The service rejects a requested limit above
``GRAPH_MAX_SEARCH_LIMIT``.

Focused graph
-------------

``GET /v1/graph/subgraph/{id}?depth=1&degree_limit=&node_limit=&edge_limit=``

The result has ``rootId``, returned node and edge counts, ``truncated``,
``displayMode``, ``canExpand``, ``nextDepth``, and a ``limits`` object. Clients
must surface a summarized/truncated result rather than assuming it represents
every database relationship.

The service accepts depth one or two. Values exceeding configured server limits
receive a validation error. The root must exist or the endpoint returns 404.

Details, edges, and clusters
----------------------------

* ``GET /v1/graph/nodes/{id}`` returns metadata, source information, and a
  bounded related-entity list.
* ``GET /v1/graph/edges?ids=a,b`` returns ``returned``, ``truncated``, and the
  applied ``edgeLimit``.
* ``GET /v1/graph/clusters`` returns Louvain assignments alongside bounded
  ``nodeCount``, ``edgeCount``, ``truncated``, ``limits``, and ``cachedUntil``.

Write routes remain separate. ``POST /v1/graph/relations`` requires the graph
admin token when one is configured.