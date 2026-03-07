import { Server, Database, Code2, Repeat, ShieldCheck, Zap } from "lucide-react";

const SERVICES = [
  {
    title: "Microservice Architecture",
    description: "Decoupled, scalable services that communicate seamlessly. We architect systems that grow with your user base without becoming monolithic nightmares.",
    icon: <Server className="w-6 h-6 text-primary" />
  },
  {
    title: "Robust CRUD APIs",
    description: "RESTful and GraphQL interfaces designed with intuitive developer experiences, comprehensive documentation, and strict type safety.",
    icon: <Code2 className="w-6 h-6 text-accent" />
  },
  {
    title: "Database Design",
    description: "Optimized relational (PostgreSQL) and NoSQL schemas. We handle indexing, migrations, and query optimization for high-performance data retrieval.",
    icon: <Database className="w-6 h-6 text-blue-400" />
  },
  {
    title: "Workflow Automation",
    description: "Instant response systems for customer inquiries. We build intelligent agents that resolve common issues by interfacing directly with your internal APIs.",
    icon: <Repeat className="w-6 h-6 text-green-400" />
  },
  {
    title: "Secure Infrastructure",
    description: "Enterprise-grade security implementations including zero-trust networking, RBAC, encrypted payloads, and automated vulnerability scanning.",
    icon: <ShieldCheck className="w-6 h-6 text-orange-400" />
  },
  {
    title: "High-Performance Edge",
    description: "Deployments localized globally via edge networks. Ensure your application responds in milliseconds regardless of where your clients are located.",
    icon: <Zap className="w-6 h-6 text-yellow-400" />
  }
];

export function Services() {
  return (
    <section id="services" className="py-24 bg-card/30 relative">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/5 blur-[120px] pointer-events-none rounded-full"></div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-12 items-end justify-between mb-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Expertise & <span className="text-gradient">Capabilities</span>.</h2>
            <p className="text-muted-foreground text-lg">
              We specialize in the complex technical foundation that powers modern digital products. We don't just build apps; we engineer resilient systems.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((service, index) => (
            <div 
              key={index}
              className="glass-panel glass-panel-hover p-8 rounded-2xl group flex flex-col"
            >
              <div className="w-14 h-14 rounded-xl bg-background border border-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                {service.icon}
              </div>
              <h3 className="text-xl font-display font-bold mb-3">{service.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}