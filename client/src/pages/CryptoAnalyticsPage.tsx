/**
 * /crypto/analytics — Portfolio Analytics Page
 *
 * Connects to crypto-analytics (port 8104) via gateway proxy.
 * Shows portfolio value timeseries, P&L breakdown, performance metrics,
 * asset allocation chart, and a snapshot recording form.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import {
  LineChart as LineIcon, AlertTriangle, Loader2, TrendingUp,
  TrendingDown, BarChart2, RefreshCw, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar,
  Cell, PieChart, Pie, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Timeseries {
  user_id: string;
  portfolio_id: string;
  dates: string[];
  values: number[];
  cost_basis: number[];
  pnl: number[];
  pnl_pct: number[];
}

interface Performance {
  sharpe_ratio: number;
  max_drawdown_pct: number;
  volatility_30d_pct: number;
  total_return_pct: number;
  latest_value_usd: number;
  cost_basis_usd: number;
  snapshot_count: number;
}

interface BreakdownAsset {
  coin_symbol: string;
  quantity: number;
  price_usd: number;
  value_usd: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  weight_pct: number;
}

interface Breakdown {
  assets: BreakdownAsset[];
  total_value_usd: number;
  total_pnl: number;
}

// ── Static seed data ──────────────────────────────────────────────────────────

const DEMO_USER = "demo-user-001";
const DEMO_PORTFOLIO = "main";

// Generate 90 days of synthetic portfolio data
function genSyntheticTimeseries(): Timeseries {
  const base = 125000;
  const dates: string[] = [];
  const values: number[] = [];
  const cost_basis: number[] = [];
  const pnl: number[] = [];
  const pnl_pct: number[] = [];
  let price = base;
  const cost = 112000;
  for (let i = 89; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    price = price * (1 + (Math.random() * 0.04 - 0.018));
    values.push(Math.round(price));
    cost_basis.push(cost);
    pnl.push(Math.round(price - cost));
    pnl_pct.push(((price - cost) / cost) * 100);
  }
  return { user_id: DEMO_USER, portfolio_id: DEMO_PORTFOLIO, dates, values, cost_basis, pnl, pnl_pct };
}

const STATIC_TS = genSyntheticTimeseries();

const STATIC_BREAKDOWN: Breakdown = {
  assets: [
    { coin_symbol: "BTC", quantity: 0.5, price_usd: 67000, value_usd: 33500, cost_basis: 30000, pnl: 3500, pnl_pct: 11.67, weight_pct: 40.3 },
    { coin_symbol: "ETH", quantity: 3.2, price_usd: 3400, value_usd: 10880, cost_basis: 9600, pnl: 1280, pnl_pct: 13.33, weight_pct: 13.1 },
    { coin_symbol: "SOL", quantity: 50, price_usd: 165, value_usd: 8250, cost_basis: 7000, pnl: 1250, pnl_pct: 17.86, weight_pct: 9.9 },
    { coin_symbol: "USDC", quantity: 5000, price_usd: 1.0, value_usd: 5000, cost_basis: 5000, pnl: 0, pnl_pct: 0, weight_pct: 6.0 },
    { coin_symbol: "MATIC", quantity: 1000, price_usd: 0.85, value_usd: 850, cost_basis: 900, pnl: -50, pnl_pct: -5.56, weight_pct: 1.0 },
  ],
  total_value_usd: 58480,
  total_pnl: 5980,
};

const STATIC_PERF: Performance = {
  sharpe_ratio: 1.42,
  max_drawdown_pct: -18.3,
  volatility_30d_pct: 24.7,
  total_return_pct: 11.6,
  latest_value_usd: 58480,
  cost_basis_usd: 52500,
  snapshot_count: 90,
};

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

function fmt(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

interface MetricCardProps { label: string; value: string; sub?: string; positive?: boolean; neutral?: boolean; }
function MetricCard({ label, value, sub, positive, neutral }: MetricCardProps) {
  const color = neutral ? "text-foreground" : positive ? "text-emerald-400" : "text-red-400";
  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function CryptoAnalyticsPage() {
  const [demoMode, setDemoMode] = useState(false);
  const qc = useQueryClient();

  const { data: tsData, isLoading: tsLoading, isError: tsError, refetch } = useQuery<Timeseries>({
    queryKey: ["analytics-timeseries", DEMO_USER],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-analytics/proxy/v1/analytics/portfolio/timeseries?user_id=${DEMO_USER}&portfolio_id=${DEMO_PORTFOLIO}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
    staleTime: 60_000,
  });

  const { data: perfData, isLoading: perfLoading, isError: perfError } = useQuery<Performance>({
    queryKey: ["analytics-performance", DEMO_USER],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-analytics/proxy/v1/analytics/portfolio/performance?user_id=${DEMO_USER}&portfolio_id=${DEMO_PORTFOLIO}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
    staleTime: 60_000,
  });

  const { data: breakdownData, isLoading: bdLoading, isError: bdError } = useQuery<Breakdown>({
    queryKey: ["analytics-breakdown", DEMO_USER],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-analytics/proxy/v1/analytics/portfolio/breakdown?user_id=${DEMO_USER}&portfolio_id=${DEMO_PORTFOLIO}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
    staleTime: 60_000,
  });

  // Seed demo snapshot mutation
  const seedMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/apps/crypto-analytics/proxy/v1/analytics/portfolio/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER,
          portfolio_id: DEMO_PORTFOLIO,
          assets: STATIC_BREAKDOWN.assets.map(a => ({
            coin_symbol: a.coin_symbol,
            quantity: a.quantity,
            price_usd: a.price_usd,
            cost_basis: a.cost_basis / a.quantity,
          })),
          realized_pnl: 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analytics-timeseries"] });
      qc.invalidateQueries({ queryKey: ["analytics-performance"] });
      qc.invalidateQueries({ queryKey: ["analytics-breakdown"] });
      setDemoMode(false);
    },
  });

  const offline = tsError && perfError;
  const ts: Timeseries = tsData ?? STATIC_TS;
  const perf: Performance = perfData ?? STATIC_PERF;
  const bd: Breakdown = breakdownData ?? STATIC_BREAKDOWN;

  // Build chart data
  const tsChartData = ts.dates.map((d, i) => ({
    date: d,
    value: ts.values[i],
    cost: ts.cost_basis[i],
    pnl: ts.pnl[i],
  }));

  const latestPnl = ts.pnl[ts.pnl.length - 1] ?? 0;
  const tsColor = latestPnl >= 0 ? "#10b981" : "#ef4444";

  const pieData = bd.assets.map(a => ({ name: a.coin_symbol, value: Math.round(a.weight_pct * 10) / 10 }));
  const barData = bd.assets.map(a => ({ name: a.coin_symbol, pnl: Math.round(a.pnl), pnl_pct: Math.round(a.pnl_pct * 10) / 10 }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 md:px-6 container mx-auto max-w-6xl">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-1">
              <LineIcon className="w-7 h-7 text-amber-400" />
              <div>
                <h1 className="text-2xl font-bold font-display text-gradient">Crypto Analytics</h1>
                <p className="text-sm text-muted-foreground">Portfolio P&L, Sharpe ratio, drawdown, and asset allocation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending} className="text-xs h-7">
                {seedMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
                Record Snapshot
              </Button>
              <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </motion.div>

        {offline && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Crypto Analytics service (port 8104) is offline — showing synthetic demo data.
              {" "}<button onClick={() => seedMut.mutate()} className="underline text-amber-300 hover:text-amber-200">Try recording a snapshot</button> when the service is up.
            </span>
          </div>
        )}

        {/* Performance metrics */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {perfLoading ? (
            Array(4).fill(0).map((_, i) => <div key={i} className="glass-panel rounded-xl p-4 h-20 animate-pulse bg-white/3" />)
          ) : (
            <>
              <MetricCard label="Portfolio Value" value={fmt(perf.latest_value_usd)} sub={`Cost basis: ${fmt(perf.cost_basis_usd)}`} neutral />
              <MetricCard label="Total Return" value={`${perf.total_return_pct >= 0 ? "+" : ""}${perf.total_return_pct.toFixed(2)}%`}
                sub={`${perf.snapshot_count} snapshots`} positive={perf.total_return_pct >= 0} />
              <MetricCard label="Sharpe Ratio" value={perf.sharpe_ratio.toFixed(2)} sub="Annualised (365d, rf=5%)" positive={perf.sharpe_ratio >= 1} neutral={perf.sharpe_ratio >= 0 && perf.sharpe_ratio < 1} />
              <MetricCard label="Max Drawdown" value={`${perf.max_drawdown_pct.toFixed(2)}%`}
                sub={`30d Vol: ${perf.volatility_30d_pct.toFixed(1)}%`} positive={perf.max_drawdown_pct > -10} />
            </>
          )}
        </motion.div>

        {/* Timeseries chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Portfolio Value Over Time
          </h2>
          {tsLoading ? (
            <div className="flex justify-center items-center h-60"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={tsChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={tsColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={tsColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b7280" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(tsChartData.length / 6)} />
                <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} domain={["auto", "auto"]} width={55} />
                <RTooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  formatter={(val: number, name: string) => [fmt(val), name === "value" ? "Portfolio" : "Cost Basis"]} />
                <Area type="monotone" dataKey="cost" stroke="#6b7280" strokeWidth={1} fill="url(#costGrad)" dot={false} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="value" stroke={tsColor} strokeWidth={2} fill="url(#valGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Bottom row: P&L bar + pie chart */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* P&L Breakdown bar */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="glass-panel rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> P&L by Asset
            </h2>
            {bdLoading ? (
              <div className="flex justify-center items-center h-48"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={50} />
                  <RTooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(val: number) => [`$${val.toLocaleString()}`, "P&L"]} />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          {/* Allocation pie */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="glass-panel rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4">Asset Allocation</h2>
            {bdLoading ? (
              <div className="flex justify-center items-center h-48"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" nameKey="name" label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(val: number, name: string) => [`${val}%`, name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* Asset table */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-6">
          <h2 className="font-semibold text-foreground mb-3">Asset Breakdown</h2>
          <div className="glass-panel rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Asset</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Qty</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Price</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Value</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">P&L</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Weight</th>
                </tr>
              </thead>
              <tbody>
                {bd.assets.map(a => (
                  <tr key={a.coin_symbol} className="border-b border-white/3 hover:bg-white/3" data-testid={`row-asset-${a.coin_symbol}`}>
                    <td className="px-4 py-3 font-semibold text-foreground">{a.coin_symbol}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{a.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">${a.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(a.value_usd)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className={`font-semibold ${a.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {a.pnl >= 0 ? "+" : ""}{fmt(a.pnl)}
                      </div>
                      <div className={`text-xs ${a.pnl_pct >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        {a.pnl_pct >= 0 ? "+" : ""}{a.pnl_pct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-muted-foreground">{a.weight_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
