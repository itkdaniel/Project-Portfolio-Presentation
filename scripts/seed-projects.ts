/**
 * Seed rich sample project data for development/demo.
 * Run with: npx tsx scripts/seed-projects.ts
 */
import { db } from "../server/db";
import { projects, users } from "../shared/schema";
import { hashPassword } from "../server/auth";
import { sql } from "drizzle-orm";

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
    name: "NexusML — Transformer Classification Service",
    description: "PyTorch encoder-only transformer for intent classification and semantic search. Built from scratch, no HuggingFace.",
    longDescription: `Custom BERT-style transformer architecture with 8 attention heads, 4 encoder layers,
and a BPE tokenizer trained on domain-specific corpus. Serves via FastAPI with Redis embedding cache.
Supports: text classification, semantic similarity, fill-mask prediction, and batch embedding generation.
Quantised INT8 model available for CPU-constrained environments. Training pipeline includes MLM pre-training
and supervised fine-tuning with cosine LR schedule and AdamW.`,
    type: "AI/ML Service",
    tags: ["Python", "PyTorch", "FastAPI", "Redis", "Transformer", "NLP", "Docker", "CUDA"],
    githubUrl: "https://github.com/nexusconsult/nexus-ml",
    runCommand: "docker build -t nexus-ml . && docker run -p 8001:8001 nexus-ml",
    testCommand: "pytest tests/test_model.py -v",
    usageInstructions: `POST /ai/classify  — intent classification
POST /ai/embed     — L2-normalized embeddings
POST /ai/similarity — cosine similarity
POST /ai/fill-mask  — masked token prediction`,
    demoApiEndpoint: "/api/v1/ai/demo",
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
  {
    name: "InfraTrace — Distributed Tracing Platform",
    description: "OpenTelemetry-compatible tracing collector and visualizer for microservice architectures.",
    longDescription: `End-to-end distributed tracing built on OpenTelemetry SDK. Collects spans from
Node.js, Python, and Go services, correlates them into traces, and stores in ClickHouse for sub-second
queries over billions of spans. Web UI shows flame graphs, service maps, and latency percentile histograms.`,
    type: "Observability",
    tags: ["Go", "ClickHouse", "OpenTelemetry", "React", "Docker", "Kubernetes"],
    githubUrl: "https://github.com/nexusconsult/infratrace",
    runCommand: "docker-compose up -d",
    testCommand: "go test ./... && npm test",
    usageInstructions: `Configure OTEL_EXPORTER_OTLP_ENDPOINT=http://infratrace:4317 in your services.
Access UI at :3000.`,
    status: "draft",
    published: false,
    featured: false,
  },
];

async function seed() {
  console.log("🌱 Seeding projects...");

  // Clear existing projects
  await db.delete(projects);

  // Insert all sample projects
  for (const p of SAMPLE_PROJECTS) {
    const [inserted] = await db.insert(projects).values(p).returning({ id: projects.id, name: projects.name });
    console.log(`  ✓ ${inserted.name}`);
  }

  console.log(`\n✅ Seeded ${SAMPLE_PROJECTS.length} projects.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});