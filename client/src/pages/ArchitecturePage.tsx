import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { Badge } from "@/components/ui/badge";
import { Database, GitBranch, Server, Box, Network } from "lucide-react";

// ── Mermaid diagram definitions ───────────────────────────────────────────────

const DIAGRAMS = {
  coreUsers: `erDiagram
    users {
      varchar id PK
      text username
      text email
      text password
      text role
      int corp_role_id FK
      text full_name
      text profile_picture_url
      timestamp created_at
    }
    corp_roles {
      int id PK
      text name
      text display_name
      int level
      text data_rating
    }
    data_ratings {
      int id PK
      text code
      text name
      text description
    }
    user_settings {
      int id PK
      varchar user_id FK
      text theme
      boolean email_notifications
      text timezone
      timestamp updated_at
    }
    resumes {
      int id PK
      varchar user_id FK
      jsonb sections
      text file_url
      text active_view
    }
    users }o--|| corp_roles : "has"
    users ||--o| user_settings : "configures"
    users ||--o| resumes : "owns"`,

  coreContent: `erDiagram
    projects {
      varchar id PK
      text name
      text description
      text type
      boolean published
      boolean featured
      text status
      timestamp created_at
    }
    bookings {
      varchar id PK
      text name
      text email
      text meeting_type
      text date
      text time
      text status
      timestamp created_at
    }
    inquiries {
      varchar id PK
      text message
      text response
      boolean resolved
      timestamp created_at
    }
    email_config {
      int id PK
      text smtp_host
      int smtp_port
      text from_email
      boolean enabled
      timestamp updated_at
    }`,

  notifications: `erDiagram
    notifications {
      varchar id PK
      varchar user_id FK
      text type
      text title
      text body
      boolean read
      text link
      timestamp created_at
    }
    user_notification_prefs {
      int id PK
      varchar user_id FK
      boolean in_app
      boolean email
      boolean sms
      text sms_phone
    }
    scope_requests {
      varchar id PK
      varchar user_id FK
      text scope_name
      text reason
      text status
      text admin_note
      timestamp created_at
    }
    granted_scopes {
      varchar id PK
      varchar user_id FK
      text scope
      varchar granted_by FK
      timestamp granted_at
      timestamp expires_at
      timestamp revoked_at
    }
    users ||--o{ notifications : "receives"
    users ||--o| user_notification_prefs : "prefs"
    users ||--o{ scope_requests : "submits"
    users ||--o{ granted_scopes : "holds"`,

  taxSystem: `erDiagram
    tax_periods {
      int id PK
      int tax_year
      text filing_deadline
      text status
    }
    federal_forms {
      int id PK
      text form_number
      text title
      text category
      text who_files
      boolean is_active
    }
    state_forms {
      int id PK
      text state_code
      text form_number
      text title
      text category
    }
    tax_brackets {
      int id PK
      int tax_year
      text filing_status
      float rate
      numeric income_from
      numeric income_to
    }
    standard_deductions {
      int id PK
      int tax_year
      text filing_status
      numeric base_amount
    }
    tax_questions {
      int id PK
      text question_key
      text category
      text input_type
      int sort_order
    }
    form_requirement_rules {
      int id PK
      text question_key
      text question_value
      text form_number
      text priority
    }
    questionnaire_sessions {
      varchar id PK
      int tax_year
      text session_token
      jsonb answers
      text status
    }`,

  scraperGraph: `erDiagram
    entity_types {
      int id PK
      text name
      text color
      text description
    }
    entities {
      varchar id PK
      text type FK
      text title
      text summary
      text source_url
      float confidence
      float trend_score
      timestamp scraped_at
    }
    entity_relations {
      int id PK
      varchar from_entity_id FK
      varchar to_entity_id FK
      text relation_type
      float weight
    }
    scrape_jobs {
      varchar id PK
      text target_url
      text status
      int entity_count
      timestamp started_at
      timestamp completed_at
    }
    scrape_sources {
      int id PK
      text name
      text type
      jsonb config_json
      boolean is_active
    }
    entities }o--|| entity_types : "classified as"
    entity_relations }o--|| entities : "from"
    entity_relations }o--|| entities : "to"`,

  systemFlow: `flowchart TD
    Browser["🌐 Browser / CLI Client"]
    Nginx["⚙️ Nginx :80/:443\\nReverse Proxy + TLS"]
    Express["🟢 Express.js :5000\\nMain API + SPA + WebSocket"]
    PG[("🐘 PostgreSQL\\nPrimary Database")]
    Redis[("🔴 Redis\\nCache + Pub/Sub")]

    Booking["📅 Nexus Booking\\n:8003 FastAPI"]
    Tax["📄 Nexus Tax\\n:8004 FastAPI"]
    Search["🔍 Nexus Search\\n:8002 FastAPI + BM25"]
    AI["🤖 Nexus AI\\n:8001 PyTorch"]
    Scraper["🕷️ Nexus Scraper\\n:8005 FastAPI"]
    Graph["🕸️ Nexus Graph\\n:8006 FastAPI + igraph"]
    Crypto["₿ NexusCrypto\\n:8100 Next.js Gateway"]

    Browser --> Nginx
    Nginx --> Express
    Express --> PG
    Express --> Redis
    Express -. "gateway\\nproxy" .-> Booking
    Express -. "gateway\\nproxy" .-> Tax
    Express -. "gateway\\nproxy" .-> Search
    Express -. "gateway\\nproxy" .-> AI
    Express -. "gateway\\nproxy" .-> Scraper
    Express -. "gateway\\nproxy" .-> Graph
    Express -. "gateway\\nproxy" .-> Crypto
    Search --> Redis
    Scraper --> Redis
    Scraper --> PG
    Graph --> PG

    style Express fill:#1d4ed8,stroke:#3b82f6
    style PG fill:#0f4c75,stroke:#1e90ff
    style Redis fill:#7f1d1d,stroke:#ef4444
    style Nginx fill:#1e293b,stroke:#475569`,

  cryptoFlow: `flowchart LR
    Gateway["₿ NexusCrypto\\n:8100 Gateway"]
    Market["📈 Crypto Market\\n:8101 OHLCV + WS"]
    Wallet["👜 Crypto Wallet\\n:8102 HD Wallet"]
    DEX["⚖️ Crypto DEX\\n:8103 AMM + Orders"]
    Analytics["📊 Crypto Analytics\\n:8104 P&L + Sharpe"]
    Feeds["🌐 Exchange Feeds\\nWebSocket Streams"]
    Chain["⛓️ EVM / UTXO\\nBlockchain RPC"]
    Contracts["📜 Smart Contracts\\nSolidity Proxies"]

    Gateway --> Market
    Gateway --> Wallet
    Gateway --> DEX
    Gateway --> Analytics
    Feeds --> Market
    Chain --> Wallet
    Chain --> DEX
    Contracts --> DEX
    Analytics --> Market
    Analytics --> Wallet`,

  infraStack: `flowchart TD
    GH["🐙 GitHub Actions CI/CD"]
    GHCR["📦 GHCR Container Registry"]
    K8s["☸️ Kubernetes Cluster"]
    HPA["⚖️ HPA Auto-scaler"]
    NS["📁 nexusconsult Namespace"]
    Ingress["🚪 K8s Ingress Controller"]

    GH -- "build + push" --> GHCR
    GH -- "kubectl apply" --> K8s
    K8s --> NS
    NS --> Ingress
    NS --> HPA
    HPA -- "scales" --> NS

    style GH fill:#24292e,stroke:#6e7681
    style K8s fill:#326ce5,stroke:#1a56db
    style GHCR fill:#1f2937,stroke:#374151`,
};

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = "db-schema" | "system" | "infrastructure";

