import { useState, useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ArrowLeft,
  RefreshCw,
  Calendar,
  FileText,
  Search,
  Brain,
  Server,
  Crosshair,
  Database,
  ExternalLink,
  Globe2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Loader2,
  Network,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthSnapshot {
  ts: number;
  status: "healthy" | "unhealthy";
  latencyMs?: number;
}

interface HealthHistoryEntry {
  name: string;
  label: string;
  snapshots: HealthSnapshot[];
}

interface SubAppStatus {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  tags: string[];
  status: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
}

interface EntityType {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface Entity {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  sourceLabel: string | null;
  confidence: number | null;
  trendScore: number;
  scrapedAt: string;
}

interface EntityRelation {
  id: number;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  weight: number;
}

interface EntityDetail extends Entity {
  relations: EntityRelation[];
}

interface EntityListResponse {
  total: number;
  limit: number;
  offset: number;
  items: Entity[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uptimePercent(snapshots: HealthSnapshot[]): number {
  if (snapshots.length === 0) return 0;
  const healthy = snapshots.filter((s) => s.status === "healthy").length;
  return Math.round((healthy / snapshots.length) * 100);
}

function avgLatency(snapshots: HealthSnapshot[]): number | null {
  const withLatency = snapshots.filter(
    (s) => s.status === "healthy" && s.latencyMs !== undefined,
  );
  if (withLatency.length === 0) return null;
  const sum = withLatency.reduce((a, s) => a + (s.latencyMs ?? 0), 0);
  return Math.round(sum / withLatency.length);
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function confidenceLabel(value: number | null): string {
  if (value === null || value === undefined) return "Not classified";
  return `${Math.round(value * 100)}% confidence`;
}

function entityColor(type: string, types: EntityType[] | undefined): string {
  return types?.find((item) => item.name === type)?.color ?? "#6366f1";
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ snapshots }: { snapshots: HealthSnapshot[] }) {
  // Show last 40 snapshots
  const recent = snapshots.slice(-40);
  if (recent.length === 0) {
    return (
      <div className="flex items-end gap-[2px] h-8">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1 rounded-sm bg-white/5" />
        ))}
      </div>
    );
  }
  // Find max latency for scaling
  const maxLat = Math.max(
    ...recent.map((s) => s.latencyMs ?? 0),
    1,
  );
  return (
    <div className="flex items-end gap-[2px] h-8" data-testid="sparkline">
      {recent.map((snap, i) => {
        const height = snap.status === "unhealthy"
          ? 4
          : Math.max(4, Math.round(((snap.latencyMs ?? 10) / maxLat) * 28));
        return (
          <div
            key={i}
            title={`${formatTs(snap.ts)} — ${snap.status}${snap.latencyMs !== undefined ? ` · ${snap.latencyMs}ms` : ""}`}
            style={{ height: `${height}px` }}
            className={`w-1.5 rounded-sm flex-shrink-0 transition-all ${
              snap.status === "healthy" ? "bg-green-400/70" : "bg-red-400/50"
            }`}
          />
        );
      })}
    </div>
  );
}

// ── Status indicators ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SubAppStatus["status"] | undefined }) {
  if (status === "healthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-400 font-mono" data-testid="pill-healthy">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Operational
      </div>
    );
  }
  if (status === "unhealthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono" data-testid="pill-unhealthy">
        <span className="w-2 h-2 rounded-full bg-red-400" />
        Offline
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" data-testid="pill-unknown">
      <Clock className="w-3 h-3" />
      Checking…
    </div>
  );
}

const APP_ICONS: Record<string, React.ReactNode> = {
  booking: <Calendar className="w-5 h-5" />,
  tax:     <FileText className="w-5 h-5" />,
  search:  <Search className="w-5 h-5" />,
  ai:      <Brain className="w-5 h-5" />,
};

