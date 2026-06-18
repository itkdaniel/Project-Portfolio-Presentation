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

import type { Request, Response } from "express";

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
        { method: "GET",  path: "/health",                 description: "Health check",             auth: false },
        { method: "GET",  path: "/v1/search",              description: "Full-text search (BM25)",  auth: false },
        { method: "GET",  path: "/v1/projects",            description: "List projects",            auth: false },
        { method: "GET",  path: "/v1/projects/:id/related",description: "BFS tag recommendations", auth: false },
        { method: "GET",  path: "/openapi.json",           description: "OpenAPI spec",             auth: false },
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
        { method: "GET",  path: "/health",                 description: "Health check",             auth: false },
        { method: "POST", path: "/v1/ai/classify",         description: "Text classification",      auth: false },
        { method: "POST", path: "/v1/ai/embed",            description: "Sentence embeddings",      auth: false },
        { method: "POST", path: "/v1/ai/similarity",       description: "Cosine similarity",        auth: false },
        { method: "POST", path: "/v1/ai/fill-mask",        description: "Fill-mask inference",      auth: false },
        { method: "GET",  path: "/v1/ai/status",           description: "Model status",             auth: false },
        { method: "GET",  path: "/openapi.json",           description: "OpenAPI spec",             auth: false },
      ],
      githubUrl: "https://github.com/itkdaniel/nexus-ai",
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
  res: Response,
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

  let upstream: Response;
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
