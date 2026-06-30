/**
 * /crypto/wallet — HD Wallet Page
 *
 * Connects to crypto-wallet (port 8102) via gateway proxy.
 * Shows wallet list, address balances, and transaction history.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import {
  Wallet, AlertTriangle, Loader2, ArrowDownLeft, ArrowUpRight,
  ChevronRight, CreditCard, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TokenBalance {
  token_symbol: string;
  amount: number;
  contract_address: string | null;
}

interface AddressRow {
  id: number;
  address: string;
  chain: string;
  path_index: number;
  label: string | null;
  balances: TokenBalance[];
}

interface WalletRow {
  id: number;
  name: string;
  chain: string;
  hd_path: string;
  master_pubkey: string;
  is_watch_only: boolean;
  created_at: string;
}

interface TxRow {
  id: number;
  tx_hash: string;
  from_address: string;
  to_address: string;
  direction: string;
  amount: number;
  fee: number;
  token_symbol: string;
  status: string;
  chain: string;
  created_at: string;
}

// ── Static fallback ────────────────────────────────────────────────────────────

const STATIC_WALLETS: WalletRow[] = [
  { id: 1, name: "Main EVM Wallet", chain: "EVM", hd_path: "m/44'/60'/0'", master_pubkey: "02a1b2c3d4e5f6...", is_watch_only: false, created_at: new Date().toISOString() },
  { id: 2, name: "Solana Wallet", chain: "SOL", hd_path: "m/44'/501'/0'", master_pubkey: "03f1e2d3c4b5a6...", is_watch_only: false, created_at: new Date().toISOString() },
];

const STATIC_ADDRESSES: AddressRow[] = [
  { id: 1, address: "0x742d35Cc6634C0532925a3b8D4C9B5d5...", chain: "EVM", path_index: 0, label: "Primary", balances: [{ token_symbol: "ETH", amount: 2.5, contract_address: null }, { token_symbol: "USDC", amount: 5000, contract_address: "0xa0b8..." }] },
  { id: 2, address: "0x8F3Cf7ad23Cd3CaDbD9735AFf958023...", chain: "EVM", path_index: 1, label: null, balances: [{ token_symbol: "MATIC", amount: 500, contract_address: "0x7d1a..." }, { token_symbol: "USDC", amount: 1000, contract_address: "0xa0b8..." }] },
  { id: 3, address: "9xDLTJ7jJoLxNEcpQ7F4UTPHRp...", chain: "SOL", path_index: 0, label: "Main SOL", balances: [{ token_symbol: "SOL", amount: 25, contract_address: null }, { token_symbol: "USDC", amount: 2000, contract_address: "EPjFW..." }] },
];

const STATIC_TXS: TxRow[] = [
  { id: 1, tx_hash: "0xabc123...", from_address: "0x742d...", to_address: "0x8F3C...", direction: "out", amount: 0.5, fee: 0.001, token_symbol: "ETH", status: "confirmed", chain: "EVM", created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, tx_hash: "0xdef456...", from_address: "0x1234...", to_address: "0x742d...", direction: "in", amount: 1000, fee: 0, token_symbol: "USDC", status: "confirmed", chain: "EVM", created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 3, tx_hash: "0xghi789...", from_address: "0x742d...", to_address: "0xdead...", direction: "out", amount: 200, fee: 0.0005, token_symbol: "USDC", status: "confirmed", chain: "EVM", created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, tx_hash: "0xjkl012...", from_address: "0xbeef...", to_address: "0x742d...", direction: "in", amount: 0.3, fee: 0, token_symbol: "ETH", status: "pending", chain: "EVM", created_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 5, tx_hash: "FrwJ1...", from_address: "9xDL...", to_address: "Epjk...", direction: "out", amount: 5, fee: 0.000005, token_symbol: "SOL", status: "confirmed", chain: "SOL", created_at: new Date(Date.now() - 259200000).toISOString() },
];

function shortAddr(a: string) { return `${a.slice(0, 8)}…${a.slice(-6)}`; }

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { confirmed: "text-emerald-400 bg-emerald-400/10", pending: "text-amber-400 bg-amber-400/10", failed: "text-red-400 bg-red-400/10" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "text-muted-foreground bg-white/5"}`}>{status}</span>;
}

export default function CryptoWalletPage() {
  const [selectedWalletId, setSelectedWalletId] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"addresses" | "transactions">("addresses");

  const { data: wallets, isLoading: walletsLoading, isError: walletsError } = useQuery<WalletRow[]>({
    queryKey: ["wallet-wallets"],
    queryFn: async () => {
      const res = await fetch("/api/apps/crypto-wallet/proxy/v1/wallet/wallets?user_id=demo-user");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.wallets ?? []);
    },
    retry: 1,
    staleTime: 60_000,
  });

  const { data: addresses, isLoading: addrsLoading } = useQuery<AddressRow[]>({
    queryKey: ["wallet-addresses", selectedWalletId],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-wallet/proxy/v1/wallet/addresses/${selectedWalletId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.addresses ?? []);
    },
    retry: 1,
    enabled: !walletsError,
  });

  const { data: txs, isLoading: txsLoading } = useQuery<TxRow[]>({
    queryKey: ["wallet-txs", selectedWalletId],
    queryFn: async () => {
      const res = await fetch(`/api/apps/crypto-wallet/proxy/v1/wallet/transactions?wallet_id=${selectedWalletId}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.transactions ?? []);
    },
    retry: 1,
    enabled: !walletsError,
  });

  const offline = walletsError;
  const displayWallets = wallets ?? (offline ? STATIC_WALLETS : []);
  const displayAddresses = addresses ?? (offline ? STATIC_ADDRESSES.filter(a => a.id <= 2) : []);
  const displayTxs = txs ?? (offline ? STATIC_TXS : []);

  // Aggregate balance across addresses
  const balanceMap: Record<string, number> = {};
  displayAddresses.forEach(addr => addr.balances?.forEach(b => { balanceMap[b.token_symbol] = (balanceMap[b.token_symbol] ?? 0) + b.amount; }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 md:px-6 container mx-auto max-w-6xl">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Wallet className="w-7 h-7 text-purple-400" />
            <h1 className="text-2xl font-bold font-display text-gradient">Crypto Wallet</h1>
          </div>
          <p className="text-sm text-muted-foreground">HD wallet derivation, multi-chain balances, transaction history</p>
        </motion.div>

        {offline && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Crypto Wallet service (port 8102) is offline — displaying demo data.</span>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Wallet list */}
          <div className="lg:col-span-1">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Wallets</h2>
            {walletsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-2">
                {displayWallets.map(w => (
                  <button key={w.id} onClick={() => setSelectedWalletId(w.id)}
                    className={`w-full glass-panel rounded-xl p-3 text-left hover:border-white/20 transition-all ${selectedWalletId === w.id ? "border border-purple-500/40 bg-purple-500/5" : ""}`}
                    data-testid={`btn-wallet-${w.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2">
                        <Wallet className="w-4 h-4 text-purple-400" />
                      </div>
                      {selectedWalletId === w.id && <ChevronRight className="w-4 h-4 text-purple-400" />}
                    </div>
                    <div className="text-sm font-semibold text-foreground">{w.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{w.chain}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{w.hd_path}</div>
                    {w.is_watch_only && <Badge variant="outline" className="mt-1 text-xs">Watch Only</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main content */}
          <div className="lg:col-span-3 space-y-4">
            {/* Balance summary */}
            <div className="glass-panel rounded-xl p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Aggregate Balance
              </h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(balanceMap).map(([sym, amt]) => (
                  <div key={sym} className="bg-white/3 rounded-lg px-4 py-2.5 text-center" data-testid={`balance-${sym}`}>
                    <div className="text-xs text-muted-foreground">{sym}</div>
                    <div className="text-lg font-bold text-foreground">{amt.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  </div>
                ))}
                {Object.keys(balanceMap).length === 0 && (
                  <span className="text-sm text-muted-foreground">No balances found</span>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/5 pb-0">
              {(["addresses", "transactions"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
                  data-testid={`tab-${tab}`}
                >
                  {tab === "addresses" ? "Addresses" : "Transactions"}
                </button>
              ))}
            </div>

            {activeTab === "addresses" ? (
              addrsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-3">
                  {displayAddresses.map(addr => (
                    <div key={addr.id} className="glass-panel rounded-xl p-4" data-testid={`card-address-${addr.id}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-mono text-sm text-foreground">{shortAddr(addr.address)}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Index {addr.path_index} · {addr.chain}{addr.label ? ` · ${addr.label}` : ""}</div>
                        </div>
                        <Badge variant="outline" className="text-xs">{addr.chain}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(addr.balances ?? []).map(b => (
                          <span key={b.token_symbol} className="text-xs bg-white/5 rounded px-2 py-1">
                            <span className="font-semibold text-foreground">{b.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                            <span className="text-muted-foreground ml-1">{b.token_symbol}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              txsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="glass-panel rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-4 py-3 text-muted-foreground font-medium">Type</th>
                        <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Tx Hash</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium">Amount</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Status</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayTxs.map(tx => (
                        <tr key={tx.tx_hash} className="border-b border-white/3 hover:bg-white/3" data-testid={`row-tx-${tx.id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {tx.direction === "in"
                                ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                                : <ArrowUpRight className="w-4 h-4 text-red-400" />}
                              <span className={`text-xs font-semibold ${tx.direction === "in" ? "text-emerald-400" : "text-red-400"}`}>
                                {tx.direction === "in" ? "Received" : "Sent"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="font-mono text-xs text-muted-foreground">{shortAddr(tx.tx_hash)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold">{tx.amount.toLocaleString("en-US", { maximumFractionDigits: 5 })}</span>
                            <span className="text-muted-foreground ml-1 text-xs">{tx.token_symbol}</span>
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell"><StatusBadge status={tx.status} /></td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
