import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { Play, Download, Github, Box, Loader2, ExternalLink, BookOpen, Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useRealtimeProjects } from "@/lib/websocket";
import type { Project } from "@shared/schema";

interface SubAppInfo {
  name: string;
  label: string;
  description: string;
  baseUrl: string;
  port: number;
  healthPath: string;
  openApiPath: string;
  tags: string[];
  matchKeys: string[];
  endpoints?: Array<{ method: string; path: string; description: string; auth: boolean }>;
  githubUrl?: string;
  status?: "healthy" | "unhealthy" | "unconfigured";
  latencyMs?: number;
}

function matchProjectToSubApp(project: Project, apps: SubAppInfo[]): SubAppInfo | null {
  const nameLower = project.name.toLowerCase();
  const tagsLower = (project.tags || []).map(t => t.toLowerCase());
  const demoEndpoint = (project.demoApiEndpoint || "").toLowerCase();

  for (const app of apps) {
    const matched = app.matchKeys.some(key =>
      nameLower.includes(key) ||
      tagsLower.some(t => t.includes(key)) ||
      demoEndpoint.includes(key) ||
      demoEndpoint.includes(`/api/apps/${app.name}`)
    );
    if (matched) return app;
  }
  return null;
}

function SubAppStatusBadge({ status, latencyMs }: { status?: SubAppInfo["status"]; latencyMs?: number }) {
  if (status === "healthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-400 font-mono" data-testid="badge-subapp-healthy">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>online{latencyMs !== undefined ? ` · ${latencyMs}ms` : ""}</span>
      </div>
    );
  }
  if (status === "unhealthy") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400/70 font-mono" data-testid="badge-subapp-unhealthy">
        <XCircle className="w-3.5 h-3.5" />
        <span>offline</span>
      </div>
    );
  }
  if (status) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" data-testid="badge-subapp-unknown">
        <Clock className="w-3.5 h-3.5" />
        <span>checking…</span>
      </div>
    );
  }
  return null;
}

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-green-400 bg-green-400/10 border-green-400/20",
  POST:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
  PUT:    "text-amber-400 bg-amber-400/10 border-amber-400/20",
  PATCH:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  DELETE: "text-red-400 bg-red-400/10 border-red-400/20",
};

