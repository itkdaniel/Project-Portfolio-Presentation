/**
 * Seed rich sample project data for development/demo.
 * Run with: npx tsx scripts/seed-projects.ts
 *
 * The four NexusConsult sub-app projects are upserted by name so re-running
 * this script does not create duplicates.
 */
import { db } from "../server/db";
import { projects, users } from "../shared/schema";
import { hashPassword } from "../server/auth";
import { sql, eq } from "drizzle-orm";

const SAMPLE_PROJECTS = [
  {
    name: "NexusAuth — JWT + RBAC Microservice",
    description: "Production-grade auth service with role-based access control, refresh token rotation, and OAuth2 support.",
    longDescription: `A complete authentication and authorization microservice built for enterprise scale.
Features JWT token issuance with RS256 signing, sliding refresh window, device fingerprinting,
and a fine-grained RBAC engine. Supports OAuth2 code flow with PKCE for SSO integration.
PostgreSQL-backed session store with Redis cache for sub-millisecond token validation.`,
    type: "Microservice",
    tags: ["Node.js", "TypeScript", "JWT", "PostgreSQL", "Redis", "OAuth2", "RBAC", "Docker"],
    githubUrl: "https://github.com/nexusconsult/nexus-auth",
    runCommand: "docker-compose up -d && npm run migrate && npm start",
    testCommand: "npm test -- --coverage",
    usageInstructions: `POST /auth/login — issue access + refresh tokens
POST /auth/refresh — rotate refresh token
POST /auth/logout — revoke session
GET  /auth/me — current user profile`,
    demoApiEndpoint: "/api/v1/auth/demo",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "StreamForge — Kafka Event Pipeline",
    description: "High-throughput event streaming pipeline processing 50K+ events/sec with at-least-once delivery guarantees.",
    longDescription: `Real-time data pipeline built on Apache Kafka with custom consumer group management.
Implements the outbox pattern for transactional event publishing, dead-letter queues for error recovery,
and backpressure-aware consumers using the reactive streams spec.
Includes a monitoring dashboard with lag tracking and partition rebalancing alerts.`,
    type: "Data Pipeline",
    tags: ["Python", "Kafka", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Prometheus"],
    githubUrl: "https://github.com/nexusconsult/streamforge",
    runCommand: "docker-compose -f docker-compose.kafka.yml up -d && python -m streamforge.consumer",
    testCommand: "pytest tests/ -v --cov=streamforge",
    usageInstructions: `Publish event: POST /events/{topic}
Consumer status: GET /consumers/status
Replay DLQ: POST /dlq/replay`,
    demoApiEndpoint: "/api/v1/stream/demo",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "GraphShield — API Gateway with Rate Limiting",
    description: "Lightweight API gateway with token-bucket rate limiting, circuit breaker, and request deduplication.",
    longDescription: `A reverse proxy and API gateway built in Go, providing production-grade rate limiting
via token bucket algorithm (O(1) per request), circuit breaker with half-open state,
request coalescing for repeated identical queries, and header-based routing.
Handles 100K+ req/sec per instance. Horizontal scaling via Redis-backed distributed state.`,
    type: "Infrastructure",
    tags: ["Go", "Redis", "Docker", "Kubernetes", "Nginx", "Prometheus", "Grafana"],
    githubUrl: "https://github.com/nexusconsult/graphshield",
    runCommand: "go build ./... && ./graphshield --config=config.yaml",
    testCommand: "go test ./... -race -cover",
    usageInstructions: `Configure routes in config.yaml. Expose :8080 upstream.
Admin API: GET /admin/stats, POST /admin/rules`,
    status: "active",
    published: true,
    featured: false,
  },
  {
    name: "DocuFlow — Async Document Processing Pipeline",
    description: "Distributed document processing with OCR, extraction, and vector indexing. Handles PDF/DOCX/HTML.",
    longDescription: `Async document ingestion pipeline using Celery workers for OCR (Tesseract), 
structured data extraction with schema inference, and vector embedding generation for RAG applications.
Supports pluggable storage backends (S3/GCS/local), automatic format detection,
and a REST API for job submission and status polling.`,
    type: "Service",
    tags: ["Python", "FastAPI", "Celery", "Redis", "PostgreSQL", "S3", "Docker"],
    githubUrl: "https://github.com/nexusconsult/docuflow",
    runCommand: "docker-compose up -d && celery -A docuflow.worker worker --loglevel=info",
    testCommand: "pytest tests/ --cov=docuflow",
    usageInstructions: `POST /documents — upload file for processing
GET  /documents/{id}/status — check job status
GET  /documents/{id}/result — download extracted data`,
    status: "active",
    published: true,
    featured: false,
  },
  // ── NexusConsult sub-app projects ─────────────────────────────────────────
  // These are upserted by name so re-running the seed is idempotent.
  {
    name: "Nexus Booking — Consultation Scheduling",
    description: "Step-based consultation scheduling service with calendar availability, slot management, and confirmation emails. Built with FastAPI + PostgreSQL.",
    longDescription: `A standalone booking microservice that powers the NexusConsult client-portal scheduling flow.
Exposes a JSON REST API for listing available time slots, creating bookings, and managing calendar availability.
Integrated with the NexusConsult gateway at /api/apps/booking/proxy/* for transparent proxying.
Features: slot management, conflict detection, email confirmation via SMTP or console fallback.
FastAPI + PostgreSQL backend with async SQLAlchemy and Alembic migrations.`,
    type: "Microservice",
    tags: ["FastAPI", "Python", "PostgreSQL", "Calendar", "Scheduling", "Docker"],
    githubUrl: "https://github.com/itkdaniel/nexus-booking",
    runCommand: "docker build -t nexus-booking . && docker run -p 8003:8003 nexus-booking",
    testCommand: "pytest tests/ -v --cov=app",
    usageInstructions: `GET  /health                   — health check
GET  /v1/booking/slots         — list available time slots
POST /v1/booking/bookings      — create a booking
GET  /v1/booking/bookings      — list bookings (admin)
GET  /openapi.json             — OpenAPI specification`,
    demoApiEndpoint: "/api/apps/booking/proxy/health",
    sandboxUrl: "http://localhost:8003",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "Nexus Tax — IRS Form Assistant",
    description: "Guided tax questionnaire engine with IRS form recommendations, bracket calculations, and multi-year period management.",
    longDescription: `A standalone FastAPI service that drives the NexusConsult tax assistant wizard.
Provides guided multi-step questionnaire sessions, IRS federal form recommendations based on responses,
tax bracket calculations for multiple filing statuses, and multi-year period support.
Integrated with the NexusConsult gateway at /api/apps/tax/proxy/* for transparent proxying.
Features: session management, form scoring, deduction hints, and exportable summaries.`,
    type: "AI/ML Service",
    tags: ["FastAPI", "Python", "Tax Forms", "IRS", "Questionnaire", "Docker"],
    githubUrl: "https://github.com/itkdaniel/nexus-tax",
    runCommand: "docker build -t nexus-tax . && docker run -p 8004:8004 nexus-tax",
    testCommand: "pytest tests/ -v --cov=app",
    usageInstructions: `GET  /health                   — health check
GET  /v1/tax/periods           — list supported tax years
GET  /v1/tax/forms/federal     — available IRS forms
POST /v1/tax/sessions          — start questionnaire session
GET  /openapi.json             — OpenAPI specification`,
    demoApiEndpoint: "/api/apps/tax/proxy/health",
    sandboxUrl: "http://localhost:8004",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "Nexus Search — BM25 Full-Text Engine",
    description: "BM25 full-text search engine with Levenshtein fuzzy matching, Jaccard tag filtering, and BFS tag-graph recommendations.",
    longDescription: `A standalone FastAPI search service powering the NexusConsult project discovery system.
Implements BM25 ranking (Okapi), Levenshtein distance for typo-tolerant fuzzy matching,
Jaccard similarity for tag-based filtering, and BFS graph traversal for content recommendations.
Backed by async PostgreSQL with Motor/Redis for caching. Search results served in <50ms.
Integrated with the NexusConsult gateway at /api/apps/search/proxy/* for transparent proxying.`,
    type: "Service",
    tags: ["FastAPI", "Python", "BM25", "Redis", "Algorithms", "PostgreSQL", "Docker"],
    githubUrl: "https://github.com/itkdaniel/nexus-search",
    runCommand: "docker build -t nexus-search . && docker run -p 8002:8002 nexus-search",
    testCommand: "pytest tests/ -v --cov=app",
    usageInstructions: `GET  /health                      — health check
GET  /v1/search?q=...            — BM25 full-text search
GET  /v1/projects                — list all indexed projects
GET  /v1/projects/:id/related    — BFS tag-graph recommendations
GET  /openapi.json               — OpenAPI specification`,
    demoApiEndpoint: "/api/apps/search/proxy/health",
    sandboxUrl: "http://localhost:8002",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "Nexus AI — Transformer Inference Service",
    description: "PyTorch transformer inference service built from scratch — BPE tokenization, MLM pre-training, classification, embeddings, and fill-mask.",
    longDescription: `A custom encoder-only transformer inference service built entirely from scratch in PyTorch.
No HuggingFace — implements sinusoidal positional encoding, multi-head self-attention, Pre-LN encoder blocks,
a BPE tokenizer trained from a custom corpus, and an AdamW + cosine LR training pipeline.
Serves classification, L2-normalized embeddings, semantic similarity scoring, and fill-mask prediction.
Integrated with the NexusConsult gateway at /api/apps/ai/proxy/* for transparent proxying.`,
    type: "AI/ML Service",
    tags: ["PyTorch", "Python", "Transformer", "NLP", "ML", "FastAPI", "Docker", "CUDA"],
    githubUrl: "https://github.com/itkdaniel/nexus-ai",
    runCommand: "docker build -t nexus-ai . && docker run -p 8001:8001 nexus-ai",
    testCommand: "pytest tests/ -v --cov=app",
    usageInstructions: `GET  /health                   — health check + model status
POST /v1/ai/classify           — intent classification
POST /v1/ai/embed              — L2-normalized embeddings
POST /v1/ai/similarity         — cosine similarity score
POST /v1/ai/fill-mask          — masked token prediction
GET  /v1/ai/status             — model metadata
GET  /openapi.json             — OpenAPI specification`,
    demoApiEndpoint: "/api/apps/ai/proxy/health",
    sandboxUrl: "http://localhost:8001",
    status: "active",
    published: true,
    featured: true,
  },
  {
    name: "Nexus Scraper — Web Scraper + Entity Database",
    description: "Web scraper microservice that crawls URLs, classifies entities via NLP, stores structured knowledge with embeddings, and seeds trending data from HN + Reddit every 6 h.",
    longDescription: `A standalone FastAPI scraper microservice that powers the NexusConsult knowledge graph.
Fetches HTML with httpx, strips to clean text via BeautifulSoup, then pipes through the NexusAI
service for intent classification and L2-normalized embedding generation.
Extracted entities (Person, Organization, Technology, Concept, Event, Location, Product, Article,
Repository, Dataset) are stored with confidence scores and vector embeddings for downstream graph queries.
Trending content is automatically seeded every 6 hours from Hacker News top-30 and Reddit /r/technology top-20.
Integrated with the NexusConsult gateway at /api/apps/scraper/proxy/* for transparent proxying.
Features: APScheduler cron jobs, URL deduplication by SHA-256 hash, SOCKS5 onion proxy support,
paginated REST API, and full OpenAPI documentation.`,
    type: "Microservice",
    tags: ["FastAPI", "Python", "BeautifulSoup", "NLP", "APScheduler", "PostgreSQL", "Tor", "Docker"],
    githubUrl: "https://github.com/itkdaniel/nexus-scraper",
    runCommand: "docker build -t nexus-scraper . && docker run -p 8005:8005 nexus-scraper",
    testCommand: "pytest tests/ -v --cov=app",
    usageInstructions: `GET  /health                      — health check
POST /v1/scrape/url               — scrape a URL (extracts text, classifies, stores entities)
POST /v1/scrape/onion             — scrape a .onion URL via SOCKS5 proxy
GET  /v1/scrape/jobs              — list recent scrape jobs
GET  /v1/scrape/jobs/:id          — job detail with entities
POST /v1/scrape/trending          — trigger HN + Reddit trending scrape
GET  /v1/entities                 — list entities (paginated, filter by type/source)
GET  /v1/entities/:id             — entity detail with relations
GET  /v1/entity-types             — available classification types
GET  /openapi.json                — OpenAPI specification`,
    demoApiEndpoint: "/api/apps/scraper/proxy/health",
    sandboxUrl: "http://localhost:8005",
    status: "active",
    published: true,
    featured: true,
  },
];

// Sub-app project names for upsert identification
const SUB_APP_NAMES = new Set([
  "Nexus Booking — Consultation Scheduling",
  "Nexus Tax — IRS Form Assistant",
  "Nexus Search — BM25 Full-Text Engine",
  "Nexus AI — Transformer Inference Service",
  "Nexus Scraper — Web Scraper + Entity Database",
]);

async function seed() {
  console.log("🌱 Seeding projects...");

  // Clear all existing projects that aren't sub-app projects, then upsert sub-apps
  // Step 1: Delete non-sub-app projects (regenerated each run)
  // Step 2: For sub-apps, delete any existing entries with those names and re-insert
  await db.delete(projects);

  for (const p of SAMPLE_PROJECTS) {
    const [inserted] = await db.insert(projects).values(p).returning({ id: projects.id, name: projects.name });
    const marker = SUB_APP_NAMES.has(p.name) ? "⚡" : "✓";
    console.log(`  ${marker} ${inserted.name}`);
  }

  console.log(`\n✅ Seeded ${SAMPLE_PROJECTS.length} projects (${SUB_APP_NAMES.size} sub-app gateway entries).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
