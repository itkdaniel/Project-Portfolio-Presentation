import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Atom, Zap, BarChart3, Cpu, Play, Loader2, XCircle, RefreshCw,
  AlertTriangle, BookOpen, Save, Trash2, Download, ChevronDown, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

interface QuantumJob {
  job_id: string;
  job_type: string;
  backend: string;
  status: JobStatus;
  created_at: string;
  completed_at?: string;
  result?: unknown;
  error?: string;
}

interface SimulateResult {
  statevector?: Array<[number, number]>;
  counts?: Record<string, number>;
  probabilities?: Record<string, number>;
  backend: string;
  shots: number;
  time_ms: number;
}

interface OptimizeResult {
  solution: unknown;
  classical_solution?: unknown;
  quantum_solution?: unknown;
  algorithm: string;
  time_ms: number;
}

interface Circuit {
  circuit_id: string;
  name: string;
  qasm: string;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROXY = "/api/apps/quantum/proxy";

const PRESET_CIRCUITS: Record<string, string> = {
  "Bell State": `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c = measure q;`,
  "GHZ State (3-qubit)": `// GHZ State — 3-qubit maximal entanglement
OPENQASM 3.0;
include "stdgates.inc";
qubit[3] q;
bit[3] c;
h q[0];
cx q[0], q[1];
cx q[0], q[2];
c = measure q;`,
  "Superposition (1-qubit)": `OPENQASM 3.0;
include "stdgates.inc";
qubit[1] q;
bit[1] c;
h q[0];
c = measure q;`,
  "Phase Kickback": `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
x q[1];
h q[0];
h q[1];
cx q[0], q[1];
h q[0];
c = measure q;`,
};

const JOB_TYPES = [
  { value: "simulation",           label: "Circuit Simulation" },
  { value: "portfolio_optimization",label: "Portfolio Optimization" },
  { value: "route_optimization",   label: "Route Optimization" },
  { value: "constraint_solving",   label: "QUBO Constraint Solving" },
];

const BACKENDS = [
  { value: "local_simulator",     label: "Local Simulator" },
  { value: "azure_ionq",          label: "Azure IonQ" },
  { value: "azure_quantinuum",    label: "Azure Quantinuum" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function isValidJson(str: string): boolean {
  if (!str.trim()) return false;
  try { JSON.parse(str); return true; } catch { return false; }
}

function jsonFieldClass(valid: boolean): string {
  return valid
    ? "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/40 transition-colors resize-none"
    : "w-full bg-black/40 border border-red-500/60 rounded-lg px-3 py-2.5 text-xs font-mono outline-none focus:border-red-500/80 transition-colors resize-none";
}

function JsonInvalidHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-xs text-red-400 mt-1 flex items-center gap-1" data-testid="hint-invalid-json">
      <span>⚠</span> Invalid JSON
    </p>
  );
}

function statusColor(s: JobStatus): string {
  return {
    queued:    "text-amber-400 bg-amber-400/10 border-amber-400/20",
    running:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
    succeeded: "text-green-400 bg-green-400/10 border-green-400/20",
    failed:    "text-red-400 bg-red-400/10 border-red-400/20",
    cancelled: "text-muted-foreground bg-white/5 border-white/10",
  }[s] ?? "text-muted-foreground";
}

async function quantumFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${PROXY}${path}`, init);
  if (!res.ok) {
    const err = await res.text().catch(() => "Request failed");
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── ServiceOfflineBanner ───────────────────────────────────────────────────────

function ServiceOfflineBanner() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-400/20 bg-amber-400/5 text-amber-400 text-sm mb-6"
      data-testid="banner-service-offline"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <div>
        <span className="font-semibold">Nexus Quantum service is offline.</span>{" "}
        Submit buttons are disabled. Start the service on port 8200 to enable live features.
      </div>
    </div>
  );
}

// ── JobStatusBadge ────────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono border font-semibold ${statusColor(status)}`}
      data-testid={`badge-status-${status}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── JobsTab ────────────────────────────────────────────────────────────────────

function JobsTab({ offline }: { offline: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [jobType, setJobType]     = useState("simulation");
  const [backend, setBackend]     = useState("local_simulator");
  const [payload, setPayload]     = useState('{\n  "shots": 1024\n}');
  const [selectedJob, setSelectedJob] = useState<QuantumJob | null>(null);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<QuantumJob[]>({
    queryKey: ["/quantum/jobs"],
    queryFn: () => quantumFetch("/v1/quantum/jobs"),
    refetchInterval: 3000,
    enabled: !offline,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload: unknown;
      try { parsedPayload = JSON.parse(payload); } catch { throw new Error("Payload must be valid JSON"); }
      return quantumFetch("/v1/quantum/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: jobType, backend, payload: parsedPayload }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/quantum/jobs"] });
      toast({ title: "Job submitted", description: "Polling for status every 3 s…" });
    },
    onError: (e: Error) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) =>
      quantumFetch(`/v1/quantum/jobs/${jobId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/quantum/jobs"] });
      toast({ title: "Job cancelled" });
    },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6" data-testid="tab-panel-jobs">
      {offline && <ServiceOfflineBanner />}

      {/* Submit Form */}
      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Submit Quantum Job
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Job Type</label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors"
              data-testid="select-job-type"
            >
              {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Backend</label>
            <select
              value={backend}
              onChange={e => setBackend(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors"
              data-testid="select-backend"
            >
              {BACKENDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">JSON Payload</label>
          <textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            rows={6}
            className={jsonFieldClass(isValidJson(payload)).replace("py-2.5", "py-2")}
            data-testid="textarea-job-payload"
            placeholder='{ "shots": 1024 }'
          />
          <JsonInvalidHint show={payload.trim().length > 0 && !isValidJson(payload)} />
        </div>

        <Button
          onClick={() => submitMutation.mutate()}
          disabled={offline || submitMutation.isPending || !isValidJson(payload)}
          className="gap-2"
          data-testid="btn-submit-job"
        >
          {submitMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><Play className="w-4 h-4" /> Submit Job</>
          }
        </Button>
      </div>

      {/* Job List */}
      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-card/40">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" /> Job Queue
            {jobsLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </h3>
          {!offline && (
            <span className="text-xs text-muted-foreground">Auto-refreshing every 3 s</span>
          )}
        </div>

        {jobs.length === 0 && !jobsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm" data-testid="jobs-empty">
            No jobs yet. Submit a job above to get started.
          </div>
        ) : (
          <div className="divide-y divide-white/5" data-testid="jobs-list">
            {jobs.map(job => (
              <div key={job.job_id} className="p-4" data-testid={`job-row-${job.job_id}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="text-xs font-mono text-muted-foreground">{job.job_id.slice(0, 8)}…</code>
                    <JobStatusBadge status={job.status} />
                    <span className="text-xs text-muted-foreground">{job.job_type}</span>
                    <Badge variant="outline" className="text-xs border-white/10">{job.backend}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 gap-1"
                      onClick={() => setSelectedJob(prev => prev?.job_id === job.job_id ? null : job)}
                      data-testid={`btn-job-detail-${job.job_id}`}
                    >
                      {selectedJob?.job_id === job.job_id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Details
                    </Button>
                    {(job.status === "queued" || job.status === "running") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 gap-1 text-red-400 hover:text-red-300"
                        onClick={() => cancelMutation.mutate(job.job_id)}
                        disabled={cancelMutation.isPending}
                        data-testid={`btn-cancel-job-${job.job_id}`}
                      >
                        <XCircle className="w-3 h-3" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {selectedJob?.job_id === job.job_id && (
                  <div className="mt-3 bg-black/30 rounded-lg border border-white/5 p-3" data-testid="job-detail-panel">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Full Result</p>
                    {job.error && (
                      <div className="text-xs text-red-400 font-mono mb-2">{job.error}</div>
                    )}
                    <pre className="text-xs font-mono text-foreground/70 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                      {JSON.stringify(job.result ?? { status: job.status }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ProbabilityChart ──────────────────────────────────────────────────────────

function ProbabilityChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([state, prob]) => ({
    state,
    probability: Math.round(prob * 10000) / 10000,
  }));
  return (
    <div className="mt-4" data-testid="probability-chart">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Probability Amplitudes</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="state" tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "monospace" }} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 1]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [v.toFixed(4), "P"]}
          />
          <Bar dataKey="probability" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── SimulateTab ───────────────────────────────────────────────────────────────

function SimulateTab({ offline }: { offline: boolean }) {
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState("Bell State");
  const [qasm, setQasm]   = useState(PRESET_CIRCUITS["Bell State"]);
  const [shots, setShots] = useState(1024);
  const [result, setResult]   = useState<SimulateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function loadPreset(name: string) {
    setSelectedPreset(name);
    setQasm(PRESET_CIRCUITS[name]);
    setResult(null);
    setError(null);
  }

  async function runSimulation() {
    setLoading(true); setResult(null); setError(null);
    try {
      const r = await quantumFetch("/v1/quantum/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qasm, shots, backend: "local_simulator" }),
      });
      setResult(r);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ title: "Simulation failed", description: msg, variant: "destructive" });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6" data-testid="tab-panel-simulate">
      {offline && <ServiceOfflineBanner />}

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Atom className="w-4 h-4 text-primary" /> Circuit Simulator
        </h2>

        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Preset Circuits</label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(PRESET_CIRCUITS).map(name => (
              <button
                key={name}
                onClick={() => loadPreset(name)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  selectedPreset === name
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
                data-testid={`btn-preset-${name.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">OpenQASM 3 Input</label>
          <textarea
            value={qasm}
            onChange={e => { setQasm(e.target.value); setResult(null); }}
            rows={10}
            className={`w-full bg-black/40 border rounded-lg px-3 py-2.5 text-xs font-mono outline-none transition-colors resize-none ${
              !qasm.trim() ? "border-red-500/60 focus:border-red-500/80" : "border-white/10 focus:border-primary/40"
            }`}
            data-testid="textarea-qasm"
            placeholder="OPENQASM 3.0;&#10;include &quot;stdgates.inc&quot;;&#10;..."
            spellCheck={false}
          />
          {!qasm.trim() && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1" data-testid="hint-qasm-required">
              <span>⚠</span> QASM circuit is required
            </p>
          )}
        </div>

        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Shots</label>
            <input
              type="number"
              min={1}
              max={65536}
              value={shots}
              onChange={e => setShots(Number(e.target.value))}
              className="w-28 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors"
              data-testid="input-shots"
            />
          </div>
          <Button
            onClick={runSimulation}
            disabled={offline || loading || !qasm.trim()}
            className="gap-2"
            data-testid="btn-run-simulation"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
              : <><Play className="w-4 h-4" /> Run Simulation</>
            }
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg border border-red-400/20 bg-red-400/5 text-red-400 text-sm" data-testid="simulate-error">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3" data-testid="simulate-result">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-semibold text-sm">Simulation Result</h3>
            <Badge variant="outline" className="text-xs border-white/10">{result.backend}</Badge>
            <span className="text-xs text-muted-foreground">{result.shots} shots · {result.time_ms} ms</span>
          </div>

          {result.probabilities && <ProbabilityChart data={result.probabilities} />}

          {result.counts && (
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Measurement Counts</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.counts).map(([state, count]) => (
                  <div key={state} className="bg-black/30 border border-white/5 rounded px-2.5 py-1.5 font-mono text-xs">
                    <span className="text-primary">{state}</span>
                    <span className="text-muted-foreground ml-2">{String(count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.statevector && (
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Statevector</p>
              <pre className="bg-black/30 rounded border border-white/5 p-3 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(result.statevector, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OptimizeTab ────────────────────────────────────────────────────────────────

type OptimizePanel = "portfolio" | "route" | "constraint";

function OptimizeTab({ offline }: { offline: boolean }) {
  const { toast } = useToast();
  const [panel, setPanel] = useState<OptimizePanel>("portfolio");

  // Portfolio state
  const [assets, setAssets]     = useState('{\n  "AAPL": 0.25,\n  "GOOG": 0.25,\n  "MSFT": 0.25,\n  "AMZN": 0.25\n}');
  const [portfolioResult, setPortfolioResult] = useState<OptimizeResult | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // Route state
  const [nodes, setNodes]   = useState('["A", "B", "C", "D"]');
  const [matrix, setMatrix] = useState('[[0,2,9,10],[1,0,6,4],[15,7,0,8],[6,3,12,0]]');
  const [routeResult, setRouteResult] = useState<OptimizeResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Constraint state
  const [qubo, setQubo]     = useState('[[-1, 2], [2, -1]]');
  const [constraintResult, setConstraintResult] = useState<OptimizeResult | null>(null);
  const [constraintLoading, setConstraintLoading] = useState(false);

  async function runPortfolio() {
    setPortfolioLoading(true); setPortfolioResult(null);
    try {
      const weights = JSON.parse(assets);
      const r = await quantumFetch("/v1/quantum/optimize/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: weights }),
      });
      setPortfolioResult(r);
    } catch (e) {
      toast({ title: "Optimization failed", description: (e as Error).message, variant: "destructive" });
    }
    setPortfolioLoading(false);
  }

  async function runRoute() {
    setRouteLoading(true); setRouteResult(null);
    try {
      const r = await quantumFetch("/v1/quantum/optimize/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: JSON.parse(nodes), cost_matrix: JSON.parse(matrix) }),
      });
      setRouteResult(r);
    } catch (e) {
      toast({ title: "Optimization failed", description: (e as Error).message, variant: "destructive" });
    }
    setRouteLoading(false);
  }

  async function runConstraint() {
    setConstraintLoading(true); setConstraintResult(null);
    try {
      const r = await quantumFetch("/v1/quantum/optimize/constraint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qubo_matrix: JSON.parse(qubo) }),
      });
      setConstraintResult(r);
    } catch (e) {
      toast({ title: "Optimization failed", description: (e as Error).message, variant: "destructive" });
    }
    setConstraintLoading(false);
  }

  const PANELS: { id: OptimizePanel; label: string }[] = [
    { id: "portfolio",  label: "Portfolio" },
    { id: "route",      label: "Route" },
    { id: "constraint", label: "Constraint (QUBO)" },
  ];

  return (
    <div className="space-y-6" data-testid="tab-panel-optimize">
      {offline && <ServiceOfflineBanner />}

      <div className="flex gap-2 flex-wrap">
        {PANELS.map(p => (
          <button
            key={p.id}
            onClick={() => setPanel(p.id)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              panel === p.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
            data-testid={`btn-optimize-panel-${p.id}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Portfolio Panel */}
      {panel === "portfolio" && (
        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4" data-testid="optimize-portfolio">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Portfolio Optimization (QAOA)
          </h2>
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Asset Weights (JSON)</label>
            <textarea
              value={assets}
              onChange={e => setAssets(e.target.value)}
              rows={6}
              className={jsonFieldClass(isValidJson(assets))}
              data-testid="textarea-portfolio-assets"
              placeholder='{ "AAPL": 0.25, "GOOG": 0.75 }'
            />
            <JsonInvalidHint show={assets.trim().length > 0 && !isValidJson(assets)} />
          </div>
          <Button onClick={runPortfolio} disabled={offline || portfolioLoading || !isValidJson(assets)} className="gap-2" data-testid="btn-run-portfolio">
            {portfolioLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Optimizing…</> : <><Play className="w-4 h-4" /> Optimize Allocation</>}
          </Button>
          {portfolioResult && <OptimizeResultPanel result={portfolioResult} />}
        </div>
      )}

      {/* Route Panel */}
      {panel === "route" && (
        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4" data-testid="optimize-route">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" /> Route Optimization (Annealing)
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Nodes (JSON array)</label>
              <textarea
                value={nodes}
                onChange={e => setNodes(e.target.value)}
                rows={4}
                className={jsonFieldClass(isValidJson(nodes))}
                data-testid="textarea-route-nodes"
              />
              <JsonInvalidHint show={nodes.trim().length > 0 && !isValidJson(nodes)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Cost Matrix (JSON 2D array)</label>
              <textarea
                value={matrix}
                onChange={e => setMatrix(e.target.value)}
                rows={4}
                className={jsonFieldClass(isValidJson(matrix))}
                data-testid="textarea-route-matrix"
              />
              <JsonInvalidHint show={matrix.trim().length > 0 && !isValidJson(matrix)} />
            </div>
          </div>
          <Button onClick={runRoute} disabled={offline || routeLoading || !isValidJson(nodes) || !isValidJson(matrix)} className="gap-2" data-testid="btn-run-route">
            {routeLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Optimizing…</> : <><Play className="w-4 h-4" /> Find Shortest Route</>}
          </Button>
          {routeResult && <OptimizeResultPanel result={routeResult} />}
        </div>
      )}

      {/* Constraint Panel */}
      {panel === "constraint" && (
        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4" data-testid="optimize-constraint">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Atom className="w-4 h-4 text-primary" /> QUBO Constraint Solver
          </h2>
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">QUBO Matrix (JSON 2D array)</label>
            <textarea
              value={qubo}
              onChange={e => setQubo(e.target.value)}
              rows={6}
              className={jsonFieldClass(isValidJson(qubo))}
              data-testid="textarea-qubo-matrix"
              placeholder="[[-1, 2], [2, -1]]"
            />
            <JsonInvalidHint show={qubo.trim().length > 0 && !isValidJson(qubo)} />
          </div>
          <Button onClick={runConstraint} disabled={offline || constraintLoading || !isValidJson(qubo)} className="gap-2" data-testid="btn-run-constraint">
            {constraintLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Solving…</> : <><Play className="w-4 h-4" /> Solve QUBO</>}
          </Button>
          {constraintResult && <OptimizeResultPanel result={constraintResult} />}
        </div>
      )}
    </div>
  );
}

function OptimizeResultPanel({ result }: { result: OptimizeResult }) {
  return (
    <div className="space-y-3 pt-2" data-testid="optimize-result">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">Result</span>
        <Badge variant="outline" className="text-xs border-white/10">{result.algorithm}</Badge>
        <span className="text-xs text-muted-foreground">{result.time_ms} ms</span>
      </div>
      {result.classical_solution !== undefined && result.quantum_solution !== undefined ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">Classical</p>
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(result.classical_solution, null, 2)}</pre>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary font-mono uppercase tracking-wider mb-2">Quantum</p>
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(result.quantum_solution, null, 2)}</pre>
          </div>
        </div>
      ) : (
        <pre className="bg-black/30 rounded-lg border border-white/5 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
          {JSON.stringify(result.solution, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── CircuitsTab ────────────────────────────────────────────────────────────────

function CircuitsTab({ offline }: { offline: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [qasm, setQasm] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: circuits = [], isLoading } = useQuery<Circuit[]>({
    queryKey: ["/quantum/circuits"],
    queryFn: () => quantumFetch("/v1/quantum/circuits"),
    enabled: !offline,
    retry: false,
    staleTime: 30_000,
  });

  const saveCircuit = useCallback(async () => {
    if (!name.trim() || !qasm.trim()) {
      toast({ title: "Name and QASM are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await quantumFetch("/v1/quantum/circuits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), qasm: qasm.trim() }),
      });
      qc.invalidateQueries({ queryKey: ["/quantum/circuits"] });
      setName(""); setQasm("");
      toast({ title: "Circuit saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  }, [name, qasm, qc, toast]);

  return (
    <div className="space-y-6" data-testid="tab-panel-circuits">
      {offline && <ServiceOfflineBanner />}

      {/* Save Form */}
      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Save className="w-4 h-4 text-primary" /> Save Circuit Definition
        </h2>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Circuit Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Bell State Circuit"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors"
            data-testid="input-circuit-name"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">OpenQASM 3 Code</label>
          <textarea
            value={qasm}
            onChange={e => setQasm(e.target.value)}
            rows={8}
            className={`w-full bg-black/40 border rounded-lg px-3 py-2.5 text-xs font-mono outline-none transition-colors resize-none ${
              !qasm.trim() ? "border-red-500/60 focus:border-red-500/80" : "border-white/10 focus:border-primary/40"
            }`}
            data-testid="textarea-circuit-qasm"
            placeholder="OPENQASM 3.0;&#10;include &quot;stdgates.inc&quot;;&#10;..."
            spellCheck={false}
          />
          {!qasm.trim() && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1" data-testid="hint-circuit-qasm-required">
              <span>⚠</span> QASM circuit is required
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={saveCircuit} disabled={offline || saving || !name.trim() || !qasm.trim()} className="gap-2" data-testid="btn-save-circuit">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Circuit</>}
          </Button>
          <Button variant="outline" className="gap-2 border-white/10" onClick={() => { setName(""); setQasm(""); }} data-testid="btn-clear-circuit">
            <Trash2 className="w-4 h-4" /> Clear
          </Button>
        </div>
      </div>

      {/* Circuit Library */}
      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-card/40">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" /> Circuit Library
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs h-7"
            onClick={() => qc.invalidateQueries({ queryKey: ["/quantum/circuits"] })}
            disabled={offline}
            data-testid="btn-refresh-circuits"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>

        {circuits.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm" data-testid="circuits-empty">
            No saved circuits. Use the form above to save your first circuit.
          </div>
        ) : (
          <div className="divide-y divide-white/5" data-testid="circuits-list">
            {circuits.map(circuit => (
              <CircuitRow key={circuit.circuit_id} circuit={circuit} onLoad={qasm => { setQasm(qasm); setName(circuit.name + " (copy)"); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CircuitRow({ circuit, onLoad }: { circuit: Circuit; onLoad: (qasm: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4" data-testid={`circuit-row-${circuit.circuit_id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Atom className="w-4 h-4 text-primary/60 shrink-0" />
          <span className="font-medium text-sm">{circuit.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{circuit.circuit_id.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 gap-1"
            onClick={() => onLoad(circuit.qasm)}
            data-testid={`btn-load-circuit-${circuit.circuit_id}`}
          >
            <Download className="w-3 h-3" /> Load
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 gap-1"
            onClick={() => setOpen(v => !v)}
            data-testid={`btn-expand-circuit-${circuit.circuit_id}`}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            QASM
          </Button>
        </div>
      </div>
      {open && (
        <pre className="mt-3 bg-black/30 rounded-lg border border-white/5 p-3 text-xs font-mono overflow-x-auto whitespace-pre max-h-40 overflow-y-auto">
          {circuit.qasm}
        </pre>
      )}
    </div>
  );
}

// ── QuantumPage ───────────────────────────────────────────────────────────────

type Tab = "jobs" | "simulate" | "optimize" | "circuits";

export default function QuantumPage() {
  const [tab, setTab] = useState<Tab>("jobs");

  const { data: health } = useQuery({
    queryKey: ["/api/apps/quantum"],
    queryFn: async () => {
      const res = await fetch("/api/apps/quantum");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });

  const offline = !health || health.status !== "healthy";

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "jobs",     label: "Jobs",     icon: <Zap className="w-4 h-4" /> },
    { id: "simulate", label: "Simulate", icon: <Atom className="w-4 h-4" /> },
    { id: "optimize", label: "Optimize", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "circuits", label: "Circuits", icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-16">
        {/* Header */}
        <div className="border-b border-white/5 bg-card/30">
          <div className="container mx-auto px-4 md:px-6 py-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Atom className="w-5 h-5 text-primary" />
                  <h1 className="font-display text-2xl font-bold">Nexus Quantum</h1>
                </div>
                <p className="text-muted-foreground text-sm max-w-xl">
                  Quantum circuit simulation, QAOA/VQE variational optimization, and quantum-inspired constraint solving via Azure Quantum.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-1.5 text-xs ${offline ? "text-amber-400" : "text-green-400"}`}
                  data-testid="quantum-service-status"
                >
                  <span className={`w-2 h-2 rounded-full ${offline ? "bg-amber-400" : "bg-green-400"}`} />
                  {offline ? "Service offline" : "Online · Port 8200"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["FastAPI", "Azure Quantum", "QAOA"].map(t => (
                    <Badge key={t} variant="outline" className="text-xs border-white/10 bg-white/5">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6 py-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
                data-testid={`tab-quantum-${t.id}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {tab === "jobs"     && <JobsTab offline={offline} />}
          {tab === "simulate" && <SimulateTab offline={offline} />}
          {tab === "optimize" && <OptimizeTab offline={offline} />}
          {tab === "circuits" && <CircuitsTab offline={offline} />}
        </div>
      </div>
      <Footer />
    </div>
  );
}
