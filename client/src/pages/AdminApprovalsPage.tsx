import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface ScopeRequestWithUser {
  id: string;
  userId: string;
  scopeName: string;
  reason: string;
  status: string;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  username?: string;
  email?: string;
  fullName?: string;
}

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
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function statusBadge(status: string) {
  switch (status) {
    case "approved": return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
    case "denied":   return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1"><XCircle className="w-3 h-3" />Denied</Badge>;
    default:         return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
  }
}

type FilterTab = "pending" | "approved" | "denied" | "all";

function ReviewPanel({ req, onClose }: { req: ScopeRequestWithUser; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState(req.adminNote ?? "");

  const decide = useMutation({
    mutationFn: ({ status }: { status: "approved" | "denied" }) =>
      apiFetch(`/api/scope-requests/${req.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote: note || undefined }),
      }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ["/api/scope-requests"] });
      toast({ title: `Request ${status}`, description: `Scope "${req.scopeName}" has been ${status}.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/3 p-4 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Admin Note (optional)</Label>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note explaining your decision..."
          className="resize-none text-sm h-20 bg-background/50"
          maxLength={500}
          data-testid="input-admin-note"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => decide.mutate({ status: "approved" })}
          disabled={decide.isPending}
          className="gap-1.5 bg-green-600 hover:bg-green-700"
          data-testid="btn-approve"
        >
          <CheckCircle className="w-4 h-4" /> Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => decide.mutate({ status: "denied" })}
          disabled={decide.isPending}
          className="gap-1.5"
          data-testid="btn-deny"
        >
          <XCircle className="w-4 h-4" /> Deny
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
      </div>
    </div>
  );
}

function RequestCard({ req }: { req: ScopeRequestWithUser }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  return (
    <div className="glass-panel rounded-xl border border-white/5 p-5" data-testid={`scope-request-${req.id}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-primary">{req.scopeName}</span>
            {statusBadge(req.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            From{" "}
            <span className="text-foreground font-medium">{req.fullName || req.username || req.userId}</span>
            {req.email && <span className="text-muted-foreground/60 ml-1">({req.email})</span>}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {req.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReviewing(r => !r)}
              className="gap-1.5"
              data-testid={`btn-review-${req.id}`}
            >
              <ClipboardCheck className="w-4 h-4" />
              {reviewing ? "Cancel" : "Review"}
            </Button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`btn-expand-${req.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Reason</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{req.reason}</p>
          </div>
          {req.adminNote && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Admin Note</p>
              <p className="text-sm text-foreground/80">{req.adminNote}</p>
            </div>
          )}
          {req.reviewedAt && (
            <p className="text-xs text-muted-foreground/60">
              Reviewed {formatDistanceToNow(new Date(req.reviewedAt), { addSuffix: true })}
            </p>
          )}
        </div>
      )}

      {reviewing && req.status === "pending" && (
        <ReviewPanel req={req} onClose={() => setReviewing(false)} />
      )}
    </div>
  );
}

export default function AdminApprovalsPage() {
  const token = getToken();
  const [filter, setFilter] = useState<FilterTab>("pending");

  const { data: me } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/me"],
    queryFn:  () => apiFetch("/api/auth/me"),
    enabled:  !!token,
  });

  const { data: requests = [], isLoading } = useQuery<ScopeRequestWithUser[]>({
    queryKey: ["/api/scope-requests"],
    queryFn:  () => apiFetch("/api/scope-requests"),
    enabled:  !!token && me?.role === "admin",
    refetchInterval: 30_000,
  });

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  if (!token || me?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">Admin Access Required</h2>
            <p className="text-muted-foreground">This page is only accessible to administrators.</p>
            <Link href="/"><Button variant="outline">Go Home</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 md:px-6 py-24">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="approvals-title">Scope Approvals</h1>
              <p className="text-sm text-muted-foreground">
                Review and manage user scope access requests
                {pendingCount > 0 && <span className="ml-2 bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit" data-testid="approvals-filter">
          {(["pending", "approved", "denied", "all"] as FilterTab[]).map(t => (
            <button
              key={t}
              data-testid={`filter-${t}`}
              onClick={() => setFilter(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                filter === t ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {t === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-500/80 text-black text-xs rounded-full px-1.5 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground justify-center py-16">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="approvals-empty">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No {filter !== "all" ? filter : ""} requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(req => <RequestCard key={req.id} req={req} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
