/**
 * /ai — NexusAI Explorer
 *
 * Interactive UI for the nexus-ai microservice (port 8001) proxied through
 * the Express gateway at /api/apps/ai/proxy/.
 *
 * Tabs:
 *   Classify   — text classification with confidence breakdown bar chart
 *   Embed      — sentence embeddings with cosine similarity heatmap
 *   Similarity — pairwise semantic similarity score
 *   Fill-Mask  — masked language model predictions
 *   Quantum    — quantum VQE embedding via nexus-shared backend
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  Cpu,
  Atom,
  Zap,
  MessageSquare,
  Layers,
  ArrowRightLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassifyResult {
  label: string;
  score: number;
  top_k: Array<{ label: string; score: number }>;
}

interface EmbedResult {
  embeddings: number[][];
  model: string;
  dim: number;
}

interface SimilarityResult {
  score: number;
  sentence_a: string;
  sentence_b: string;
}

interface FillMaskResult {
  predictions: Array<{ token: string; score: number; sequence: string }>;
}

interface QuantumEmbedResult {
  quantum_embeddings: number[][];
  classical_embeddings: number[][];
  fidelity: number;
  fallback_used: boolean;
  model: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROXY = "/api/apps/ai/proxy";

const TABS = [
  { id: "classify",   label: "Classify",   icon: MessageSquare },
  { id: "embed",      label: "Embed",       icon: Layers },
  { id: "similarity", label: "Similarity",  icon: ArrowRightLeft },
  { id: "fill-mask",  label: "Fill-Mask",   icon: Brain },
  { id: "quantum",    label: "Quantum",     icon: Atom },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postJson(path: string, body: unknown) {
  const r = await fetch(PROXY + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
  return data;
}

/** Cosine similarity between two vectors */
function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

