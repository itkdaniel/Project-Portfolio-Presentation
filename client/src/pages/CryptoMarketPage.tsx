/**
 * /crypto/market — Market Data Page
 *
 * Connects to crypto-market (port 8101) via gateway proxy.
 * Shows coin list table, OHLCV area chart, interval selector, search filter.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import {
  TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Search, RefreshCw, CandlestickChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CoinRow {
  id: number;
  symbol: string;
  name: string;
  coingecko_id: string | null;
  is_active: boolean;
  sort_order: number;
}

interface PriceTick {
  coin_symbol: string;
  price_usd: number;
  price_change_24h: number;
  price_change_7d: number;
  volume_24h: number;
  market_cap: number | null;
  bid: number | null;
  ask: number | null;
  recorded_at: string;
}

interface OHLCVCandle {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  coin_symbol: string;
}

const INTERVALS = ["1h", "4h", "1d", "1w"] as const;
type Interval = typeof INTERVALS[number];

function fmt(n: number): string {
  if (!n && n !== 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(5)}`;
}

// Static fallback data when service is offline
const STATIC_PRICES: PriceTick[] = [
  { coin_symbol: "BTC", price_usd: 67000, price_change_24h: 2.3, price_change_7d: 5.1, volume_24h: 28e9, market_cap: 1.32e12, bid: 66990, ask: 67010, recorded_at: new Date().toISOString() },
  { coin_symbol: "ETH", price_usd: 3400, price_change_24h: -1.1, price_change_7d: 3.2, volume_24h: 14e9, market_cap: 4.1e11, bid: 3398, ask: 3402, recorded_at: new Date().toISOString() },
  { coin_symbol: "SOL", price_usd: 165, price_change_24h: 4.7, price_change_7d: 8.3, volume_24h: 3.2e9, market_cap: 7.1e10, bid: 164.8, ask: 165.2, recorded_at: new Date().toISOString() },
  { coin_symbol: "BNB", price_usd: 580, price_change_24h: 0.8, price_change_7d: 2.1, volume_24h: 1.8e9, market_cap: 8.4e10, bid: 579.5, ask: 580.5, recorded_at: new Date().toISOString() },
  { coin_symbol: "USDC", price_usd: 1.0, price_change_24h: 0.01, price_change_7d: 0.0, volume_24h: 5.1e9, market_cap: 3.2e10, bid: 0.999, ask: 1.001, recorded_at: new Date().toISOString() },
  { coin_symbol: "ADA", price_usd: 0.45, price_change_24h: -2.2, price_change_7d: -1.1, volume_24h: 3.8e8, market_cap: 1.6e10, bid: 0.449, ask: 0.451, recorded_at: new Date().toISOString() },
  { coin_symbol: "AVAX", price_usd: 35, price_change_24h: 3.1, price_change_7d: 6.4, volume_24h: 4.5e8, market_cap: 1.4e10, bid: 34.9, ask: 35.1, recorded_at: new Date().toISOString() },
  { coin_symbol: "MATIC", price_usd: 0.85, price_change_24h: -0.9, price_change_7d: 1.3, volume_24h: 2.1e8, market_cap: 7.9e9, bid: 0.848, ask: 0.852, recorded_at: new Date().toISOString() },
];

// Synthetic OHLCV data for offline fallback
function genCandles(base: number, count = 30): { date: string; close: number; high: number; low: number; volume: number }[] {
  const out = [];
  let price = base;
  for (let i = count; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const change = price * (Math.random() * 0.06 - 0.03);
    const open = price;
    price = price + change;
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      close: Math.round(price * 100) / 100,
      high: Math.round((Math.max(open, price) * (1 + Math.random() * 0.01)) * 100) / 100,
      low: Math.round((Math.min(open, price) * (1 - Math.random() * 0.01)) * 100) / 100,
      volume: Math.round(base * 1000 * (0.5 + Math.random())),
    });
  }
  return out;
}

export default function CryptoMarketPage() {
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [interval, setInterval] = useState<Interval>("1d");

  const { data: priceData, isLoading: pricesLoading, isError: pricesError, refetch } = useQuery({
    queryKey: ["market-prices"],
    queryFn: async () => {
      const res = await fetch("/api/apps/crypto-market/proxy/v1/market/prices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json as PriceTick[] : (json.prices as PriceTick[] ?? []);
    },
    retry: 1,
    staleTime: 30_000,
  });

  const { data: candleData, isLoading: candlesLoading } = useQuery({
    queryKey: ["market-candles", selectedSymbol, interval],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-market/proxy/v1/market/candles/${selectedSymbol}?interval=${interval}&limit=60`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows: OHLCVCandle[] = Array.isArray(json) ? json : (json.candles ?? []);
      return rows.map(c => ({
        date: new Date(c.open_time).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        close: c.close,
        high: c.high,
        low: c.low,
        volume: c.volume,
      }));
    },
    retry: 1,
    enabled: !pricesError,
    staleTime: 60_000,
  });

  const offline = pricesError;
  const prices = priceData ?? (offline ? STATIC_PRICES : []);
  const filtered = prices.filter(p => p.coin_symbol.toLowerCase().includes(search.toLowerCase()));
  const chartData = candleData ?? genCandles(prices.find(p => p.coin_symbol === selectedSymbol)?.price_usd ?? 100);
  const selectedPrice = prices.find(p => p.coin_symbol === selectedSymbol);
  const chartColor = (selectedPrice?.price_change_24h ?? 0) >= 0 ? "#10b981" : "#ef4444";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 md:px-6 container mx-auto max-w-6xl">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <CandlestickChart className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold font-display text-gradient">Crypto Market</h1>
          </div>
          <p className="text-sm text-muted-foreground">OHLCV candles, live prices, and 24h tickers</p>
        </motion.div>

        {offline && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Crypto Market service (port 8101) is offline — displaying reference data.</span>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Coin List */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-xl overflow-hidden">
              <div className="p-3 border-b border-white/5 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Filter coins…"
                    className="pl-8 h-7 text-xs bg-white/5"
                    data-testid="input-coin-search"
                  />
                </div>
                <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2">
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>

              {pricesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-y-auto max-h-[480px]">
                  {filtered.map(p => (
                    <button key={p.coin_symbol}
                      onClick={() => setSelectedSymbol(p.coin_symbol)}
                      className={`w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors border-b border-white/3 ${selectedSymbol === p.coin_symbol ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                      data-testid={`btn-coin-${p.coin_symbol}`}
                    >
                      <div className="text-left">
                        <div className="text-sm font-semibold text-foreground">{p.coin_symbol}</div>
                        <div className="text-xs text-muted-foreground">{fmt(p.price_usd)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-semibold ${p.price_change_24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {p.price_change_24h >= 0 ? "+" : ""}{p.price_change_24h.toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground">Vol: {fmt(p.volume_24h)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chart Panel */}
          <div className="lg:col-span-3">
            <div className="glass-panel rounded-xl p-4 h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-xl text-foreground">{selectedSymbol}</h2>
                  {selectedPrice && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-2xl font-mono font-bold">{fmt(selectedPrice.price_usd)}</span>
                      <span className={`text-sm font-semibold ${selectedPrice.price_change_24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {selectedPrice.price_change_24h >= 0 ? "+" : ""}{selectedPrice.price_change_24h.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {INTERVALS.map(iv => (
                    <button key={iv}
                      onClick={() => setInterval(iv)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${interval === iv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                      data-testid={`btn-interval-${iv}`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
              </div>

              {candlesLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      domain={["auto", "auto"]} width={60} />
                    <RTooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      formatter={(val: number) => [fmt(val), "Price"]}
                    />
                    <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={2}
                      fill="url(#chartGrad)" dot={false} activeDot={{ r: 4, fill: chartColor }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {/* Stats row */}
              {selectedPrice && (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/5">
                  <div>
                    <div className="text-xs text-muted-foreground">Market Cap</div>
                    <div className="text-sm font-semibold">{selectedPrice.market_cap ? fmt(selectedPrice.market_cap) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Volume 24h</div>
                    <div className="text-sm font-semibold">{fmt(selectedPrice.volume_24h)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Spread</div>
                    <div className="text-sm font-semibold">
                      {selectedPrice.bid && selectedPrice.ask
                        ? `${((selectedPrice.ask - selectedPrice.bid) / selectedPrice.price_usd * 100).toFixed(3)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
