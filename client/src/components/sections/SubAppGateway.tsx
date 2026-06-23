import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  ExternalLink,
  Github,
  Activity,
  BookOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Server,
  Search,
  Brain,
  FileText,
  Calendar,
  Play,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Shield,
  TrendingUp,
  Wallet,
  BarChart3,
  ArrowLeftRight,
  Bitcoin,
  Network,
  Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubAppEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
}

interface SubAppInfo {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  healthPath: string;
  openApiPath: string;
  tags: string[];
  matchKeys: string[];
  endpoints?: SubAppEndpoint[];
  githubUrl?: string;
}

interface SubAppStatus extends SubAppInfo {
  status: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
  upstreamDetail?: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// NexusConsult core services
const NEXUS_APPS = ["booking", "tax", "search", "ai", "scraper", "graph"];
// NexusCrypto parent + sub-apps
const CRYPTO_PARENT = "crypto";
const CRYPTO_CHILDREN = ["crypto-market", "crypto-wallet", "crypto-dex", "crypto-analytics"];

const APP_ICONS: Record<string, React.ReactNode> = {
  booking:          <Calendar className="w-6 h-6" />,
  tax:              <FileText className="w-6 h-6" />,
  search:           <Search className="w-6 h-6" />,
  ai:               <Brain className="w-6 h-6" />,
  scraper:          <Network className="w-6 h-6" />,
  graph:            <Layers className="w-6 h-6" />,
  crypto:           <Bitcoin className="w-6 h-6" />,
  "crypto-market":  <TrendingUp className="w-5 h-5" />,
  "crypto-wallet":  <Wallet className="w-5 h-5" />,
  "crypto-dex":     <ArrowLeftRight className="w-5 h-5" />,
  "crypto-analytics": <BarChart3 className="w-5 h-5" />,
};

const APP_COLORS: Record<string, string> = {
  booking:          "from-blue-500/20 to-blue-600/5 border-blue-500/20",
  tax:              "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
  search:           "from-violet-500/20 to-violet-600/5 border-violet-500/20",
  ai:               "from-amber-500/20 to-amber-600/5 border-amber-500/20",
  scraper:          "from-orange-500/20 to-orange-600/5 border-orange-500/20",
  graph:            "from-cyan-500/20 to-cyan-600/5 border-cyan-500/20",
  crypto:           "from-yellow-500/20 to-yellow-600/5 border-yellow-500/20",
  "crypto-market":  "from-green-500/15 to-green-600/5 border-green-500/15",
  "crypto-wallet":  "from-purple-500/15 to-purple-600/5 border-purple-500/15",
  "crypto-dex":     "from-red-500/15 to-red-600/5 border-red-500/15",
  "crypto-analytics": "from-indigo-500/15 to-indigo-600/5 border-indigo-500/15",
};

const APP_ICON_COLORS: Record<string, string> = {
  booking:          "text-blue-400",
  tax:              "text-emerald-400",
  search:           "text-violet-400",
  ai:               "text-amber-400",
  scraper:          "text-orange-400",
  graph:            "text-cyan-400",
  crypto:           "text-yellow-400",
  "crypto-market":  "text-green-400",
  "crypto-wallet":  "text-purple-400",
  "crypto-dex":     "text-red-400",
  "crypto-analytics": "text-indigo-400",
};

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-green-400 bg-green-400/10 border-green-400/20",
  POST:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
  PUT:    "text-amber-400 bg-amber-400/10 border-amber-400/20",
  PATCH:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  DELETE: "text-red-400 bg-red-400/10 border-red-400/20",
};

// ── TorStatusPill ─────────────────────────────────────────────────────────────

interface TorStatus {
  running: boolean;
  circuitEstablished: boolean;
  bootstrapPercent: number;
  socksProxy: string | null;
  error: string | null;
}

