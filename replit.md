# NexusConsult — Automation Consulting Platform

## Architecture

Full-stack automation consulting platform with a dark "Tech Professional" aesthetic.

### Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Wouter routing, TanStack Query, Framer Motion
- **Backend**: Express.js (TypeScript), custom HMAC-SHA256 JWT auth, WebSocket pub/sub
- **Database**: PostgreSQL via Drizzle ORM
- **Testing**: Vitest (unit + integration), Playwright (E2E)

### Services
| Port | Service | Description |
|------|---------|-------------|
| 5000 | Web App | TypeScript/Express — main SPA + REST API + WebSocket |
| 8000 | Python FastAPI | BM25 search, tag graph recommendations, Redis cache |
| 8001 | AI/ML Service | PyTorch transformer (built from scratch), embeddings |

### Key Files
- `shared/schema.ts` — Drizzle + Zod schemas (users, projects, bookings, inquiries)
- `server/auth.ts` — HMAC JWT middleware, hashPassword, requireAuth/requireAdmin
- `server/routes.ts` — All API routes with RBAC protection
- `server/storage.ts` — DatabaseStorage implementing IStorage interface
- `server/pubsub.ts` — WebSocket pub/sub manager (WS on /ws)
- `server/logger.ts` — Shared log utility (no circular deps)
- `client/src/pages/Booking.tsx` — Step-based booking calendar (react-day-picker v9)
- `python-service/app/algorithms/search.py` — BM25, Levenshtein, BFS graph, Jaccard
- `ai-service/model/transformer.py` — Full encoder transformer from scratch
- `ai-service/model/tokenizer.py` — BPE tokenizer from scratch
- `ai-service/training/trainer.py` — AdamW + cosine LR + MLM training pipeline

## Features Implemented

### Frontend
- Hero with interactive 3-strategy load balancer simulation (round-robin, least-conn, IP-hash)
- Project showcase — fetches from `/api/projects`, WebSocket real-time updates, tab navigation
- Step-based booking calendar: Date → Time (color-coded morning/afternoon/late slots) → Details → Confirm
- Services section, testimonials, footer

### Backend API
- `POST /api/auth/login` / `POST /api/auth/register` — JWT auth
- `GET /api/auth/me` — authenticated user profile
- `GET /api/projects` — public project list
- `POST/PATCH/DELETE /api/projects` — admin CRUD
- `POST /api/bookings` — public booking creation
- `GET /api/bookings` — admin only
- `POST /api/inquiries` — public inquiry
- `GET /api/admin/stats` — admin dashboard stats

### RBAC
- Roles: `admin`, `user` (pgEnum)
- JWT payload includes `sub` (user ID) + `role`
- `requireAuth` middleware verifies HMAC signature + 24h expiry
- `requireAdmin` chains requireAuth + role check

### WebSocket Pub/Sub
- Events: `project:created`, `project:updated`, `project:deleted`, `booking:created`, `inquiry:created`
- Broadcast to all connected WS clients

### Infrastructure
- `Dockerfile` (multi-stage, production)
- `Dockerfile.dev` (hot reload)
- `docker-compose.yml` (postgres, redis, mongo, nginx, web, python-service, ai-service)
- `docker-compose.dev.yml` (volume mounts + reload override)
- `k8s/` — namespace, web-deployment+HPA, python-deployment+HPA, ingress, secrets
- `nginx/nginx.conf` — reverse proxy, load balancing, WS upgrade, security headers
- `.github/workflows/ci.yml` — Node tests → Python tests → E2E → Docker build
- `.github/workflows/deploy.yml` — Build → push GHCR → K8s deploy → Slack notify

### Testing
- `tests/unit/auth.test.ts` — hashPassword + generateToken unit tests
- `tests/unit/schema.test.ts` — Zod schema validation unit tests
- `tests/unit/api.test.ts` — Full API integration tests (login, CRUD, RBAC)
- `tests/regression/backwards-compat.test.ts` — Contract stability regression tests
- `tests/e2e/booking.spec.ts` — Playwright E2E browser tests
- `vitest.config.ts` — Configured with include/exclude patterns, coverage
- `playwright.config.ts` — Chromium, webServer auto-start, artifacts

### Python FastAPI Service
- `app/main.py` — FastAPI with lifespan, CORS, structured logging
- `app/config.py` — pydantic-settings typed config
- `app/database.py` — async SQLAlchemy + Motor + Redis connection factories
- `app/models/project.py` — ORM model + Pydantic schemas
- `app/algorithms/search.py` — BM25, Jaccard, binary search, Levenshtein DP, BFS graph
- `app/services/cache.py` — cache-aside pattern, Redis pub/sub, TTL management
- `app/routers/projects.py` — CRUD + BM25 search + tag filter + related BFS endpoint

### AI/ML Service (PyTorch)
- `model/transformer.py` — SinusoidalPE, MHSA, FFN, EncoderBlock, NexusTransformer (Pre-LN)
- `model/tokenizer.py` — BPE tokenizer (byte-pair encoding from scratch, vocabulary, persistence)
- `training/trainer.py` — AdamW, cosine+warmup LR, gradient clipping, MLM collator, early stopping
- `main.py` — FastAPI serving classify, embed, similarity, fill-mask endpoints

### Documentation
- `README.md` — system architecture, quick start, API reference, K8s/Docker, testing
- `CONTRIBUTING.md` — branch strategy, commit format, code standards, PR process
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 adaptation
- `scripts/seed-projects.ts` — Seeds 6 rich sample projects
- `scripts/db-init.sql` — PostgreSQL extensions init

## Default Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@nexusconsult.dev | Admin@Nexus2024! |
| User | demo@nexusconsult.dev | Demo@User2024! |

## Design System
- Dark mode forced (`class="dark"` on html)
- Font: Space Grotesk (headings, `font-display`), Inter (body)
- Primary: `#3B82F6` (blue), Accent: `#9333EA` (purple)
- Utilities: `glass-panel`, `text-gradient`, `glow-sm`

## Run Commands
```bash
npm run dev          # dev server
npm run db:push      # sync schema
npx tsx scripts/seed-projects.ts  # seed data
npm run test:unit    # unit + integration tests
npm run test:e2e     # playwright E2E
npm run test:coverage # coverage report
```