import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { Badge } from "@/components/ui/badge";
import { Database, GitBranch, Server, Box, Network, ChevronDown, ChevronUp } from "lucide-react";

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

  cryptoConceptual: `erDiagram
    crypto_users {
      varchar id PK
      text email
      text username
      text password_hash
      timestamp created_at
    }
    crypto_wallets {
      varchar id PK
      varchar user_id FK
      text chain
      text address
      text encrypted_key
      timestamp created_at
    }
    market_prices {
      int id PK
      text symbol
      numeric price_usd
      float change_24h
      timestamp updated_at
    }
    dex_pools {
      varchar id PK
      text token_a
      text token_b
      numeric reserve_a
      numeric reserve_b
      float fee_rate
    }
    dex_orders {
      varchar id PK
      varchar user_id FK
      text order_type
      text symbol
      numeric amount
      numeric price
      text status
      timestamp created_at
    }
    portfolio_snapshots {
      varchar id PK
      varchar user_id FK
      jsonb holdings
      numeric total_value_usd
      timestamp captured_at
    }
    crypto_users ||--o{ crypto_wallets : "owns"
    crypto_users ||--o{ dex_orders : "places"
    crypto_users ||--o{ portfolio_snapshots : "has"`,

  systemFlow: `flowchart TD
    Browser["🌐 Browser / CLI"]
    Nginx["⚙️ Nginx :80/:443\\nTLS + Reverse Proxy"]

    subgraph Core ["NexusConsult Core :5000"]
      Express["🟢 Express.js\\nSPA + REST + WS + Gateway"]
      PG[("🐘 PostgreSQL")]
      Redis[("🔴 Redis")]
    end

    subgraph Svcs ["Microservices"]
      AI["🤖 AI :8001\\nPyTorch NLP"]
      Search["🔍 Search :8002\\nBM25 + Cache"]
      Booking["📅 Booking :8003\\nScheduling"]
      Tax["📄 Tax :8004\\nIRS Forms"]
      Scraper["🕷️ Scraper :8005\\nEntity Crawler"]
      Graph["🕸️ Graph :8006\\nKnowledge Graph"]
      Quantum["⚛️ Quantum :8200\\nAzure Quantum"]
    end

    subgraph CryptoNet ["NexusCrypto Ecosystem"]
      CryptoGW["₿ Gateway :8100"]
      Market["📈 Market :8101"]
      Wallet["👜 Wallet :8102"]
      DEX["⚖️ DEX :8103"]
      Analytics["📊 Analytics :8104"]
    end

    Browser -- "HTTP/WS" --> Nginx
    Nginx -- "HTTP" --> Express
    Express -- "SQL" --> PG
    Express -- "cache" --> Redis
    Express -. "proxy HTTP" .-> AI
    Express -. "proxy HTTP" .-> Search
    Express -. "proxy HTTP" .-> Booking
    Express -. "proxy HTTP" .-> Tax
    Express -. "proxy HTTP" .-> Scraper
    Express -. "proxy HTTP" .-> Graph
    Express -. "proxy HTTP" .-> Quantum
    Express -. "proxy HTTP" .-> CryptoGW
    CryptoGW --> Market
    CryptoGW --> Wallet
    CryptoGW --> DEX
    CryptoGW --> Analytics
    Search --> Redis
    Scraper --> Redis

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

  composeStack: `flowchart TD
    nginx["⚙️ nginx\\n:80 / :443"]
    web["🟢 web (Express)\\n:5000"]
    python["🐍 python-service\\n:8002 BM25"]
    ai["🤖 ai-service\\n:8001 PyTorch"]
    booking["📅 booking\\n:8003"]
    tax["📄 tax\\n:8004"]
    scraper["🕷️ scraper\\n:8005"]
    graph["🕸️ graph\\n:8006"]
    crypto["₿ nexus-crypto\\n:8100-8104"]
    quantum["⚛️ quantum\\n:8200"]
    analytics["📊 analytics\\n:8300"]
    pg[("🐘 postgres\\n:5432")]
    redis[("🔴 redis\\n:6379")]
    mongo[("🍃 mongo\\n:27017")]

    nginx --> web
    nginx --> python
    nginx --> ai
    web --> pg
    web --> redis
    python --> redis
    python --> pg
    ai --> pg
    booking --> pg
    tax --> pg
    scraper --> redis
    scraper --> mongo
    graph --> pg
    crypto --> redis
    crypto --> pg
    quantum --> pg
    analytics --> pg

    style nginx fill:#1e293b,stroke:#475569
    style web fill:#1d4ed8,stroke:#3b82f6
    style pg fill:#0f4c75,stroke:#1e90ff
    style redis fill:#7f1d1d,stroke:#ef4444
    style mongo fill:#0f4c1a,stroke:#16a34a`,

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

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "db-schema" | "system" | "infrastructure";

