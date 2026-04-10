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
- Platform roles: `admin`, `user` (pgEnum)
- Corporate roles: 8-level hierarchy (`user` → `creator`, IDs 1–8) in `corp_roles` table
- Data ratings: 7-tier system (`G` → `None`) in `data_ratings` table — controls CLI data access
- JWT payload includes `sub` (user ID) + `role`
- `requireAuth` middleware verifies HMAC signature + 24h expiry
- `requireAdmin` chains requireAuth + role check
- `PATCH /api/users/role` — admin-only endpoint to update a user's corporate role

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

### Testing (54 passing)
- `tests/unit/auth.test.ts` — hashPassword + generateToken unit tests
- `tests/unit/schema.test.ts` — Zod schema validation unit tests
- `tests/unit/api.test.ts` — Full API integration tests (login, CRUD, RBAC)
- `tests/unit/roles.test.ts` — Corporate role hierarchy + data rating access matrix + PATCH /api/users/role
- `tests/unit/portfolio.test.ts` — Full portfolio CRUD, publish/feature, parallel creates
- `tests/regression/backwards-compat.test.ts` — Contract stability regression tests
- `tests/e2e/booking.spec.ts` — Playwright E2E browser tests
- `vitest.config.ts` — Configured with include/exclude patterns, JSON reporter
- `playwright.config.ts` — Chromium, webServer auto-start, screenshots/traces/video

### Test Dashboard
- `/tests` page — color-coded pass/fail/skip badges, suite cards with expandable tracebacks, filter controls
- `GET /api/tests/results` — returns cached latest vitest JSON output
- `POST /api/tests/run` — triggers a fresh vitest run and returns results

### CLI Tools
#### Python CLI (`cli/python/`)
- Entry: `python nexus_cli.py` (requires `pip install click rich httpx`)
- 7 command groups: `auth`, `api`, `infra`, `portfolio`, `data`, `model`, `ai`
- `auth`: login, logout, whoami, token, roles, set-role
- `api`: get, post, patch, delete, batch (parallel), endpoints
- `infra`: start, stop, restart, scale, status, logs, cleanup, build, k8s
- `portfolio`: list, add, update, remove, publish, unpublish, feature, export
- `data`: ratings, check, scrape, preprocess, build, validate, formats (role-gated)
- `model`: list, train, validate, save, load, deploy, export
- `ai`: classify, embed, similarity, fill-mask, search, status

#### Go CLI (`cli/go/`)
- Entry: `go build -o nexus . && ./nexus` (from `cli/go/`)
- Identical command structure via cobra
- `internal/roles/roles.go` — role hierarchy + CanAccessRating logic
- `internal/config/config.go` — config load/save (~/.nexus/config.json + env overrides)
- `internal/client/http.go` — sync/parallel HTTP with goroutines (`ParallelGet`)

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
npm run dev                         # dev server (port 5000)
npm run db:push                     # sync schema to DB
npx tsx scripts/seed-projects.ts    # seed 6 sample projects
npx tsx scripts/seed-roles.ts       # seed 8 corp roles + 7 data ratings
npm run test:unit                   # vitest unit + integration (54 tests)
npm run test:e2e                    # playwright E2E
npm run test:coverage               # coverage report
```

### Python CLI
```bash
pip install click rich httpx        # one-time install
cd cli/python
python nexus_cli.py --help          # top-level help
python nexus_cli.py auth login      # authenticate
python nexus_cli.py portfolio list  # list projects
python nexus_cli.py data ratings    # show data tiers
python nexus_cli.py data check R    # check role access
python nexus_cli.py model train data/corpus  # train a model
python nexus_cli.py ai search "auth service" # semantic search
```

### Go CLI
```bash
cd cli/go
go mod tidy                         # install dependencies
go build -o nexus .                 # compile binary
./nexus --help                      # top-level help
./nexus auth login                  # authenticate
./nexus portfolio list              # list projects
./nexus data ratings --code R       # show R-tier sources
./nexus infra start                 # start Docker services
./nexus ai status                   # check AI services
./nexus api batch /api/projects /api/auth/me  # parallel fetch
```