import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  BookOpen, Server, Search, Brain, FileText, Calendar,
  Network, Layers, Bitcoin, TrendingUp, Wallet, ArrowLeftRight,
  BarChart3, Play, Loader2, ChevronDown, ChevronUp, Link as LinkIcon,
  Lock, ExternalLink, Github, Activity, Cpu, CheckCircle2, XCircle, Clock, Atom,
  FlaskConical, Zap, TrendingDown, GitBranch, LineChart,
} from "lucide-react";

// ── Core API definitions ──────────────────────────────────────────────────────

interface CoreEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  body?: string;
}
interface CoreGroup { name: string; label: string; endpoints: CoreEndpoint[] }

const CORE_API: CoreGroup[] = [
  {
    name: "auth", label: "Authentication",
    endpoints: [
      { method: "POST", path: "/api/auth/login",    description: "Login → JWT",               auth: false, body: '{"email":"user@example.com","password":"••••••••••••"}' },
      { method: "POST", path: "/api/auth/register", description: "Register new account",       auth: false, body: '{"username":"demo","email":"demo@example.com","password":"Demo@1234!","fullName":"Demo User"}' },
      { method: "GET",  path: "/api/auth/me",        description: "Authenticated user profile", auth: true  },
    ],
  },
  {
    name: "projects", label: "Projects",
    endpoints: [
      { method: "GET",    path: "/api/projects",     description: "List published projects",   auth: false },
      { method: "POST",   path: "/api/projects",     description: "Create project (admin)",    auth: true,  body: '{"name":"My Project","description":"...","type":"web","tags":["TypeScript"]}' },
      { method: "PATCH",  path: "/api/projects/:id", description: "Update project (admin)",    auth: true,  body: '{"name":"Updated Name"}' },
      { method: "DELETE", path: "/api/projects/:id", description: "Delete project (admin)",    auth: true  },
    ],
  },
  {
    name: "bookings", label: "Bookings",
    endpoints: [
      { method: "POST",   path: "/api/bookings",       description: "Create booking",          auth: false, body: '{"name":"Alice","email":"alice@example.com","details":"Discuss microservices","date":"2026-07-15","time":"10:00 AM","meetingType":"discovery"}' },
      { method: "GET",    path: "/api/bookings",       description: "List all bookings (admin)",auth: true  },
      { method: "GET",    path: "/api/bookings/:id",   description: "Get booking (admin)",      auth: true  },
      { method: "PATCH",  path: "/api/bookings/:id",   description: "Update booking (admin)",   auth: true  },
      { method: "DELETE", path: "/api/bookings/:id",   description: "Delete booking (admin)",   auth: true  },
    ],
  },
  {
    name: "settings", label: "Settings",
    endpoints: [
      { method: "GET",   path: "/api/settings",               description: "User settings",                auth: true  },
      { method: "PATCH", path: "/api/settings",               description: "Update user settings",         auth: true, body: '{"displayName":"New Name","timezone":"America/New_York"}' },
      { method: "GET",   path: "/api/settings/email-config",  description: "Email config (admin)",         auth: true  },
      { method: "PATCH", path: "/api/settings/email-config",  description: "Update email config (admin)",  auth: true  },
      { method: "POST",  path: "/api/settings/change-password",description: "Change password",             auth: true, body: '{"currentPassword":"••••••••••••","newPassword":"••••••••••••"}' },
    ],
  },
  {
    name: "notifications", label: "Notifications",
    endpoints: [
      { method: "GET",    path: "/api/notifications",            description: "List notifications",         auth: true },
      { method: "PATCH",  path: "/api/notifications/:id/read",   description: "Mark one read",              auth: true },
      { method: "PATCH",  path: "/api/notifications/read-all",   description: "Mark all read",              auth: true },
      { method: "DELETE", path: "/api/notifications/:id",        description: "Delete notification",        auth: true },
      { method: "GET",    path: "/api/notification-prefs",       description: "Notification preferences",   auth: true },
      { method: "PATCH",  path: "/api/notification-prefs",       description: "Update preferences",         auth: true, body: '{"inApp":true,"email":true,"sms":false}' },
    ],
  },
  {
    name: "scopes", label: "Scope Requests",
    endpoints: [
      { method: "POST",  path: "/api/scope-requests",            description: "Submit scope request",       auth: true,  body: '{"scopeName":"uncensored_ai","reason":"Need for research"}' },
      { method: "GET",   path: "/api/scope-requests",            description: "List scope requests",        auth: true  },
      { method: "PATCH", path: "/api/scope-requests/:id/review", description: "Review request (admin)",     auth: true,  body: '{"status":"approved","adminNote":"Approved for research use"}' },
      { method: "GET",   path: "/api/granted-scopes",            description: "My granted scopes",          auth: true  },
      { method: "GET",   path: "/api/granted-scopes/admin",      description: "All grants (admin)",         auth: true  },
    ],
  },
  {
    name: "gateway", label: "App Gateway",
    endpoints: [
      { method: "GET", path: "/api/apps",                description: "Registry + all health checks", auth: false },
      { method: "GET", path: "/api/apps/health",         description: "Parallel health check all",    auth: false },
      { method: "GET", path: "/api/apps/health/history", description: "Health history buffer",        auth: false },
      { method: "GET", path: "/api/apps/:name",          description: "Single app status",            auth: false },
      { method: "GET", path: "/api/apps/:name/openapi",  description: "Sub-app OpenAPI spec",         auth: false },
    ],
  },
  {
    name: "admin", label: "Admin",
    endpoints: [
      { method: "GET",   path: "/api/admin/stats",  description: "Dashboard statistics",        auth: true },
      { method: "PATCH", path: "/api/users/role",   description: "Update user corporate role",  auth: true, body: '{"userId":"<uuid>","corpRoleId":3}' },
    ],
  },
  {
    name: "tests", label: "Tests",
    endpoints: [
      { method: "GET",  path: "/api/tests/results", description: "Latest test results",  auth: false },
      { method: "POST", path: "/api/tests/run",      description: "Trigger test run",    auth: false },
    ],
  },
];

