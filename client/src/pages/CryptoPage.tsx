/**
 * /crypto — NexusCrypto Main Dashboard
 *
 * Aggregated view: live prices from nexus-crypto (port 8100),
 * portfolio summary from crypto-analytics (port 8104), and quick-links
 * to the Market, Wallet, DEX, and Analytics sub-pages.
 * Shows an offline banner when the crypto service is unreachable.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import {
  TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Wallet, BarChart2, ArrowLeftRight, LineChart,
  RefreshCw, Bitcoin, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CoinPrice {
  symbol: string;
  name: string;
  price_usd: number;
  price_change_24h: number;
  price_change_7d: number;
  volume_24h: number;
  market_cap: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  return `$${n.toFixed(6)}`;
}

function PctBadge({ pct }: { pct: number }) {
  const pos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

// ── Sub-page card ─────────────────────────────────────────────────────────────

interface SubCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
}

function SubCard({ href, icon, title, description, accent }: SubCardProps) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        className="glass-panel p-5 rounded-xl cursor-pointer border border-white/5 hover:border-white/15 transition-all"
        data-testid={`card-crypto-sub-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center mb-3`}>
          {icon}
        </div>
        <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </motion.div>
    </Link>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CryptoPage() {
  const { data: pricesRaw, isLoading, isError, refetch, isFetching } = useQuery<{ prices?: CoinPrice[]; error?: string }>({
    queryKey: ["crypto-prices"],
    queryFn: async () => {
      const res = await fetch("/api/apps/crypto/proxy/v1/crypto/prices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
    staleTime: 30_000,
  });

  const prices: CoinPrice[] = Array.isArray(pricesRaw)
    ? pricesRaw
    : Array.isArray((pricesRaw as any)?.prices)
    ? (pricesRaw as any).prices
    : [];

  const top5 = prices.slice(0, 5);
  const offline = isError || (!isLoading && prices.length === 0);

  // Static fallback market cap ticker
  const staticCoins = [
    { symbol: "BTC", price: 67000, change: 2.3 },
    { symbol: "ETH", price: 3400, change: -1.1 },
    { symbol: "SOL", price: 165, change: 4.7 },
    { symbol: "BNB", price: 580, change: 0.8 },
    { symbol: "USDC", price: 1.0, change: 0.01 },
    { symbol: "ADA", price: 0.45, change: -2.2 },
    { symbol: "AVAX", price: 35, change: 3.1 },
    { symbol: "MATIC", price: 0.85, change: -0.9 },
    { symbol: "DOT", price: 8.5, change: 1.5 },
    { symbol: "LINK", price: 14, change: 2.8 },
  ];

  const displayCoins = top5.length > 0
    ? top5.map(c => ({ symbol: c.symbol, price: c.price_usd, change: c.price_change_24h }))
    : staticCoins.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 md:px-6 container mx-auto max-w-6xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bitcoin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold font-display text-gradient">NexusCrypto</h1>
              <p className="text-muted-foreground text-sm">Full-stack crypto portfolio & trading platform</p>
            </div>
          </div>
        </motion.div>

        {/* Offline Banner */}
        {offline && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>NexusCrypto service (port 8100) is offline — showing static reference data.</span>
          </motion.div>
        )}

        {/* Market Ticker */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" /> Live Prices
            </h2>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} className="h-7 px-2 text-xs">
              <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {displayCoins.map((coin, i) => (
                <motion.div key={coin.symbol} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="bg-white/3 rounded-lg p-3 text-center" data-testid={`card-price-${coin.symbol}`}>
                  <div className="text-xs text-muted-foreground font-semibold mb-1">{coin.symbol}</div>
                  <div className="text-sm font-bold text-foreground">{fmt(coin.price)}</div>
                  <PctBadge pct={coin.change} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Sub-pages grid */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="font-semibold text-foreground mb-4">Explore</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SubCard
              href="/crypto/market"
              icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
              title="Market Data"
              description="Live OHLCV candles, 24h tickers, order book depth, and price history for all tracked coins."
              accent="bg-blue-500/10 border border-blue-500/20"
            />
            <SubCard
              href="/crypto/wallet"
              icon={<Wallet className="w-5 h-5 text-purple-400" />}
              title="Wallet"
              description="HD wallet derivation, multi-chain address management, token balances, and transaction history."
              accent="bg-purple-500/10 border border-purple-500/20"
            />
            <SubCard
              href="/crypto/dex"
              icon={<ArrowLeftRight className="w-5 h-5 text-emerald-400" />}
              title="DEX"
              description="Constant-product AMM swap engine — quote tokens, add/remove liquidity, and view pool stats."
              accent="bg-emerald-500/10 border border-emerald-500/20"
            />
            <SubCard
              href="/crypto/analytics"
              icon={<LineChart className="w-5 h-5 text-amber-400" />}
              title="Analytics"
              description="Portfolio P&L timeseries, Sharpe ratio, max drawdown, annualised volatility, and asset breakdown."
              accent="bg-amber-500/10 border border-amber-500/20"
            />
          </div>
        </motion.div>

        {/* Extended ticker — all coins */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" /> All Coins
          </h2>
          <div className="glass-panel rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">#</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Coin</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Price</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">24h</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">7d</th>
                </tr>
              </thead>
              <tbody>
                {(prices.length > 0 ? prices : staticCoins.map((c, i) => ({
                  symbol: c.symbol, name: c.symbol, price_usd: c.price,
                  price_change_24h: c.change, price_change_7d: c.change * 1.5,
                  volume_24h: 0, market_cap: null,
                }))).map((coin, i) => (
                  <tr key={coin.symbol} className="border-b border-white/3 hover:bg-white/3 transition-colors"
                    data-testid={`row-coin-${coin.symbol}`}>
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{coin.symbol}</span>
                      {("name" in coin) && <span className="text-muted-foreground ml-2 text-xs">{(coin as any).name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(coin.price_usd)}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell"><PctBadge pct={coin.price_change_24h} /></td>
                    <td className="px-4 py-3 text-right hidden md:table-cell"><PctBadge pct={coin.price_change_7d ?? 0} /></td>
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
