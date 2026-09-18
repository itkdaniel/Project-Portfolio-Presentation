import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Globe2, Loader2, RefreshCw, Shield, XCircle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type JobStatus = "pending" | "running" | "completed" | "failed";

interface ScrapeJob {
  id: string;
  targetUrl: string;
  status: JobStatus;
  entityCount: number;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

interface ExtractedEntity {
  id: string;
  title?: string | null;
  type?: string | null;
  confidence?: number | null;
}

interface JobsResponse {
  total: number;
  items: Array<Record<string, unknown>>;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("nexus_token") : null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = getToken();
  const response = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? body?.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function normalizeJob(job: Record<string, unknown>): ScrapeJob {
  return {
    id: String(job.id),
    targetUrl: String(job.targetUrl ?? job.target_url ?? ""),
    status: String(job.status) as JobStatus,
    entityCount: Number(job.entityCount ?? job.entity_count ?? 0),
    errorMessage: (job.errorMessage ?? job.error_message) as string | null | undefined,
    startedAt: String(job.startedAt ?? job.started_at ?? ""),
    completedAt: (job.completedAt ?? job.completed_at) as string | null | undefined,
  };
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    pending: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    running: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    completed: "border-green-500/30 bg-green-500/10 text-green-400",
    failed: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : status === "running" ? Loader2 : Clock;
  return (
    <Badge variant="outline" className={`gap-1.5 capitalize ${styles[status] ?? styles.pending}`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}

function CompletedEntities({ jobId }: { jobId: string }) {
  const { data, isLoading, isError } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/scrape/jobs", jobId],
    queryFn: () => apiFetch(`/api/scrape/jobs/${jobId}`),
  });
  const entities = (Array.isArray(data?.entities) ? data.entities : []) as ExtractedEntity[];

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading extracted entity…</p>;
  if (isError) return <p className="text-xs text-red-400">Could not load the extracted entity.</p>;
  if (!entities.length) return <p className="text-xs text-muted-foreground">No entity was extracted.</p>;

  return (
    <div className="space-y-2">
      {entities.map((entity) => (
        <div key={entity.id} className="rounded-lg border border-white/10 bg-background/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entity.title || "Untitled entity"}</span>
            {entity.type && <Badge variant="secondary">{entity.type}</Badge>}
            {typeof entity.confidence === "number" && (
              <span className="text-xs text-muted-foreground">{Math.round(entity.confidence * 100)}% confidence</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{entity.id}</p>
        </div>
      ))}
    </div>
  );
}

export default function ScrapeAdmin() {
  const token = getToken();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");

  const { data: me, isLoading: isCheckingAccess } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => apiFetch("/api/auth/me"),
    enabled: !!token,
  });

  const jobsQuery = useQuery<JobsResponse>({
    queryKey: ["/api/scrape/jobs"],
    queryFn: () => apiFetch("/api/scrape/jobs?limit=50&offset=0"),
    enabled: !!token && me?.role === "admin",
    refetchInterval: (query) => {
      const jobs = query.state.data?.items?.map(normalizeJob) ?? [];
      return jobs.some((job) => job.status === "pending" || job.status === "running") ? 2_000 : 10_000;
    },
  });

  const queueJob = useMutation({
    mutationFn: () => apiFetch("/api/scrape/url", {
      method: "POST",
      body: JSON.stringify({ url: url.trim(), source_label: sourceLabel.trim() || undefined }),
    }),
    onSuccess: () => {
      setUrl("");
      setSourceLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/jobs"] });
      toast({ title: "Scrape job queued", description: "Its status will update automatically." });
    },
    onError: (error: Error) => toast({ title: "Could not queue scrape", description: error.message, variant: "destructive" }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      queueJob.mutate();
    } catch {
      toast({ title: "Enter a valid URL", description: "Use a full http:// or https:// address.", variant: "destructive" });
    }
  }

  if (token && isCheckingAccess) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Checking admin access" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!token || me?.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="space-y-4 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Admin Access Required</h1>
            <p className="text-muted-foreground">This page is only accessible to administrators.</p>
            <Link href="/"><Button variant="outline">Go Home</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const jobs = jobsQuery.data?.items.map(normalizeJob) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container mx-auto flex-1 px-4 py-24 md:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <Globe2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold" data-testid="scrape-admin-title">Scrape a URL</h1>
            <p className="text-sm text-muted-foreground">Queue pages for analysis and review extracted entities.</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New scrape job</CardTitle>
            <CardDescription>Enter a public web page and an optional label describing its source.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="scrape-url">URL</Label>
                <Input id="scrape-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article" required data-testid="input-scrape-url" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-label">Source label <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="source-label" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)}
                  placeholder="Industry news" maxLength={100} data-testid="input-source-label" />
              </div>
              <Button type="submit" disabled={queueJob.isPending || !url.trim()} data-testid="button-queue-scrape">
                {queueJob.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />}
                Queue scrape
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent jobs</h2>
            <p className="text-sm text-muted-foreground">{jobsQuery.data?.total ?? 0} total</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        {jobsQuery.isError && (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Could not load scrape jobs.</AlertDescription></Alert>
        )}
        {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No scrape jobs yet.</div>
        )}
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id} data-testid={`scrape-job-${job.id}`}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <a href={job.targetUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 break-all font-medium hover:text-primary">
                      {job.targetUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {job.startedAt ? `Queued ${formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}` : job.id}
                      {" · "}{job.entityCount} {job.entityCount === 1 ? "entity" : "entities"}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                {job.status === "failed" && job.errorMessage && <p className="text-sm text-red-400">{job.errorMessage}</p>}
                {job.status === "completed" && <CompletedEntities jobId={job.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}