interface DiagramCard { title: string; description: string; code: string }

interface DbGroup {
  id: string;
  label: string;
  tableCount: number;
  badgeColor: string;
  tables: string[];
  diagrams: DiagramCard[];
  note?: string;
}

// ── DB Schema groups (4 collapsible groups) ───────────────────────────────────

const DB_GROUPS: DbGroup[] = [
  {
    id: "core",
    label: "NexusConsult Core",
    tableCount: 13,
    badgeColor: "text-blue-300 bg-blue-500/10 border-blue-500/30",
    tables: ["users","corp_roles","data_ratings","user_settings","resumes","projects","bookings","inquiries","email_config","notifications","user_notification_prefs","scope_requests","granted_scopes"],
    diagrams: [
      { title: "Users & Identity", description: "User accounts, corporate role hierarchy (8 levels), data rating access tiers, per-user settings, and résumé storage.", code: DIAGRAMS.coreUsers },
      { title: "Projects, Bookings & Inquiries", description: "Portfolio projects, step-based consultation bookings, contact inquiries, and SMTP email configuration.", code: DIAGRAMS.coreContent },
      { title: "Notifications & Scope Approval", description: "In-app notifications, per-channel delivery preferences (in-app/email/SMS), AI scope request workflow, and granted access scopes with expiry.", code: DIAGRAMS.notifications },
    ],
  },
  {
    id: "tax",
    label: "Tax Assistant System",
    tableCount: 9,
    badgeColor: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    tables: ["tax_periods","federal_forms","state_forms","tax_brackets","standard_deductions","special_tax_rates","tax_questions","form_requirement_rules","questionnaire_sessions"],
    diagrams: [
      { title: "Tax System Schema", description: "Tax year periods, IRS federal and state forms, bracket tables, standard deductions, questionnaire engine, and form recommendation rules.", code: DIAGRAMS.taxSystem },
    ],
  },
  {
    id: "scraper",
    label: "Scraper / Knowledge Graph",
    tableCount: 5,
    badgeColor: "text-orange-300 bg-orange-500/10 border-orange-500/30",
    tables: ["entity_types","entities","entity_relations","scrape_jobs","scrape_sources"],
    diagrams: [
      { title: "Scraper & Graph Schema", description: "Entity type taxonomy, NLP-classified scraped entities with embeddings, directed weighted knowledge graph edges, and scrape job lifecycle tracking.", code: DIAGRAMS.scraperGraph },
    ],
  },
  {
    id: "crypto",
    label: "NexusCrypto (Conceptual)",
    tableCount: 6,
    badgeColor: "text-yellow-300 bg-yellow-500/10 border-yellow-500/30",
    tables: ["crypto_users","crypto_wallets","market_prices","dex_pools","dex_orders","portfolio_snapshots"],
    note: "Conceptual schema — actual tables are distributed across NexusCrypto sub-apps (ports 8100–8104), each with their own independent database.",
    diagrams: [
      { title: "NexusCrypto Conceptual Schema", description: "Conceptual data model for the NexusCrypto ecosystem: user accounts, HD wallets, live market prices, DEX liquidity pools and orders, and portfolio snapshots.", code: DIAGRAMS.cryptoConceptual },
    ],
  },
];

