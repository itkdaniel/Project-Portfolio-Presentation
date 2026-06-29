/**
 * API Gateway Layer — Sub-App Registry
 *
 * Maintains a registry of the four standalone NexusConsult microservices and
 * exposes helpers for parallel health-checking, OpenAPI spec caching, and
 * transparent HTTP proxying.
 *
 * Sub-app base URLs are resolved from dedicated SUB_APP_* env vars, falling
 * back to the legacy NEXUS_* vars for backward compatibility, and finally to
 * well-known localhost ports when running in a local dev environment.
 */

import type { Request, Response as ExpressResponse } from "express";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubAppEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
}

export interface SubAppInfo {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  healthPath: string;
  openApiPath: string;
  tags: string[];
  matchKeys: string[];
  endpoints: SubAppEndpoint[];
  githubUrl?: string;
}

export interface SubAppStatus extends SubAppInfo {
  status: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
  upstreamDetail?: unknown;
}

// ── URL resolution ────────────────────────────────────────────────────────────

export function resolveUrl(
  subAppVar: string,
  nexusVar: string,
  defaultPort: number,
): string {
  const val =
    process.env[subAppVar] ||
    process.env[nexusVar] ||
    `http://localhost:${defaultPort}`;
  return val.replace(/\/$/, "");
}

// ── Registry ──────────────────────────────────────────────────────────────────