// ── Sub-app config ────────────────────────────────────────────────────────────

interface SubApp { name: string; label: string; icon: React.ReactNode; color: string; iconColor: string; port: number; tags: string[] }
const SUB_APPS: SubApp[] = [
  { name: "booking",          label: "Nexus Booking",     icon: <Calendar className="w-4 h-4" />,        color: "text-blue-400 bg-blue-400/10",     iconColor: "text-blue-400",   port: 8003, tags: ["FastAPI","Python","Calendar"] },
  { name: "tax",              label: "Nexus Tax",         icon: <FileText className="w-4 h-4" />,        color: "text-emerald-400 bg-emerald-400/10",iconColor: "text-emerald-400",port: 8004, tags: ["FastAPI","Python","IRS"] },
  { name: "search",           label: "Nexus Search",      icon: <Search className="w-4 h-4" />,          color: "text-violet-400 bg-violet-400/10",  iconColor: "text-violet-400", port: 8002, tags: ["FastAPI","BM25","Redis"] },
  { name: "ai",               label: "Nexus AI",          icon: <Brain className="w-4 h-4" />,           color: "text-amber-400 bg-amber-400/10",    iconColor: "text-amber-400",  port: 8001, tags: ["PyTorch","NLP","ML"] },
  { name: "scraper",          label: "Nexus Scraper",     icon: <Network className="w-4 h-4" />,         color: "text-orange-400 bg-orange-400/10",  iconColor: "text-orange-400", port: 8005, tags: ["FastAPI","BeautifulSoup"] },
  { name: "graph",            label: "Nexus Graph",       icon: <Layers className="w-4 h-4" />,          color: "text-cyan-400 bg-cyan-400/10",      iconColor: "text-cyan-400",   port: 8006, tags: ["FastAPI","igraph","D3"] },
  { name: "quantum",          label: "Nexus Quantum",     icon: <Atom className="w-4 h-4" />,            color: "text-teal-400 bg-teal-400/10",      iconColor: "text-teal-400",   port: 8200, tags: ["FastAPI","Azure Quantum","QAOA"] },
  { name: "crypto",           label: "NexusCrypto",       icon: <Bitcoin className="w-4 h-4" />,         color: "text-yellow-400 bg-yellow-400/10",  iconColor: "text-yellow-400", port: 8100, tags: ["Next.js","WebSocket"] },
  { name: "crypto-market",    label: "Crypto Market",     icon: <TrendingUp className="w-4 h-4" />,      color: "text-green-400 bg-green-400/10",    iconColor: "text-green-400",  port: 8101, tags: ["FastAPI","OHLCV"] },
  { name: "crypto-wallet",    label: "Crypto Wallet",     icon: <Wallet className="w-4 h-4" />,          color: "text-purple-400 bg-purple-400/10",  iconColor: "text-purple-400", port: 8102, tags: ["FastAPI","Web3"] },
  { name: "crypto-dex",       label: "Crypto DEX",        icon: <ArrowLeftRight className="w-4 h-4" />, color: "text-red-400 bg-red-400/10",        iconColor: "text-red-400",    port: 8103, tags: ["FastAPI","AMM"] },
  { name: "crypto-analytics", label: "Crypto Analytics",  icon: <BarChart3 className="w-4 h-4" />,       color: "text-indigo-400 bg-indigo-400/10",  iconColor: "text-indigo-400", port: 8104, tags: ["FastAPI","Pandas"] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-green-400 bg-green-400/10 border-green-400/20",
  POST:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
  PUT:    "text-amber-400 bg-amber-400/10 border-amber-400/20",
  PATCH:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  DELETE: "text-red-400 bg-red-400/10 border-red-400/20",
};

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const seen = new Set<string>();
  // OpenAPI {param} style
  for (const m of path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
    if (!seen.has(m[1])) { params.push(m[1]); seen.add(m[1]); }
  }
  // Express :param style
  for (const m of path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    if (!seen.has(m[1])) { params.push(m[1]); seen.add(m[1]); }
  }
  return params;
}
function resolvePathParams(path: string, params: Record<string, string>): string {
  // Replace {param} (OpenAPI) and :param (Express) — both styles
  return path
    .replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => encodeURIComponent(params[n] || `{${n}}`))
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => encodeURIComponent(params[n] || `:${n}`));
}

// ── TryItPanel ────────────────────────────────────────────────────────────────