interface DiagramCard {
  title: string;
  description: string;
  code: string;
}

const DB_GROUPS: DiagramCard[] = [
  {
    title: "Users & Identity",
    description: "User accounts, corporate role hierarchy (8 levels), data rating access tiers, per-user settings, and résumé storage.",
    code: DIAGRAMS.coreUsers,
  },
  {
    title: "Projects, Bookings & Inquiries",
    description: "Portfolio projects, step-based consultation bookings, contact inquiries, and SMTP email configuration.",
    code: DIAGRAMS.coreContent,
  },
  {
    title: "Notifications & Scope Approval",
    description: "In-app notifications, per-channel delivery preferences, AI scope request workflow, and granted access scopes with expiry.",
    code: DIAGRAMS.notifications,
  },
  {
    title: "Tax Assistant System",
    description: "Tax year periods, IRS federal and state forms, bracket tables, standard deductions, questionnaire engine, and form recommendation rules.",
    code: DIAGRAMS.taxSystem,
  },
  {
    title: "Scraper & Knowledge Graph",
    description: "Entity type taxonomy, NLP-classified scraped entities with embeddings, directed weighted knowledge graph edges, and scrape job lifecycle tracking.",
    code: DIAGRAMS.scraperGraph,
  },
];

const SYSTEM_CARDS: DiagramCard[] = [
  {
    title: "System Architecture",
    description: "Nginx reverse proxy routes traffic to Express.js (main app + gateway) and all microservices. Express proxies sub-app requests via the API gateway layer.",
    code: DIAGRAMS.systemFlow,
  },
  {
    title: "NexusCrypto Ecosystem",
    description: "NexusCrypto gateway unifies market data feeds, HD wallet management, AMM/DEX trading, and portfolio analytics into a single platform.",
    code: DIAGRAMS.cryptoFlow,
  },
];