const APP_COLORS: Record<string, { card: string; icon: string; bar: string }> = {
  booking: { card: "border-blue-500/20",   icon: "text-blue-400 bg-blue-500/10",    bar: "bg-blue-500" },
  tax:     { card: "border-emerald-500/20", icon: "text-emerald-400 bg-emerald-500/10", bar: "bg-emerald-500" },
  search:  { card: "border-violet-500/20",  icon: "text-violet-400 bg-violet-500/10",  bar: "bg-violet-500" },
  ai:      { card: "border-amber-500/20",   icon: "text-amber-400 bg-amber-500/10",   bar: "bg-amber-500" },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [countdown, setCountdown] = useState(10);
  const [activeView, setActiveView] = useState<"services" | "entities">("services");
  const [entityPage, setEntityPage] = useState(0);
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const entitiesPerPage = 12;

  const {
    data: liveApps,
    isLoading: appsLoading,
    refetch: refetchApps,
    dataUpdatedAt,
  } = useQuery<SubAppStatus[]>({
    queryKey: ["/api/apps"],
    queryFn: async () => {
      const res = await fetch("/api/apps");
      if (!res.ok) throw new Error("Failed to fetch service registry");
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: history } = useQuery<HealthHistoryEntry[]>({
    queryKey: ["/api/apps/health/history"],
    queryFn: async () => {
      const res = await fetch("/api/apps/health/history");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: entityTypes } = useQuery<EntityType[]>({
    queryKey: ["/api/entity-types"],
    queryFn: async () => {
      const res = await fetch("/api/entity-types");
      if (!res.ok) throw new Error("Failed to fetch entity types");
      return res.json();
    },
    enabled: activeView === "entities",
    staleTime: 5 * 60_000,
  });

  const entityQuery = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(entitiesPerPage),
      offset: String(entityPage * entitiesPerPage),
    });
    if (entityTypeFilter !== "all") params.set("type", entityTypeFilter);
    if (sourceFilter.trim()) params.set("source", sourceFilter.trim());
    return `/api/entities?${params.toString()}`;
  }, [entityPage, entityTypeFilter, sourceFilter]);

  const { data: entityResults, isLoading: entitiesLoading, isFetching: entitiesFetching, error: entitiesError } =
    useQuery<EntityListResponse>({
      queryKey: [entityQuery],
      queryFn: async () => {
        const res = await fetch(entityQuery);
        if (!res.ok) throw new Error("Failed to fetch entities");
        return res.json();
      },
      enabled: activeView === "entities",
      placeholderData: keepPreviousData,
    });

  const { data: sourceCatalog } = useQuery<EntityListResponse>({
    queryKey: ["/api/entities", "source-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/entities?limit=100&offset=0");
      if (!res.ok) throw new Error("Failed to fetch entity sources");
      return res.json();
    },
    enabled: activeView === "entities",
    staleTime: 5 * 60_000,
  });

  const { data: selectedEntity, isLoading: selectedEntityLoading } = useQuery<EntityDetail>({
    queryKey: ["/api/entities", selectedEntityId],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${selectedEntityId}`);
      if (!res.ok) throw new Error("Failed to fetch entity details");
      return res.json();
    },
    enabled: activeView === "entities" && !!selectedEntityId,
  });

  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (sourceCatalog?.items ?? [])
            .map((entity) => entity.sourceLabel)
            .filter((source): source is string => Boolean(source)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [sourceCatalog?.items],
  );

  // Countdown timer
  useEffect(() => {
    setCountdown(10);
    const iv = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 10 : c - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [dataUpdatedAt]);

  const allHealthy = liveApps?.every((a) => a.status === "healthy");
  const healthyCount = liveApps?.filter((a) => a.status === "healthy").length ?? 0;
  const totalCount = liveApps?.length ?? 4;

  const getHistory = (name: string): HealthSnapshot[] =>
    history?.find((h) => h.name === name)?.snapshots ?? [];

  const entityTotalPages = Math.max(1, Math.ceil((entityResults?.total ?? 0) / entitiesPerPage));

  function resetEntityFilters() {
    setEntityPage(0);
    setEntityTypeFilter("all");
    setSourceFilter("");
    setSelectedEntityId(null);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto px-4 md:px-6 pt-28 pb-20">

        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to home
          </Link>

           <div className="flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold">System Status</h1>
                {!appsLoading && (
                  <Badge
                    variant="outline"
                    className={`text-xs font-mono ${
                      allHealthy
                        ? "text-green-400 border-green-400/30 bg-green-400/5"
                        : "text-red-400 border-red-400/30 bg-red-400/5"
                    }`}
                    data-testid="badge-overall-status"
                  >
                    {allHealthy ? "All Systems Operational" : `${healthyCount}/${totalCount} Online`}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                Real-time health monitoring for all NexusConsult microservices.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Refreshing in <span className="text-foreground tabular-nums w-4 text-center">{countdown}s</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 hover:bg-white/5 text-xs"
                onClick={() => { refetchApps(); setCountdown(10); }}
                data-testid="btn-refresh-now"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh now
              </Button>
            </div>
          </div>
        </div>

         <Tabs value={activeView} onValueChange={(value) => setActiveView(value as "services" | "entities")}>
           <TabsList className="w-full justify-start h-auto rounded-none bg-transparent p-0 gap-1 border-b border-white/10">
             <TabsTrigger
               value="services"
               className="rounded-none gap-2 px-4 py-3 text-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
               data-testid="tab-service-status"
             >
               <Activity className="w-4 h-4" />
               Service status
             </TabsTrigger>
             <TabsTrigger
               value="entities"
               className="rounded-none gap-2 px-4 py-3 text-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
               data-testid="tab-entity-explorer"
             >
               <Network className="w-4 h-4" />
               Entity explorer
             </TabsTrigger>
           </TabsList>

           <TabsContent value="services" className="mt-8">
        {/* Overall status banner */}
        {!appsLoading && (
          <div
            className={`rounded-2xl border p-5 mb-10 flex items-center gap-4 ${
              allHealthy
                ? "bg-green-500/5 border-green-500/20"
                : healthyCount === 0
                  ? "bg-red-500/5 border-red-500/20"
                  : "bg-amber-500/5 border-amber-500/20"
            }`}
            data-testid="banner-overall"
          >
            {allHealthy ? (
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
            ) : healthyCount === 0 ? (
              <XCircle className="w-6 h-6 text-red-400 shrink-0" />
            ) : (
              <Activity className="w-6 h-6 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {allHealthy
                  ? "All services are operating normally."
                  : healthyCount === 0
                    ? "All services appear to be offline."
                    : `${totalCount - healthyCount} service${totalCount - healthyCount > 1 ? "s" : ""} currently offline.`}
              </div>
              {dataUpdatedAt > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last checked at {new Date(dataUpdatedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Service cards */}
        <div className="space-y-4" data-testid="service-cards">
          {(liveApps ?? Array.from({ length: 4 }, (_, i) => ({
            name: ["booking","tax","search","ai"][i],
            label: ["Nexus Booking","Nexus Tax","Nexus Search","Nexus AI"][i],
            description: "",
            baseUrl: "",
            port: [8003,8004,8002,8001][i],
            tags: [],
            status: "unconfigured" as const,
          }))).map((app) => {
            const snaps = getHistory(app.name);
            const uptime = uptimePercent(snaps);
            const avgLat = avgLatency(snaps);
            const colors = APP_COLORS[app.name] ?? { card: "border-white/10", icon: "text-muted-foreground bg-white/5", bar: "bg-primary" };

            return (
              <div
                key={app.name}
                className={`glass-panel rounded-2xl border p-6 ${colors.card}`}
                data-testid={`card-status-${app.name}`}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Icon + name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors.icon}`}>
                      {APP_ICONS[app.name] ?? <Server className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold" data-testid={`text-service-name-${app.name}`}>{app.label}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        port {app.port} · /api/apps/{app.name}/proxy/*
                      </div>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="hidden lg:flex flex-col gap-1 min-w-[160px]">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      Response latency (recent)
                    </div>
                    <Sparkline snapshots={snaps} />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    {snaps.length > 0 && (
                      <>
                        <div className="text-center">
                          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Uptime</div>
                          <div className={`text-sm font-bold tabular-nums ${uptime >= 90 ? "text-green-400" : uptime >= 50 ? "text-amber-400" : "text-red-400"}`} data-testid={`text-uptime-${app.name}`}>
                            {uptime}%
                          </div>
                        </div>
                        {avgLat !== null && (
                          <div className="text-center">
                            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Avg Latency</div>
                            <div className="text-sm font-bold tabular-nums text-foreground/80" data-testid={`text-latency-${app.name}`}>
                              {avgLat}ms
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Status pill */}
                    <div className="min-w-[100px] flex justify-end">
                      <StatusPill status={app.status} />
                    </div>
                  </div>
                </div>

                {/* Uptime bar */}
                {snaps.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
                      <span>Health history ({snaps.length} checks)</span>
                      <span>{snaps.length > 0 ? `oldest: ${formatTs(snaps[0].ts)}` : ""}</span>
                    </div>
                    <div className="flex gap-[2px] h-2 w-full">
                      {snaps.slice(-80).map((snap, i) => (
                        <div
                          key={i}
                          title={`${formatTs(snap.ts)} — ${snap.status}${snap.latencyMs !== undefined ? ` · ${snap.latencyMs}ms` : ""}`}
                          className={`flex-1 rounded-sm ${
                            snap.status === "healthy" ? "bg-green-400/60" : "bg-red-400/40"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {snaps.length === 0 && (
                  <div className="mt-3 text-xs text-muted-foreground font-mono">
                    No history yet — data accumulates as the gateway polls services.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-10 glass-panel rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">About This Page</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-sm bg-green-400/60 mt-0.5 shrink-0" />
              <span><span className="text-foreground font-medium">Operational</span> — service responded to health probe within 3s</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 rounded-sm bg-red-400/40 mt-0.5 shrink-0" />
              <span><span className="text-foreground font-medium">Offline</span> — health probe timed out or returned non-2xx</span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-3 h-3 mt-0.5 shrink-0" />
              <span>History is in-memory and resets on server restart. Polls every 10s via the gateway.</span>
            </div>
          </div>
        </div>
           </TabsContent>

           <TabsContent value="entities" className="mt-8">
           <section aria-label="Entity explorer" data-testid="entity-explorer">
             <div className="flex flex-col gap-5 mb-6">
               <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                 <div>
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                       <Database className="w-5 h-5 text-violet-400" />
                     </div>
                     <div>
                       <h2 className="text-2xl font-display font-bold">Entity Explorer</h2>
                       <p className="text-sm text-muted-foreground">Browse the knowledge graph discovered by NexusScraper.</p>
                     </div>
                   </div>
                 </div>
                 <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                   <span className="w-2 h-2 rounded-full bg-violet-400" />
                   {entityResults?.total ?? 0} {entityResults?.total === 1 ? "entity" : "entities"} indexed
                 </div>
               </div>

               <div className="glass-panel rounded-2xl border border-white/10 p-4">
                 <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
                   <SlidersHorizontal className="w-3.5 h-3.5" />
                   Filter discoveries
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
                   <label className="space-y-1.5">
                     <span className="text-xs text-muted-foreground">Entity type</span>
                     <Select
                       value={entityTypeFilter}
                       onValueChange={(value) => {
                         setEntityPage(0);
                         setSelectedEntityId(null);
                         setEntityTypeFilter(value);
                       }}
                     >
                       <SelectTrigger className="bg-background/50 border-white/10" data-testid="select-entity-type">
                         <SelectValue placeholder="All entity types" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="all">All entity types</SelectItem>
                         {(entityTypes ?? []).map((type) => (
                           <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </label>
                   <label className="space-y-1.5">
                     <span className="text-xs text-muted-foreground">Source label</span>
                     <div className="relative">
                       <Input
                         list="entity-source-options"
                         value={sourceFilter}
                         onChange={(event) => {
                           setEntityPage(0);
                           setSelectedEntityId(null);
                           setSourceFilter(event.target.value);
                         }}
                         placeholder="e.g. Hacker News or Reddit"
                         className="bg-background/50 border-white/10 pr-9"
                         data-testid="input-entity-source"
                       />
                       <datalist id="entity-source-options">
                         {sourceOptions.map((source) => <option key={source} value={source} />)}
                       </datalist>
                       {sourceFilter && (
                         <button
                           type="button"
                           onClick={() => { setSourceFilter(""); setEntityPage(0); }}
                           className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                           aria-label="Clear source filter"
                         >
                           <X className="w-4 h-4" />
                         </button>
                       )}
                     </div>
                   </label>
                   <Button
                     type="button"
                     variant="ghost"
                     className="gap-2 text-muted-foreground hover:text-foreground"
                     onClick={resetEntityFilters}
                     disabled={entityTypeFilter === "all" && !sourceFilter && !selectedEntityId}
                     data-testid="button-clear-entity-filters"
                   >
                     <X className="w-4 h-4" />
                     Clear filters
                   </Button>
                 </div>
               </div>
             </div>

             {entitiesError ? (
               <div className="glass-panel rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
                 <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                 <p className="font-medium">Entity data is unavailable</p>
                 <p className="text-sm text-muted-foreground mt-1">The scraper database could not be reached. Try again shortly.</p>
               </div>
             ) : (
               <div className={`grid gap-5 ${selectedEntityId ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
                 <div>
                   {entitiesLoading ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {Array.from({ length: 6 }).map((_, index) => (
                         <div key={index} className="glass-panel rounded-2xl border border-white/10 p-5 animate-pulse">
                           <div className="h-3 w-20 rounded bg-white/10 mb-4" />
                           <div className="h-5 w-3/4 rounded bg-white/10 mb-3" />
                           <div className="h-3 w-full rounded bg-white/5 mb-2" />
                           <div className="h-3 w-2/3 rounded bg-white/5" />
                         </div>
                       ))}
                     </div>
                   ) : entityResults?.items.length ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {entityResults.items.map((entity) => {
                         const color = entityColor(entity.type, entityTypes);
                         const isSelected = selectedEntityId === entity.id;
                         return (
                           <button
                             type="button"
                             key={entity.id}
                             onClick={() => setSelectedEntityId(entity.id)}
                             className={`text-left glass-panel rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:border-white/25 ${
                               isSelected ? "border-primary/60 bg-primary/5" : "border-white/10"
                             }`}
                             data-testid={`entity-card-${entity.id}`}
                           >
                             <div className="flex items-start justify-between gap-3 mb-4">
                               <Badge
                                 variant="outline"
                                 className="text-[10px] font-mono"
                                 style={{ color, borderColor: `${color}66`, backgroundColor: `${color}12` }}
                               >
                                 {entity.type}
                               </Badge>
                               <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                             </div>
                             <h3 className="font-semibold leading-snug line-clamp-2 mb-2">{entity.title}</h3>
                             <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3.75rem]">
                               {entity.summary || "No summary available for this discovery."}
                             </p>
                             <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-[11px] font-mono text-muted-foreground">
                               {entity.sourceLabel && <span className="truncate max-w-[150px]">{entity.sourceLabel}</span>}
                               <span>{formatDate(entity.scrapedAt)}</span>
                               {entity.confidence !== null && <span>{Math.round(entity.confidence * 100)}%</span>}
                             </div>
                           </button>
                         );
                       })}
                     </div>
                   ) : (
                     <div className="glass-panel rounded-2xl border border-white/10 p-12 text-center">
                       <Network className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
                       <h3 className="font-semibold mb-1">No entities match these filters</h3>
                       <p className="text-sm text-muted-foreground mb-5">Try a different type or source label.</p>
                       <Button type="button" variant="outline" onClick={resetEntityFilters}>Clear filters</Button>
                     </div>
                   )}

                   {entityResults && entityResults.total > 0 && (
                     <div className="flex items-center justify-between mt-6">
                       <span className="text-xs text-muted-foreground font-mono">
                         Showing {entityResults.offset + 1}–{Math.min(entityResults.offset + entityResults.items.length, entityResults.total)} of {entityResults.total}
                       </span>
                       <div className="flex items-center gap-2">
                         <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           className="gap-1 border-white/10"
                           disabled={entityPage === 0 || entitiesFetching}
                           onClick={() => { setEntityPage((page) => page - 1); setSelectedEntityId(null); }}
                           aria-label="Previous entity page"
                           data-testid="button-entities-previous"
                         >
                           <ChevronLeft className="w-4 h-4" />
                           Previous
                         </Button>
                         <span className="text-xs font-mono text-muted-foreground px-2">
                           {entityPage + 1} / {entityTotalPages}
                         </span>
                         <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           className="gap-1 border-white/10"
                           disabled={entityPage >= entityTotalPages - 1 || entitiesFetching}
                           onClick={() => { setEntityPage((page) => page + 1); setSelectedEntityId(null); }}
                           aria-label="Next entity page"
                           data-testid="button-entities-next"
                         >
                           Next
                           <ChevronRight className="w-4 h-4" />
                         </Button>
                       </div>
                     </div>
                   )}
                 </div>

                 {selectedEntityId && (
                   <aside className="glass-panel rounded-2xl border border-white/10 p-5 h-fit xl:sticky xl:top-28" data-testid="entity-detail-panel">
                     {selectedEntityLoading || !selectedEntity ? (
                       <div className="flex items-center justify-center py-16 text-muted-foreground">
                         <Loader2 className="w-5 h-5 animate-spin mr-2" />
                         Loading entity…
                       </div>
                     ) : (
                       <>
                         <div className="flex items-start justify-between gap-3 mb-5">
                           <div>
                             <div className="flex items-center gap-2 mb-2">
                               <span
                                 className="w-2.5 h-2.5 rounded-full"
                                 style={{ backgroundColor: entityColor(selectedEntity.type, entityTypes) }}
                               />
                               <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{selectedEntity.type}</span>
                             </div>
                             <h2 className="text-xl font-display font-bold leading-snug">{selectedEntity.title}</h2>
                           </div>
                           <button
                             type="button"
                             onClick={() => setSelectedEntityId(null)}
                             className="text-muted-foreground hover:text-foreground p-1"
                             aria-label="Close entity details"
                           >
                             <X className="w-4 h-4" />
                           </button>
                         </div>

                         <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                           {selectedEntity.summary || "No summary available for this discovery."}
                         </p>

                         <div className="space-y-3 text-sm border-t border-white/10 pt-4">
                           <div className="flex items-start gap-3">
                             <Globe2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                             <div className="min-w-0">
                               <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Source</div>
                               <a
                                 href={selectedEntity.sourceUrl}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="text-primary hover:underline break-all inline-flex items-center gap-1"
                               >
                                 {selectedEntity.sourceLabel || "Open source"}
                                 <ExternalLink className="w-3 h-3 shrink-0" />
                               </a>
                             </div>
                           </div>
                           <div className="flex items-start gap-3">
                             <Crosshair className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                             <div>
                               <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Classification</div>
                               <div>{confidenceLabel(selectedEntity.confidence)}</div>
                             </div>
                           </div>
                           <div className="flex items-start gap-3">
                             <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                             <div>
                               <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Discovered</div>
                               <div>{formatDate(selectedEntity.scrapedAt)}</div>
                             </div>
                           </div>
                         </div>

                         <div className="border-t border-white/10 mt-5 pt-4">
                           <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                               <Link2 className="w-4 h-4 text-primary" />
                               <h3 className="text-sm font-semibold">Outbound relations</h3>
                             </div>
                             <Badge variant="outline" className="text-[10px] font-mono">{selectedEntity.relations.length}</Badge>
                           </div>
                           {selectedEntity.relations.length ? (
                             <div className="space-y-2">
                               {selectedEntity.relations.map((relation) => (
                                 <button
                                   type="button"
                                   key={relation.id}
                                   onClick={() => setSelectedEntityId(relation.toEntityId)}
                                   className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                   data-testid={`entity-relation-${relation.id}`}
                                 >
                                   <span className="min-w-0">
                                     <span className="block text-sm font-medium truncate">{relation.relationType.replace(/_/g, " ")}</span>
                                     <span className="block text-[10px] font-mono text-muted-foreground truncate">to {relation.toEntityId}</span>
                                   </span>
                                   <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                 </button>
                               ))}
                             </div>
                           ) : (
                             <p className="text-xs text-muted-foreground">No outbound relations have been recorded.</p>
                           )}
                         </div>
                       </>
                     )}
                   </aside>
                 )}
               </div>
             )}
           </section>
           </TabsContent>
         </Tabs>
      </main>
    </div>
  );
}