function TorStatusPill() {
  const { data, isLoading, isError } = useQuery<TorStatus>({
    queryKey: ["/api/apps/ai/proxy/v1/ai/tor/status"],
    queryFn: async () => {
      const res = await fetch("/api/apps/ai/proxy/v1/ai/tor/status");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 20_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" data-testid="tor-pill-loading">
        <Loader2 className="w-3 h-3 animate-spin" /><span>Tor…</span>
      </div>
    );
  }
  if (isError || !data?.running) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400/70 font-mono" data-testid="tor-pill-error">
        <Shield className="w-3 h-3" /><span>Tor offline</span>
      </div>
    );
  }
  if (data.circuitEstablished) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-mono" data-testid="tor-pill-connected">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-green-400">Tor circuit up</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono" data-testid="tor-pill-bootstrapping">
      <Shield className="w-3 h-3" /><span>Tor {data.bootstrapPercent}%</span>
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status, latencyMs }: { status: SubAppStatus["status"]; latencyMs?: number }) {
  if (status === "healthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-400 font-mono" data-testid="badge-status-healthy">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>online</span>
        {latencyMs !== undefined && <span className="text-green-400/60">{latencyMs}ms</span>}
      </div>
    );
  }
  if (status === "unhealthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono" data-testid="badge-status-unhealthy">
        <XCircle className="w-3.5 h-3.5" /><span>offline</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" data-testid="badge-status-unconfigured">
      <Clock className="w-3.5 h-3.5" /><span>not configured</span>
    </div>
  );
}

// ── Try-it sandbox ────────────────────────────────────────────────────────────

function extractPathParams(path: string): string[] {
  return (path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []).map((p) => p.slice(1));
}
function resolvePathParams(path: string, params: Record<string, string>): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => encodeURIComponent(params[name] || `:${name}`));
}

interface TryItState {
  pathParams: Record<string, string>;
  queryString: string;
  bodyText: string;
  loading: boolean;
  response: { status: number; body: string } | null;
  error: string | null;
}