function ScoreBar({ score, colour = "blue" }: { score: number; colour?: string }) {
  const pct = Math.round(score * 100);
  const bg = colour === "purple" ? "bg-purple-500" : colour === "green" ? "bg-green-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-full bg-white/5 h-2">
        <div
          className={`h-2 rounded-full ${bg} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-white/60 w-10 text-right">{pct}%</span>
    </div>
  );
}

function OfflineBanner({ port = 8001 }: { port?: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 mb-6">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>nexus-ai service is offline.</strong> Start the service on port {port} to use live inference.
      </span>
    </div>
  );
}

// ── Tab: Classify ─────────────────────────────────────────────────────────────

function ClassifyTab({ isOnline }: { isOnline: boolean }) {
  const [text, setText] = useState(
    "Our platform uses Kubernetes to orchestrate 12 microservices with zero-downtime deployments."
  );

  const { mutate, data, isPending, isError, error } = useMutation<ClassifyResult>({
    mutationFn: () => postJson("/v1/classify", { text }),
  });

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">INPUT TEXT</label>
        <textarea
          data-testid="textarea-classify"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white
                     placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>
      <Button
        data-testid="btn-classify"
        onClick={() => mutate()}
        disabled={!text.trim() || !isOnline || isPending}
        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        Classify
      </Button>

      {isError && (
        <p className="text-xs text-red-400" data-testid="classify-error">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="glass-panel rounded-xl p-5 space-y-4" data-testid="classify-result">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Top label</p>
              <p className="text-lg font-semibold text-white">{data.label}</p>
            </div>
            <span className="rounded-full bg-blue-500/20 px-3 py-1 text-sm font-medium text-blue-300">
              {Math.round(data.score * 100)}% confidence
            </span>
          </div>
          {data.top_k && data.top_k.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/40">Score breakdown</p>
              {data.top_k.map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>{item.label}</span>
                  </div>
                  <ScoreBar score={item.score} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: Embed ────────────────────────────────────────────────────────────────

function EmbedTab({ isOnline }: { isOnline: boolean }) {
  const [sentences, setSentences] = useState(
    "Kubernetes orchestrates containerised workloads\nFastAPI enables async Python web services\nReact components drive the frontend UI"
  );
  const [showRaw, setShowRaw] = useState(false);

  const { mutate, data, isPending, isError, error } = useMutation<EmbedResult>({
    mutationFn: () =>
      postJson("/v1/embed", {
        sentences: sentences.split("\n").filter((s) => s.trim()),
      }),
  });

  const sentenceList = sentences.split("\n").filter((s) => s.trim());

  // Simple cosine similarity matrix
  const simMatrix =
    data?.embeddings && data.embeddings.length > 1
      ? data.embeddings.map((a, i) =>
          data.embeddings.map((b, j) =>
            i === j ? 1 : cosine(a, b)
          )
        )
      : null;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">
          SENTENCES (one per line)
        </label>
        <textarea
          data-testid="textarea-embed"
          value={sentences}
          onChange={(e) => setSentences(e.target.value)}
          rows={4}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white
                     placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none font-mono"
        />
      </div>
      <Button
        data-testid="btn-embed"
        onClick={() => mutate()}
        disabled={sentenceList.length === 0 || !isOnline || isPending}
        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
        Generate Embeddings
      </Button>

      {isError && (
        <p className="text-xs text-red-400">{(error as Error).message}</p>
      )}

      {data && (
        <div className="space-y-4" data-testid="embed-result">
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>Model: <strong className="text-white/60">{data.model}</strong></span>
            <span>Dim: <strong className="text-white/60">{data.dim}</strong></span>
            <span>Vectors: <strong className="text-white/60">{data.embeddings.length}</strong></span>
          </div>

          {simMatrix && (
            <div className="glass-panel rounded-xl p-4">
              <p className="text-xs text-white/40 mb-3">Cosine similarity matrix</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-white/30 pb-2 pr-3">—</th>
                      {sentenceList.map((_, i) => (
                        <th key={i} className="text-white/30 pb-2 px-2">S{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {simMatrix.map((row, i) => (
                      <tr key={i}>
                        <td className="text-white/40 pr-3 py-1.5 max-w-[120px] truncate">
                          S{i + 1}: {sentenceList[i].slice(0, 20)}…
                        </td>
                        {row.map((val, j) => {
                          const intensity = Math.round(val * 100);
                          return (
                            <td key={j} className="px-2 py-1.5 text-center font-mono">
                              <span
                                className="rounded px-1 py-0.5"
                                style={{
                                  background: i === j
                                    ? "rgba(59,130,246,0.3)"
                                    : `rgba(99,102,241,${val * 0.6})`,
                                  color: val > 0.5 ? "white" : "rgba(255,255,255,0.5)",
                                }}
                              >
                                {val.toFixed(2)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRaw ? "Hide" : "Show"} raw vectors
          </button>
          {showRaw && (
            <pre className="rounded-lg bg-black/40 p-3 text-xs text-white/50 overflow-auto max-h-48">
              {JSON.stringify(data.embeddings.map((v) => v.slice(0, 8).map((x) => x.toFixed(4))), null, 2)}
              {"\n…"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: Similarity ───────────────────────────────────────────────────────────

function SimilarityTab({ isOnline }: { isOnline: boolean }) {
  const [sentA, setSentA] = useState("Kubernetes orchestrates containers at scale");
  const [sentB, setSentB] = useState("Docker containers run isolated workloads");

  const { mutate, data, isPending, isError, error } = useMutation<SimilarityResult>({
    mutationFn: () =>
      postJson("/v1/similarity", { sentence_a: sentA, sentence_b: sentB }),
  });

  const score = data?.score ?? null;
  const scoreColour =
    score === null ? "white" : score >= 0.7 ? "text-green-400" : score >= 0.4 ? "text-blue-400" : "text-red-400";

  return (
    <div className="space-y-5">
      {[
        { label: "SENTENCE A", value: sentA, onChange: setSentA, testId: "textarea-sentence-a" },
        { label: "SENTENCE B", value: sentB, onChange: setSentB, testId: "textarea-sentence-b" },
      ].map(({ label, value, onChange, testId }) => (
        <div key={label}>
          <label className="block text-xs font-medium text-white/50 mb-1.5">{label}</label>
          <textarea
            data-testid={testId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white
                       placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      ))}
      <Button
        data-testid="btn-similarity"
        onClick={() => mutate()}
        disabled={!sentA.trim() || !sentB.trim() || !isOnline || isPending}
        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
        Compute Similarity
      </Button>

      {isError && <p className="text-xs text-red-400">{(error as Error).message}</p>}

      {data && (
        <div className="glass-panel rounded-xl p-6 text-center" data-testid="similarity-result">
          <p className="text-xs text-white/40 mb-2">Cosine Similarity</p>
          <p className={`text-5xl font-bold font-mono ${scoreColour}`}>
            {score !== null ? score.toFixed(4) : "—"}
          </p>
          <div className="mt-4 max-w-xs mx-auto">
            <ScoreBar score={score ?? 0} colour={score !== null && score >= 0.7 ? "green" : "blue"} />
          </div>
          <p className="mt-3 text-xs text-white/30">
            {score !== null && score >= 0.7
              ? "High semantic similarity"
              : score !== null && score >= 0.4
              ? "Moderate semantic similarity"
              : "Low semantic similarity"}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Fill-Mask ────────────────────────────────────────────────────────────

function FillMaskTab({ isOnline }: { isOnline: boolean }) {
  const [text, setText] = useState(
    "The platform uses [MASK] to orchestrate containerised microservices."
  );

  const { mutate, data, isPending, isError, error } = useMutation<FillMaskResult>({
    mutationFn: () => postJson("/v1/fill-mask", { text }),
  });

  const hasMask = text.includes("[MASK]");

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">
          TEXT WITH [MASK] TOKEN
        </label>
        <textarea
          data-testid="textarea-fill-mask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white
                     placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none"
        />
        {!hasMask && text.trim() && (
          <p className="mt-1 text-xs text-amber-400">⚠ Include [MASK] in your text.</p>
        )}
      </div>
      <Button
        data-testid="btn-fill-mask"
        onClick={() => mutate()}
        disabled={!hasMask || !isOnline || isPending}
        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        Fill Mask
      </Button>

      {isError && <p className="text-xs text-red-400">{(error as Error).message}</p>}

      {data?.predictions && (
        <div className="glass-panel rounded-xl p-5 space-y-3" data-testid="fill-mask-result">
          <p className="text-xs text-white/40">Top predictions</p>
          {data.predictions.map((pred, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-white">
                  "{pred.token}"
                </span>
                <span className="text-xs text-white/50 font-mono">
                  {(pred.score * 100).toFixed(1)}%
                </span>
              </div>
              <ScoreBar score={pred.score} colour={i === 0 ? "green" : "blue"} />
              <p className="text-xs text-white/30 italic">{pred.sequence}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Quantum Embed ────────────────────────────────────────────────────────

function QuantumTab({ isOnline }: { isOnline: boolean }) {
  const [texts, setTexts] = useState(
    "Quantum entanglement enables non-local correlations\nVQE finds ground-state energies variationally\nQAOA optimises combinatorial problems"
  );

  const { mutate, data, isPending, isError, error } = useMutation<QuantumEmbedResult>({
    mutationFn: () =>
      postJson("/v1/ai/quantum/embed", {
        texts: texts.split("\n").filter((s) => s.trim()),
        target_dim: 4,
        num_layers: 2,
      }),
  });

  const textList = texts.split("\n").filter((s) => s.trim());

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-300">
        <Atom className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Uses VQE quantum feature projection. Falls back to classical PCA when Azure Quantum
          credentials are absent. The <strong>fidelity</strong> score measures quantum vs classical divergence.
        </span>
      </div>
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">TEXTS (one per line)</label>
        <textarea
          data-testid="textarea-quantum-embed"
          value={texts}
          onChange={(e) => setTexts(e.target.value)}
          rows={4}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white
                     placeholder:text-white/30 focus:outline-none focus:border-blue-500 resize-none font-mono"
        />
      </div>
      <Button
        data-testid="btn-quantum-embed"
        onClick={() => mutate()}
        disabled={textList.length === 0 || !isOnline || isPending}
        className="bg-purple-600 hover:bg-purple-500 text-white gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Atom className="h-4 w-4" />}
        Quantum Embed
      </Button>

      {isError && <p className="text-xs text-red-400">{(error as Error).message}</p>}

      {data && (
        <div className="space-y-4" data-testid="quantum-embed-result">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Fidelity", value: data.fidelity.toFixed(4), colour: "text-purple-300" },
              { label: "Backend", value: data.fallback_used ? "Classical" : "Quantum", colour: data.fallback_used ? "text-amber-300" : "text-green-300" },
              { label: "Vectors", value: String(data.quantum_embeddings.length), colour: "text-white" },
            ].map(({ label, value, colour }) => (
              <div key={label} className="glass-panel rounded-xl p-4 text-center">
                <p className="text-xs text-white/40 mb-1">{label}</p>
                <p className={`text-lg font-semibold font-mono ${colour}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-xl p-4 overflow-auto max-h-48">
            <p className="text-xs text-white/40 mb-2">Quantum embeddings (first 6 dims)</p>
            <table className="text-xs font-mono w-full">
              <tbody>
                {data.quantum_embeddings.map((vec, i) => (
                  <tr key={i}>
                    <td className="text-white/30 pr-3">{textList[i]?.slice(0, 20)}…</td>
                    <td className="text-white/60">
                      [{vec.slice(0, 6).map((v) => v.toFixed(3)).join(", ")}…]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIPage() {
  const [activeTab, setActiveTab] = useState<TabId>("classify");
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${PROXY}/health`)
      .then((r) => setIsOnline(r.ok))
      .catch(() => setIsOnline(false));
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case "classify":   return <ClassifyTab   isOnline={!!isOnline} />;
      case "embed":      return <EmbedTab      isOnline={!!isOnline} />;
      case "similarity": return <SimilarityTab isOnline={!!isOnline} />;
      case "fill-mask":  return <FillMaskTab   isOnline={!!isOnline} />;
      case "quantum":    return <QuantumTab     isOnline={!!isOnline} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600/20">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold font-display text-gradient">
              NexusAI Explorer
            </h1>
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
              Transformer
            </Badge>
            {isOnline !== null && (
              <span
                data-testid="ai-online-status"
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  isOnline ? "text-green-400" : "text-amber-400"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-400" : "bg-amber-400"}`} />
                {isOnline ? "Online :8001" : "Offline"}
              </span>
            )}
          </div>
          <p className="text-sm text-white/50 ml-12">
            Interactive inference playground for the NexusAI PyTorch transformer service
          </p>
        </div>

        {/* ── Offline banner ───────────────────────────────────────────── */}
        {isOnline === false && <OfflineBanner />}

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 rounded-xl bg-white/5 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium
                         transition-all duration-150 ${
                           activeTab === id
                             ? "bg-white/10 text-white shadow-sm"
                             : "text-white/40 hover:text-white/70"
                         }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-6">
          {renderTab()}
        </div>

        {/* ── Info footer ──────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center gap-6 text-xs text-white/30">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3" />
            <span>nexus-ai :8001</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Atom className="h-3 w-3" />
            <span>Azure Quantum backend (graceful fallback)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            <span>Pre-LN Encoder Transformer</span>
          </div>
        </div>
      </main>
    </div>
  );
}