export function buildRegistry(): SubAppInfo[] {
  return [
    {
      name: "booking",
      label: "Nexus Booking",
      description:
        "Step-based consultation scheduling service with calendar availability, slot management, and email confirmation.",
      baseUrl: resolveUrl("SUB_APP_BOOKING_URL", "NEXUS_BOOKING_URL", 8003),
      port: 8003,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "PostgreSQL", "Calendar"],
      matchKeys: ["booking", "schedule", "calendar", "appointment"],
      endpoints: [
        { method: "GET",  path: "/health",                 description: "Health check",             auth: false },
        { method: "GET",  path: "/v1/booking/slots",       description: "Available time slots",     auth: false },
        { method: "POST", path: "/v1/booking/bookings",    description: "Create a booking",         auth: false },
        { method: "GET",  path: "/v1/booking/bookings",    description: "List all bookings",        auth: true  },
        { method: "GET",  path: "/openapi.json",           description: "OpenAPI spec",             auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-booking",
    },
    {
      name: "tax",
      label: "Nexus Tax",
      description:
        "Guided tax questionnaire engine with IRS form recommendations, bracket calculations, and multi-year period management.",
      baseUrl: resolveUrl("SUB_APP_TAX_URL", "NEXUS_TAX_URL", 8004),
      port: 8004,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "Tax Forms", "IRS"],
      matchKeys: ["tax", "irs", "form", "filing", "deduction"],
      endpoints: [
        { method: "GET",  path: "/health",                 description: "Health check",             auth: false },
        { method: "GET",  path: "/v1/tax/periods",         description: "Tax year periods",         auth: false },
        { method: "GET",  path: "/v1/tax/forms/federal",   description: "Federal tax forms",        auth: false },
        { method: "POST", path: "/v1/tax/sessions",        description: "Start questionnaire",      auth: false },
        { method: "GET",  path: "/openapi.json",           description: "OpenAPI spec",             auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-tax",
    },
    {
      name: "search",
      label: "Nexus Search",
      description:
        "BM25 full-text search engine with Levenshtein fuzzy matching, Jaccard tag filtering, and BFS tag-graph recommendations.",
      baseUrl: resolveUrl("SUB_APP_SEARCH_URL", "NEXUS_SEARCH_URL", 8002),
      port: 8002,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "BM25", "Redis", "Algorithms"],
      matchKeys: ["search", "bm25", "query", "index", "recommend"],
      endpoints: [
        { method: "GET",  path: "/health",                    description: "Health check",                      auth: false },
        { method: "GET",  path: "/v1/search",                 description: "Full-text search (BM25)",           auth: false },
        { method: "GET",  path: "/v1/projects",               description: "List projects",                     auth: false },
        { method: "GET",  path: "/v1/projects/:id/related",   description: "BFS tag recommendations",          auth: false },
        { method: "POST", path: "/v1/search/quantum/tune",    description: "Quantum BM25 parameter tuning",    auth: false },
        { method: "GET",  path: "/openapi.json",              description: "OpenAPI spec",                      auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-search",
    },
    {
      name: "ai",
      label: "Nexus AI",
      description:
        "PyTorch transformer inference service built from scratch — BPE tokenization, MLM pre-training, classification, embeddings, and fill-mask.",
      baseUrl: resolveUrl("SUB_APP_AI_URL", "NEXUS_AI_URL", 8001),
      port: 8001,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["PyTorch", "Python", "Transformer", "NLP", "ML"],
      matchKeys: ["ai", "ml", "model", "transformer", "nlp", "embed", "classify"],
      endpoints: [
        { method: "GET",  path: "/health",                 description: "Health check",                       auth: false },
        { method: "POST", path: "/v1/ai/classify",         description: "Text classification",                auth: false },
        { method: "POST", path: "/v1/ai/embed",            description: "Sentence embeddings",                auth: false },
        { method: "POST", path: "/v1/ai/similarity",       description: "Cosine similarity",                  auth: false },
        { method: "POST", path: "/v1/ai/fill-mask",        description: "Fill-mask inference",                auth: false },
        { method: "GET",  path: "/v1/ai/status",           description: "Model status",                       auth: false },
        { method: "POST", path: "/v1/ai/quantum/embed",    description: "VQE-inspired quantum feature map",   auth: false },
        { method: "GET",  path: "/openapi.json",           description: "OpenAPI spec",                       auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-ai",
    },
    {
      name: "scraper",
      label: "Nexus Scraper",
      description:
        "Web scraper microservice — crawls URLs, classifies entities via NLP, stores structured knowledge with embeddings; trending seeds from HN + Reddit every 6 h.",
      baseUrl: resolveUrl("SUB_APP_SCRAPER_URL", "NEXUS_SCRAPER_URL", 8005),
      port: 8005,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "BeautifulSoup", "NLP", "PostgreSQL", "APScheduler"],
      matchKeys: ["scraper", "scrape", "entity", "crawl", "trending", "hn", "reddit", "knowledge"],
      endpoints: [
        { method: "GET",  path: "/health",                  description: "Health check",               auth: false },
        { method: "GET",  path: "/info",                    description: "Service info + endpoint list",auth: false },
        { method: "POST", path: "/v1/scrape/url",           description: "Scrape a single URL",        auth: false },
        { method: "POST", path: "/v1/scrape/onion",         description: "Scrape a .onion URL via Tor", auth: false },
        { method: "GET",  path: "/v1/scrape/jobs",          description: "List recent scrape jobs",    auth: false },
        { method: "GET",  path: "/v1/scrape/jobs/:id",      description: "Single job detail",          auth: false },
        { method: "POST", path: "/v1/scrape/trending",      description: "Trigger trending scrape run",auth: false },
        { method: "GET",  path: "/v1/entities",             description: "List entities (paginated)",  auth: false },
        { method: "GET",  path: "/v1/entities/:id",         description: "Single entity with relations",auth: false },
        { method: "GET",  path: "/v1/entity-types",         description: "Available entity types",     auth: false },
        { method: "GET",  path: "/openapi.json",            description: "OpenAPI spec",               auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-scraper",
    },
    {
      name: "graph",
      label: "Nexus Graph",
      description:
        "Knowledge graph API — interactive force-directed entity graph with Louvain community detection, ego-subgraph queries, and a React canvas UI.",
      baseUrl: resolveUrl("SUB_APP_GRAPH_URL", "NEXUS_GRAPH_URL", 8006),
      port: 8006,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "igraph", "Louvain", "React", "D3", "PostgreSQL"],
      matchKeys: ["graph", "knowledge", "cluster", "node", "edge", "relation", "louvain", "visualize"],
      endpoints: [
        { method: "GET",  path: "/health",                       description: "Health check",               auth: false },
        { method: "GET",  path: "/info",                         description: "Service info + endpoint list",auth: false },
        { method: "GET",  path: "/openapi.json",                 description: "OpenAPI spec",               auth: false },
        { method: "GET",  path: "/v1/graph/nodes",               description: "Paginated entity nodes",     auth: false },
        { method: "GET",  path: "/v1/graph/nodes/:id",           description: "Single node detail + neighbors", auth: false },
        { method: "GET",  path: "/v1/graph/edges",               description: "Edges between node IDs",     auth: false },
        { method: "GET",  path: "/v1/graph/clusters",            description: "Louvain community clusters", auth: false },
        { method: "GET",  path: "/v1/graph/subgraph/:id",        description: "Ego-graph radius 2",         auth: false },
        { method: "POST", path: "/v1/graph/relations",           description: "Create manual relation",     auth: true  },
        { method: "POST", path: "/v1/graph/quantum/partition",   description: "QAOA min-cut bipartition",   auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-graph",
    },

    // ── NexusCrypto Ecosystem ─────────────────────────────────────────────────
    // NexusCrypto is the parent platform; its microservices are registered here
    // so the portfolio gateway can health-check, proxy, and document them all.
    {
      name: "crypto",
      label: "NexusCrypto",
      description:
        "Full-stack cryptocurrency portfolio and trading platform — real-time price feeds, wallet management, DEX trading engine, and portfolio analytics, unified under a single API gateway.",
      baseUrl: resolveUrl("SUB_APP_CRYPTO_URL", "NEXUS_CRYPTO_URL", 8100),
      port: 8100,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["Next.js", "TypeScript", "Crypto", "WebSocket", "PostgreSQL"],
      matchKeys: ["crypto", "bitcoin", "ethereum", "blockchain", "portfolio", "coin"],
      endpoints: [
        { method: "GET",  path: "/health",                    description: "Health check",                  auth: false },
        { method: "GET",  path: "/info",                      description: "Platform info + sub-app links", auth: false },
        { method: "GET",  path: "/v1/crypto/coins",           description: "Supported coins & metadata",    auth: false },
        { method: "GET",  path: "/v1/crypto/prices",          description: "Live spot prices (all coins)",  auth: false },
        { method: "GET",  path: "/v1/crypto/prices/:symbol",  description: "Single coin price + 24h change",auth: false },
        { method: "GET",  path: "/v1/crypto/portfolio",       description: "Authenticated portfolio summary",auth: true  },
        { method: "POST", path: "/v1/crypto/auth/login",      description: "Login → JWT",                   auth: false },
        { method: "POST", path: "/v1/crypto/auth/register",   description: "Register new account",          auth: false },
        { method: "GET",  path: "/openapi.json",              description: "OpenAPI spec",                  auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-crypto",
    },
    {
      name: "crypto-market",
      label: "Crypto Market",
      description:
        "Real-time market data microservice — OHLCV candlestick aggregation, WebSocket price streaming, order book depth snapshots, and 24h ticker summaries from multiple exchange feeds.",
      baseUrl: resolveUrl("SUB_APP_CRYPTO_MARKET_URL", "NEXUS_CRYPTO_MARKET_URL", 8101),
      port: 8101,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "WebSocket", "OHLCV", "Redis"],
      matchKeys: ["market", "price", "ohlcv", "candle", "ticker", "orderbook", "feed"],
      endpoints: [
        { method: "GET",  path: "/health",                            description: "Health check",               auth: false },
        { method: "GET",  path: "/v1/market/tickers",                 description: "All 24h tickers",            auth: false },
        { method: "GET",  path: "/v1/market/ticker/:symbol",          description: "Single ticker",              auth: false },
        { method: "GET",  path: "/v1/market/ohlcv/:symbol",          description: "OHLCV candles",              auth: false },
        { method: "GET",  path: "/v1/market/orderbook/:symbol",       description: "Order book depth",           auth: false },
        { method: "GET",  path: "/v1/market/history/:symbol",         description: "Price history (paginated)",  auth: false },
        { method: "GET",  path: "/openapi.json",                      description: "OpenAPI spec",               auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-crypto-market",
    },
    {
      name: "crypto-wallet",
      label: "Crypto Wallet",
      description:
        "Non-custodial wallet microservice — HD wallet derivation, multi-chain balance aggregation, transaction broadcast, and gas estimation for EVM and UTXO chains.",
      baseUrl: resolveUrl("SUB_APP_CRYPTO_WALLET_URL", "NEXUS_CRYPTO_WALLET_URL", 8102),
      port: 8102,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "Web3", "EVM", "BTC", "HD Wallet"],
      matchKeys: ["wallet", "address", "balance", "send", "receive", "utxo", "evm", "web3"],
      endpoints: [
        { method: "GET",  path: "/health",                            description: "Health check",                  auth: false },
        { method: "POST", path: "/v1/wallet/create",                  description: "Create HD wallet",              auth: true  },
        { method: "GET",  path: "/v1/wallet/:address/balance",        description: "Multi-chain balance",           auth: true  },
        { method: "GET",  path: "/v1/wallet/:address/transactions",   description: "Transaction history",           auth: true  },
        { method: "POST", path: "/v1/wallet/send",                    description: "Broadcast transaction",         auth: true  },
        { method: "GET",  path: "/v1/wallet/gas/:chain",              description: "Gas price estimate",            auth: false },
        { method: "GET",  path: "/openapi.json",                      description: "OpenAPI spec",                  auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-crypto-wallet",
    },
    {
      name: "crypto-dex",
      label: "Crypto DEX",
      description:
        "Decentralized exchange trading engine — AMM liquidity pools, limit order book, swap routing across pools, slippage estimation, and on-chain settlement via smart contract proxies.",
      baseUrl: resolveUrl("SUB_APP_CRYPTO_DEX_URL", "NEXUS_CRYPTO_DEX_URL", 8103),
      port: 8103,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "AMM", "DEX", "Smart Contracts", "Solidity"],
      matchKeys: ["dex", "swap", "liquidity", "pool", "amm", "trade", "order", "slippage"],
      endpoints: [
        { method: "GET",  path: "/health",                            description: "Health check",               auth: false },
        { method: "GET",  path: "/v1/dex/pools",                      description: "Liquidity pool list",        auth: false },
        { method: "GET",  path: "/v1/dex/pools/:id",                  description: "Single pool detail",         auth: false },
        { method: "POST", path: "/v1/dex/quote",                      description: "Swap quote + routing",       auth: false },
        { method: "POST", path: "/v1/dex/swap",                       description: "Execute swap",               auth: true  },
        { method: "GET",  path: "/v1/dex/orders",                     description: "Open limit orders",          auth: true  },
        { method: "POST", path: "/v1/dex/orders",                     description: "Place limit order",          auth: true  },
        { method: "DELETE",path: "/v1/dex/orders/:id",                description: "Cancel order",               auth: true  },
        { method: "GET",  path: "/openapi.json",                      description: "OpenAPI spec",               auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-crypto-dex",
    },
    {
      name: "crypto-analytics",
      label: "Crypto Analytics",
      description:
        "Portfolio analytics microservice — P&L attribution, rolling Sharpe ratio, drawdown analysis, asset correlation matrix, and on-chain DeFi position aggregation.",
      baseUrl: resolveUrl("SUB_APP_CRYPTO_ANALYTICS_URL", "NEXUS_CRYPTO_ANALYTICS_URL", 8104),
      port: 8104,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "Pandas", "Analytics", "DeFi", "P&L"],
      matchKeys: ["analytics", "pnl", "sharpe", "drawdown", "correlation", "performance", "defi", "yield"],
      endpoints: [
        { method: "GET",  path: "/health",                              description: "Health check",                        auth: false },
        { method: "GET",  path: "/v1/analytics/portfolio/:userId",      description: "Full portfolio report",               auth: true  },
        { method: "GET",  path: "/v1/analytics/pnl/:userId",           description: "P&L attribution breakdown",           auth: true  },
        { method: "GET",  path: "/v1/analytics/performance/:userId",    description: "Sharpe + drawdown metrics",           auth: true  },
        { method: "GET",  path: "/v1/analytics/correlation",            description: "Asset correlation matrix",            auth: false },
        { method: "GET",  path: "/v1/analytics/defi/:address",          description: "DeFi position aggregation",           auth: true  },
        { method: "POST", path: "/v1/analytics/quantum/optimize",       description: "QAOA portfolio optimization",         auth: false },
        { method: "GET",  path: "/openapi.json",                        description: "OpenAPI spec",                        auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-crypto-analytics",
    },

    // ── Nexus Quantum ─────────────────────────────────────────────────────────
    {
      name: "quantum",
      label: "Nexus Quantum",
      description:
        "Azure Quantum microservice — quantum circuit simulation, QAOA/VQE variational algorithms, and quantum-inspired optimization (portfolio balancing, route planning, QUBO constraint solving). Degrades gracefully to local simulation when Azure credentials are absent.",
      baseUrl: resolveUrl("SUB_APP_QUANTUM_URL", "NEXUS_QUANTUM_URL", 8200),
      port: 8200,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "Azure Quantum", "QAOA", "VQE", "Optimization"],
      matchKeys: ["quantum", "qaoa", "vqe", "qubo", "circuit", "annealing", "qiskit", "variational"],
      endpoints: [
        { method: "GET",    path: "/health",                           description: "Health check",                    auth: false },
        { method: "GET",    path: "/info",                             description: "Service metadata",                auth: false },
        { method: "GET",    path: "/openapi.json",                     description: "OpenAPI spec",                    auth: false },
        { method: "POST",   path: "/v1/quantum/jobs",                  description: "Submit a quantum job",            auth: false },
        { method: "GET",    path: "/v1/quantum/jobs",                  description: "List submitted jobs",             auth: false },
        { method: "GET",    path: "/v1/quantum/jobs/:job_id",          description: "Poll job status + results",       auth: false },
        { method: "DELETE", path: "/v1/quantum/jobs/:job_id",          description: "Cancel a pending job",            auth: false },
        { method: "POST",   path: "/v1/quantum/simulate",              description: "Simulate a quantum circuit",      auth: false },
        { method: "GET",    path: "/v1/quantum/simulate/backends",     description: "List available simulators",       auth: false },
        { method: "POST",   path: "/v1/quantum/optimize/portfolio",    description: "Portfolio optimization (QAOA)",   auth: false },
        { method: "POST",   path: "/v1/quantum/optimize/route",        description: "Route optimization (annealing)",  auth: false },
        { method: "POST",   path: "/v1/quantum/optimize/constraint",   description: "QUBO constraint solver",          auth: false },
        { method: "GET",    path: "/v1/quantum/optimize/algorithms",   description: "List available algorithms",       auth: false },
        { method: "POST",   path: "/v1/quantum/circuits",              description: "Save a circuit definition",       auth: false },
        { method: "GET",    path: "/v1/quantum/circuits",              description: "List saved circuits",             auth: false },
        { method: "GET",    path: "/v1/quantum/circuits/:circuit_id",  description: "Retrieve a circuit definition",   auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-quantum",
    },

    // ── Nexus Analytics (Platform API analytics) ─────────────────────────────
    {
      name: "analytics",
      label: "Nexus Analytics",
      description:
        "Platform API analytics microservice — records API call events from all NexusConsult services and exposes per-service aggregate stats, top-endpoint rankings, error-rate breakdowns, and time-bucketed call/latency timeseries.",
      baseUrl: resolveUrl("SUB_APP_ANALYTICS_URL", "NEXUS_ANALYTICS_URL", 8300),
      port: 8300,
      healthPath: "/health",
      openApiPath: "/openapi.json",
      tags: ["FastAPI", "Python", "Analytics", "Metrics", "Timeseries"],
      matchKeys: ["analytics", "metrics", "timeseries", "latency", "errors", "events", "monitoring"],
      endpoints: [
        { method: "GET",  path: "/health",                           description: "Liveness probe",                    auth: false },
        { method: "GET",  path: "/info",                             description: "Service metadata",                  auth: false },
        { method: "GET",  path: "/openapi.json",                     description: "OpenAPI spec",                      auth: false },
        { method: "POST", path: "/v1/analytics/events",              description: "Record one API call event",         auth: false },
        { method: "GET",  path: "/v1/analytics/summary",             description: "Per-service aggregate stats",       auth: false },
        { method: "GET",  path: "/v1/analytics/top-endpoints",       description: "Top N endpoints by call volume",    auth: false },
        { method: "GET",  path: "/v1/analytics/errors",              description: "Error-rate breakdown per service",  auth: false },
        { method: "GET",  path: "/v1/analytics/timeseries",          description: "Time-bucketed call/error counts",   auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-analytics",
    },
  ];
}

// ── Health checks ─────────────────────────────────────────────────────────────

/**
 * Check the health of a single sub-app.
 * Returns a resolved SubAppStatus — never rejects.
 */
export async function checkHealth(app: SubAppInfo): Promise<SubAppStatus> {
  const url = `${app.baseUrl}${app.healthPath}`;
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - start;
    let upstreamDetail: unknown = null;
    try {
      upstreamDetail = await resp.json();
    } catch {
      upstreamDetail = null;
    }
    return {
      ...app,
      status: resp.ok ? "healthy" : "unhealthy",
      latencyMs,
      upstreamDetail,
    };
  } catch {
    return {
      ...app,
      status: "unhealthy",
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Run health checks on all registered sub-apps in parallel via Promise.allSettled.
 * Returns an array of SubAppStatus objects — always length 4.
 */
export async function checkAllHealth(): Promise<SubAppStatus[]> {
  const registry = buildRegistry();
  const results = await Promise.allSettled(registry.map(checkHealth));
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { ...registry[i], status: "unhealthy" as const };
  });
}

// ── OpenAPI cache ─────────────────────────────────────────────────────────────

interface OpenApiCacheEntry {
  data: unknown;
  fetchedAt: number;
  status: number;
}

const openApiCache = new Map<string, OpenApiCacheEntry>();
const OPENAPI_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch (and cache) the OpenAPI spec from a sub-app.
 * Returns cached data if TTL has not expired.
 */
export async function getCachedOpenApi(
  app: SubAppInfo,
): Promise<{ hit: boolean; data: unknown; status: number }> {
  const cached = openApiCache.get(app.name);
  if (cached && Date.now() - cached.fetchedAt < OPENAPI_TTL_MS) {
    return { hit: true, data: cached.data, status: cached.status };
  }

  const url = `${app.baseUrl}${app.openApiPath}`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    if (resp.ok) {
      openApiCache.set(app.name, { data, fetchedAt: Date.now(), status: resp.status });
    }
    return { hit: false, data, status: resp.status };
  } catch {
    return { hit: false, data: null, status: 503 };
  }
}

/**
 * Invalidate a single entry in the OpenAPI cache (e.g. after a sub-app upgrade).
 */
export function invalidateOpenApiCache(name: string): void {
  openApiCache.delete(name);
}

// ── Health history ────────────────────────────────────────────────────────────

export interface HealthSnapshot {
  ts: number;
  status: "healthy" | "unhealthy";
  latencyMs?: number;
}

export interface HealthHistoryEntry {
  name: string;
  label: string;
  snapshots: HealthSnapshot[];
}

// Circular buffer: keep the last 144 snapshots per app (≈ 24h at 10-min poll)
const HISTORY_MAX = 144;
const healthHistoryBuffer = new Map<string, HealthSnapshot[]>();

/**
 * Record a batch of health check results into the in-memory circular buffer.
 * Called after every checkAllHealth() run.
 */
export function recordHealthSnapshot(results: SubAppStatus[]): void {
  for (const r of results) {
    const snapshots = healthHistoryBuffer.get(r.name) ?? [];
    snapshots.push({
      ts: Date.now(),
      status: r.status === "healthy" ? "healthy" : "unhealthy",
      latencyMs: r.latencyMs,
    });
    if (snapshots.length > HISTORY_MAX) snapshots.shift();
    healthHistoryBuffer.set(r.name, snapshots);
  }
}

/**
 * Return the full health history for all registered sub-apps.
 */
export function getHealthHistory(): HealthHistoryEntry[] {
  return buildRegistry().map((app) => ({
    name: app.name,
    label: app.label,
    snapshots: healthHistoryBuffer.get(app.name) ?? [],
  }));
}

// ── Transparent HTTP proxy ────────────────────────────────────────────────────

// Request headers to forward to the upstream sub-app
const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "accept",
  "accept-language",
  "accept-encoding",
  "content-type",
  "x-request-id",
  "x-correlation-id",
];

// Upstream response headers to forward back to the client
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
  "x-request-id",
  "x-correlation-id",
];

/**
 * Transparently proxy an HTTP request to a sub-app.
 * Preserves upstream status code, content-type, and body semantics.
 * Writes directly to `res` — does not return a value.
 */
export async function proxyToSubApp(
  appInfo: SubAppInfo,
  req: Request,
  res: ExpressResponse,
  subPath: string,
): Promise<void> {
  const url = `${appInfo.baseUrl}${subPath}`;

  // Build forwarded headers from the original request
  const fwdHeaders: Record<string, string> = {};
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers[h];
    if (v) fwdHeaders[h] = Array.isArray(v) ? v[0] : v;
  }

  const init: RequestInit = {
    method: req.method,
    headers: fwdHeaders,
    signal: AbortSignal.timeout(10000),
  };

  if (!["GET", "HEAD", "DELETE"].includes(req.method) && req.body !== undefined) {
    // If we already have a content-type from the request, preserve it;
    // otherwise default to JSON since Express parses JSON bodies.
    if (!fwdHeaders["content-type"]) {
      fwdHeaders["content-type"] = "application/json";
    }
    init.body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  let upstream: Awaited<ReturnType<typeof fetch>>;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `Gateway upstream unreachable: ${appInfo.name} ${url} — ${(err as Error).message}`,
    );
  }

  // Forward safe upstream response headers
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }

  res.status(upstream.status);

  // Stream the raw body text to preserve content-type semantics
  // (works for JSON, plain-text, YAML, HTML — anything the upstream sends)
  const body = await upstream.text();
  res.send(body);
}
