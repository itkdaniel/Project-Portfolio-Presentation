# NexusGraph — Knowledge Graph + Visualization

Interactive force-directed knowledge graph built on top of the NexusConsult entity database.
Visualizes entities and relationships extracted by NexusScraper with Louvain community detection.

## Architecture

```
nexus-graph/
├── app/
│   ├── config.py           # Pydantic settings (port 8006, DB URL, cluster TTL)
│   ├── database.py         # Async SQLAlchemy + asyncpg session factory
│   ├── graph_engine.py     # Core graph queries + Louvain clustering (igraph)
│   ├── models/graph.py     # Pydantic response models
│   ├── routers/graph.py    # FastAPI route handlers
│   └── main.py             # create_app() factory; serves built React SPA
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main shell: state, load, toolbar, cluster toggle
│   │   ├── api.ts          # Fetch helpers for all /v1/graph/* endpoints
│   │   ├── convexHull.ts   # Graham scan convex hull + hull expansion
│   │   ├── types.ts        # TypeScript interfaces
│   │   └── components/
│   │       ├── GraphCanvas.tsx   # react-force-graph-2d wrapper + cluster overlay
│   │       ├── DetailDrawer.tsx  # Slide-in node detail panel
│   │       ├── SearchBar.tsx     # Live search filter
│   │       └── ColorLegend.tsx   # Entity type → color legend
│   ├── package.json        # React 18, react-force-graph-2d, Vite
│   └── vite.config.ts      # Dev proxy → localhost:8006
├── tests/
│   ├── test_graph_api.py   # HTTP integration tests (mock engine)
│   └── test_graph_engine.py # Engine unit tests (mock DB)
├── pyproject.toml          # python-igraph, sqlalchemy[asyncio], asyncpg, fastapi
└── Dockerfile              # Multi-stage: Node build → Python runtime
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/info` | — | Service info + endpoint list |
| GET | `/openapi.json` | — | OpenAPI 3.1 spec |
| GET | `/v1/graph/nodes` | — | Paginated entity nodes; `?search=`, `?type=`, `?limit=`, `?offset=` |
| GET | `/v1/graph/nodes/:id` | — | Single node detail + neighbor list |
| GET | `/v1/graph/edges` | — | Edges between given node IDs (`?ids=uuid1,uuid2,…`) |
| GET | `/v1/graph/clusters` | — | Louvain community assignments (10 min cache) |
| GET | `/v1/graph/subgraph/:id` | — | Ego-graph radius 2 (node + all 2-hop neighbours) |
| POST | `/v1/graph/relations` | Admin | Create manual weighted relation |
| POST | `/v1/graph/quantum/partition` | — | QAOA-inspired quantum graph bipartitioning (see below) |

### Quantum Endpoint — `POST /v1/graph/quantum/partition`

Finds a minimum-cut bipartition of the supplied graph using QAOA-inspired
simulated annealing. Returns both partitions alongside a greedy classical
Kernighan-Lin baseline for comparison.

**Request**
```json
{
  "nodes":      ["A", "B", "C", "D"],
  "edges":      [{"source": "A", "target": "B", "weight": 1.5}],
  "num_rounds": 300
}
```

**Response**
```json
{
  "partition_a":          ["A", "C"],
  "partition_b":          ["B", "D"],
  "cut_weight":           1.5,
  "classical_cut_weight": 2.0,
  "improvement_pct":      25.0,
  "fallback_used":        true,
  "error":                null
}
```

`cut_weight` is always derived from the returned `partition_a` / `partition_b`
so the metric is guaranteed to be consistent with the actual partition boundary.

**Graceful fallback**: when `AZURE_QUANTUM_WORKSPACE_ID` is absent the
simulation runs locally; `fallback_used` is `true`.  
**Error shape on non-200**: `{"error": "...", "fallback_used": bool}` with HTTP 422.

## Graph Algorithms

### Node ranking
Nodes are sorted by **relation count** (descending) so the most-connected entities appear first.
Node size on the canvas scales with `√(relationCount)`.

### Louvain community detection
Uses [`python-igraph`](https://igraph.org/python/) `Graph.community_multilevel()` which implements
the Louvain algorithm:

1. All entities become graph vertices; entity relations become undirected edges.
2. `community_multilevel()` greedily maximises modularity Q across multiple rounds.
3. Each vertex receives a community ID (0-indexed integer).
4. Results are cached in-process for **10 minutes** to avoid re-running on every request.
5. When the entity database changes (new relation created), the cache is **invalidated automatically**.

Typical complexity: **O(n log n)** for sparse graphs.

### Ego-graph (subgraph)
`GET /v1/graph/subgraph/:id` returns all nodes within graph distance 2 of the target node
using a two-level CTE in PostgreSQL — no full-graph load required.

### Convex hull (cluster overlay)
The React frontend draws cluster regions using a **Graham scan** convex hull, expanded outward
by a 18px padding for visual clarity. Implemented in `frontend/src/convexHull.ts`.

## Quick Start

### Python backend
```bash
cd nexus-graph
pip install -e ".[dev]"
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/nexus \
  uvicorn app.main:app --port 8006 --reload
```

### Frontend (dev with proxy)
```bash
cd nexus-graph/frontend
npm install
npm run dev          # http://localhost:5174 → proxies /v1 to :8006
```

### Docker (full stack)
```bash
cd nexus-graph
docker build -t nexus-graph .
docker run -p 8006:8006 \
  -e DATABASE_URL=postgresql+asyncpg://user:pass@host/nexus \
  nexus-graph
# Visit http://localhost:8006 to see the UI
```

### Tests
```bash
cd nexus-graph
pytest tests/ -v --cov=app
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/nexus` | Shared NexusConsult PostgreSQL URL |
| `PORT` | `8006` | Listening port |
| `DEBUG` | `false` | Enable SQLAlchemy echo |
| `CLUSTER_CACHE_TTL` | `600` | Cluster result TTL in seconds |

## Frontend Features

- **Force-directed canvas** — WebGL-accelerated via `react-force-graph-2d`
- **Node colours** — mapped from `entity_types.color` in the database (10 defaults seeded)
- **Node size** — scales with `√(relationCount)` so hubs are visually prominent
- **Search highlight** — matching nodes pulse; non-matching nodes dim to 20% opacity
- **Detail drawer** — click any node to open a slide-in panel with full entity info,
  confidence score, trend score, source link, and a scrollable neighbour list
- **Neighbour navigation** — clicking a neighbour loads its ego-subgraph and recentres
- **Cluster toggle** — fetches `/v1/graph/clusters`; draws convex hull per Louvain community
  with a dashed stroke and semi-transparent fill; labels each cluster at its centroid
- **Fit to screen** button — `zoomToFit(400, 40)`
- **Load more** — loads the next 100 nodes by relation count without replacing the current graph
- **Type filter** — dropdown populated from node types visible in the current graph
- **Color legend** — collapsible panel showing entity type → colour with per-type counts
