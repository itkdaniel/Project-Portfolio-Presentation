import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Shield, ShieldOff, Search, RefreshCw, ChevronLeft,
  AlertTriangle, User, Lock, CheckCircle2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminGrantedScope {
  id: string;
  userId: string;
  scope: string;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  username: string | null;
  email: string | null;
  fullName: string | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── RevokeButton ──────────────────────────────────────────────────────────────

function RevokeButton({ grant }: { grant: AdminGrantedScope }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const revoke = useMutation({
    mutationFn: () => apiFetch(`/api/admin/granted-scopes/${grant.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/granted-scopes"] });
      toast({
        title: "Scope revoked",
        description: `Revoked '${grant.scope}' for ${grant.email ?? grant.username ?? grant.userId}`,
      });
    },
    onError: (e: Error) => toast({ title: "Revoke failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2 text-xs"
      onClick={() => revoke.mutate()}
      disabled={revoke.isPending}
      data-testid={`btn-revoke-${grant.id}`}
    >
      {revoke.isPending
        ? <RefreshCw className="w-3 h-3 animate-spin" />
        : <ShieldOff className="w-3 h-3" />}
      Revoke
    </Button>
  );
}

// ── ScopeRow ──────────────────────────────────────────────────────────────────

function ScopeRow({ grant }: { grant: AdminGrantedScope }) {
  const displayName = grant.fullName || grant.username || grant.userId.slice(0, 8) + "…";
  const email = grant.email ?? "—";

  return (
    <tr
      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
      data-testid={`row-grant-${grant.id}`}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight" data-testid={`text-grant-name-${grant.id}`}>
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">{email}</p>
          </div>
        </div>
      </td>

      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-amber-400" />
          <code
            className="text-xs font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded"
            data-testid={`text-grant-scope-${grant.id}`}
          >
            {grant.scope}
          </code>
        </div>
      </td>

      <td className="py-3 px-4">
        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1" data-testid={`badge-scope-active-${grant.id}`}>
          <CheckCircle2 className="w-3 h-3" /> Active
        </Badge>
      </td>

      <td className="py-3 px-4 text-xs text-muted-foreground">
        <span title={new Date(grant.grantedAt).toLocaleString()}>
          {formatDistanceToNow(new Date(grant.grantedAt), { addSuffix: true })}
        </span>
      </td>

      <td className="py-3 px-4 text-xs text-muted-foreground">
        {grant.expiresAt ? (
          <span title={new Date(grant.expiresAt).toLocaleString()}>
            {formatDistanceToNow(new Date(grant.expiresAt), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-muted-foreground/50">Never</span>
        )}
      </td>

      <td className="py-3 px-4 text-right">
        <RevokeButton grant={grant} />
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminScopesPage() {
  const [search, setSearch] = useState("");

  const { data: grants = [], isLoading, error, refetch, isFetching } = useQuery<AdminGrantedScope[]>({
    queryKey: ["/api/admin/granted-scopes"],
    queryFn: () => apiFetch("/api/admin/granted-scopes"),
    staleTime: 30_000,
    retry: false,
  });

  const filtered = search.trim()
    ? grants.filter(g => {
        const q = search.toLowerCase();
        return (
          g.email?.toLowerCase().includes(q) ||
          g.username?.toLowerCase().includes(q) ||
          g.fullName?.toLowerCase().includes(q) ||
          g.scope.toLowerCase().includes(q)
        );
      })
    : grants;

  const withExpiry    = grants.filter(g => g.expiresAt !== null).length;
  const noExpiry      = grants.filter(g => g.expiresAt === null).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 md:px-6 py-24">

        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/approvals" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Approvals
          </Link>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold" data-testid="page-title-admin-scopes">
                  Active AI Access Grants
                </h1>
                <p className="text-sm text-muted-foreground">
                  Users currently holding AI scope access — revoke individual grants as needed
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-white/10 hover:bg-white/5"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="btn-refresh-grants"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <p className="text-2xl font-bold font-mono text-green-400" data-testid="stat-active-total">{grants.length}</p>
            <p className="text-xs font-medium text-muted-foreground">Active grants</p>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <p className="text-2xl font-bold font-mono text-amber-400">{withExpiry}</p>
            <p className="text-xs font-medium text-muted-foreground">Time-limited</p>
          </div>
          <div className="glass-panel rounded-xl p-4 border border-white/5">
            <p className="text-2xl font-bold font-mono text-blue-400">{noExpiry}</p>
            <p className="text-xs font-medium text-muted-foreground">Permanent</p>
          </div>
        </div>

        {/* Search + table */}
        <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by user, email, or scope…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-white/10 h-8 text-sm"
                data-testid="input-search-grants"
              />
            </div>
            <p className="text-xs text-muted-foreground shrink-0" data-testid="text-grant-count">
              {filtered.length} {filtered.length === 1 ? "grant" : "grants"}
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading grants…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-sm">Failed to load grants. Admin access required.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground" data-testid="empty-grants">
              <Shield className="w-8 h-8 opacity-30" />
              <p className="text-sm">
                {search.trim() ? "No grants match that search." : "No active AI access grants."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-grants">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Scope</th>
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Granted</th>
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires</th>
                    <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(g => <ScopeRow key={g.id} grant={g} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
      <Footer />
    </div>
  );
}