function TryItPanel({ appName, endpoint }: { appName: string; endpoint: SubAppEndpoint | { method: string; path: string; summary?: string } }) {
  const pathParams = extractPathParams(endpoint.path);
  const hasBody = ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const [state, setState] = useState<TryItState>({
    pathParams: Object.fromEntries(pathParams.map((p) => [p, ""])),
    queryString: "",
    bodyText: hasBody ? "{}" : "",
    loading: false,
    response: null,
    error: null,
  });

  async function send() {
    setState((s) => ({ ...s, loading: true, response: null, error: null }));
    try {
      const resolvedPath = resolvePathParams(endpoint.path, state.pathParams);
      const qs = state.queryString.trim()
        ? (state.queryString.startsWith("?") ? state.queryString : `?${state.queryString}`)
        : "";
      const url = `/api/apps/${appName}/proxy${resolvedPath}${qs}`;
      const init: RequestInit = { method: endpoint.method };
      if (hasBody && state.bodyText.trim()) {
        init.headers = { "Content-Type": "application/json" };
        init.body = state.bodyText;
      }
      const resp = await fetch(url, init);
      const text = await resp.text();
      let body = text;
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ }
      setState((s) => ({ ...s, loading: false, response: { status: resp.status, body } }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }

  return (
    <div className="mt-2 bg-black/40 rounded-lg border border-white/5 p-3 space-y-3" data-testid={`tryit-panel-${appName}-${endpoint.method}-${endpoint.path.replace(/\//g, "-")}`}>
      {pathParams.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <LinkIcon className="w-3 h-3" /> Path Parameters
          </div>
          {pathParams.map((param) => (
            <div key={param} className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">:{param}</span>
              <input
                type="text"
                placeholder={param}
                value={state.pathParams[param] || ""}
                onChange={(e) => setState((s) => ({ ...s, pathParams: { ...s.pathParams, [param]: e.target.value } }))}
                className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors"
                data-testid={`input-param-${param}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Query String (optional)</div>
        <input
          type="text"
          placeholder="q=search+term&limit=10"
          value={state.queryString}
          onChange={(e) => setState((s) => ({ ...s, queryString: e.target.value }))}
          className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors"
          data-testid="input-querystring"
        />
      </div>
      {hasBody && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Request Body (JSON)</div>
          <textarea
            rows={4}
            value={state.bodyText}
            onChange={(e) => setState((s) => ({ ...s, bodyText: e.target.value }))}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/40 transition-colors resize-none"
            data-testid="input-body"
          />
        </div>
      )}
      <Button size="sm" className="gap-2 w-full" onClick={send} disabled={state.loading} data-testid="btn-send">
        {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {state.loading ? "Sending…" : "Send Request"}
      </Button>
      {state.response && (
        <div className="space-y-1.5" data-testid="response-panel">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Response</div>
            <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-bold ${
              state.response.status >= 200 && state.response.status < 300 ? "text-green-400 bg-green-400/10"
                : state.response.status >= 400 ? "text-red-400 bg-red-400/10"
                : "text-amber-400 bg-amber-400/10"
            }`} data-testid="response-status">
              {state.response.status}
            </span>
          </div>
          <pre className="bg-black/50 rounded border border-white/5 p-3 text-xs font-mono text-foreground/80 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all" data-testid="response-body">
            {state.response.body}
          </pre>
        </div>
      )}
      {state.error && (
        <div className="text-xs text-red-400 font-mono bg-red-400/5 rounded border border-red-400/10 p-2" data-testid="response-error">
          Error: {state.error}
        </div>
      )}
    </div>
  );
}

// ── EndpointRow ───────────────────────────────────────────────────────────────

function EndpointRow({ appName, ep }: { appName: string; ep: SubAppEndpoint | { method: string; path: string; summary?: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-white/5 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 bg-black/30 p-2.5 hover:bg-black/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`btn-endpoint-expand-${ep.method}-${ep.path.replace(/\//g, "-")}`}
      >
        <span className={`font-mono text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${METHOD_COLORS[ep.method] || "text-muted-foreground bg-white/5 border-white/10"}`}>
          {ep.method}
        </span>
        <code className="text-xs text-foreground/80 font-mono flex-1 truncate">{ep.path}</code>
        {"summary" in ep && ep.summary ? (
          <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[160px] shrink-0">{ep.summary}</span>
        ) : "description" in ep && ep.description ? (
          <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[160px] shrink-0">{ep.description}</span>
        ) : null}
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && <TryItPanel appName={appName} endpoint={ep} />}
    </div>
  );
}

// ── SubAppDrawer ──────────────────────────────────────────────────────────────

function SubAppDrawer({ app, healthData, open, onClose }: {
  app: SubAppInfo; healthData: SubAppStatus | null; open: boolean; onClose: () => void;
}) {
  const { data: openApiSpec, isLoading: specLoading } = useQuery({
    queryKey: [`/api/apps/${app.name}/openapi`],
    queryFn: async () => {
      const res = await fetch(`/api/apps/${app.name}/openapi`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const displayEndpoints: Array<SubAppEndpoint | { method: string; path: string; summary?: string }> = [];
  if (openApiSpec?.paths) {
    for (const [path, methods] of Object.entries(openApiSpec.paths as Record<string, Record<string, { summary?: string }>>)) {
      for (const [method, details] of Object.entries(methods)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          displayEndpoints.push({ method: method.toUpperCase(), path, summary: details.summary });
        }
      }
    }
  }
  const endpoints = displayEndpoints.length > 0 ? displayEndpoints : (app.endpoints ?? []);
  const colorClass = APP_COLORS[app.name] || "from-primary/20 to-primary/5 border-primary/20";
  const iconColorClass = APP_ICON_COLORS[app.name] || "text-primary";

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="bg-card border-white/10 max-h-[90vh]" data-testid={`drawer-subapp-${app.name}`}>
        <DrawerHeader className="border-b border-white/5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center ${colorClass} border`}>
                <span className={iconColorClass}>{APP_ICONS[app.name] || <Server className="w-5 h-5" />}</span>
              </div>
              <div>
                <DrawerTitle className="font-display text-lg">{app.label}</DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground mt-0.5">
                  {app.baseUrl} · port {app.port}
                </DrawerDescription>
              </div>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid={`btn-close-drawer-${app.name}`}>
                Close
              </Button>
            </DrawerClose>
          </div>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {healthData && <StatusBadge status={healthData.status} latencyMs={healthData.latencyMs} />}
            {app.name === "ai" && <TorStatusPill />}
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs border-white/10 bg-white/5">{tag}</Badge>
              ))}
            </div>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto p-6 space-y-6">
          <p className="text-muted-foreground text-sm leading-relaxed">{app.description}</p>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">API Endpoints</h4>
              {specLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              <span className="text-xs text-muted-foreground ml-auto">Click an endpoint to try it live</span>
            </div>
            {endpoints.length > 0 ? (
              <div className="space-y-2" data-testid={`list-endpoints-${app.name}`}>
                {endpoints.map((ep, i) => <EndpointRow key={i} appName={app.name} ep={ep} />)}
              </div>
            ) : !specLoading ? (
              <div className="text-xs text-muted-foreground bg-black/20 rounded-lg p-4 border border-white/5">
                OpenAPI spec unavailable — service may be offline or not yet configured.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="sm" asChild className="gap-2" data-testid={`btn-open-app-${app.name}`}>
              <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Open App
              </a>
            </Button>
            {app.githubUrl && (
              <Button variant="outline" size="sm" asChild className="gap-2 border-white/10 hover:bg-white/5" data-testid={`btn-github-${app.name}`}>
                <a href={app.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild className="gap-2 border-white/10 hover:bg-white/5" data-testid={`btn-openapi-${app.name}`}>
              <a href={`/api/apps/${app.name}/openapi`} target="_blank" rel="noopener noreferrer">
                <BookOpen className="w-3.5 h-3.5" /> OpenAPI Spec
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-2 border-white/10 hover:bg-white/5" data-testid={`btn-proxy-${app.name}`}>
              <a href={`/api/apps/${app.name}/health`} target="_blank" rel="noopener noreferrer">
                <Activity className="w-3.5 h-3.5" /> Health Check
              </a>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── SubAppCard ────────────────────────────────────────────────────────────────

function SubAppCard({ app, healthStatus, compact = false }: { app: SubAppInfo; healthStatus: SubAppStatus | null; compact?: boolean }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const colorClass = APP_COLORS[app.name] || "from-primary/20 to-primary/5 border-primary/20";
  const iconColorClass = APP_ICON_COLORS[app.name] || "text-primary";

  if (compact) {
    return (
      <>
        <div
          className={`glass-panel rounded-xl p-4 bg-gradient-to-br border flex flex-col gap-3 hover:scale-[1.01] transition-transform duration-200 ${colorClass}`}
          data-testid={`card-subapp-${app.name}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center ${iconColorClass}`}>
                {APP_ICONS[app.name] || <Server className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm leading-tight" data-testid={`text-subapp-name-${app.name}`}>{app.label}</h4>
                <p className="text-[10px] text-muted-foreground font-mono">:{app.port}</p>
              </div>
            </div>
            {healthStatus
              ? <StatusBadge status={healthStatus.status} latencyMs={healthStatus.latencyMs} />
              : <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{app.description}</p>
          <div className="flex flex-wrap gap-1">
            {app.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] border-white/10 bg-white/5 px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 gap-1.5 h-7 text-xs" onClick={() => setDrawerOpen(true)} data-testid={`btn-api-docs-${app.name}`}>
              <BookOpen className="w-3 h-3" /> API Docs
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-7 text-xs border-white/10 hover:bg-white/5" asChild data-testid={`btn-open-${app.name}`}>
              <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" /> Open
              </a>
            </Button>
          </div>
        </div>
        <SubAppDrawer app={app} healthData={healthStatus} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div
        className={`glass-panel rounded-2xl p-6 bg-gradient-to-br border flex flex-col gap-4 hover:scale-[1.01] transition-transform duration-300 ${colorClass}`}
        data-testid={`card-subapp-${app.name}`}
      >
        <div className="flex items-start justify-between">
          <div className={`w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center ${iconColorClass}`}>
            {APP_ICONS[app.name] || <Server className="w-6 h-6" />}
          </div>
          {healthStatus
            ? <StatusBadge status={healthStatus.status} latencyMs={healthStatus.latencyMs} />
            : <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div>
          <h3 className="font-display font-bold text-lg mb-1" data-testid={`text-subapp-name-${app.name}`}>{app.label}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{app.description}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {app.tags.slice(0, 4).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs border-white/10 bg-white/5">{tag}</Badge>
          ))}
        </div>
        <div className="flex gap-2 mt-auto pt-2">
          <Button size="sm" className="flex-1 gap-2" onClick={() => setDrawerOpen(true)} data-testid={`btn-api-docs-${app.name}`}>
            <BookOpen className="w-3.5 h-3.5" /> API Docs
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-2 border-white/10 hover:bg-white/5" asChild data-testid={`btn-open-${app.name}`}>
            <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Open App
            </a>
          </Button>
        </div>
      </div>
      <SubAppDrawer app={app} healthData={healthStatus} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

// ── CryptoEcosystemSection ───────────────────────────────────────────────────

function CryptoEcosystemSection({ registry }: { registry: SubAppStatus[] }) {
  const [parentDrawerOpen, setParentDrawerOpen] = useState(false);

  const getHealth = (name: string): SubAppStatus | null =>
    registry.find((h) => h.name === name) ?? null;

  const parentApp = registry.find(a => a.name === CRYPTO_PARENT);
  const childApps = CRYPTO_CHILDREN.map(name => registry.find(a => a.name === name)).filter(Boolean) as SubAppStatus[];

  const parentHealth = getHealth(CRYPTO_PARENT);
  const healthyChildren = childApps.filter(a => getHealth(a.name)?.status === "healthy").length;

  if (!parentApp) return null;

  return (
    <div className="mt-16 pt-16 border-t border-white/5" data-testid="section-crypto-ecosystem">
      {/* Section header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <Badge variant="outline" className="mb-3 text-yellow-400 border-yellow-400/20 bg-yellow-400/5">
            <Bitcoin className="w-3 h-3 mr-1" /> NexusCrypto Ecosystem
          </Badge>
          <h3 className="text-2xl md:text-3xl font-display font-bold">
            Crypto Platform &amp; Sub-Services.
          </h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl">
            NexusCrypto is a standalone crypto trading and portfolio platform. Its four microservices
            are independently deployable and accessible through the same unified gateway.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground" data-testid="text-crypto-health-summary">
            <Activity className="w-3.5 h-3.5 text-yellow-400" />
            <span className={healthyChildren > 0 ? "text-green-400" : "text-muted-foreground"}>{healthyChildren}</span>
            <span>/{childApps.length} sub-services online</span>
          </div>
        </div>
      </div>

      {/* Parent platform card + sub-app grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

        {/* Parent: NexusCrypto main platform */}
        <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br border border-yellow-500/20 from-yellow-500/20 to-yellow-600/5 flex flex-col gap-4"
          data-testid="card-crypto-parent">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center text-yellow-400">
              <Bitcoin className="w-6 h-6" />
            </div>
            {parentHealth
              ? <StatusBadge status={parentHealth.status} latencyMs={parentHealth.latencyMs} />
              : <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-bold text-xl" data-testid="text-subapp-name-crypto">NexusCrypto</h3>
              <Badge variant="outline" className="text-[10px] border-yellow-400/20 text-yellow-400 bg-yellow-400/5">Platform</Badge>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{parentApp.description}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parentApp.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs border-white/10 bg-white/5">{tag}</Badge>
            ))}
          </div>
          {/* Sub-service summary pills */}
          <div className="bg-black/20 rounded-lg p-3 border border-white/5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Microservices</p>
            <div className="space-y-1.5">
              {CRYPTO_CHILDREN.map(childName => {
                const childHealth = getHealth(childName);
                const childApp = registry.find(a => a.name === childName);
                return (
                  <div key={childName} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      childHealth?.status === "healthy" ? "bg-green-400"
                        : childHealth?.status === "unhealthy" ? "bg-red-400"
                        : "bg-muted-foreground/30"
                    }`} />
                    <span className="text-foreground/70 flex-1">{childApp?.label ?? childName}</span>
                    <span className="text-muted-foreground font-mono">:{childApp?.port}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 mt-auto">
            <Button size="sm" className="flex-1 gap-2" onClick={() => setParentDrawerOpen(true)} data-testid="btn-api-docs-crypto">
              <BookOpen className="w-3.5 h-3.5" /> API Docs
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-2 border-white/10 hover:bg-white/5" asChild data-testid="btn-open-crypto">
              <a href={parentApp.baseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Open App
              </a>
            </Button>
          </div>
        </div>

        {/* Children: the four sub-apps in a 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="grid-crypto-children">
          {childApps.map(app => (
            <SubAppCard key={app.name} app={app} healthStatus={getHealth(app.name)} compact />
          ))}
        </div>
      </div>

      {/* NexusCrypto gateway route reference */}
      <div className="mt-8 glass-panel rounded-xl p-5 border border-yellow-500/10">
        <div className="flex items-center gap-2 mb-3">
          <Bitcoin className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold">NexusCrypto Gateway Routes</span>
          <Badge variant="outline" className="text-xs border-yellow-400/20 text-yellow-400 bg-yellow-400/5 ml-auto font-mono">
            /api/apps/crypto*
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {[
            { method: "ANY", path: "/api/apps/crypto/proxy/*",           desc: "NexusCrypto main platform" },
            { method: "ANY", path: "/api/apps/crypto-market/proxy/*",    desc: "Market data & price feeds" },
            { method: "ANY", path: "/api/apps/crypto-wallet/proxy/*",    desc: "Wallet management" },
            { method: "ANY", path: "/api/apps/crypto-dex/proxy/*",       desc: "DEX trading engine" },
          ].map((ep) => (
            <div key={ep.path} className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400 text-[10px] font-bold">{ep.method}</span>
                <span className="text-foreground/70 truncate text-[10px]">{ep.path}</span>
              </div>
              <span className="text-muted-foreground">{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {parentApp && (
        <SubAppDrawer
          app={parentApp}
          healthData={parentHealth}
          open={parentDrawerOpen}
          onClose={() => setParentDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ── SubAppGateway section ─────────────────────────────────────────────────────

export function SubAppGateway() {
  const { data: registry, isLoading: registryLoading } = useQuery<SubAppStatus[]>({
    queryKey: ["/api/apps"],
    queryFn: async () => {
      const res = await fetch("/api/apps");
      if (!res.ok) throw new Error("Failed to fetch sub-app registry");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const getHealth = (name: string): SubAppStatus | null =>
    registry?.find((h) => h.name === name) ?? null;

  // Split registry into NexusConsult core services and NexusCrypto ecosystem
  const nexusApps = (registry || []).filter(a => NEXUS_APPS.includes(a.name));
  const healthyNexus = nexusApps.filter(a => a.status === "healthy").length;
  const totalNexus   = nexusApps.length;

  return (
    <section id="services-gateway" className="py-24 relative border-t border-white/5">
      <div className="container mx-auto px-4 md:px-6">

        {/* ── NexusConsult Core Services ── */}
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4 text-primary border-primary/20 bg-primary/5">
            Live Microservices
          </Badge>
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">
            Connected Services.
          </h2>
          <p className="text-muted-foreground text-lg">
            Standalone microservices — each independently deployable, fully documented, and
            accessible via the unified API gateway.
          </p>
          {!registryLoading && totalNexus > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4" data-testid="text-gateway-health-summary">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-mono text-muted-foreground">
                <span className={healthyNexus > 0 ? "text-green-400" : "text-muted-foreground"}>{healthyNexus}</span>
                <span className="text-muted-foreground">/{totalNexus} services online</span>
              </span>
            </div>
          )}
        </div>

        {registryLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* NexusConsult core grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-subapps">
              {nexusApps.map((app) => (
                <SubAppCard key={app.name} app={app} healthStatus={getHealth(app.name)} />
              ))}
            </div>

            {/* NexusCrypto Ecosystem group */}
            <CryptoEcosystemSection registry={registry || []} />
          </>
        )}

        {/* Gateway endpoint reference */}
        <div className="mt-12 glass-panel rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Unified Gateway</span>
            <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5 ml-auto">
              /api/apps
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
            {[
              { method: "GET",  path: "/api/apps",                    desc: "Health-enriched registry" },
              { method: "GET",  path: "/api/apps/:name/health",       desc: "Live health probe" },
              { method: "ANY",  path: "/api/apps/:name/proxy/*",      desc: "Transparent HTTP proxy" },
              { method: "GET",  path: "/api/apps/:name/openapi",      desc: "Cached OpenAPI spec" },
            ].map((ep) => (
              <div key={ep.path} className="bg-black/30 rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-400 text-[10px] font-bold">{ep.method}</span>
                  <span className="text-foreground/70 truncate">{ep.path}</span>
                </div>
                <span className="text-muted-foreground">{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
