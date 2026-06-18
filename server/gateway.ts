/**
 * API Gateway Layer — Sub-App Registry
 *
 * Maintains a registry of the four standalone NexusConsult microservices and
 * exposes helpers for parallel health-checking and HTTP proxying.
 *
 * Sub-app base URLs are resolved from dedicated SUB_APP_* env vars, falling
 * back to the legacy NEXUS_* vars for backward compatibility, and finally to
 * well-known localhost ports when running in a local dev environment.
 */

export interface SubAppInfo {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  healthPath: string;
  openApiPath: string;
  tags: string[];
  docsUrl?: string;
  githubUrl?: string;
}

export interface SubAppStatus extends SubAppInfo {
  status: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
  upstreamDetail?: unknown;
}

function resolveUrl(
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
      githubUrl: "https://github.com/itkdaniel/nexus-ai",
    },
  ];
}

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
 * Run health checks on all registered sub-apps in parallel.
 * Returns an array of SubAppStatus objects — always length 4.
 */
export async function checkAllHealth(): Promise<SubAppStatus[]> {
  const registry = buildRegistry();
  const results = await Promise.allSettled(registry.map(checkHealth));
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      ...registry[i],
      status: "unhealthy" as const,
    };
  });
}

/**
 * Forward an HTTP request to a sub-app, returning status + parsed body.
 * Carries the Authorization header through for protected upstream routes.
 */
export async function proxyToSubApp(
  appInfo: SubAppInfo,
  method: string,
  subPath: string,
  headers: Record<string, string | string[] | undefined>,
  body?: unknown,
): Promise<{ status: number; data: unknown; contentType: string }> {
  const url = `${appInfo.baseUrl}${subPath}`;
  const fwdHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (headers["authorization"]) {
    fwdHeaders["Authorization"] = headers["authorization"] as string;
  }

  const init: RequestInit = {
    method,
    headers: fwdHeaders,
    signal: AbortSignal.timeout(10000),
  };
  if (body !== undefined && !["GET", "HEAD", "DELETE"].includes(method)) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  const contentType = resp.headers.get("content-type") || "application/json";
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  return { status: resp.status, data, contentType };
}
