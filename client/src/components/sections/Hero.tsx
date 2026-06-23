import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Server, Database, Code, Terminal, Sparkles, Activity, Play, ActivitySquare } from "lucide-react";
import heroBg from "@/assets/images/hero-bg.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

type LoadBalancerStrategy = 'round-robin' | 'least-connections' | 'ip-hash';

interface ServerNode {
  id: number;
  load: number;
  status: 'healthy' | 'warning' | 'critical';
  requestsProcessed: number;
}

export function Hero() {
  const [strategy, setStrategy] = useState<LoadBalancerStrategy>('round-robin');
  const [isSimulating, setIsSimulating] = useState(false);
  const [trafficRate, setTrafficRate] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [droppedRequests, setDroppedRequests] = useState(0);
  
  const [servers, setServers] = useState<ServerNode[]>([
    { id: 1, load: 0, status: 'healthy', requestsProcessed: 0 },
    { id: 2, load: 0, status: 'healthy', requestsProcessed: 0 },
    { id: 3, load: 0, status: 'healthy', requestsProcessed: 0 },
    { id: 4, load: 0, status: 'healthy', requestsProcessed: 0 },
  ]);

  // Simulation Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isSimulating) {
      // Incoming traffic simulation
      interval = setInterval(() => {
        const incomingBurst = Math.floor(Math.random() * 50) + 10;
        setTrafficRate(incomingBurst * 10); // requests per second calc
        setTotalRequests(prev => prev + incomingBurst);
        
        setServers(currentServers => {
          let nextServers = [...currentServers];
          
          // Apply load based on strategy
          if (strategy === 'round-robin') {
            // Evenly distribute but randomly assign to simulate real world variance
            const baseLoad = incomingBurst / nextServers.length;
            nextServers = nextServers.map(s => {
              const newLoad = Math.min(100, s.load + baseLoad + (Math.random() * 5 - 2));
              return {
                ...s,
                load: newLoad > 0 ? newLoad : 0,
                requestsProcessed: s.requestsProcessed + Math.floor(baseLoad),
                status: newLoad > 85 ? 'critical' : newLoad > 65 ? 'warning' : 'healthy'
              };
            });
          } else if (strategy === 'least-connections') {
            // Find server with least load
            for (let i = 0; i < incomingBurst; i++) {
              const leastLoadedIdx = nextServers.reduce((minIdx, server, idx, arr) => 
                server.load < arr[minIdx].load ? idx : minIdx, 0);
              
              nextServers[leastLoadedIdx].load += 1.5;
              nextServers[leastLoadedIdx].requestsProcessed += 1;
            }
            
            nextServers = nextServers.map(s => ({
              ...s,
              load: Math.min(100, s.load),
              status: s.load > 85 ? 'critical' : s.load > 65 ? 'warning' : 'healthy'
            }));
          } else if (strategy === 'ip-hash') {
            // Simulated "sticky" sessions where 1 or 2 servers get hit hard
            const targetServerIdx = Math.random() > 0.7 ? 0 : 1; 
            const secondaryTargetIdx = 2;
            
            const heavyLoad = incomingBurst * 0.7;
            const lightLoad = incomingBurst * 0.3;
            
            nextServers[targetServerIdx].load += heavyLoad;
            nextServers[targetServerIdx].requestsProcessed += Math.floor(heavyLoad);
            
            nextServers[secondaryTargetIdx].load += lightLoad;
            nextServers[secondaryTargetIdx].requestsProcessed += Math.floor(lightLoad);
            
            nextServers = nextServers.map(s => ({
              ...s,
              load: Math.min(100, s.load),
              status: s.load > 85 ? 'critical' : s.load > 65 ? 'warning' : 'healthy'
            }));
          }

          // Calculate dropped requests
          const dropped = nextServers.reduce((acc, s) => {
            if (s.load >= 100) return acc + Math.floor(Math.random() * 5);
            return acc;
          }, 0);
          
          if (dropped > 0) {
             setDroppedRequests(prev => prev + dropped);
          }

          // Cool down
          return nextServers.map(s => ({
            ...s,
            load: Math.max(0, s.load - (Math.random() * 15 + 5)),
            status: s.load - 10 > 85 ? 'critical' : s.load - 10 > 65 ? 'warning' : 'healthy'
          }));
        });
        
      }, 500);
    } else {
      // Gradual cool down when stopped
      interval = setInterval(() => {
        setTrafficRate(0);
        setServers(current => current.map(s => ({
          ...s,
          load: Math.max(0, s.load - 5),
          status: s.load - 5 > 85 ? 'critical' : s.load - 5 > 65 ? 'warning' : 'healthy'
        })));
      }, 500);
    }

    return () => clearInterval(interval);
  }, [isSimulating, strategy]);

  const toggleSimulation = () => {
    if (!isSimulating) {
      setTotalRequests(0);
      setDroppedRequests(0);
      setServers(servers.map(s => ({ ...s, load: 0, requestsProcessed: 0, status: 'healthy' })));
    }
    setIsSimulating(!isSimulating);
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-green-500';
    }
  };

  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 pb-16 overflow-hidden">
      {/* Background with abstract graphic */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-background/80 z-10"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent z-10"></div>
        <img 
          src={heroBg} 
          alt="Abstract Architecture" 
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
        />
      </div>

      <div className="container relative z-20 mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Copy */}
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 text-xs">
                <Sparkles className="w-3 h-3 mr-2" /> High-Availability Systems
              </Badge>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-[1.1]">
              Architecting <span className="text-gradient">Resilient</span> Solutions.
            </h1>
            
            <p className="text-lg text-muted-foreground md:text-xl leading-relaxed">
              We design and deploy scalable microservices capable of handling massive traffic spikes. Test our load balancing simulation below to see architecture in action.
            </p>
            
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <Button size="lg" className="rounded-full h-14 px-8 text-base shadow-[0_0_20px_rgba(59,130,246,0.3)] group" asChild>
                <a href="/status">
                  View Deployments
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full h-14 px-8 text-base bg-card/50 backdrop-blur-sm border-white/10 hover:bg-white/5" asChild>
                <a href="/docs">
                  <Terminal className="mr-2 w-5 h-5" />
                  API Documentation
                </a>
              </Button>
            </div>

            <div className="flex items-center gap-6 mt-8 text-sm font-mono text-muted-foreground border-t border-white/5 pt-8">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" /> Multi-Region
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" /> Auto-Scaling
              </div>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-green-400" /> Fault Tolerant
              </div>
            </div>
          </div>

          {/* Right Column: Load Balancer Simulation */}
          <div className="relative w-full max-w-lg mx-auto lg:ml-auto">
            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-[60px]"></div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/20 rounded-full blur-[60px]"></div>
            
            <div className="glass-panel rounded-2xl overflow-hidden relative z-10 flex flex-col border-white/10">
              {/* Header / Controls */}
              <div className="bg-card/80 border-b border-white/10 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSimulating ? 'bg-primary/20 animate-pulse' : 'bg-secondary'}`}>
                      <ActivitySquare className={`w-4 h-4 ${isSimulating ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className="font-display font-medium text-sm">Load Balancer Simulation</h3>
                      <p className="text-xs text-muted-foreground font-mono">Test traffic distribution algorithms</p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant={isSimulating ? "destructive" : "default"}
                    onClick={toggleSimulation}
                    className="h-8 gap-2"
                  >
                    {isSimulating ? "Stop Traffic" : <><Play className="w-3 h-3"/> Start Traffic</>}
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Strategy:</span>
                  <Select 
                    value={strategy} 
                    onValueChange={(val: LoadBalancerStrategy) => setStrategy(val)}
                    disabled={isSimulating}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background/50 border-white/10">
                      <SelectValue placeholder="Select Strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round-robin">Round Robin (Sequential)</SelectItem>
                      <SelectItem value="least-connections">Least Connections (Dynamic)</SelectItem>
                      <SelectItem value="ip-hash">IP Hash (Sticky Sessions)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Visualization Area */}
              <div className="p-6 bg-background/50 flex flex-col gap-6">
                
                {/* Traffic Stats */}
                <div className="grid grid-cols-3 gap-4 pb-6 border-b border-white/5">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Incoming</span>
                    <span className="text-xl font-mono text-primary flex items-center gap-2">
                      {trafficRate} <span className="text-xs text-muted-foreground">req/s</span>
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-white/5 pl-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total</span>
                    <span className="text-xl font-mono text-foreground">{totalRequests.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col border-l border-white/5 pl-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Dropped</span>
                    <span className={`text-xl font-mono ${droppedRequests > 0 ? 'text-destructive' : 'text-green-400'}`}>
                      {droppedRequests.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Server Nodes */}
                <div className="space-y-4">
                  {servers.map((server) => (
                    <div key={server.id} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(server.status)} ${isSimulating ? 'animate-pulse' : ''}`}></div>
                          <span className="text-foreground/80">Node-{server.id}</span>
                        </div>
                        <span className="text-muted-foreground">{server.requestsProcessed} reqs | {Math.round(server.load)}% load</span>
                      </div>
                      <Progress 
                        value={server.load} 
                        className="h-1.5 bg-secondary"
                        indicatorClassName={
                          server.status === 'critical' ? 'bg-destructive' : 
                          server.status === 'warning' ? 'bg-yellow-500' : 'bg-primary'
                        }
                      />
                    </div>
                  ))}
                </div>

                {/* Analysis/Insight Box */}
                <div className="mt-2 bg-secondary/30 rounded-lg p-3 border border-white/5 text-xs text-muted-foreground leading-relaxed">
                  {strategy === 'round-robin' && "Round Robin distributes requests sequentially. It's fair but doesn't account for differing server capacities or current load. Notice the relatively even spread."}
                  {strategy === 'least-connections' && "Least Connections routes traffic to the node currently handling the fewest requests. It's highly efficient for preventing any single node from overloading."}
                  {strategy === 'ip-hash' && "IP Hashing ties specific clients to specific nodes. While good for maintaining session state, it risks severe uneven load distribution (hotspots) if one client generates massive traffic."}
                </div>
                
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
}