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
} from "lucide-react";

interface SubAppInfo {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  healthPath: string;
  openApiPath: string;
  tags: string[];
  githubUrl?: string;
}

interface SubAppStatus extends SubAppInfo {
  status: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
  upstreamDetail?: unknown;
}

const APP_ICONS: Record<string, React.ReactNode> = {
  booking: <Calendar className="w-6 h-6" />,
  tax:     <FileText className="w-6 h-6" />,
  search:  <Search className="w-6 h-6" />,
  ai:      <Brain className="w-6 h-6" />,
};

const APP_COLORS: Record<string, string> = {
  booking: "from-blue-500/20 to-blue-600/5 border-blue-500/20",
  tax:     "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
  search:  "from-violet-500/20 to-violet-600/5 border-violet-500/20",
  ai:      "from-amber-500/20 to-amber-600/5 border-amber-500/20",
};

const APP_ICON_COLORS: Record<string, string> = {
  booking: "text-blue-400",
  tax:     "text-emerald-400",
  search:  "text-violet-400",
  ai:      "text-amber-400",
};

function StatusBadge({ status, latencyMs }: { status: SubAppStatus["status"]; latencyMs?: number }) {
  if (status === "healthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-400 font-mono" data-testid="badge-status-healthy">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>online</span>
        {latencyMs !== undefined && (
          <span className="text-green-400/60">{latencyMs}ms</span>
        )}
      </div>
    );
  }
  if (status === "unhealthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono" data-testid="badge-status-unhealthy">
        <XCircle className="w-3.5 h-3.5" />
        <span>offline</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" data-testid="badge-status-unconfigured">
      <Clock className="w-3.5 h-3.5" />
      <span>not configured</span>
    </div>
  );
}

