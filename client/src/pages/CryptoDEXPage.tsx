/**
 * /crypto/dex — Decentralized Exchange Page
 *
 * Connects to crypto-dex (port 8103) via gateway proxy.
 * Shows AMM liquidity pools, swap quote interface, liquidity positions, recent trades.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import {
  ArrowLeftRight, AlertTriangle, Loader2, Droplets,
  TrendingUp, RefreshCw, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Pool {
  id: number;
  name: string;
  token_a: string;
  token_b: string;
  reserve_a: number;
  reserve_b: number;
  fee_bps: number;
  total_lp_tokens: number;
  price: number;
  volume_24h: number;
  tvl_usd: number;
  apr: number;
}

interface QuoteResult {
  amount_out: number;
  price_impact_pct: number;
  fee: number;
  effective_price: number;
}

interface Trade {
  id: number;
  trader_address: string;
  token_in: string;
  token_out: string;
  amount_in: number;
  amount_out: number;
  fee: number;
  price_impact_pct: number;
  tx_hash: string;
  executed_at: string;
}

interface LiquidityPos {
  id: number;
  pool_id: number;
  user_address: string;
  lp_tokens: number;
  share_pct: number;
  entry_reserve_a: number;
  entry_reserve_b: number;
  created_at: string;
}

// ── Static fallback ────────────────────────────────────────────────────────────

const STATIC_POOLS: Pool[] = [
  { id: 1, name: "ETH/USDC", token_a: "ETH", token_b: "USDC", reserve_a: 100, reserve_b: 340000, fee_bps: 30, total_lp_tokens: 5830, price: 3400, volume_24h: 2100000, tvl_usd: 680000, apr: 12.4 },
  { id: 2, name: "BTC/USDC", token_a: "BTC", token_b: "USDC", reserve_a: 5, reserve_b: 335000, fee_bps: 30, total_lp_tokens: 1295, price: 67000, volume_24h: 3400000, tvl_usd: 670000, apr: 8.7 },
  { id: 3, name: "SOL/USDC", token_a: "SOL", token_b: "USDC", reserve_a: 2000, reserve_b: 330000, fee_bps: 30, total_lp_tokens: 25690, price: 165, volume_24h: 890000, tvl_usd: 660000, apr: 18.2 },
  { id: 4, name: "ETH/BTC", token_a: "ETH", token_b: "BTC", reserve_a: 50, reserve_b: 2.5, fee_bps: 30, total_lp_tokens: 353, price: 0.0507, volume_24h: 450000, tvl_usd: 337500, apr: 5.9 },
  { id: 5, name: "MATIC/USDC", token_a: "MATIC", token_b: "USDC", reserve_a: 10000, reserve_b: 8500, fee_bps: 30, total_lp_tokens: 9220, price: 0.85, volume_24h: 120000, tvl_usd: 17000, apr: 24.1 },
];

function fmt(n: number, prefix = "$"): string {
  if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `${prefix}${n.toFixed(n < 1 ? 5 : 2)}`;
}

// Simple client-side AMM quote (constant product)
function localQuote(pool: Pool, tokenIn: string, amountIn: number): QuoteResult {
  const [reserveIn, reserveOut] = tokenIn === pool.token_a
    ? [pool.reserve_a, pool.reserve_b]
    : [pool.reserve_b, pool.reserve_a];
  const fee = amountIn * pool.fee_bps / 10_000;
  const ainFee = amountIn - fee;
  const amountOut = (ainFee * reserveOut) / (reserveIn + ainFee);
  const priceImpact = (amountIn / (reserveIn + amountIn)) * 100;
  return { amount_out: amountOut, price_impact_pct: priceImpact, fee, effective_price: amountOut / amountIn };
}

export default function CryptoDEXPage() {
  const [selectedPoolId, setSelectedPoolId] = useState<number>(1);
  const [swapToken, setSwapToken] = useState("ETH");
  const [swapAmount, setSwapAmount] = useState("");

  const { data: pools, isLoading, isError, refetch } = useQuery<Pool[]>({
    queryKey: ["dex-pools"],
    queryFn: async () => {
      const res = await fetch("/api/apps/crypto-dex/proxy/v1/dex/pools");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.pools ?? []);
    },
    retry: 1,
    staleTime: 30_000,
  });

  const { data: recentTrades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["dex-trades", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-dex/proxy/v1/dex/trades?pool_id=${selectedPoolId}&limit=10`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.trades ?? []);
    },
    retry: 1,
    enabled: !isError,
  });

  const offline = isError;
  const displayPools = pools ?? (offline ? STATIC_POOLS : []);
  const selectedPool = displayPools.find(p => p.id === selectedPoolId) ?? displayPools[0];

  const amtNum = parseFloat(swapAmount) || 0;
  const quote = selectedPool && amtNum > 0 ? localQuote(selectedPool, swapToken, amtNum) : null;
  const swapOutToken = swapToken === selectedPool?.token_a ? selectedPool?.token_b : selectedPool?.token_a;

  const impactColor = quote
    ? quote.price_impact_pct < 0.5 ? "text-emerald-400"
    : quote.price_impact_pct < 2 ? "text-amber-400"
    : "text-red-400"
    : "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 md:px-6 container mx-auto max-w-6xl">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <ArrowLeftRight className="w-7 h-7 text-emerald-400" />
            <h1 className="text-2xl font-bold font-display text-gradient">Crypto DEX</h1>
          </div>
          <p className="text-sm text-muted-foreground">Constant-product AMM swap engine — pools, quotes, and liquidity</p>
        </motion.div>

        {offline && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Crypto DEX service (port 8103) is offline — showing reference pools with client-side AMM quotes.</span>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Pool list */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Liquidity Pools</h2>
              <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2 text-xs">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="glass-panel rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Pool</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">TVL</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">24h Vol</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">APR</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPools.map(pool => (
                      <tr key={pool.id}
                        onClick={() => { setSelectedPoolId(pool.id); setSwapToken(pool.token_a); }}
                        className={`border-b border-white/3 cursor-pointer hover:bg-white/5 transition-colors ${selectedPoolId === pool.id ? "bg-emerald-500/5 border-l-2 border-l-emerald-500" : ""}`}
                        data-testid={`row-pool-${pool.id}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-semibold text-foreground">{pool.name}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">{fmt(pool.tvl_usd)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">{fmt(pool.volume_24h)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{pool.apr.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(pool.fee_bps / 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pool detail stats */}
            {selectedPool && (
              <div className="glass-panel rounded-xl p-4">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  {selectedPool.name} Pool Details
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><div className="text-xs text-muted-foreground">{selectedPool.token_a} Reserve</div><div className="text-sm font-semibold">{selectedPool.reserve_a.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div></div>
                  <div><div className="text-xs text-muted-foreground">{selectedPool.token_b} Reserve</div><div className="text-sm font-semibold">{selectedPool.reserve_b.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div></div>
                  <div><div className="text-xs text-muted-foreground">LP Tokens</div><div className="text-sm font-semibold">{selectedPool.total_lp_tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div></div>
                  <div><div className="text-xs text-muted-foreground">Price ({selectedPool.token_a})</div><div className="text-sm font-semibold">{selectedPool.price.toFixed(selectedPool.price < 1 ? 5 : 2)} {selectedPool.token_b}</div></div>
                </div>
              </div>
            )}

            {/* Recent trades */}
            <div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" /> Recent Trades
              </h3>
              {tradesLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="glass-panel rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-3 py-2 text-muted-foreground">Swap</th>
                        <th className="text-right px-3 py-2 text-muted-foreground">Amount In</th>
                        <th className="text-right px-3 py-2 text-muted-foreground hidden sm:table-cell">Amount Out</th>
                        <th className="text-right px-3 py-2 text-muted-foreground hidden md:table-cell">Impact</th>
                        <th className="text-right px-3 py-2 text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recentTrades ?? []).map(t => (
                        <tr key={t.id} className="border-b border-white/3 hover:bg-white/3" data-testid={`row-trade-${t.id}`}>
                          <td className="px-3 py-2 font-semibold">{t.token_in}→{t.token_out}</td>
                          <td className="px-3 py-2 text-right">{t.amount_in.toFixed(4)} {t.token_in}</td>
                          <td className="px-3 py-2 text-right hidden sm:table-cell">{t.amount_out.toFixed(4)} {t.token_out}</td>
                          <td className="px-3 py-2 text-right hidden md:table-cell">
                            <span className={t.price_impact_pct < 1 ? "text-emerald-400" : "text-amber-400"}>{t.price_impact_pct.toFixed(3)}%</span>
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{new Date(t.executed_at).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                      {!recentTrades?.length && (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No trades recorded yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Swap panel */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-xl p-5 sticky top-24">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-emerald-400" /> Swap
              </h2>

              {selectedPool && (
                <>
                  {/* Token selector */}
                  <div className="mb-3">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Swap From</label>
                    <div className="flex gap-2">
                      {[selectedPool.token_a, selectedPool.token_b].map(tok => (
                        <button key={tok} onClick={() => setSwapToken(tok)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${swapToken === tok ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-white/5 text-muted-foreground hover:text-foreground"}`}
                          data-testid={`btn-swap-token-${tok}`}
                        >
                          {tok}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Amount</label>
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={swapAmount}
                      onChange={e => setSwapAmount(e.target.value)}
                      className="bg-white/5 text-right font-mono"
                      data-testid="input-swap-amount"
                    />
                  </div>

                  {/* Quote result */}
                  {quote ? (
                    <div className="bg-white/3 rounded-xl p-4 space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-bold text-foreground">{quote.amount_out.toFixed(6)} {swapOutToken}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Effective price</span>
                        <span className="text-foreground">{quote.effective_price.toFixed(6)} {swapOutToken}/{swapToken}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price impact</span>
                        <span className={impactColor}>{quote.price_impact_pct.toFixed(3)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee ({(selectedPool.fee_bps / 100).toFixed(2)}%)</span>
                        <span className="text-muted-foreground">{quote.fee.toFixed(6)} {swapToken}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/3 rounded-xl p-4 text-center text-sm text-muted-foreground mb-4">
                      Enter an amount to see the quote
                    </div>
                  )}

                  <Button className="w-full bg-emerald-600 hover:bg-emerald-500" data-testid="btn-swap-execute" disabled={!quote}>
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Swap {swapToken} → {swapOutToken}
                  </Button>
                </>
              )}

              {/* Liquidity CTA */}
              <div className="mt-5 pt-4 border-t border-white/5">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Droplets className="w-3 h-3" /> Add Liquidity
                </h3>
                <p className="text-xs text-muted-foreground">
                  Earn {selectedPool?.apr.toFixed(1)}% APR by providing liquidity to the {selectedPool?.name} pool.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
