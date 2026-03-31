import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  name: string;
  fullName: string;
  status: "pass" | "fail" | "skip" | "pending";
  duration: number;
  errorMessage?: string;
  errorStack?: string;
  file: string;
  suite: string;
}

interface TestSuite {
  name: string;
  file: string;
  status: "pass" | "fail";
  duration: number;
  tests: TestCase[];
  passCount: number;
  failCount: number;
  skipCount: number;
}

interface CoverageResult {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

interface TestRunResult {
  runAt: string | null;
  duration: number;
  status: "pass" | "fail" | "running" | "error" | "no-results";
  suites: TestSuite[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    passRate: number;
  };
  coverage?: CoverageResult;
  error?: string;
  message?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TestCase["status"] | "no-results" | "error" }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    pass:       { bg: "bg-emerald-500/10 border border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400", label: "PASS" },
    fail:       { bg: "bg-red-500/10 border border-red-500/30",         text: "text-red-400",     dot: "bg-red-400",     label: "FAIL" },
    skip:       { bg: "bg-amber-500/10 border border-amber-500/30",     text: "text-amber-400",   dot: "bg-amber-400",   label: "SKIP" },
    pending:    { bg: "bg-slate-500/10 border border-slate-500/30",     text: "text-slate-400",   dot: "bg-slate-400",   label: "PEND" },
    running:    { bg: "bg-blue-500/10 border border-blue-500/30",       text: "text-blue-400",    dot: "bg-blue-400",    label: "RUN"  },
    error:      { bg: "bg-red-500/10 border border-red-500/30",         text: "text-red-400",     dot: "bg-red-500",     label: "ERR"  },
    "no-results": { bg: "bg-slate-500/10 border border-slate-500/30",  text: "text-slate-400",   dot: "bg-slate-400",   label: "—"    },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

// ── Coverage Bar ──────────────────────────────────────────────────────────────

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 80 ? "from-emerald-500 to-emerald-400"
              : pct >= 60 ? "from-amber-500 to-amber-400"
              : "from-red-500 to-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-slate-400">{label}</span>
        <span className={pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-red-400"}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Error Traceback ───────────────────────────────────────────────────────────

function ErrorDetails({ test }: { test: TestCase }) {
  const [expanded, setExpanded] = useState(false);
  if (!test.errorMessage) return null;

  const lines = (test.errorStack || "").split("\n").filter(Boolean);
  const frameLines = lines.filter(l => l.includes("at "));

  return (
    <div className="mt-2 rounded-lg border border-red-500/20 bg-red-950/20 overflow-hidden">
      {/* Error message header */}
      <div className="flex items-start gap-2 p-3 bg-red-500/10">
        <span className="mt-0.5 text-red-400 text-lg leading-none">✕</span>
        <div className="flex-1 min-w-0">
          <p className="text-red-300 text-xs font-mono break-all leading-relaxed">
            {test.errorMessage}
          </p>
        </div>
        {lines.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="shrink-0 text-xs text-red-400 hover:text-red-300 font-mono border border-red-500/30 rounded px-2 py-0.5"
          >
            {expanded ? "collapse" : `traceback (${frameLines.length} frames)`}
          </button>
        )}
      </div>

      {/* Stack trace */}
      {expanded && lines.length > 0 && (
        <div className="p-3 border-t border-red-500/20 bg-slate-950/60">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Stack Trace</p>
          <div className="space-y-0.5">
            {lines.map((line, i) => {
              const isFrame  = line.trim().startsWith("at ");
              const isSource = line.includes("workspace") || line.includes("tests/");
              return (
                <div
                  key={i}
                  className={`font-mono text-[11px] leading-relaxed px-2 py-0.5 rounded ${
                    isSource
                      ? "bg-red-500/10 text-red-300"
                      : isFrame
                        ? "text-slate-500"
                        : "text-slate-400"
                  }`}
                >
                  <span className="select-none text-slate-700 mr-2">{String(i + 1).padStart(3)}</span>
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Test Row ──────────────────────────────────────────────────────────────────

function TestRow({ test }: { test: TestCase }) {
  const icon = test.status === "pass" ? "✓"
             : test.status === "fail" ? "✕"
             : test.status === "skip" ? "○"
             : "◌";
  const iconColor = test.status === "pass" ? "text-emerald-400"
                  : test.status === "fail" ? "text-red-400"
                  : test.status === "skip" ? "text-amber-400"
                  : "text-slate-500";

  return (
    <div
      data-testid={`test-row-${test.id}`}
      className={`border-l-2 pl-4 pr-3 py-2 ${
        test.status === "pass" ? "border-emerald-500/40"
        : test.status === "fail" ? "border-red-500/60"
        : "border-slate-600/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-mono text-sm font-bold ${iconColor}`}>{icon}</span>
        <span className="flex-1 text-sm text-slate-200 font-mono">{test.name}</span>
        <span className="text-xs text-slate-600 font-mono">{fmtMs(test.duration)}</span>
      </div>
      {test.status === "fail" && <ErrorDetails test={test} />}
    </div>
  );
}

// ── Suite Card ────────────────────────────────────────────────────────────────

const SUITE_LABELS: Record<string, string> = {
  "api.test":            "API Integration",
  "auth.test":           "Auth Utilities",
  "schema.test":         "Schema Validation",
  "backwards-compat.test": "Regression / Compat",
};

function SuiteCard({ suite, defaultOpen }: { suite: TestSuite; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const passRate = suite.tests.length > 0
    ? Math.round((suite.passCount / suite.tests.length) * 100) : 100;

  return (
    <div
      data-testid={`suite-card-${suite.name}`}
      className={`rounded-xl border overflow-hidden ${
        suite.status === "fail"
          ? "border-red-500/30 bg-red-950/10"
          : "border-slate-700/50 bg-slate-900/50"
      }`}
    >
      {/* Suite header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        data-testid={`suite-toggle-${suite.name}`}
      >
        <span className="text-slate-500 text-sm">{open ? "▾" : "▸"}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={suite.status} />
            <span className="text-sm font-semibold text-white font-mono">
              {SUITE_LABELS[suite.name] || suite.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{suite.file}</p>
        </div>

        {/* Mini stats */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs font-mono">
              <span className="text-emerald-400 font-bold">{suite.passCount}</span>
              <span className="text-slate-600"> / {suite.tests.length}</span>
            </p>
            <p className="text-xs text-slate-600 font-mono">{fmtMs(suite.duration)}</p>
          </div>
          {/* Progress arc */}
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#1e293b" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="14" fill="none"
                stroke={passRate === 100 ? "#10b981" : passRate >= 75 ? "#f59e0b" : "#ef4444"}
                strokeWidth="3.5"
                strokeDasharray={`${(passRate / 100) * 87.96} 87.96`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold font-mono text-white">
              {passRate}%
            </span>
          </div>
        </div>
      </button>

      {/* Test list */}
      {open && (
        <div className="border-t border-slate-700/40 bg-slate-950/30 divide-y divide-slate-800/40">
          {suite.tests.map(test => <TestRow key={test.id} test={test} />)}
        </div>
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">{label}</p>
      <p className={`text-3xl font-bold font-mono mt-1 ${color}`}>{value}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TestDashboard() {
  const qc       = useQueryClient();
  const [running, setRunning] = useState(false);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading } = useQuery<TestRunResult>({
    queryKey: ["/api/tests/results"],
    queryFn: () => fetch("/api/tests/results").then(r => r.json()),
    refetchInterval: running ? 3000 : false,
  });

  const runMutation = useMutation({
    mutationFn: () => fetch("/api/tests/run", { method: "POST" }).then(r => r.json()),
    onMutate: () => setRunning(true),
    onSettled: (result) => {
      setRunning(false);
      qc.setQueryData(["/api/tests/results"], result);
      qc.invalidateQueries({ queryKey: ["/api/tests/results"] });
    },
  });

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const res = data as TestRunResult | undefined;
  const summary = res?.summary ?? { total: 0, pass: 0, fail: 0, skip: 0, passRate: 0 };
  const overallStatus = running ? "running"
    : (res?.status === "no-results" || !res) ? "no-results"
    : res.status;

  // Filter controls
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "skip">("all");
  const filteredSuites = (res?.suites ?? []).map(s => ({
    ...s,
    tests: filter === "all" ? s.tests : s.tests.filter(t => t.status === filter),
  })).filter(s => filter === "all" || s.tests.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm font-mono">
            ← nexus
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-white font-semibold font-mono text-sm">test-dashboard</span>
          <div className="flex-1" />

          {/* Overall status pill */}
          <StatusBadge status={overallStatus as any} />

          {/* Run button */}
          <button
            data-testid="button-run-tests"
            onClick={() => runMutation.mutate()}
            disabled={running}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold font-mono transition-all ${
              running
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 border border-blue-500"
            }`}
          >
            {running ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-blue-300/40 border-t-blue-300 animate-spin" />
                running…
              </>
            ) : "▶ Run Tests"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Title ── */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            Test Suite — <span className="text-gradient bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">NexusConsult</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-mono">
            Vitest unit + integration · Playwright E2E · Coverage v8
            {res?.runAt && (
              <span className="ml-3 text-slate-600">last run: {fmtDate(res.runAt)} · {fmtMs(res.duration)}</span>
            )}
          </p>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Tests" value={summary.total}     color="text-white" />
          <SummaryCard label="Passed"      value={summary.pass}      color="text-emerald-400" />
          <SummaryCard label="Failed"      value={summary.fail}      color={summary.fail > 0 ? "text-red-400" : "text-emerald-400"} />
          <SummaryCard label="Skipped"     value={summary.skip}      color="text-amber-400" />
        </div>

        {/* ── Pass-rate progress bar ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-300">Overall Pass Rate</span>
            <span
              className={`text-2xl font-bold font-mono ${
                summary.passRate === 100 ? "text-emerald-400"
                : summary.passRate >= 75 ? "text-amber-400" : "text-red-400"
              }`}
            >
              {summary.passRate}%
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              data-testid="progress-pass-rate"
              className={`h-full rounded-full transition-all duration-700 ${
                summary.passRate === 100
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : summary.passRate >= 75
                    ? "bg-gradient-to-r from-amber-500 to-amber-400"
                    : "bg-gradient-to-r from-red-500 to-red-400"
              }`}
              style={{ width: `${summary.passRate}%` }}
            />
          </div>
          {/* segment labels */}
          {summary.total > 0 && (
            <div className="flex gap-4 mt-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {summary.pass} passed
              </span>
              {summary.fail > 0 && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  {summary.fail} failed
                </span>
              )}
              {summary.skip > 0 && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  {summary.skip} skipped
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Coverage ── */}
        {res?.coverage && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Code Coverage</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <CoverageBar label="Lines"      pct={res.coverage.lines} />
              <CoverageBar label="Functions"  pct={res.coverage.functions} />
              <CoverageBar label="Branches"   pct={res.coverage.branches} />
              <CoverageBar label="Statements" pct={res.coverage.statements} />
            </div>
          </div>
        )}

        {/* ── Filter tabs ── */}
        {(res?.suites?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-mono mr-1">filter:</span>
            {(["all", "pass", "fail", "skip"] as const).map(f => (
              <button
                key={f}
                data-testid={`filter-${f}`}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold border transition-colors ${
                  filter === f
                    ? f === "all"   ? "bg-slate-700 border-slate-500 text-white"
                      : f === "pass" ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                      : f === "fail" ? "bg-red-500/20 border-red-500 text-red-300"
                      : "bg-amber-500/20 border-amber-500 text-amber-300"
                    : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* ── Suite cards ── */}
        {isLoading || running ? (
          <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-10 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-blue-300 font-mono text-sm">{running ? "Running test suite…" : "Loading results…"}</p>
            <p className="text-slate-600 text-xs font-mono mt-1">This takes 3–8 seconds</p>
          </div>
        ) : filteredSuites.length === 0 && res?.status !== "no-results" ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-10 text-center">
            <p className="text-slate-500 font-mono text-sm">No tests match filter: {filter}</p>
          </div>
        ) : res?.status === "no-results" || !res ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-10 text-center space-y-3">
            <p className="text-4xl">🧪</p>
            <p className="text-slate-300 font-semibold">No results yet</p>
            <p className="text-slate-500 text-sm font-mono">Click "▶ Run Tests" to execute the full suite</p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="suite-list">
            {filteredSuites.map((suite, i) => (
              <SuiteCard
                key={suite.file}
                suite={suite}
                defaultOpen={suite.status === "fail" || i < 2}
              />
            ))}
          </div>
        )}

        {/* ── E2E note ── */}
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/20 p-5">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Playwright E2E Suite</h2>
          <p className="text-xs text-slate-500 font-mono mb-3">
            End-to-end tests run in headless Chromium with full screenshot and trace capture.
            Screenshots are embedded in failures; traces can be opened in the Playwright trace viewer.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
              <p className="text-slate-500 uppercase tracking-widest text-[10px] mb-1">Test file</p>
              <p className="text-slate-300">tests/e2e/booking.spec.ts</p>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
              <p className="text-slate-500 uppercase tracking-widest text-[10px] mb-1">Reporter</p>
              <p className="text-slate-300">html · json · list</p>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
              <p className="text-slate-500 uppercase tracking-widest text-[10px] mb-1">Artifacts</p>
              <p className="text-slate-300">test-results/e2e/ · playwright-report/</p>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Run E2E locally</p>
            <code className="text-emerald-400 text-xs">npx playwright test --reporter=html</code>
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600">
          <span>Legend:</span>
          <span className="flex items-center gap-1.5 text-emerald-400"><span className="font-bold">✓</span> passed</span>
          <span className="flex items-center gap-1.5 text-red-400"><span className="font-bold">✕</span> failed — error + traceback shown inline</span>
          <span className="flex items-center gap-1.5 text-amber-400"><span className="font-bold">○</span> skipped / todo</span>
          <span className="flex items-center gap-1.5 text-slate-500"><span className="font-bold">◌</span> pending</span>
        </div>
      </main>
    </div>
  );
}