const SYSTEM_CARDS: DiagramCard[] = [
  { title: "System Architecture — All 13 Services", description: "Nginx reverse proxy → Express.js gateway → all 13 standalone sub-app services via HTTP proxy. NexusCrypto sub-apps are grouped under their gateway (ports 8100–8104). Nexus Quantum runs on port 8200. Nexus Analytics on port 8300. Express also manages the PostgreSQL primary DB and Redis cache.", code: DIAGRAMS.systemFlow },
];

const INFRA_CARDS: DiagramCard[] = [
  { title: "Docker Compose Service Topology", description: "All services defined in docker-compose.yml: nginx (reverse proxy), web (Express), python-service (BM25), ai-service (PyTorch), booking, tax, scraper, graph, nexus-quantum (port 8200), nexus-analytics (port 8300), and the nexus-crypto suite — all wired to PostgreSQL, Redis, and MongoDB.", code: DIAGRAMS.composeStack },
  { title: "CI/CD & Kubernetes", description: "GitHub Actions builds and pushes images to GHCR, then deploys to a Kubernetes cluster with HPA auto-scaling and an Ingress controller.", code: DIAGRAMS.infraStack },
];

// ── Infrastructure static info ────────────────────────────────────────────────

const INFRA_SERVICES = [
  { name: "Nginx",          desc: "Reverse proxy, load balancing, WS upgrade, TLS termination",         color: "text-green-400",  icon: <Network className="w-4 h-4" /> },
  { name: "Docker",         desc: "Multi-stage production Dockerfile + dev hot-reload variant",          color: "text-blue-400",   icon: <Box className="w-4 h-4" /> },
  { name: "PostgreSQL",     desc: "Primary relational database via Drizzle ORM (28 tables)",             color: "text-sky-400",    icon: <Database className="w-4 h-4" /> },
  { name: "Redis",          desc: "BM25 search cache, API response caching, pub/sub for search service", color: "text-red-400",    icon: <Server className="w-4 h-4" /> },
  { name: "Kubernetes",     desc: "Namespace, deployment + HPA per service, Ingress, Secrets",           color: "text-violet-400", icon: <GitBranch className="w-4 h-4" /> },
  { name: "GitHub Actions", desc: "CI: Node tests → Python tests → E2E → Docker build; CD: build → push GHCR → K8s deploy", color: "text-orange-400", icon: <GitBranch className="w-4 h-4" /> },
];

// ── CollapsibleGroup ──────────────────────────────────────────────────────────

