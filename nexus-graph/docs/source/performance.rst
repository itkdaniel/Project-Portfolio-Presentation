Performance limits and clustering
=================================

Why limits are visible
----------------------

Highly connected entities can have many more relationships than a browser can
meaningfully display. NexusGraph bounds data at the database boundary and sends
the applied limits with every focused response. A user can distinguish an empty
graph from a summarized graph and choose whether to request the next supported
depth.

Bounded work
------------

The traversal cap is applied per frontier entity, then total nodes and edges are
capped. This prevents a graph request from loading an unbounded database graph
into application memory. The edge endpoint similarly caps both the number of
entity identifiers and relation rows.

Louvain cache
-------------

Cluster results are cached in-process for ``CLUSTER_CACHE_TTL`` seconds and are
invalidated when a manual relationship is created. Each cache entry is built
from only the configured cluster node and edge caps. The ``cachedUntil`` field
helps callers explain whether they are seeing a fresh or cached summary.

Operational guidance
--------------------

Start with the defaults. Increase a limit only after measuring database query
time, memory use, and frontend interaction on representative high-degree data.
Do not bypass bounds in an admin browser client; use an offline analysis job
when whole-graph computation is genuinely required.