const INFRA_CARDS: DiagramCard[] = [
  {
    title: "CI/CD & Kubernetes",
    description: "GitHub Actions builds and pushes images to GHCR, then deploys to a Kubernetes cluster with HPA auto-scaling and an Ingress controller.",
    code: DIAGRAMS.infraStack,
  },
];

// ── Infrastructure static info ────────────────────────────────────────────────

const INFRA_SERVICES = [
  { name: "Nginx",        desc: "Reverse proxy, load balancing, WS upgrade, TLS termination",         color: "text-green-400",  icon: <Network className="w-4 h-4" /> },
  { name: "Docker",       desc: "Multi-stage production Dockerfile + dev hot-reload variant",          color: "text-blue-400",   icon: <Box className="w-4 h-4" /> },
  { name: "PostgreSQL",   desc: "Primary relational database via Drizzle ORM (28 tables)",             color: "text-sky-400",    icon: <Database className="w-4 h-4" /> },
  { name: "Redis",        desc: "BM25 search cache, API response caching, pub/sub for search service", color: "text-red-400",    icon: <Server className="w-4 h-4" /> },
  { name: "Kubernetes",   desc: "Namespace, deployment + HPA per service, Ingress, Secrets",           color: "text-violet-400", icon: <GitBranch className="w-4 h-4" /> },
  { name: "GitHub Actions", desc: "CI: Node tests → Python tests → E2E → Docker build; CD: build → push GHCR → K8s deploy", color: "text-orange-400", icon: <GitBranch className="w-4 h-4" /> },
];

// ── TableSummary ──────────────────────────────────────────────────────────────