function CollapsibleGroup({ group, defaultOpen = false }: { group: DbGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel rounded-xl border border-white/5 overflow-hidden" data-testid={`db-group-${group.id}`}>
      <button
        className="w-full flex items-center justify-between p-5 bg-card/50 hover:bg-card/70 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-base font-display font-semibold`}>{group.label}</span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${group.badgeColor}`}>{group.tableCount} tables</span>
          {group.note && <span className="text-xs text-amber-400/70 font-mono">conceptual</span>}
        </div>
        <span className="text-muted-foreground shrink-0 ml-3">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      {open && (
        <div className="border-t border-white/5">
          {group.note && (
            <div className="px-5 pt-4 pb-0">
              <p className="text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/10 rounded-lg px-3 py-2">{group.note}</p>
            </div>
          )}
          <div className="space-y-6 p-5">
            {group.diagrams.map((d, i) => (
              <div key={i} className="rounded-lg border border-white/5 overflow-hidden">
                <div className="px-4 py-3 bg-black/30 border-b border-white/5">
                  <div className="font-medium text-sm">{d.title}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                </div>
                <div className="p-4 bg-black/20">
                  <MermaidDiagram code={d.code} className="min-h-[100px]" />
                </div>
              </div>
            ))}
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Tables</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tables.map(t => (
                  <code key={t} className="text-xs font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-muted-foreground">{t}</code>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StaticDiagramSection ──────────────────────────────────────────────────────

function StaticDiagramSection({ cards }: { cards: DiagramCard[] }) {
  return (
    <div className="space-y-8">
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

// ── Hash → tab mapping ────────────────────────────────────────────────────────

function hashToTab(hash: string): Tab {
  if (hash === "#infrastructure") return "infrastructure";
  if (hash === "#system") return "system";
  return "db-schema";
}

// ── ArchitecturePage ──────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const [tab, setTab] = useState<Tab>(() => hashToTab(window.location.hash));

  // Keep tab in sync with URL hash (back/forward + anchor links)
  useEffect(() => {
    const onHash = () => setTab(hashToTab(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Update URL hash when tab changes programmatically
  function selectTab(t: Tab) {
    setTab(t);
    const hash = t === "infrastructure" ? "#infrastructure" : t === "system" ? "#system" : "";
    window.history.replaceState(null, "", hash ? `/architecture${hash}` : "/architecture");
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "db-schema",      label: "Database Schema",     icon: <Database className="w-4 h-4" /> },
    { id: "system",         label: "System Architecture", icon: <Network className="w-4 h-4" /> },
    { id: "infrastructure", label: "Infrastructure",      icon: <Server className="w-4 h-4" /> },
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
                {DB_GROUPS.map(g => (
                  <div key={g.id} className={`px-2.5 py-1 rounded-full text-xs font-mono border ${g.badgeColor}`}>
                    {g.label} · {g.tableCount} tables
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
                onClick={() => selectTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
                data-testid={`tab-${t.id}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Database Schema tab — 4 collapsible groups */}
          {tab === "db-schema" && (
            <div className="space-y-4" id="db-schema">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {DB_GROUPS.map(g => (
                  <div key={g.id} className="glass-panel rounded-xl p-4 border border-white/5">
                    <div className={`text-2xl font-display font-bold mb-1 ${g.badgeColor.split(" ")[0]}`}>{g.tableCount}</div>
                    <div className="text-xs text-muted-foreground font-medium">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">tables</div>
                  </div>
                ))}
              </div>
              {DB_GROUPS.map((group, i) => (
                <CollapsibleGroup key={group.id} group={group} defaultOpen={i === 0} />
              ))}
            </div>
          )}

          {/* System Architecture tab */}
          {tab === "system" && (
            <div className="space-y-8" id="system">
              <div className="glass-panel rounded-xl border border-white/5 p-5 bg-card/20 mb-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  NexusConsult is a polyglot microservice platform. The central Express.js server acts as the main web application, REST API server, WebSocket hub, and transparent API gateway — proxying requests to 13 standalone sub-app services, each independently deployable.
                </p>
              </div>
              <StaticDiagramSection cards={SYSTEM_CARDS} />

              <div className="glass-panel rounded-xl border border-white/5 p-5">
                <h3 className="font-display font-semibold mb-4">Service Port Registry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {[
                    { port: "5000", name: "Express.js",       desc: "Main App + API + WS" },
                    { port: "8001", name: "Nexus AI",          desc: "PyTorch NLP Service" },
                    { port: "8002", name: "Nexus Search",      desc: "BM25 + Redis" },
                    { port: "8003", name: "Nexus Booking",     desc: "Scheduling" },
                    { port: "8004", name: "Nexus Tax",         desc: "IRS Forms" },
                    { port: "8005", name: "Nexus Scraper",     desc: "Entity Crawler" },
                    { port: "8006", name: "Nexus Graph",       desc: "Knowledge Graph" },
                    { port: "8100", name: "NexusCrypto",       desc: "Crypto Gateway" },
                    { port: "8101", name: "Crypto Market",     desc: "OHLCV + Tickers" },
                    { port: "8102", name: "Crypto Wallet",     desc: "HD Wallet / Web3" },
                    { port: "8103", name: "Crypto DEX",        desc: "AMM + Orders" },
                    { port: "8104", name: "Crypto Analytics",  desc: "P&L / Sharpe" },
                    { port: "8200", name: "Nexus Quantum",     desc: "Azure Quantum / QAOA" },
                    { port: "8300", name: "Nexus Analytics",   desc: "Platform API Metrics" },
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
            <div className="space-y-8" id="infrastructure">
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

              <StaticDiagramSection cards={INFRA_CARDS} />

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