function SubAppDrawer({
  app,
  open,
  onClose,
}: {
  app: SubAppInfo;
  open: boolean;
  onClose: () => void;
}) {
  const { data: openApiSpec, isLoading: specLoading } = useQuery({
    queryKey: [`/api/apps/${app.name}/openapi`],
    queryFn: async () => {
      const res = await fetch(`/api/apps/${app.name}/openapi`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Merge static endpoints with any extras from the OpenAPI spec
  const staticEndpoints = app.endpoints || [];
  const specEndpoints: Array<{ method: string; path: string; summary?: string }> = [];
  if (openApiSpec?.paths) {
    for (const [path, methods] of Object.entries(openApiSpec.paths as Record<string, Record<string, { summary?: string }>>)) {
      for (const [method, details] of Object.entries(methods)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          specEndpoints.push({ method: method.toUpperCase(), path, summary: details.summary });
        }
      }
    }
  }
  const displayEndpoints = specEndpoints.length > 0
    ? specEndpoints
    : staticEndpoints.map(e => ({ method: e.method, path: e.path, summary: e.description }));

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="bg-card border-white/10 max-h-[85vh]" data-testid={`drawer-app-${app.name}`}>
        <DrawerHeader className="border-b border-white/5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <DrawerTitle className="font-display text-lg">{app.label}</DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground mt-0.5">
                Gateway: /api/apps/{app.name}/proxy/* · port {app.port}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid={`btn-close-drawer-${app.name}`}>
                Close
              </Button>
            </DrawerClose>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <SubAppStatusBadge status={app.status} latencyMs={app.latencyMs} />
            <div className="flex flex-wrap gap-1.5">
              {app.tags.slice(0, 4).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs border-white/10 bg-white/5">{tag}</Badge>
              ))}
            </div>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto p-6 space-y-5">
          <p className="text-muted-foreground text-sm leading-relaxed">{app.description}</p>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">API Endpoints</h4>
              {specLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            {displayEndpoints.length > 0 ? (
              <div className="space-y-2" data-testid={`list-endpoints-${app.name}`}>
                {displayEndpoints.map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg p-2.5 border border-white/5">
                    <span className={`font-mono text-xs px-2 py-0.5 rounded border font-bold shrink-0 ${METHOD_COLORS[ep.method] || "text-muted-foreground bg-white/5 border-white/10"}`}>
                      {ep.method}
                    </span>
                    <code className="text-xs text-foreground/80 font-mono flex-1 truncate">{ep.path}</code>
                    {"summary" in ep && ep.summary && (
                      <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[200px]">{ep.summary}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : !specLoading ? (
              <div className="text-xs text-muted-foreground bg-black/20 rounded-lg p-4 border border-white/5">
                OpenAPI spec unavailable — service may be offline or not yet running.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="sm" asChild className="gap-2" data-testid={`btn-open-app-${app.name}`}>
              <a href={app.baseUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Open App
              </a>
            </Button>
            {app.githubUrl && (
              <Button variant="outline" size="sm" asChild className="gap-2 border-white/10 hover:bg-white/5" data-testid={`btn-github-${app.name}`}>
                <a href={app.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild className="gap-2 border-white/10 hover:bg-white/5" data-testid={`btn-raw-openapi-${app.name}`}>
              <a href={`${app.baseUrl}${app.openApiPath}`} target="_blank" rel="noopener noreferrer">
                <BookOpen className="w-3.5 h-3.5" /> OpenAPI Spec
              </a>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function ProjectShowcase() {
  useRealtimeProjects();

  const [drawerApp, setDrawerApp] = useState<SubAppInfo | null>(null);

  // Parallel fetch of projects + sub-app registry
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const { data: subApps } = useQuery<SubAppInfo[]>({
    queryKey: ["/api/apps"],
    queryFn: async () => {
      const res = await fetch("/api/apps");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const activeProjects = projects?.filter(p => p.published) || [];
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentTab = activeTab || activeProjects[0]?.id || "";

  if (projectsLoading) {
    return (
      <section id="portfolio" className="py-24 relative">
        <div className="container mx-auto px-4 md:px-6 flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </section>
    );
  }

  if (activeProjects.length === 0) {
    return (
      <section id="portfolio" className="py-24 relative">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-4 text-primary border-primary/20 bg-primary/5">Production-Ready Containers</Badge>
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Interactive Deliverables.</h2>
            <p className="text-muted-foreground text-lg">
              No projects published yet. Use the API to push your first containerized application.
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto">
            <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Quick Start</div>
            <div className="bg-black/50 rounded-lg p-4 font-mono text-sm border border-white/5 space-y-2">
              <div className="text-green-400"><span className="text-white/50">$</span> curl -X POST /api/projects \</div>
              <div className="text-green-400 pl-4">-H "Content-Type: application/json" \</div>
              <div className="text-green-400 pl-4">-d '{`{"name":"My Service","description":"...","type":"API","tags":["Node.js"]}`}'</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id="portfolio" className="py-24 relative">
        <div className="container mx-auto px-4 md:px-6">
          
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-4 text-primary border-primary/20 bg-primary/5">Production-Ready Containers</Badge>
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Interactive Deliverables.</h2>
            <p className="text-muted-foreground text-lg">
              Browse our portfolio of standalone microservices. Each project is containerized, fully documented, and ready to be downloaded or run locally in your environment.
            </p>
          </div>

          <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto hide-scrollbar mb-12">
              <TabsList className="bg-card/50 border border-white/5 p-1 h-auto rounded-full w-max mx-auto flex-nowrap">
                {activeProjects.map(p => (
                  <TabsTrigger 
                    key={p.id} 
                    value={p.id}
                    className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium"
                    data-testid={`tab-project-${p.id}`}
                  >
                    {p.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {activeProjects.map(project => {
              const linkedApp = subApps ? matchProjectToSubApp(project, subApps) : null;

              return (
                <TabsContent key={project.id} value={project.id} className="mt-0 outline-none">
                  <div className="glass-panel rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 animate-in fade-in zoom-in-95 duration-500">
                    
                    {/* Visual Side */}
                    <div className="relative min-h-[300px] lg:min-h-full bg-secondary/30 border-r border-white/5 p-8 flex items-center justify-center group">
                      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent z-0"></div>
                      
                      <div className="relative z-10 w-full rounded-xl overflow-hidden shadow-2xl border border-white/10 group-hover:scale-[1.02] transition-transform duration-500">
                        <div className="bg-card border-b border-white/10 px-4 py-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                          <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                          <span className="ml-2 text-xs font-mono text-muted-foreground flex items-center gap-2"><Box className="w-3 h-3"/> nexus/{project.id.slice(0, 8)}</span>
                        </div>
                        {project.imageUrl ? (
                          <img src={project.imageUrl} alt={project.name} className="w-full h-auto object-cover" />
                        ) : (
                          <div className="w-full h-48 bg-gradient-to-br from-primary/10 via-accent/10 to-background flex items-center justify-center">
                            <span className="font-mono text-4xl text-primary/30">{`{ }`}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Details Side */}
                    <div className="p-8 lg:p-12 flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{project.type}</Badge>
                        <div className="flex items-center text-xs text-green-400 font-mono">
                          <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
                          {project.status === "active" ? "Ready to deploy" : project.status}
                        </div>
                        {linkedApp && (
                          <SubAppStatusBadge status={linkedApp.status} latencyMs={linkedApp.latencyMs} />
                        )}
                      </div>
                      
                      <h3 className="text-2xl lg:text-3xl font-display font-bold mb-4" data-testid={`text-project-name-${project.id}`}>{project.name}</h3>
                      <p className="text-muted-foreground mb-8 leading-relaxed">
                        {project.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-8">
                        {(project.tags || []).map(tag => (
                          <Badge key={tag} variant="outline" className="border-white/10 bg-white/5 text-foreground/80">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-auto space-y-6">
                        {(project.runCommand || project.testCommand || project.usageInstructions) && (
                          <div className="bg-black/50 rounded-lg p-4 font-mono text-sm border border-white/5">
                            <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">Usage Instructions</div>
                            {project.usageInstructions && (
                              <div className="text-foreground/70 text-xs mb-3 whitespace-pre-wrap">{project.usageInstructions}</div>
                            )}
                            {project.runCommand && (
                              <div className="text-green-400 flex items-center gap-2 mb-2">
                                <span className="text-white/50">$</span> {project.runCommand}
                              </div>
                            )}
                            {project.testCommand && (
                              <div className="text-primary flex items-center gap-2">
                                <span className="text-white/50">$</span> {project.testCommand}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                          {/* Sub-app integration buttons — shown when project is linked to a sub-app */}
                          {linkedApp && (
                            <>
                              <Button
                                size="sm"
                                className="gap-2"
                                onClick={() => setDrawerApp(linkedApp)}
                                data-testid={`btn-api-docs-${project.id}`}
                              >
                                <BookOpen className="w-3.5 h-3.5" /> API Docs
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 border-white/10 hover:bg-white/5"
                                asChild
                                data-testid={`btn-open-app-${project.id}`}
                              >
                                <a href={linkedApp.baseUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3.5 h-3.5" /> Open App
                                </a>
                              </Button>
                            </>
                          )}

                          {/* Standard sandbox / download buttons */}
                          {project.sandboxUrl && (
                            <Button className="gap-2" size="sm" asChild data-testid={`btn-sandbox-${project.id}`}>
                              <a href={project.sandboxUrl} target="_blank" rel="noopener noreferrer">
                                <Play className="w-3.5 h-3.5" /> Live Sandbox
                              </a>
                            </Button>
                          )}
                          {project.downloadUrl && (
                            <Button variant="outline" size="sm" className="gap-2 border-white/10 hover:bg-white/5" asChild data-testid={`btn-download-${project.id}`}>
                              <a href={project.downloadUrl} download>
                                <Download className="w-3.5 h-3.5" /> Download
                              </a>
                            </Button>
                          )}
                          {!linkedApp && !project.sandboxUrl && !project.downloadUrl && (
                            <>
                              <Button size="lg" disabled className="flex-1 md:flex-none">
                                <Play className="w-4 h-4 mr-2" /> Live Sandbox
                              </Button>
                              <Button variant="outline" size="lg" className="flex-1 md:flex-none border-white/10" disabled>
                                <Download className="w-4 h-4 mr-2" /> Download Bundle
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 hover:bg-white/5 rounded-full border border-transparent hover:border-white/10"
                            asChild
                            data-testid={`btn-github-${project.id}`}
                          >
                            <a href={project.githubUrl || (linkedApp?.githubUrl ?? "#")} target="_blank" rel="noopener noreferrer">
                              <Github className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                      
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </section>

      {/* API Docs drawer for linked sub-app */}
      {drawerApp && (
        <SubAppDrawer
          app={drawerApp}
          open={!!drawerApp}
          onClose={() => setDrawerApp(null)}
        />
      )}
    </>
  );
}