const TABLE_GROUPS = [
  { label: "NexusConsult Core", count: 13, color: "bg-blue-500/20 text-blue-300 border-blue-500/30", tables: ["users","corp_roles","data_ratings","user_settings","resumes","projects","bookings","inquiries","email_config","notifications","user_notification_prefs","scope_requests","granted_scopes"] },
  { label: "Tax Assistant",     count: 9,  color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", tables: ["tax_periods","federal_forms","state_forms","tax_brackets","standard_deductions","special_tax_rates","tax_questions","form_requirement_rules","questionnaire_sessions"] },
  { label: "Scraper / Graph",   count: 5,  color: "bg-orange-500/20 text-orange-300 border-orange-500/30", tables: ["entity_types","entities","entity_relations","scrape_jobs","scrape_sources"] },
  { label: "NexusCrypto",       count: 1,  color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", tables: ["Conceptual — managed by NexusCrypto sub-apps"] },
];

// ── DiagramSection ────────────────────────────────────────────────────────────

function DiagramSection({ cards }: { cards: DiagramCard[] }) {
  return (
    <div className="space-y-10">
      {cards.map((card, i) => (
        <div key={i} className="glass-panel rounded-xl border border-white/5 overflow-hidden">
          <div className="p-5 border-b border-white/5 bg-card/50">
            <h3 className="font-display font-semibold text-base">{card.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{card.description}</p>
          </div>
          <div className="p-4 bg-black/20">
            <MermaidDiagram code={card.code} className="min-h-[120px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ArchitecturePage ──────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const [tab, setTab] = useState<Tab>("db-schema");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "db-schema",       label: "Database Schema",    icon: <Database className="w-4 h-4" /> },
    { id: "system",          label: "System Architecture", icon: <Network className="w-4 h-4" /> },
    { id: "infrastructure",  label: "Infrastructure",      icon: <Server className="w-4 h-4" /> },
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
                  <GitBranch className="w-5 h-5 text-primary" />
                  <h1 className="font-display text-2xl font-bold">Architecture</h1>
                </div>
                <p className="text-muted-foreground text-sm max-w-xl">
                  Database schema design, system topology, and infrastructure overview for NexusConsult and all microservices.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TABLE_GROUPS.map(g => (
                  <div key={g.label} className={`px-2.5 py-1 rounded-full text-xs font-mono border ${g.color}`}>
                    {g.label} · {g.count} tables
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6 py-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
                data-testid={`tab-${t.id}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Database Schema tab */}
          {tab === "db-schema" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {TABLE_GROUPS.map(g => (
                  <div key={g.label} className="glass-panel rounded-xl p-4 border border-white/5">
                    <div className={`text-2xl font-display font-bold mb-1 ${g.color.split(" ")[1]}`}>{g.count}</div>
                    <div className="text-xs text-muted-foreground font-medium">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">tables</div>
                  </div>
                ))}
              </div>
              <DiagramSection cards={DB_GROUPS} />

              {/* Table name reference */}
              <div className="glass-panel rounded-xl border border-white/5 p-5">
                <h3 className="font-display font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wider">All 28 Tables</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {TABLE_GROUPS.map(g => (
                    <div key={g.label}>
                      <div className={`text-xs font-semibold mb-2 ${g.color.split(" ")[1]}`}>{g.label}</div>
                      <ul className="space-y-1">
                        {g.tables.map(t => (
                          <li key={t} className="text-xs font-mono text-muted-foreground">{t}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* System Architecture tab */}
          {tab === "system" && (
            <div className="space-y-8">
              <div className="glass-panel rounded-xl border border-white/5 p-5 bg-card/20 mb-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  NexusConsult is a polyglot microservice platform. The central Express.js server acts as the main web application, REST API server, WebSocket hub, and transparent API gateway — proxying requests to 11 standalone sub-app services, each independently deployable.
                </p>
              </div>
              <DiagramSection cards={SYSTEM_CARDS} />

              <div className="glass-panel rounded-xl border border-white/5 p-5">
                <h3 className="font-display font-semibold mb-4">Service Port Registry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {[
                    { port: "5000", name: "Express.js", desc: "Main App + API + WS" },
                    { port: "8001", name: "Nexus AI",    desc: "PyTorch NLP Service" },
                    { port: "8002", name: "Nexus Search",desc: "BM25 + Redis" },
                    { port: "8003", name: "Nexus Booking",desc: "Scheduling" },
                    { port: "8004", name: "Nexus Tax",   desc: "IRS Forms" },
                    { port: "8005", name: "Nexus Scraper",desc: "Entity Crawler" },
                    { port: "8006", name: "Nexus Graph", desc: "Knowledge Graph" },
                    { port: "8100", name: "NexusCrypto", desc: "Crypto Gateway" },
                    { port: "8101", name: "Crypto Market",desc: "OHLCV + Tickers" },
                    { port: "8102", name: "Crypto Wallet",desc: "HD Wallet / Web3" },
                    { port: "8103", name: "Crypto DEX",  desc: "AMM + Orders" },
                    { port: "8104", name: "Crypto Analytics",desc: "P&L / Sharpe" },
                  ].map(s => (
                    <div key={s.port} className="bg-black/20 rounded-lg p-3 border border-white/5">
                      <code className="text-primary text-xs font-mono font-bold">:{s.port}</code>
                      <div className="font-medium text-sm mt-0.5">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Infrastructure tab */}
          {tab === "infrastructure" && (
            <div className="space-y-8">
              <div className="grid md:grid-cols-3 gap-4">
                {INFRA_SERVICES.map(s => (
                  <div key={s.name} className="glass-panel rounded-xl border border-white/5 p-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${s.color}`}>{s.icon}</div>
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <DiagramSection cards={INFRA_CARDS} />

              {/* Docker compose files */}
              <div className="glass-panel rounded-xl border border-white/5 p-5">
                <h3 className="font-display font-semibold mb-4">Compose & K8s Files</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  {[
                    { file: "docker-compose.yml",        desc: "Production: postgres, redis, mongo, nginx, web, python-service, ai-service" },
                    { file: "docker-compose.dev.yml",    desc: "Dev override: volume mounts + hot-reload for all services" },
                    { file: "Dockerfile",                desc: "Multi-stage production build — deps → build → runtime" },
                    { file: "Dockerfile.dev",            desc: "Dev image with tsx watch + Python reload" },
                    { file: "k8s/web-deployment.yaml",   desc: "Web deployment + HPA (min 2 / max 10 replicas)" },
                    { file: "k8s/ingress.yaml",          desc: "Ingress with TLS termination and path routing" },
                    { file: "k8s/secrets.yaml",          desc: "Kubernetes Secret for DB credentials + JWT key" },
                    { file: "nginx/nginx.conf",          desc: "Upstream round-robin, WS upgrade, security headers" },
                  ].map(f => (
                    <div key={f.file} className="flex gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                      <code className="text-primary text-xs font-mono shrink-0 pt-0.5">{f.file}</code>
                      <span className="text-xs text-muted-foreground">{f.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GitHub Actions */}
              <div className="glass-panel rounded-xl border border-white/5 p-5">
                <h3 className="font-display font-semibold mb-4">GitHub Actions Workflows</h3>
                <div className="space-y-3">
                  {[
                    { file: ".github/workflows/ci.yml",     steps: ["Node unit + integration tests","Python service tests","Playwright E2E browser tests","Docker image build validation"] },
                    { file: ".github/workflows/deploy.yml", steps: ["Build Docker image","Push to GitHub Container Registry (GHCR)","kubectl apply to K8s cluster","Slack deployment notification"] },
                  ].map(w => (
                    <div key={w.file} className="p-4 bg-black/20 rounded-lg border border-white/5">
                      <code className="text-sm font-mono text-primary">{w.file}</code>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {w.steps.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-white/10 bg-white/5">{i + 1}. {s}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
