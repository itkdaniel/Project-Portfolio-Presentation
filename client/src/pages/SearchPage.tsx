/**
 * /search — NexusSearch Explorer
 *
 * Connects to nexus-search (port 8002) via the Express gateway proxy at
 * /api/apps/search/proxy/.  Provides BM25 full-text search, tag filtering,
 * project cards, and a "related projects" panel powered by the tag-graph BFS
 * endpoint.  Shows an offline banner when the service is unreachable.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Tag,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Network,
  Loader2,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  title: string;
  description: string;
  tags: string[];
  status: string;
  featured?: boolean;
  github_url?: string;
  demo_url?: string;
}

interface SearchResult {
  projects: Project[];
  total: number;
  query?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROXY = "/api/apps/search/proxy";
const TAGS = [
  "automation", "python", "typescript", "fastapi", "react",
  "postgresql", "redis", "kubernetes", "docker", "ai", "quantum", "analytics",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(path: string) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function highlightQuery(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "**$1**");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-blue-500/30 text-blue-200 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <span className="font-semibold">nexus-search service is offline.</span>{" "}
        Showing cached results from the main API. Start the service on port 8002 for full BM25 search.
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  query,
  onRelated,
  isSelected,
}: {
  project: Project;
  query: string;
  onRelated: (id: number) => void;
  isSelected: boolean;
}) {
  const statusColour =
    project.status === "completed"
      ? "bg-green-500/20 text-green-300"
      : project.status === "in_progress"
      ? "bg-blue-500/20 text-blue-300"
      : "bg-gray-500/20 text-gray-300";

  return (
    <div
      data-testid={`project-card-${project.id}`}
      className={`glass-panel rounded-xl p-5 transition-all duration-200 ${
        isSelected ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white leading-snug truncate">
            {query ? <HighlightedText text={project.title} query={query} /> : project.title}
          </h3>
          <p className="mt-1 text-sm text-white/60 line-clamp-2">
            {query ? (
              <HighlightedText text={project.description} query={query} />
            ) : (
              project.description
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColour}`}>
            {project.status.replace("_", " ")}
          </span>
          {project.featured && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
              Featured
            </span>
          )}
        </div>
      </div>

      {project.tags && project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 border-white/10 px-3 text-xs"
          onClick={() => onRelated(project.id)}
          data-testid={`btn-related-${project.id}`}
        >
          <Network className="h-3 w-3" />
          Related
        </Button>
        {project.github_url && (
          <a
            href={project.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
            data-testid={`link-github-${project.id}`}
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </a>
        )}
        {project.demo_url && (
          <a
            href={project.demo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
            data-testid={`link-demo-${project.id}`}
          >
            <ExternalLink className="h-3 w-3" />
            Demo
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [relatedId, setRelatedId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  // ── Health check ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${PROXY}/health`)
      .then((r) => setIsOnline(r.ok))
      .catch(() => setIsOnline(false));
  }, []);

  // ── Debounce input ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // ── BM25 search via nexus-search proxy ───────────────────────────────────
  const searchPath = isOnline
    ? `${PROXY}/v1/search?q=${encodeURIComponent(debouncedQuery)}&${activeTags.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}`
    : `/api/projects?search=${encodeURIComponent(debouncedQuery)}`;

  const {
    data: searchData,
    isLoading: searchLoading,
    refetch,
  } = useQuery<SearchResult | Project[]>({
    queryKey: ["search", debouncedQuery, activeTags, isOnline],
    queryFn: () => fetchJson(searchPath),
    enabled: isOnline !== null,
    staleTime: 15_000,
  });

  // Normalise to Project[]
  const projects: Project[] = Array.isArray(searchData)
    ? searchData
    : (searchData as SearchResult)?.projects ?? [];

  // ── Related projects via tag-graph BFS ───────────────────────────────────
  const { data: relatedData, isLoading: relatedLoading } = useQuery<{ related: Project[] }>({
    queryKey: ["related", relatedId],
    queryFn: () => fetchJson(`${PROXY}/v1/projects/${relatedId}/related`),
    enabled: relatedId !== null && isOnline === true,
    staleTime: 30_000,
  });
  const relatedProjects: Project[] = relatedData?.related ?? [];

  // ── Tag toggle ────────────────────────────────────────────────────────────
  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const clearAll = () => {
    setQuery("");
    setDebouncedQuery("");
    setActiveTags([]);
    setRelatedId(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20">
              <Search className="h-5 w-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold font-display text-gradient">
              NexusSearch
            </h1>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
              BM25
            </Badge>
            {isOnline !== null && (
              <span
                data-testid="search-online-status"
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  isOnline ? "text-green-400" : "text-amber-400"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isOnline ? "bg-green-400" : "bg-amber-400"
                  }`}
                />
                {isOnline ? "Online" : "Offline"}
              </span>
            )}
          </div>
          <p className="text-sm text-white/50 ml-12">
            BM25 full-text search with tag-graph recommendations — powered by nexus-search :8002
          </p>
        </div>

        {/* ── Offline banner ───────────────────────────────────────────── */}
        {isOnline === false && (
          <div className="mb-6">
            <OfflineBanner />
          </div>
        )}

        {/* ── Search + filters ─────────────────────────────────────────── */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              data-testid="input-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects by keyword…"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11"
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
                onClick={() => setQuery("")}
                data-testid="btn-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tag pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-white/40">
              <Tag className="h-3 w-3" /> Filter by tag:
            </span>
            {TAGS.map((tag) => (
              <button
                key={tag}
                data-testid={`tag-pill-${tag}`}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-all ${
                  activeTags.includes(tag)
                    ? "border-blue-500 bg-blue-500/20 text-blue-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
                }`}
              >
                {tag}
              </button>
            ))}
            {(activeTags.length > 0 || query) && (
              <button
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
                onClick={clearAll}
                data-testid="btn-clear-all"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* ── Main grid ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/40">
                {searchLoading ? (
                  "Searching…"
                ) : (
                  <>
                    {projects.length} result{projects.length !== 1 ? "s" : ""}
                    {debouncedQuery && (
                      <span className="text-white/30">
                        {" "}for "{debouncedQuery}"
                      </span>
                    )}
                  </>
                )}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs text-white/40 hover:text-white"
                onClick={() => refetch()}
                data-testid="btn-refresh"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {searchLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/2 px-6 py-16 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-white/20 mb-3" />
                <p className="text-sm text-white/40">
                  {debouncedQuery
                    ? `No projects matched "${debouncedQuery}".`
                    : "No projects found. Try a different query or tag."}
                </p>
              </div>
            ) : (
              projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  query={debouncedQuery}
                  onRelated={setRelatedId}
                  isSelected={relatedId === project.id}
                />
              ))
            )}
          </div>

          {/* Related projects panel */}
          <div className="space-y-4">
            <div className="glass-panel rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Tag-Graph Related
                </h3>
                {relatedId !== null && (
                  <button
                    className="ml-auto text-white/30 hover:text-white/60"
                    onClick={() => setRelatedId(null)}
                    data-testid="btn-close-related"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {relatedId === null ? (
                <p className="text-xs text-white/40">
                  Click <strong className="text-white/60">Related</strong> on any project to
                  see BFS tag-graph recommendations from nexus-search.
                </p>
              ) : !isOnline ? (
                <p className="text-xs text-amber-400">
                  nexus-search must be online for tag-graph recommendations.
                </p>
              ) : relatedLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                </div>
              ) : relatedProjects.length === 0 ? (
                <p className="text-xs text-white/40">No related projects found.</p>
              ) : (
                <div className="space-y-3">
                  {relatedProjects.map((p) => (
                    <div
                      key={p.id}
                      data-testid={`related-card-${p.id}`}
                      className="rounded-lg bg-white/5 p-3"
                    >
                      <p className="text-sm font-medium text-white truncate">{p.title}</p>
                      {p.tags && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs text-white/30">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats card */}
            <div className="glass-panel rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Search Stats</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-white/40">Results</dt>
                  <dd className="font-medium text-white">{projects.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-white/40">Active tags</dt>
                  <dd className="font-medium text-white">{activeTags.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-white/40">Engine</dt>
                  <dd className="font-medium text-white">{isOnline ? "BM25" : "Full-text"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-white/40">Service</dt>
                  <dd className={`font-medium ${isOnline ? "text-green-400" : "text-amber-400"}`}>
                    {isOnline ? ":8002 live" : "offline"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
