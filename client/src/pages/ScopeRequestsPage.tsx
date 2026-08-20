import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  ChevronRight,
  Clock,
  FileKey,
  Info,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface ScopeRequest {
  id: string;
  scopeName: string;
  reason: string;
  status: "pending" | "approved" | "denied" | string;
  adminNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

const SCOPE_OPTIONS = [
  {
    value: "uncensored",
    label: "Uncensored AI mode",
    description: "Access advanced AI responses without content-filter post-processing.",
  },
] as const;

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
    case "approved":
      return (
        <Badge className="gap-1 border-green-500/20 bg-green-500/10 text-green-400" data-testid="badge-status-approved">
          <CheckCircle className="h-3 w-3" /> Approved
        </Badge>
      );
    case "denied":
      return (
        <Badge className="gap-1 border-red-500/20 bg-red-500/10 text-red-400" data-testid="badge-status-denied">
          <XCircle className="h-3 w-3" /> Denied
        </Badge>
      );
    default:
      return (
        <Badge className="gap-1 border-yellow-500/20 bg-yellow-500/10 text-yellow-400" data-testid="badge-status-pending">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
  }
}

function activationPath(scopeName: string) {
  return scopeName === "uncensored" || scopeName === "uncensored_ai" ? "/ai" : "/settings";
}

function RequestCard({ request }: { request: ScopeRequest }) {
  return (
    <article
      className="glass-panel rounded-xl border border-white/5 p-5"
      data-testid={`scope-request-${request.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-primary/10 px-2 py-0.5 font-mono text-sm font-semibold text-primary">
              {request.scopeName}
            </code>
            {statusBadge(request.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
          </p>
        </div>

        {request.status === "approved" && (
          <Link href={activationPath(request.scopeName)}>
            <Button size="sm" className="gap-1.5" data-testid={`link-activate-${request.id}`}>
              Activate feature <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>

      <div className="mt-4 border-t border-white/5 pt-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</p>
        <p className="whitespace-pre-wrap text-sm text-foreground/80">{request.reason}</p>
      </div>

      {request.adminNote && (
        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Admin note</p>
          <p className="text-sm text-foreground/80">{request.adminNote}</p>
        </div>
      )}

      {request.reviewedAt && (
        <p className="mt-3 text-xs text-muted-foreground/60">
          Reviewed {formatDistanceToNow(new Date(request.reviewedAt), { addSuffix: true })}
        </p>
      )}
    </article>
  );
}

export default function ScopeRequestsPage() {
  const token = getToken();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scopeName, setScopeName] = useState<string>(SCOPE_OPTIONS[0].value);
  const [reason, setReason] = useState("");

  const { data: requests = [], isLoading, isError } = useQuery<ScopeRequest[]>({
    queryKey: ["/api/scope-requests"],
    queryFn: () => apiFetch("/api/scope-requests"),
    enabled: !!token,
    refetchInterval: 15_000,
    retry: false,
  });

  const requestMutation = useMutation({
    mutationFn: () => apiFetch("/api/scope-requests", {
      method: "POST",
      body: JSON.stringify({ scopeName, reason: reason.trim() }),
    }),
    onSuccess: () => {
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/scope-requests"] });
      toast({
        title: "Request submitted",
        description: "An administrator will review your request.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
    },
  });

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="space-y-4 text-center">
            <FileKey className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Sign in to request access</h2>
            <p className="text-muted-foreground">Scope access requests are available to authenticated users.</p>
            <Link href="/login"><Button>Sign In</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container mx-auto flex-1 px-4 py-24 md:px-6">
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <FileKey className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold" data-testid="scope-requests-title">Scope Access</h1>
            <p className="text-sm text-muted-foreground">
              Request access to protected features and track administrator decisions.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
          <section className="glass-panel h-fit rounded-xl border border-white/5 p-5" data-testid="scope-request-form">
            <div className="mb-5">
              <h2 className="font-semibold">Request new access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us which feature you need and why.
              </p>
            </div>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reason.trim()) return;
                requestMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="scope-name">Feature access</Label>
                <Select value={scopeName} onValueChange={setScopeName}>
                  <SelectTrigger id="scope-name" data-testid="select-scope-name">
                    <SelectValue placeholder="Select a feature" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {SCOPE_OPTIONS.find((option) => option.value === scopeName)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scope-reason">Reason for request</Label>
                <Textarea
                  id="scope-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain how you plan to use this feature…"
                  className="min-h-32 resize-y bg-background/50"
                  maxLength={1000}
                  required
                  data-testid="textarea-scope-reason"
                />
                <p className="text-right text-xs text-muted-foreground">{reason.length}/1000</p>
              </div>

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={!reason.trim() || requestMutation.isPending}
                data-testid="button-submit-scope-request"
              >
                {requestMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
                Submit request
              </Button>
            </form>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Your requests</h2>
                <p className="text-sm text-muted-foreground">Status updates appear here after review.</p>
              </div>
              {requests.length > 0 && (
                <Badge variant="secondary" data-testid="scope-request-count">{requests.length}</Badge>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading requests…
              </div>
            ) : isError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center text-sm text-red-300" data-testid="scope-requests-error">
                <Info className="mx-auto mb-3 h-8 w-8" />
                Unable to load your requests. Please try again.
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-muted-foreground" data-testid="scope-requests-empty">
                <FileKey className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium">No requests yet</p>
                <p className="mt-1 text-sm">Submit a request to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => <RequestCard key={request.id} request={request} />)}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