function TryItPanel({ endpoint, proxyPrefix = "" }: {
  endpoint: { method: string; path: string; body?: string };
  proxyPrefix?: string;
}) {
  const pathParams = extractPathParams(endpoint.path);
  const hasBody = ["POST","PUT","PATCH"].includes(endpoint.method);
  const [pathParamVals, setPathParamVals] = useState<Record<string, string>>(Object.fromEntries(pathParams.map(p => [p,""])));
  const [qs, setQs] = useState("");
  const [body, setBody] = useState(endpoint.body ?? (hasBody ? "{}" : ""));
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setLoading(true); setResponse(null); setErr(null);
    try {
      const resolved = resolvePathParams(endpoint.path, pathParamVals);
      const qsPart = qs.trim() ? (qs.startsWith("?") ? qs : `?${qs}`) : "";
      const url = `${proxyPrefix}${resolved}${qsPart}`;
      const init: RequestInit = { method: endpoint.method };
      const token = localStorage.getItem("nexus_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (hasBody && body.trim()) { headers["Content-Type"] = "application/json"; init.body = body; }
      init.headers = headers;
      const res = await fetch(url, init);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ }
      setResponse({ status: res.status, body: pretty });
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }

  return (
    <div className="mt-2 bg-black/40 rounded-lg border border-white/5 p-3 space-y-3">
      {pathParams.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Path Params</div>
          {pathParams.map(p => (
            <div key={p} className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">:{p}</span>
              <input type="text" placeholder={p} value={pathParamVals[p] || ""}
                onChange={e => setPathParamVals(v => ({ ...v, [p]: e.target.value }))}
                className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary/40 transition-colors"
                data-testid={`input-param-${p}`} />
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Query String</div>
        <input type="text" placeholder="key=value&foo=bar" value={qs} onChange={e => setQs(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary/40 transition-colors"
          data-testid="input-querystring" />
      </div>
      {hasBody && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Request Body (JSON)</div>
          <textarea rows={4} value={body} onChange={e => setBody(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/40 transition-colors resize-none"
            data-testid="input-body" />
        </div>
      )}
      <Button size="sm" className="gap-2 w-full" onClick={send} disabled={loading} data-testid="btn-send">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {loading ? "Sending…" : "Send Request"}
      </Button>
      {response && (
        <div className="space-y-1" data-testid="response-panel">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Response</span>
            <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-bold ${response.status < 300 ? "text-green-400 bg-green-400/10" : response.status < 500 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10"}`} data-testid="response-status">{response.status}</span>
          </div>
          <pre className="bg-black/50 rounded border border-white/5 p-3 text-xs font-mono text-foreground/80 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap break-all" data-testid="response-body">{response.body}</pre>
        </div>
      )}
      {err && <div className="text-xs text-red-400 font-mono bg-red-400/5 rounded border border-red-400/10 p-2" data-testid="response-error">Error: {err}</div>}
    </div>
  );
}

// ── EndpointRow ───────────────────────────────────────────────────────────────

function EndpointRow({ endpoint, proxyPrefix }: { endpoint: CoreEndpoint | { method: string; path: string; description?: string; summary?: string; auth?: boolean; body?: string }; proxyPrefix?: string }) {
  const [open, setOpen] = useState(false);
  const desc = "summary" in endpoint ? endpoint.summary : "description" in endpoint ? endpoint.description : "";
  const isAuth = "auth" in endpoint ? endpoint.auth : false;
  return (
    <div className="rounded-lg border border-white/5 overflow-hidden" data-testid={`endpoint-${endpoint.method}-${endpoint.path.replace(/\//g,"-")}`}>
      <button className="w-full flex items-center gap-3 bg-black/30 p-2.5 hover:bg-black/50 transition-colors text-left" onClick={() => setOpen(v => !v)}>
        <span className={`font-mono text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${METHOD_COLORS[endpoint.method] || "text-muted-foreground"}`}>{endpoint.method}</span>
        <code className="text-xs text-foreground/80 font-mono flex-1 truncate">{endpoint.path}</code>
        {isAuth && <span title="Requires auth"><Lock className="w-3 h-3 text-yellow-400/60 shrink-0" aria-label="Requires authentication" /></span>}
        {desc && <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[200px] shrink-0">{String(desc)}</span>}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>
      {open && <TryItPanel endpoint={endpoint as CoreEndpoint} proxyPrefix={proxyPrefix} />}
    </div>
  );
}

// ── CoreApiSection ────────────────────────────────────────────────────────────

function CoreApiSection() {
  const [activeGroup, setActiveGroup] = useState("auth");
  const group = CORE_API.find(g => g.name === activeGroup) ?? CORE_API[0];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold mb-1">NexusConsult Core API</h2>
        <p className="text-muted-foreground text-sm">REST API served by Express.js · Base URL: <code className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded">http://localhost:5000</code> · JWT Bearer auth</p>
        <p className="text-xs text-amber-400/70 bg-amber-400/5 border border-amber-400/10 rounded-lg px-3 py-2 mt-3">
          This catalog covers primary endpoints. Additional internal routes (resume, tax proxy, notification-prefs test, granted-scopes) are omitted for brevity — see <code className="font-mono">server/routes.ts</code> for the complete surface.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {CORE_API.map(g => (
          <button key={g.name}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${activeGroup === g.name ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"}`}
            onClick={() => setActiveGroup(g.name)}
            data-testid={`tab-group-${g.name}`}
          >{g.label}</button>
        ))}
      </div>
      <div className="space-y-2">
        {group.endpoints.map((ep, i) => <EndpointRow key={i} endpoint={ep} />)}
      </div>
    </div>
  );
}

// ── SubAppSection ─────────────────────────────────────────────────────────────

interface OpenApiPath { [method: string]: { summary?: string; description?: string } }

function SubAppSection({ app }: { app: SubApp }) {
  const { data: spec, isLoading } = useQuery({
    queryKey: [`/api/apps/${app.name}/openapi`],
    queryFn: async () => { const res = await fetch(`/api/apps/${app.name}/openapi`); if (!res.ok) return null; return res.json(); },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const { data: health } = useQuery({
    queryKey: [`/api/apps/${app.name}/health-check`],
    queryFn: async () => { const res = await fetch(`/api/apps/${app.name}`); if (!res.ok) return null; return res.json(); },
    retry: false,
    staleTime: 30_000,
  });

  const liveEndpoints: Array<{ method: string; path: string; summary?: string; auth?: boolean }> = [];
  if (spec?.paths) {
    for (const [path, methods] of Object.entries(spec.paths as Record<string, OpenApiPath>)) {
      for (const [method, det] of Object.entries(methods)) {
        if (["get","post","put","patch","delete"].includes(method)) {
          liveEndpoints.push({ method: method.toUpperCase(), path, summary: det.summary });
        }
      }
    }
  }

  // Static fallback from the gateway registry (available even when the sub-app is offline)
  const staticEndpoints: Array<{ method: string; path: string; description?: string; auth?: boolean }> = health?.endpoints ?? [];
  const statusStr: "healthy" | "unhealthy" | "unconfigured" = health?.status ?? "unconfigured";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-9 h-9 rounded-lg ${app.color} flex items-center justify-center border border-white/10`}>
              <span className={app.iconColor}>{app.icon}</span>
            </div>
            <h2 className="font-display text-2xl font-bold">{app.label}</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Port <code className="font-mono text-xs bg-white/5 px-1 rounded">{app.port}</code> ·
            Proxy via <code className="font-mono text-xs bg-white/5 px-1 rounded">/api/apps/{app.name}/proxy/*</code>
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {statusStr === "healthy"
            ? <div className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />Online</div>
            : statusStr === "unhealthy"
              ? <div className="flex items-center gap-1.5 text-xs text-red-400"><XCircle className="w-3.5 h-3.5" />Offline</div>
              : <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" />Not configured</div>
          }
          <Button size="sm" variant="outline" asChild className="gap-1.5 border-white/10 text-xs">
            <a href={`/api/apps/${app.name}/openapi`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3" /> OpenAPI Spec
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild className="gap-1.5 border-white/10 text-xs">
            <a href={`http://localhost:${app.port}`} target="_blank" rel="noopener noreferrer">
              <Activity className="w-3 h-3" /> Health
            </a>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {app.tags.map(t => <Badge key={t} variant="outline" className="text-xs border-white/10 bg-white/5">{t}</Badge>)}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold">Endpoints</span>
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {!isLoading && liveEndpoints.length > 0 && <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">Live from OpenAPI</Badge>}
        </div>
        {liveEndpoints.length > 0 ? (
          <div className="space-y-2">
            {liveEndpoints.map((ep, i) => <EndpointRow key={i} endpoint={ep} proxyPrefix={`/api/apps/${app.name}/proxy`} />)}
          </div>
        ) : staticEndpoints.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground bg-amber-400/5 border border-amber-400/10 rounded-lg px-3 py-2 mb-3">
              Service offline — showing static endpoint list from registry. Try-it sandbox will connect when the service starts.
            </p>
            {staticEndpoints.map((ep, i) => <EndpointRow key={i} endpoint={ep} proxyPrefix={`/api/apps/${app.name}/proxy`} />)}
          </div>
        ) : !isLoading ? (
          <div className="text-xs text-muted-foreground bg-black/20 rounded-lg p-4 border border-white/5">
            No endpoint data available. Proxy path: <code className="font-mono">/api/apps/{app.name}/proxy/*</code>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── QuantumExperimentsSection ─────────────────────────────────────────────────

interface QuantumEndpointDef {
  id: string;
  label: string;
  service: string;
  port: number;
  proxyPath: string;
  icon: React.ReactNode;
  iconColor: string;
  accent: string;
  accentBg: string;
  description: string;
  algorithm: string;
  defaultBody: string;
  quantumResultLabel: string;
  classicalResultLabel: string;
  fidelityLabel: string;
}

const QUANTUM_ENDPOINTS: QuantumEndpointDef[] = [
  {
    id: "embed",
    label: "Quantum Embed",
    service: "Nexus AI",
    port: 8001,
    proxyPath: "/api/apps/ai/proxy/v1/ai/quantum/embed",
    icon: <Brain className="w-4 h-4" />,
    iconColor: "text-amber-400",
    accent: "text-amber-400",
    accentBg: "bg-amber-400/10 border-amber-400/20",
    description: "VQE-inspired quantum feature map that embeds text into a high-dimensional quantum Hilbert space, then compares against a classical PCA baseline.",
    algorithm: "VQE / Quantum Feature Map",
    defaultBody: JSON.stringify({
      texts: ["quantum machine learning for natural language processing", "transformer attention mechanism"],
      target_dim: 8,
      num_layers: 3,
    }, null, 2),
    quantumResultLabel: "Quantum Embeddings",
    classicalResultLabel: "Classical Embeddings",
    fidelityLabel: "Hilbert-Space Fidelity",
  },
  {
    id: "tune",
    label: "Quantum Tune",
    service: "Nexus Search",
    port: 8002,
    proxyPath: "/api/apps/search/proxy/v1/search/quantum/tune",
    icon: <Search className="w-4 h-4" />,
    iconColor: "text-violet-400",
    accent: "text-violet-400",
    accentBg: "bg-violet-400/10 border-violet-400/20",
    description: "Quantum annealing-based BM25 parameter tuning. Finds optimal k1/b values using QUBO formulation and compares retrieval NDCG against the classical default (k1=1.5, b=0.75).",
    algorithm: "Quantum Annealing / QUBO",
    defaultBody: JSON.stringify({
      training_pairs: [
        { query: "neural network transformer architecture", relevant_doc_ids: ["doc1", "doc2"] },
        { query: "attention mechanism self-attention", relevant_doc_ids: ["doc2", "doc3"] },
        { query: "BERT pre-training masked language model", relevant_doc_ids: ["doc3"] },
      ],
      num_steps: 400,
    }, null, 2),
    quantumResultLabel: "Quantum-Tuned Params",
    classicalResultLabel: "Classical Default Params",
    fidelityLabel: "NDCG Δ (quantum − baseline)",
  },
  {
    id: "partition",
    label: "Quantum Partition",
    service: "Nexus Graph",
    port: 8006,
    proxyPath: "/api/apps/graph/proxy/v1/graph/quantum/partition",
    icon: <GitBranch className="w-4 h-4" />,
    iconColor: "text-cyan-400",
    accent: "text-cyan-400",
    accentBg: "bg-cyan-400/10 border-cyan-400/20",
    description: "QAOA-based min-cut graph bipartitioning. Finds the optimal way to split a graph into two communities, benchmarked against classical Kernighan-Lin partitioning.",
    algorithm: "QAOA / Min-Cut",
    defaultBody: JSON.stringify({
      nodes: ["A", "B", "C", "D", "E", "F"],
      edges: [
        { source: "A", target: "B", weight: 1.0 },
        { source: "A", target: "C", weight: 0.5 },
        { source: "B", target: "C", weight: 1.5 },
        { source: "C", target: "D", weight: 0.3 },
        { source: "D", target: "E", weight: 1.0 },
        { source: "D", target: "F", weight: 0.8 },
        { source: "E", target: "F", weight: 1.2 },
      ],
      num_rounds: 300,
    }, null, 2),
    quantumResultLabel: "Quantum Partition",
    classicalResultLabel: "Classical Partition",
    fidelityLabel: "Improvement %",
  },
  {
    id: "optimize",
    label: "Quantum Optimize",
    service: "Crypto Analytics",
    port: 8104,
    proxyPath: "/api/apps/crypto-analytics/proxy/v1/analytics/quantum/optimize",
    icon: <LineChart className="w-4 h-4" />,
    iconColor: "text-indigo-400",
    accent: "text-indigo-400",
    accentBg: "bg-indigo-400/10 border-indigo-400/20",
    description: "QAOA portfolio optimization using a quantum variational ansatz to find the Markowitz-optimal asset allocation, benchmarked against classical mean-variance optimization.",
    algorithm: "QAOA / Variational Quantum Eigensolver",
    defaultBody: JSON.stringify({
      assets: ["BTC", "ETH", "SOL", "ADA"],
      cov_matrix: [
        [0.04, 0.012, 0.008, 0.006],
        [0.012, 0.09, 0.015, 0.010],
        [0.008, 0.015, 0.16, 0.020],
        [0.006, 0.010, 0.020, 0.25],
      ],
      risk_tolerance: 0.5,
      num_steps: 300,
    }, null, 2),
    quantumResultLabel: "Quantum Weights",
    classicalResultLabel: "Classical Weights",
    fidelityLabel: "Sharpe Δ (quantum − classical)",
  },
];

function isJsonStr(s: string) {
  if (!s.trim()) return false;
  try { JSON.parse(s); return true; } catch { return false; }
}

function MetricBadge({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-black/30 border border-white/5 rounded-lg px-3 py-2 min-w-[80px]" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className={`text-sm font-bold font-mono ${positive === false ? "text-red-400" : "text-green-400"}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">{label}</span>
    </div>
  );
}

function QuantumVsClassicalTable({ quantum, classical, quantumLabel, classicalLabel }: {
  quantum: unknown;
  classical: unknown;
  quantumLabel: string;
  classicalLabel: string;
}) {
  function renderValue(v: unknown): React.ReactNode {
    if (v === null || v === undefined) return <span className="text-muted-foreground text-xs italic">—</span>;
    if (typeof v === "number") return <span className="font-mono text-xs">{Number.isInteger(v) ? v : v.toFixed(6)}</span>;
    if (typeof v === "string") return <span className="font-mono text-xs break-all">{v}</span>;
    if (typeof v === "boolean") return <span className={`font-mono text-xs ${v ? "text-green-400" : "text-red-400"}`}>{String(v)}</span>;
    if (Array.isArray(v)) {
      if (v.length === 0) return <span className="text-muted-foreground text-xs">[]</span>;
      if (typeof v[0] === "number") {
        const preview = v.slice(0, 6).map((n: number) => (typeof n === "number" ? n.toFixed(4) : String(n)));
        return (
          <span className="font-mono text-xs text-foreground/70">
            [{preview.join(", ")}{v.length > 6 ? `, … +${v.length - 6}` : ""}]
          </span>
        );
      }
      return <span className="font-mono text-xs text-foreground/70">[{v.map(String).slice(0, 4).join(", ")}{v.length > 4 ? "…" : ""}]</span>;
    }
    if (typeof v === "object") {
      return (
        <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {JSON.stringify(v, null, 2)}
        </pre>
      );
    }
    return <span className="font-mono text-xs">{String(v)}</span>;
  }

  const qObj = quantum && typeof quantum === "object" && !Array.isArray(quantum) ? quantum as Record<string, unknown> : null;
  const cObj = classical && typeof classical === "object" && !Array.isArray(classical) ? classical as Record<string, unknown> : null;

  if (!qObj && !cObj) {
    return (
      <div className="grid md:grid-cols-2 gap-4" data-testid="qvc-simple">
        <div className="bg-black/30 border border-primary/10 rounded-lg p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2">{quantumLabel}</p>
          <div>{renderValue(quantum)}</div>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-lg p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">{classicalLabel}</p>
          <div>{renderValue(classical)}</div>
        </div>
      </div>
    );
  }

  const allKeys = Array.from(new Set([...Object.keys(qObj ?? {}), ...Object.keys(cObj ?? {})]));

  return (
    <div className="overflow-x-auto" data-testid="qvc-table">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground py-2 pr-3 w-32">Field</th>
            <th className="text-left py-2 pr-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-primary">
                <Atom className="w-3 h-3" /> {quantumLabel}
              </span>
            </th>
            <th className="text-left py-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <Cpu className="w-3 h-3" /> {classicalLabel}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map(key => (
            <tr key={key} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 pr-3 font-mono text-muted-foreground/70 align-top">{key}</td>
              <td className="py-2 pr-3 align-top">{renderValue(qObj?.[key])}</td>
              <td className="py-2 align-top">{renderValue(cObj?.[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RawResponse = Record<string, unknown>;

interface AdaptedResult {
  quantumData: unknown;
  classicalData: unknown;
  metrics: Array<{ label: string; value: string; positive?: boolean }>;
}

function adaptResponse(epId: string, raw: RawResponse): AdaptedResult {
  const fmt = (n: unknown, decimals = 4) =>
    typeof n === "number" ? n.toFixed(decimals) : String(n ?? "—");

  if (epId === "embed") {
    const qEmbs = raw.quantum_embeddings as number[][] | undefined;
    const cEmbs = raw.classical_embeddings as number[][] | undefined;
    const fidelity = raw.fidelity as number | undefined;
    const dim = raw.target_dim as number | undefined;
    return {
      quantumData: qEmbs
        ? { vectors: qEmbs.map((v, i) => `text[${i}]: [${v.slice(0, 4).map(x => x.toFixed(4)).join(", ")}${v.length > 4 ? "…" : ""}]`).join("\n") }
        : undefined,
      classicalData: cEmbs
        ? { vectors: cEmbs.map((v, i) => `text[${i}]: [${v.slice(0, 4).map(x => x.toFixed(4)).join(", ")}${v.length > 4 ? "…" : ""}]`).join("\n") }
        : undefined,
      metrics: [
        { label: "Hilbert-Space Fidelity", value: fmt(fidelity), positive: typeof fidelity === "number" && fidelity >= 0.5 },
        { label: "Target Dim", value: fmt(dim, 0) },
        { label: "Fallback Used", value: raw.fallback_used ? "Yes (simulator)" : "No (hardware)" },
      ].filter(m => m.value !== "—" && m.value !== "undefined"),
    };
  }

  if (epId === "tune") {
    const qk1 = raw.optimal_k1 as number | undefined;
    const qb  = raw.optimal_b  as number | undefined;
    const qNdcg = raw.quantum_ndcg  as number | undefined;
    const cNdcg = raw.baseline_ndcg as number | undefined;
    const delta = (qNdcg !== undefined && cNdcg !== undefined) ? qNdcg - cNdcg : undefined;
    return {
      quantumData: (qk1 !== undefined || qNdcg !== undefined)
        ? { k1: qk1, b: qb, ndcg: qNdcg } : undefined,
      classicalData: (cNdcg !== undefined)
        ? { k1: 1.5, b: 0.75, ndcg: cNdcg } : undefined,
      metrics: [
        { label: "Quantum NDCG",   value: fmt(qNdcg), positive: true },
        { label: "Baseline NDCG",  value: fmt(cNdcg), positive: true },
        { label: "NDCG Δ", value: delta !== undefined ? (delta >= 0 ? `+${delta.toFixed(4)}` : delta.toFixed(4)) : "—", positive: delta !== undefined && delta >= 0 },
        { label: "Optimal k1", value: fmt(qk1) },
        { label: "Optimal b",  value: fmt(qb)  },
        { label: "Fallback Used", value: raw.fallback_used ? "Yes (simulator)" : "No (hardware)" },
      ].filter(m => m.value !== "—" && m.value !== "undefined"),
    };
  }

  if (epId === "partition") {
    const pa   = raw.partition_a as string[] | undefined;
    const pb   = raw.partition_b as string[] | undefined;
    const qCut = raw.cut_weight as number | undefined;
    const cCut = raw.classical_cut_weight as number | undefined;
    const pct  = raw.improvement_pct as number | undefined;
    return {
      quantumData: (pa || pb || qCut !== undefined)
        ? { partition_a: pa ?? [], partition_b: pb ?? [], cut_weight: qCut } : undefined,
      classicalData: (cCut !== undefined)
        ? { cut_weight: cCut } : undefined,
      metrics: [
        { label: "Quantum Cut Weight",   value: fmt(qCut), positive: true },
        { label: "Classical Cut Weight", value: fmt(cCut), positive: true },
        { label: "Improvement %", value: pct !== undefined ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—", positive: pct !== undefined && pct >= 0 },
        { label: "Fallback Used", value: raw.fallback_used ? "Yes (simulator)" : "No (hardware)" },
      ].filter(m => m.value !== "—" && m.value !== "undefined"),
    };
  }

  if (epId === "optimize") {
    const qW  = raw.quantum_weights   as Record<string, number> | undefined;
    const cW  = raw.classical_weights as Record<string, number> | undefined;
    const qSh = raw.quantum_sharpe    as number | undefined;
    const cSh = raw.classical_sharpe  as number | undefined;
    const shDelta = (qSh !== undefined && cSh !== undefined) ? qSh - cSh : undefined;
    return {
      quantumData: (qW || qSh !== undefined) ? { ...qW, sharpe: qSh } : undefined,
      classicalData: (cW || cSh !== undefined) ? { ...cW, sharpe: cSh } : undefined,
      metrics: [
        { label: "Quantum Sharpe",   value: fmt(qSh), positive: true },
        { label: "Classical Sharpe", value: fmt(cSh), positive: true },
        { label: "Sharpe Δ", value: shDelta !== undefined ? (shDelta >= 0 ? `+${shDelta.toFixed(4)}` : shDelta.toFixed(4)) : "—", positive: shDelta !== undefined && shDelta >= 0 },
        { label: "Fallback Used", value: raw.fallback_used ? "Yes (simulator)" : "No (hardware)" },
      ].filter(m => m.value !== "—" && m.value !== "undefined"),
    };
  }

  return { quantumData: undefined, classicalData: undefined, metrics: [] };
}

function QuantumEndpointPanel({ ep }: { ep: QuantumEndpointDef }) {
  const [body, setBody] = useState(ep.defaultBody);
  const [loading, setLoading] = useState(false);
  const [adapted, setAdapted] = useState<AdaptedResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  async function runExperiment() {
    setLoading(true); setAdapted(null); setRawJson(null); setErr(null); setOffline(false);
    try {
      const res = await fetch(ep.proxyPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      let parsed: RawResponse | null = null;
      try { parsed = JSON.parse(text); } catch { /* raw */ }

      if (!res.ok) {
        if (res.status === 502 || res.status === 503 || res.status === 504) setOffline(true);
        const errMsg = parsed?.error ?? parsed?.detail ?? text ?? `HTTP ${res.status}`;
        setErr(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      } else if (parsed) {
        setAdapted(adaptResponse(ep.id, parsed));
        setRawJson(JSON.stringify(parsed, null, 2));
      } else {
        setRawJson(text);
      }
    } catch (e) {
      setOffline(true);
      setErr((e as Error).message);
    }
    setLoading(false);
  }

  const hasComparison = adapted && (adapted.quantumData !== undefined || adapted.classicalData !== undefined);

  return (
    <div className="space-y-5" data-testid={`quantum-panel-${ep.id}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${ep.accentBg} flex items-center justify-center border shrink-0`}>
          <span className={ep.iconColor}>{ep.icon}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg font-semibold">{ep.label}</h3>
            <Badge variant="outline" className="text-xs border-white/10">{ep.service}</Badge>
            <Badge variant="outline" className={`text-xs ${ep.accentBg} ${ep.accent} border-0`}>{ep.algorithm}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{ep.description}</p>
          <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
            POST <span className="text-foreground/40">{ep.proxyPath}</span>
          </p>
        </div>
      </div>

      {offline && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-400/20 bg-amber-400/5 text-amber-400 text-xs" data-testid={`offline-banner-${ep.id}`}>
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span><strong>{ep.service}</strong> (port {ep.port}) is offline. Start the service to try this endpoint live.</span>
        </div>
      )}

      {/* Input */}
      <div className="space-y-2">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Request Body (JSON)</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={10}
          className={`w-full bg-black/40 border rounded-lg px-3 py-2.5 text-xs font-mono outline-none transition-colors resize-none ${
            !isJsonStr(body) && body.trim() ? "border-red-500/50 focus:border-red-500/70" : "border-white/10 focus:border-primary/40"
          }`}
          data-testid={`textarea-body-${ep.id}`}
          spellCheck={false}
        />
        {!isJsonStr(body) && body.trim() && (
          <p className="text-xs text-red-400 flex items-center gap-1" data-testid={`hint-invalid-${ep.id}`}>⚠ Invalid JSON</p>
        )}
      </div>

      <Button
        onClick={runExperiment}
        disabled={loading || !isJsonStr(body)}
        className="gap-2"
        data-testid={`btn-run-${ep.id}`}
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Running Experiment…</>
          : <><Zap className="w-4 h-4" /> Run Quantum Experiment</>
        }
      </Button>

      {/* Error */}
      {err && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-400/20 bg-red-400/5 text-red-400 text-xs" data-testid={`error-${ep.id}`}>
          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap break-all">{err}</pre>
        </div>
      )}

      {/* Result */}
      {adapted && (
        <div className="space-y-4 glass-panel rounded-xl border border-white/5 p-5" data-testid={`result-${ep.id}`}>
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" /> Experiment Results
          </h4>

          {/* Key metrics row */}
          {adapted.metrics.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3" /> Key Metrics
              </p>
              <div className="flex flex-wrap gap-3" data-testid={`metrics-row-${ep.id}`}>
                {adapted.metrics.map(m => (
                  <MetricBadge key={m.label} label={m.label} value={m.value} positive={m.positive} />
                ))}
              </div>
            </div>
          )}

          {/* Side-by-side quantum vs classical */}
          {hasComparison && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Atom className="w-3 h-3 text-primary" /> Quantum vs Classical Comparison
              </p>
              <div className="bg-black/30 border border-white/5 rounded-lg p-3">
                <QuantumVsClassicalTable
                  quantum={adapted.quantumData}
                  classical={adapted.classicalData}
                  quantumLabel={ep.quantumResultLabel}
                  classicalLabel={ep.classicalResultLabel}
                />
              </div>
            </div>
          )}

          {/* Full raw response (collapsible) */}
          {rawJson && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-mono text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors select-none">
                ▶ Full Raw Response
              </summary>
              <pre className="mt-2 bg-black/40 border border-white/5 rounded-lg p-3 text-xs font-mono text-foreground/60 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {rawJson}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function QuantumExperimentsSection() {
  const [activeEp, setActiveEp] = useState(QUANTUM_ENDPOINTS[0].id);
  const ep = QUANTUM_ENDPOINTS.find(e => e.id === activeEp) ?? QUANTUM_ENDPOINTS[0];

  return (
    <div className="flex flex-col gap-6" data-testid="quantum-experiments-section">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-teal-400/10 border border-teal-400/20 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-teal-400" />
          </div>
          <h2 className="font-display text-2xl font-bold">Quantum Experiments</h2>
        </div>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Live try-it panel for the four cross-service quantum endpoints. Each experiment runs a quantum algorithm
          on the selected backend and renders results side-by-side against a classical baseline, highlighting
          fidelity and improvement metrics.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {[
            { label: "VQE / Feature Maps", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
            { label: "QAOA / Annealing",   color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
            { label: "Quantum Min-Cut",    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
            { label: "Quantum Portfolio",  color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20" },
          ].map(t => (
            <span key={t.label} className={`px-2.5 py-0.5 rounded-full border font-mono ${t.color}`}>{t.label}</span>
          ))}
        </div>
        <p className="text-xs text-amber-400/70 bg-amber-400/5 border border-amber-400/10 rounded-lg px-3 py-2 mt-3">
          Each endpoint is proxied through <code className="font-mono">/api/apps/&#123;service&#125;/proxy</code>. The
          sub-services must be running for live results. When offline the form stays active for inspection.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2" data-testid="quantum-tabs">
        {QUANTUM_ENDPOINTS.map(e => (
          <button
            key={e.id}
            onClick={() => setActiveEp(e.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              activeEp === e.id
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 hover:bg-white/5"
            }`}
            data-testid={`tab-quantum-${e.id}`}
          >
            <span className={activeEp === e.id ? "text-primary" : e.iconColor}>{e.icon}</span>
            {e.label}
            <Badge variant="outline" className="text-[10px] border-white/10 ml-0.5 font-mono">{e.service}</Badge>
          </button>
        ))}
      </div>

      {/* Active experiment panel */}
      <div className="glass-panel rounded-xl border border-white/5 p-6">
        <QuantumEndpointPanel key={ep.id} ep={ep} />
      </div>
    </div>
  );
}

// ── SidebarItem ───────────────────────────────────────────────────────────────

function SidebarItem({ label, icon, active, onClick, badge, indent = false }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; badge?: string; indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${indent ? "pl-7" : ""} ${active ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
      data-testid={`sidebar-${label.toLowerCase().replace(/\s+/g,"-")}`}
    >
      <span className={`shrink-0 ${active ? "text-primary" : ""}`}>{icon}</span>
      <span className="flex-1 truncate font-medium">{label}</span>
      {badge && <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">{badge}</span>}
    </button>
  );
}

// ── DocsPage ──────────────────────────────────────────────────────────────────

type Selection = "core" | "quantum-experiments" | string;

export default function DocsPage() {
  const [selected, setSelected] = useState<Selection>("core");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeSubApp = SUB_APPS.find(a => a.name === selected);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col pt-16">
        {/* Page header */}
        <div className="border-b border-white/5 bg-card/30">
          <div className="container mx-auto px-4 md:px-6 py-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-5 h-5 text-primary" />
                <h1 className="font-display text-xl font-bold">API Documentation</h1>
              </div>
              <p className="text-sm text-muted-foreground">NexusConsult Core + 12 microservice sub-apps · Live try-it sandbox included</p>
            </div>
            <button className="md:hidden text-muted-foreground hover:text-foreground text-sm" onClick={() => setMobileOpen(v => !v)}>
              {mobileOpen ? "Close" : "Services ↓"}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden container mx-auto px-0 md:px-6">
          {/* Sidebar */}
          <aside className={`${mobileOpen ? "block" : "hidden"} md:block w-full md:w-64 lg:w-72 shrink-0 border-r border-white/5 bg-card/20 overflow-y-auto`}>
            <div className="p-3 space-y-1 py-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 mb-2">Core Platform</p>
              <SidebarItem label="NexusConsult Core" icon={<Cpu className="w-4 h-4" />} active={selected === "core"} onClick={() => { setSelected("core"); setMobileOpen(false); }} badge="REST" />

              <div className="pt-3">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 mb-2">NexusConsult Services</p>
                {SUB_APPS.slice(0,6).map(app => (
                  <SidebarItem key={app.name} label={app.label} icon={<span className={app.iconColor}>{app.icon}</span>} active={selected === app.name} onClick={() => { setSelected(app.name); setMobileOpen(false); }} badge={String(app.port)} />
                ))}
              </div>

              <div className="pt-3">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 mb-2">Nexus Quantum</p>
                <SidebarItem label="Nexus Quantum" icon={<span className="text-teal-400"><Atom className="w-4 h-4" /></span>} active={selected === "quantum"} onClick={() => { setSelected("quantum"); setMobileOpen(false); }} badge="8200" />
                <SidebarItem label="Quantum Experiments" icon={<span className="text-teal-400"><FlaskConical className="w-4 h-4" /></span>} active={selected === "quantum-experiments"} onClick={() => { setSelected("quantum-experiments"); setMobileOpen(false); }} badge="Try-It" />
              </div>

              <div className="pt-3">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 mb-2">NexusCrypto Ecosystem</p>
                {SUB_APPS.slice(7).map(app => (
                  <SidebarItem key={app.name} label={app.label} icon={<span className={app.iconColor}>{app.icon}</span>} active={selected === app.name} onClick={() => { setSelected(app.name); setMobileOpen(false); }} badge={String(app.port)} indent={app.name !== "crypto"} />
                ))}
              </div>

              <div className="pt-4 px-3">
                <div className="rounded-lg bg-black/30 border border-white/5 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground/60 mb-2">Auth</div>
                  <div>Sign in via <code className="font-mono text-primary">POST /api/auth/login</code></div>
                  <div className="text-[10px] mt-2 text-muted-foreground/60">Bearer token auto-injected from localStorage after login</div>
                </div>
              </div>

              <div className="px-3 pt-2">
                <Button size="sm" variant="outline" asChild className="w-full gap-2 border-white/10 text-xs">
                  <a href="https://github.com/itkdaniel" target="_blank" rel="noopener noreferrer">
                    <Github className="w-3.5 h-3.5" /> GitHub
                  </a>
                </Button>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-8" data-testid="docs-main-content">
            {selected === "core"
              ? <CoreApiSection />
              : selected === "quantum-experiments"
                ? <QuantumExperimentsSection />
                : activeSubApp
                  ? <SubAppSection app={activeSubApp} />
                  : null
            }
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
