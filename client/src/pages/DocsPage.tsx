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
  Lock, ExternalLink, Github, Activity, Cpu, CheckCircle2, XCircle, Clock,
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
      { method: "POST", path: "/api/auth/login",    description: "Login → JWT",               auth: false, body: '{"email":"admin@nexusconsult.dev","password":"Admin@Nexus2024!"}' },
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
      { method: "POST",  path: "/api/settings/change-password",description: "Change password",             auth: true, body: '{"currentPassword":"Demo@User2024!","newPassword":"New@Pass2024!"}' },
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
  return (path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []).map((p) => p.slice(1));
}
function resolvePathParams(path: string, params: Record<string, string>): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => encodeURIComponent(params[n] || `:${n}`));
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
        {isAuth && <Lock className="w-3 h-3 text-yellow-400/60 shrink-0" title="Requires auth" />}
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

  const liveEndpoints: Array<{ method: string; path: string; summary?: string }> = [];
  if (spec?.paths) {
    for (const [path, methods] of Object.entries(spec.paths as Record<string, OpenApiPath>)) {
      for (const [method, det] of Object.entries(methods)) {
        if (["get","post","put","patch","delete"].includes(method)) {
          liveEndpoints.push({ method: method.toUpperCase(), path, summary: det.summary });
        }
      }
    }
  }
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
        ) : !isLoading ? (
          <div className="text-xs text-muted-foreground bg-black/20 rounded-lg p-4 border border-white/5">
            OpenAPI spec unavailable — service may be offline. Proxy path: <code className="font-mono">/api/apps/{app.name}/proxy/*</code>
          </div>
        ) : null}
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

type Selection = "core" | string;

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
              <p className="text-sm text-muted-foreground">NexusConsult Core + 11 microservice sub-apps · Live try-it sandbox included</p>
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
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 mb-2">NexusCrypto Ecosystem</p>
                {SUB_APPS.slice(6).map(app => (
                  <SidebarItem key={app.name} label={app.label} icon={<span className={app.iconColor}>{app.icon}</span>} active={selected === app.name} onClick={() => { setSelected(app.name); setMobileOpen(false); }} badge={String(app.port)} indent={app.name !== "crypto"} />
                ))}
              </div>

              <div className="pt-4 px-3">
                <div className="rounded-lg bg-black/30 border border-white/5 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground/60 mb-2">Quick Auth</div>
                  <div><span className="text-yellow-400">Admin:</span> admin@nexusconsult.dev</div>
                  <div><span className="text-blue-400">User:</span> demo@nexusconsult.dev</div>
                  <div className="text-[10px] mt-2 text-muted-foreground/60">Token auto-injected from localStorage</div>
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
