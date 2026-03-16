import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, Github, Box, Loader2 } from "lucide-react";
import { useRealtimeProjects } from "@/lib/websocket";
import type { Project } from "@shared/schema";

export function ProjectShowcase() {
  useRealtimeProjects();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const activeProjects = projects?.filter(p => p.published) || [];
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentTab = activeTab || activeProjects[0]?.id || "";

  if (isLoading) {
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
          <div className="flex justify-center mb-12">
            <TabsList className="bg-card/50 border border-white/5 p-1 h-auto rounded-full max-w-full overflow-x-auto flex-nowrap hide-scrollbar">
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

          {activeProjects.map(project => (
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

                    <div className="flex flex-wrap items-center gap-4">
                      {project.sandboxUrl && (
                        <Button className="flex-1 md:flex-none" size="lg" asChild>
                          <a href={project.sandboxUrl} target="_blank" rel="noopener noreferrer">
                            <Play className="w-4 h-4 mr-2" /> Live Sandbox
                          </a>
                        </Button>
                      )}
                      {project.downloadUrl && (
                        <Button variant="outline" className="flex-1 md:flex-none border-white/10 hover:bg-white/5" size="lg" asChild>
                          <a href={project.downloadUrl} download>
                            <Download className="w-4 h-4 mr-2" /> Download Bundle
                          </a>
                        </Button>
                      )}
                      {!project.sandboxUrl && !project.downloadUrl && (
                        <>
                          <Button className="flex-1 md:flex-none" size="lg" disabled>
                            <Play className="w-4 h-4 mr-2" /> Live Sandbox
                          </Button>
                          <Button variant="outline" className="flex-1 md:flex-none border-white/10" size="lg" disabled>
                            <Download className="w-4 h-4 mr-2" /> Download Bundle
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="h-11 w-11 hover:bg-white/5 rounded-full border border-transparent hover:border-white/10">
                        <Github className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                  
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}