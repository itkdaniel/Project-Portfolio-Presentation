import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Bot, Code, Database, Server, Terminal, Sparkles, Send } from "lucide-react";
import heroBg from "@/assets/images/hero-bg.png";

export function Hero() {
  const [inquiry, setInquiry] = useState("");
  const [chatResponse, setChatResponse] = useState<{role: 'user' | 'bot', text: string} | null>(null);

  const handleSimulateInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiry) return;
    
    setChatResponse({ role: 'user', text: inquiry });
    
    // Simulate automated response
    setTimeout(() => {
      setChatResponse({ 
        role: 'bot', 
        text: "Analyzing request... I've identified your need as a 'Microservice Architecture Upgrade'. A containerized cluster with load balancing would reduce latency by 40%. Would you like me to provision a demo environment?" 
      });
      setInquiry("");
    }, 1200);
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
                <Sparkles className="w-3 h-3 mr-2" /> Automated Consulting Infrastructure
              </Badge>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-[1.1]">
              Architecting <span className="text-gradient">End-to-End</span> Solutions.
            </h1>
            
            <p className="text-lg text-muted-foreground md:text-xl leading-relaxed">
              We design and deploy scalable microservices, intelligent CRUD APIs, and containerized applications. Stop managing infrastructure, start scaling your product.
            </p>
            
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <Button size="lg" className="rounded-full h-14 px-8 text-base shadow-[0_0_20px_rgba(59,130,246,0.3)] group">
                View Deployments
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full h-14 px-8 text-base bg-card/50 backdrop-blur-sm border-white/10 hover:bg-white/5">
                <Terminal className="mr-2 w-5 h-5" />
                API Documentation
              </Button>
            </div>

            <div className="flex items-center gap-6 mt-8 text-sm font-mono text-muted-foreground border-t border-white/5 pt-8">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" /> Containerized
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" /> Scalable DBs
              </div>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-green-400" /> REST/GraphQL
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Automation Demo */}
          <div className="relative w-full max-w-lg mx-auto lg:ml-auto">
            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-[60px]"></div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/20 rounded-full blur-[60px]"></div>
            
            <div className="glass-panel rounded-2xl overflow-hidden relative z-10 flex flex-col h-[450px]">
              {/* Header */}
              <div className="bg-card border-b border-white/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-medium text-sm">Nexus AI Architect</h3>
                    <p className="text-xs text-green-400 font-mono">Online • Awaiting specs</p>
                  </div>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                <div className="bg-secondary/50 border border-white/5 rounded-2xl rounded-tl-sm p-4 max-w-[85%] self-start text-sm text-muted-foreground">
                  <p className="text-foreground mb-2 font-medium">System ready.</p>
                  Describe your project requirements, and I will instantly architect a microservice solution, outline the database schema, and generate the API endpoints.
                </div>

                {chatResponse?.role === 'user' && (
                  <div className="bg-primary/20 border border-primary/30 rounded-2xl rounded-tr-sm p-4 max-w-[85%] self-end text-sm text-primary-foreground animate-in slide-in-from-right-4 fade-in duration-300">
                    {chatResponse.text}
                  </div>
                )}

                {chatResponse?.role === 'bot' && (
                  <div className="bg-secondary/50 border border-white/5 rounded-2xl rounded-tl-sm p-4 max-w-[85%] self-start text-sm text-foreground animate-in slide-in-from-left-4 fade-in duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <Cpu className="w-4 h-4 text-primary" />
                      <span className="font-mono text-xs text-primary">ANALYSIS_COMPLETE</span>
                    </div>
                    {chatResponse.text}
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" className="h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border-0">Deploy Demo</Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs bg-transparent border-white/10">View Schema</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-card/50 border-t border-white/5 backdrop-blur-md">
                <form onSubmit={handleSimulateInquiry} className="relative">
                  <Input 
                    placeholder="e.g. I need a scalable user authentication system..." 
                    className="pr-12 bg-background/50 border-white/10 focus-visible:ring-primary focus-visible:border-primary h-12"
                    value={inquiry}
                    onChange={(e) => setInquiry(e.target.value)}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="absolute right-1.5 top-1.5 h-9 w-9 rounded-md bg-primary hover:bg-primary/90"
                    disabled={!inquiry}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
}