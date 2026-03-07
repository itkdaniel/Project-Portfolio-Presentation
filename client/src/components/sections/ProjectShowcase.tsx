import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, TerminalSquare, Github, Box, Database, ExternalLink, Cpu } from "lucide-react";

// Import mocked assets
import projectApi from "@/assets/images/project-api.png";
import projectDb from "@/assets/images/project-db.png";
import projectEcom from "@/assets/images/project-ecom.png";

const PROJECTS = [
  {
    id: "auth-service",
    name: "Identity Microservice",
    description: "A standalone JWT-based authentication service. Features rate-limiting, OAuth2 integration, and role-based access control (RBAC). Designed to be plugged into any frontend framework.",
    image: projectApi,
    tags: ["Node.js", "Redis", "PostgreSQL", "Docker"],
    type: "API",
    commands: {
      run: "docker run -p 8080:8080 nexus/auth-service:latest",
      test: "curl -X POST http://localhost:8080/api/v1/auth/token"
    }
  },
  {
    id: "data-pipeline",
    name: "Real-time Analytics Engine",
    description: "Event-driven architecture for processing high-volume analytics data. Uses WebSockets for real-time dashboard updates and timeseries databases for historical querying.",
    image: projectDb,
    tags: ["Go", "Kafka", "ClickHouse", "React"],
    type: "Infrastructure",
    commands: {
      run: "docker-compose up -d analytics-cluster",
      test: "wscat -c ws://localhost:9000/stream"
    }
  },
  {
    id: "ecom-core",
    name: "Headless Commerce Core",
    description: "End-to-end e-commerce backend exposing a GraphQL API. Manages inventory, complex pricing rules, and integrates with Stripe for secure checkout processing.",
    image: projectEcom,
    tags: ["TypeScript", "GraphQL", "Prisma", "Stripe API"],
    type: "Fullstack",
    commands: {
      run: "npm run start:services",
      test: "apollo client:check"
    }
  }
];

export function ProjectShowcase() {
  const [activeProject, setActiveProject] = useState(PROJECTS[0].id);

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

        <Tabs defaultValue={PROJECTS[0].id} onValueChange={setActiveProject} className="w-full">
          <div className="flex justify-center mb-12">
            <TabsList className="bg-card/50 border border-white/5 p-1 h-auto rounded-full max-w-full overflow-x-auto flex-nowrap hide-scrollbar">
              {PROJECTS.map(p => (
                <TabsTrigger 
                  key={p.id} 
                  value={p.id}
                  className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium"
                >
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {PROJECTS.map(project => (
            <TabsContent key={project.id} value={project.id} className="mt-0 outline-none">
              <div className="glass-panel rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 animate-in fade-in zoom-in-95 duration-500">
                
                {/* Visual Side */}
                <div className="relative min-h-[300px] lg:min-h-full bg-secondary/30 border-r border-white/5 p-8 flex items-center justify-center group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent z-0"></div>
                  
                  {/* Container Mockup */}
                  <div className="relative z-10 w-full rounded-xl overflow-hidden shadow-2xl border border-white/10 group-hover:scale-[1.02] transition-transform duration-500">
                    <div className="bg-card border-b border-white/10 px-4 py-2 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                      <span className="ml-2 text-xs font-mono text-muted-foreground flex items-center gap-2"><Box className="w-3 h-3"/> nexus/{project.id}</span>
                    </div>
                    <img src={project.image} alt={project.name} className="w-full h-auto object-cover" />
                  </div>
                </div>

                {/* Details Side */}
                <div className="p-8 lg:p-12 flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{project.type}</Badge>
                    <div className="flex items-center text-xs text-green-400 font-mono">
                      <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
                      Ready to deploy
                    </div>
                  </div>
                  
                  <h3 className="text-2xl lg:text-3xl font-display font-bold mb-4">{project.name}</h3>
                  <p className="text-muted-foreground mb-8 leading-relaxed">
                    {project.description}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-8">
                    {project.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="border-white/10 bg-white/5 text-foreground/80">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-auto space-y-6">
                    {/* CLI Mockup */}
                    <div className="bg-black/50 rounded-lg p-4 font-mono text-sm border border-white/5">
                      <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider">Usage Instructions</div>
                      <div className="text-green-400 flex items-center gap-2 mb-2">
                        <span className="text-white/50">$</span> {project.commands.run}
                      </div>
                      <div className="text-primary flex items-center gap-2">
                        <span className="text-white/50">$</span> {project.commands.test}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <Button className="flex-1 md:flex-none" size="lg">
                        <Play className="w-4 h-4 mr-2" /> Live Sandbox
                      </Button>
                      <Button variant="outline" className="flex-1 md:flex-none border-white/10 hover:bg-white/5" size="lg">
                        <Download className="w-4 h-4 mr-2" /> Download Bundle
                      </Button>
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