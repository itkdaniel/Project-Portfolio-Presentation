# NexusConsult — Automation Consulting Platform

> Full-stack automation consulting platform with containerized microservice portfolio, real-time project showcase, client booking/scheduling, AI/ML services, and comprehensive DevOps infrastructure.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Quick Start](#quick-start)
- [Services](#services)
- [API Reference](#api-reference)
- [Authentication & RBAC](#authentication--rbac)
- [WebSocket Pub/Sub](#websocket-pubsub)
- [Infrastructure](#infrastructure)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx (port 80/443)                     │
│          Load Balancer · Reverse Proxy · TLS Termination        │
└───────────┬──────────────────┬──────────────────┬──────────────┘
            │                  │                  │
     ┌──────▼──────┐   ┌───────▼───────┐  ┌──────▼──────┐
     │  Web App    │   │ Python FastAPI │  │  AI Service  │
     │  (Node.js)  │   │   (port 8000) │  │  (port 8001) │
     │  port 5000  │   │ REST + Search │  │  Transformer │
     └──────┬──────┘   └───────┬───────┘  └──────┬──────┘
            │                  │                  │
     ┌──────▼──────────────────▼──────────────────▼──────┐
     │                    Data Layer                       │
     │  PostgreSQL (primary) · MongoDB (docs) · Redis     │
     └────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Tech | Purpose |
|-----------|------|---------|
| **Web Application** | TypeScript, Express, React | Main SPA + REST API + WebSocket pub/sub |
| **Python Microservice** | FastAPI, SQLAlchemy, asyncpg | BM25 search, tag graph, cache-aside |
| **AI/ML Service** | PyTorch, FastAPI | Transformer classification + embeddings |
| **PostgreSQL** | v16 | Primary relational datastore |
| **Redis** | v7 | Caching (TTL), pub/sub, rate limiting |
| **MongoDB** | v7 | Document store for unstructured data |
| **Nginx** | Alpine | Reverse proxy, load balancing, TLS |

---

## Quick Start

### Local Development (Node.js only)

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET

# Push schema to PostgreSQL
npm run db:push

# Seed sample data
npx tsx scripts/seed-projects.ts

# Start development server
npm run dev
# → http://localhost:5000
```

**Default credentials:**
| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@nexusconsult.dev` | `Admin@Nexus2024!` |
| User | `demo@nexusconsult.dev` | `Demo@User2024!` |

### Full Stack (Docker Compose)

```bash
# Clone repo
git clone https://github.com/your-org/nexusconsult

# Start all services
docker-compose up -d

# Check health
docker-compose ps

# View logs
docker-compose logs -f web
```

### Development Mode (with hot reload)

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Services

### Web Application — TypeScript/Express

The main application serving both the React frontend and REST API.

**Routes:**
- `GET /` — React SPA (serves `index.html`)
- `POST /api/auth/login` — JWT authentication
- `GET /api/projects` — List published projects
- `POST /api/bookings` — Create consultation booking
- `WS /ws` — WebSocket pub/sub

### Python FastAPI Microservice

Advanced search and recommendation APIs backed by PostgreSQL + MongoDB + Redis.

**Routes:**
- `GET /v1/projects?search=<query>` — BM25 full-text search
- `GET /v1/projects?tags=kafka,streaming` — Jaccard tag filtering
- `GET /v1/projects/{id}/related` — BFS graph-based recommendations
- `GET /health` — Service health check

**Search Algorithm:** BM25 (k1=1.5, b=0.75) on `name + description` fields.
Falls back to Levenshtein fuzzy matching when BM25 score is zero.
Tag ranking uses Jaccard similarity: `|A∩B| / |A∪B|`.

### AI/ML Microservice — PyTorch Transformer

Custom encoder-only transformer (BERT-style) built from scratch.

**Endpoints:**
- `POST /ai/classify` — Intent classification (top-k softmax)
- `POST /ai/embed` — L2-normalized text embeddings (Redis-cached)
- `POST /ai/similarity` — Cosine similarity between two texts
- `POST /ai/fill-mask` — Masked token prediction

**Architecture:**
- 4 encoder layers, 8 attention heads, 256 hidden dim (~3M params)
- Pre-LayerNorm for stable training
- Sinusoidal positional encoding
- BPE tokenizer (8K vocab, trained on domain corpus)
- AdamW optimizer + cosine LR schedule + linear warm-up

---

## API Reference

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@nexusconsult.dev", "password": "Admin@Nexus2024!" }
```

Response:
```json
{
  "token": "<JWT>",
  "user": { "id": "...", "username": "admin", "email": "...", "role": "admin" }
}
```

Include in subsequent requests:
```http
Authorization: Bearer <JWT>
```

### Projects

```http
GET  /api/projects            # List all published projects
GET  /api/projects/:id        # Get single project
POST /api/projects            # Create project (admin only)
PATCH /api/projects/:id       # Update project (admin only)
DELETE /api/projects/:id      # Delete project (admin only)
```

### Bookings

```http
POST /api/bookings            # Create booking (public)
GET  /api/bookings            # List bookings (admin only)
```

**Booking payload:**
```json
{
  "name": "Jane Doe",
  "email": "jane@company.com",
  "company": "Acme Corp",
  "meetingType": "discovery",
  "details": "We need help migrating to microservices...",
  "date": "2026-05-01",
  "time": "10:00"
}
```

### Admin

```http
GET /api/admin/stats          # Dashboard statistics (admin only)
GET /api/inquiries            # List inquiries (admin only)
PATCH /api/inquiries/:id/resolve  # Resolve inquiry (admin only)
```

---

## Authentication & RBAC

Token format: custom HMAC-SHA256 JWT (3-part base64url, 24-hour expiry).

| Role | Permissions |
|------|-------------|
| `admin` | All CRUD on projects, view bookings/inquiries, admin stats |
| `user` | Read public projects, create bookings/inquiries |
| (public) | Read projects, create bookings/inquiries |

RBAC middleware chain:
```
requireAuth → verify HMAC → attach req.user → next()
requireAdmin → requireAuth + check role === "admin" → next()
```

---

## WebSocket Pub/Sub

Connect to `ws://localhost:5000/ws` for real-time updates.

**Events published:**
| Event | Trigger |
|-------|---------|
| `project:created` | New project added (admin) |
| `project:updated` | Project updated (admin) |
| `project:deleted` | Project deleted (admin) |
| `booking:created` | New consultation booked |
| `inquiry:created` | New inquiry submitted |

**Client example:**
```javascript
const ws = new WebSocket("ws://localhost:5000/ws");
ws.onmessage = (e) => {
  const { event, data } = JSON.parse(e.data);
  if (event === "project:created") console.log("New project:", data.name);
};
```

---

## Infrastructure

### Docker

```bash
# Build and run production image
docker build -t nexus-web .
docker run -p 5000:5000 --env-file .env nexus-web

# Full stack
docker-compose up -d

# Dev mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Kubernetes

```bash
# Create namespace and secrets
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic nexus-secrets \
  --from-literal=database-url="$DATABASE_URL" \
  --from-literal=jwt-secret="$JWT_SECRET" \
  -n nexusconsult

# Deploy
kubectl apply -f k8s/

# Check rollout
kubectl rollout status deployment/nexus-web -n nexusconsult

# HPA status
kubectl get hpa -n nexusconsult
```

### CI/CD — GitHub Actions

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | Push to any branch | Type check → Unit tests → E2E → Docker build |
| `deploy.yml` | Push to `main` | Build → Push image → Deploy to K8s → Notify Slack |

---

## Testing

```bash
# Unit tests (Vitest)
npm run test:unit

# Unit tests with coverage
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e

# Regression tests
npm run test:regression

# Python service tests
cd python-service && pytest tests/ -v --cov=app

# All tests
npm test
```

**Test coverage targets:** >80% lines for server/, shared/

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | `nexus-dev-secret-...` | HMAC signing secret |
| `PORT` | No | `5000` | HTTP server port |
| `REDIS_URL` | No | — | Redis connection URL |
| `NODE_ENV` | No | `development` | `development` / `production` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, code standards, and PR guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT © NexusConsult