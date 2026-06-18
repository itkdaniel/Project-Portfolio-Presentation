import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
      </main>
    </div>
  );
}
