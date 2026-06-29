/**
 * /analytics — Platform API Analytics Dashboard
 *
 * Connects to nexus-analytics (port 8300) via the Express gateway proxy at
 * /api/apps/analytics/proxy/.  Displays real-time service call counts,
 * error rates, latency stats, and a timeseries chart.
 * Shows an offline banner when the service is unreachable.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Activity,
  Server,
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceSummary {
  service: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
}

interface EndpointSummary {
  service: string;
  method: string;
  endpoint: string;
  total_calls: number;
  avg_latency_ms: number;
  error_rate: number;
}

interface TimeseriesPoint {
  bucket: string;
  calls: number;
  errors: number;
  avg_latency_ms: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROXY = "/api/apps/analytics/proxy";

const HOURS_OPTIONS = [1, 6, 24, 72, 168];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(path: string) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postJson(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function ServiceColour(name: string): string {
  const colours: Record<string, string> = {
    "nexus-quantum":   "#8b5cf6",
    "nexus-ai":        "#7c3aed",
    "nexus-search":    "#2563eb",
    "nexus-booking":   "#0891b2",
    "nexus-tax":       "#059669",
    "nexus-graph":     "#d97706",
    "nexus-analytics": "#dc2626",
  };
  return colours[name] ?? "#6b7280";
}

// ── Offline Banner ────────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 mb-6">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <span className="font-semibold">nexus-analytics service is offline.</span>{" "}
        Start the service on port 8300 to enable platform metrics.
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  colour = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  colour?: "blue" | "green" | "red" | "purple" | "amber";
}) {
  const iconBg: Record<string, string> = {
    blue:   "bg-blue-600/20 text-blue-400",
    green:  "bg-green-600/20 text-green-400",
    red:    "bg-red-600/20 text-red-400",
    purple: "bg-purple-600/20 text-purple-400",
    amber:  "bg-amber-600/20 text-amber-400",
  };
  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wide">{label}</p>
        <div className={`rounded-lg p-2 ${iconBg[colour]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [hours, setHours] = useState(24);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  // Health check
  useEffect(() => {
    fetch(`${PROXY}/health`)
      .then((r) => setIsOnline(r.ok))
      .catch(() => setIsOnline(false));
  }, []);

  // Summary
  const { data: summary = [], isLoading: sumLoading, refetch: refetchSummary } = useQuery<ServiceSummary[]>({
    queryKey: ["analytics-summary", hours],
    queryFn: () => fetchJson(`${PROXY}/v1/analytics/summary?hours=${hours}`),
    enabled: isOnline === true,
    refetchInterval: 30_000,
  });

  // Top endpoints
  const { data: topEndpoints = [], isLoading: topLoading } = useQuery<EndpointSummary[]>({
    queryKey: ["analytics-top", hours],
    queryFn: () => fetchJson(`${PROXY}/v1/analytics/top-endpoints?hours=${hours}&limit=10`),
    enabled: isOnline === true,
    refetchInterval: 30_000,
  });

  // Timeseries
  const { data: timeseries = [], isLoading: tsLoading } = useQuery<TimeseriesPoint[]>({
    queryKey: ["analytics-ts", hours],
    queryFn: () =>
      fetchJson(`${PROXY}/v1/analytics/timeseries?hours=${hours}&bucket_minutes=${hours <= 6 ? 15 : 60}`),
    enabled: isOnline === true,
    refetchInterval: 30_000,
  });

  // Test event ingestion
  const { mutate: sendTestEvent, isPending: sendingEvent } = useMutation({
    mutationFn: () =>
      postJson(`${PROXY}/v1/analytics/events`, {
        service: "nexus-analytics-ui",
        method: "GET",
        endpoint: "/analytics",
        status_code: 200,
        latency_ms: Math.round(Math.random() * 80 + 10),
      }),
    onSuccess: () => refetchSummary(),
  });

  // Aggregate totals
  const totals = summary.reduce(
    (acc, s) => ({
      calls: acc.calls + s.total_calls,
      errors: acc.errors + s.error_calls,
      avgLatency: acc.avgLatency + s.avg_latency_ms,
    }),
    { calls: 0, errors: 0, avgLatency: 0 }
  );
  const avgLatency = summary.length ? totals.avgLatency / summary.length : 0;
  const overallSuccessRate = totals.calls
    ? (((totals.calls - totals.errors) / totals.calls) * 100).toFixed(1)
    : "—";

  // Format timeseries bucket labels
  const tsChartData = timeseries.map((p) => ({
    ...p,
    label: new Date(p.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  const isLoading = sumLoading || topLoading || tsLoading;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20">
                <BarChart2 className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold font-display text-gradient">
                Platform Analytics
              </h1>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                nexus-analytics
              </Badge>
              {isOnline !== null && (
                <span
                  data-testid="analytics-online-status"
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    isOnline ? "text-green-400" : "text-amber-400"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-400" : "bg-amber-400"}`} />
                  {isOnline ? "Online :8300" : "Offline"}
                </span>
              )}
            </div>
            <p className="text-sm text-white/50 ml-12">
              API call counts, latency, and error rates across all NexusConsult services
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Time window selector */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  data-testid={`hours-${h}`}
                  onClick={() => setHours(h)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    hours === h
                      ? "bg-blue-600 text-white"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {h < 24 ? `${h}h` : `${h / 24}d`}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-white/10 text-xs"
              onClick={() => refetchSummary()}
              disabled={isLoading}
              data-testid="btn-refresh-analytics"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Offline banner */}
        {isOnline === false && <OfflineBanner />}

        {isOnline === true && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
              <StatCard
                label="Total Calls"
                value={isLoading ? "…" : totals.calls.toLocaleString()}
                sub={`last ${hours}h`}
                icon={Activity}
                colour="blue"
              />
              <StatCard
                label="Success Rate"
                value={isLoading ? "…" : `${overallSuccessRate}%`}
                sub={`${totals.errors.toLocaleString()} errors`}
                icon={CheckCircle2}
                colour="green"
              />
              <StatCard
                label="Avg Latency"
                value={isLoading ? "…" : `${avgLatency.toFixed(0)}ms`}
                sub="across all services"
                icon={Clock}
                colour="purple"
              />
              <StatCard
                label="Services"
                value={isLoading ? "…" : String(summary.length)}
                sub="reporting data"
                icon={Server}
                colour="amber"
              />
            </div>

            {/* Timeseries chart */}
            {tsChartData.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 mb-6">
                <h2 className="text-sm font-semibold text-white mb-4">API Call Volume</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={tsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={false} name="Calls" />
                    <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} dot={false} name="Errors" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Service summary table + endpoint chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
              {/* Service summary */}
              <div className="glass-panel rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Service Summary</h2>
                {sumLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  </div>
                ) : summary.length === 0 ? (
                  <p className="text-xs text-white/40 py-8 text-center">
                    No events recorded yet. Send a test event below.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {summary.map((s) => (
                      <div key={s.service} data-testid={`summary-row-${s.service}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white">{s.service}</span>
                          <div className="flex items-center gap-3 text-xs text-white/40">
                            <span className="text-white/60">{s.total_calls.toLocaleString()} calls</span>
                            <span className={s.error_calls > 0 ? "text-red-400" : "text-green-400"}>
                              {(s.success_rate * 100).toFixed(1)}% OK
                            </span>
                            <span>{s.avg_latency_ms.toFixed(0)}ms avg</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${s.success_rate * 100}%`,
                              background: ServiceColour(s.service),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top endpoints bar chart */}
              <div className="glass-panel rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Top Endpoints by Volume</h2>
                {topLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  </div>
                ) : topEndpoints.length === 0 ? (
                  <p className="text-xs text-white/40 py-8 text-center">No endpoint data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={topEndpoints.map((e) => ({
                        name: `${e.method} ${e.endpoint.slice(0, 20)}`,
                        calls: e.total_calls,
                        latency: Math.round(e.avg_latency_ms),
                      }))}
                      layout="vertical"
                    >
                      <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} width={120} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      />
                      <Bar dataKey="calls" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Send test event */}
            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white mb-1">Test Event Ingestion</h2>
              <p className="text-xs text-white/40 mb-4">
                Send a sample analytics event from this UI page to verify the pipeline is working.
              </p>
              <Button
                size="sm"
                onClick={() => sendTestEvent()}
                disabled={sendingEvent}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
                data-testid="btn-send-test-event"
              >
                {sendingEvent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Send Test Event
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