function SubAppDrawer({
  app,
  healthData,
  open,
  onClose,
}: {
  app: SubAppInfo;
  healthData: SubAppStatus | null;
  open: boolean;
  onClose: () => void;
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
  });

  const endpoints: Array<{ method: string; path: string; summary?: string }> = [];
  if (openApiSpec?.paths) {
    for (const [path, methods] of Object.entries(openApiSpec.paths as Record<string, Record<string, { summary?: string }>>)) {
      for (const [method, details] of Object.entries(methods)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          endpoints.push({ method: method.toUpperCase(), path, summary: details.summary });
        }
      }
    }
  }

  const METHOD_COLORS: Record<string, string> = {
    GET:    "text-green-400 bg-green-400/10 border-green-400/20",
    POST:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
    PUT:    "text-amber-400 bg-amber-400/10 border-amber-400/20",
    PATCH:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
    DELETE: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="bg-card border-white/10 max-h-[85vh]" data-testid={`drawer-subapp-${app.name}`}>
        <DrawerHeader className="border-b border-white/5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center ${APP_COLORS[app.name]} border`}>
                <span className={APP_ICON_COLORS[app.name]}>{APP_ICONS[app.name] || <Server className="w-5 h-5" />}</span>
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

          <div className="flex items-center gap-4 mt-3">
            {healthData && (
              <StatusBadge status={healthData.status} latencyMs={healthData.latencyMs} />
            )}
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs border-white/10 bg-white/5">{tag}</Badge>
              ))}
            </div>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto p-6 space-y-6">
          <p className="text-muted-foreground text-sm leading-relaxed">{app.description}</p>

          {/* API Endpoints */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">API Endpoints</h4>
              {specLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>

            {endpoints.length > 0 ? (
              <div className="space-y-2" data-testid={`list-endpoints-${app.name}`}>
                {endpoints.map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg p-2.5 border border-white/5">
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${METHOD_COLORS[ep.method] || "text-muted-foreground bg-white/5 border-white/10"}`}>
                      {ep.method}
                    </span>
                    <code className="text-xs text-foreground/80 font-mono flex-1 truncate">{ep.path}</code>
                    {ep.summary && (
                      <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[200px]">{ep.summary}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : !specLoading ? (
              <div className="text-xs text-muted-foreground bg-black/20 rounded-lg p-4 border border-white/5">
                OpenAPI spec unavailable — service may be offline or not yet configured.
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              size="sm"
              asChild
              className="gap-2"
              data-testid={`btn-open-app-${app.name}`}
            >
              <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                Open App
              </a>
            </Button>
            {app.githubUrl && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-2 border-white/10 hover:bg-white/5"
                data-testid={`btn-github-${app.name}`}
              >
                <a href={app.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-2 border-white/10 hover:bg-white/5"
              data-testid={`btn-openapi-${app.name}`}
            >
              <a href={`${app.baseUrl}${app.openApiPath}`} target="_blank" rel="noopener noreferrer">
                <BookOpen className="w-3.5 h-3.5" />
                OpenAPI Spec
              </a>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SubAppCard({
  app,
  healthStatus,
}: {
  app: SubAppInfo;
  healthStatus: SubAppStatus | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const colorClass = APP_COLORS[app.name] || "from-primary/20 to-primary/5 border-primary/20";
  const iconColorClass = APP_ICON_COLORS[app.name] || "text-primary";

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
          {healthStatus ? (
            <StatusBadge status={healthStatus.status} latencyMs={healthStatus.latencyMs} />
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
            </div>
          )}
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
          <Button
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setDrawerOpen(true)}
            data-testid={`btn-api-docs-${app.name}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            API Docs
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 border-white/10 hover:bg-white/5"
            asChild
            data-testid={`btn-open-${app.name}`}
          >
            <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Open App
            </a>
          </Button>
        </div>
      </div>

      <SubAppDrawer
        app={app}
        healthData={healthStatus}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}

export function SubAppGateway() {
  const { data: registry, isLoading: registryLoading } = useQuery<SubAppInfo[]>({
    queryKey: ["/api/apps"],
    queryFn: async () => {
      const res = await fetch("/api/apps");
      if (!res.ok) throw new Error("Failed to fetch sub-app registry");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: healthData } = useQuery<SubAppStatus[]>({
    queryKey: ["/api/apps/health"],
    queryFn: async () => {
      if (!registry) return [];
      const results = await Promise.allSettled(
        registry.map(async (app) => {
          const res = await fetch(`/api/apps/${app.name}/health`);
          if (!res.ok) throw new Error("unhealthy");
          return res.json() as Promise<SubAppStatus>;
        }),
      );
      return results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return { ...registry[i], status: "unhealthy" as const };
      });
    },
    enabled: !!registry && registry.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const getHealth = (name: string): SubAppStatus | null => {
    return healthData?.find((h) => h.name === name) ?? null;
  };

  const healthyCount = healthData?.filter((h) => h.status === "healthy").length ?? 0;
  const totalCount = registry?.length ?? 0;

  return (
    <section id="services-gateway" className="py-24 relative border-t border-white/5">
      <div className="container mx-auto px-4 md:px-6">

        <div className="mb-16 text-center max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4 text-primary border-primary/20 bg-primary/5">
            Live Microservices
          </Badge>
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">
            Connected Services.
          </h2>
          <p className="text-muted-foreground text-lg">
            Four standalone microservices — each independently deployable, fully documented, and accessible via the unified API gateway.
          </p>
          {!registryLoading && totalCount > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4" data-testid="text-gateway-health-summary">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-mono text-muted-foreground">
                <span className={healthyCount > 0 ? "text-green-400" : "text-muted-foreground"}>{healthyCount}</span>
                <span className="text-muted-foreground">/{totalCount} services online</span>
              </span>
            </div>
          )}
        </div>

        {registryLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="grid-subapps">
            {(registry || []).map((app) => (
              <SubAppCard
                key={app.name}
                app={app}
                healthStatus={getHealth(app.name)}
              />
            ))}
          </div>
        )}

        {/* Gateway endpoint info */}
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
              { method: "GET",  path: "/api/apps",                    desc: "Sub-app registry" },
              { method: "GET",  path: "/api/apps/:name/health",       desc: "Health check" },
              { method: "ANY",  path: "/api/apps/:name/proxy/*",      desc: "HTTP proxy" },
              { method: "GET",  path: "/api/apps/:name/openapi",      desc: "OpenAPI spec" },
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
