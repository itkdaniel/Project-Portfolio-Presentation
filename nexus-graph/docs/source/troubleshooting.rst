Troubleshooting
===============

Graph page remains unavailable
------------------------------

Open the platform deployments/status experience and check the ``graph`` service
health. The graph page reports gateway failures rather than spinning forever.
Confirm the service-manager registry can resolve ``SUB_APP_GRAPH_URL`` (or its
legacy ``NEXUS_GRAPH_URL`` counterpart) and that the graph service health route
responds.

No search results
-----------------

An empty search is valid when the entity database has no matching rows. Remove
the type filter, try a shorter term, and verify the scraper has created
entities. Empty results are different from the graph-service unavailable alert.

A graph is summarized
---------------------

The platform indicates when a response hit node/edge bounds or crossed the
display threshold. Inspect the response ``limits`` and ``nextDepth`` fields.
This is expected protection for high-degree entities, not lost data.

Cluster results seem old
------------------------

Review ``cachedUntil`` and ``CLUSTER_CACHE_TTL``. Manual relation creation
invalidates the cache. For externally written database changes, wait for the
TTL or restart only as part of normal service operations.