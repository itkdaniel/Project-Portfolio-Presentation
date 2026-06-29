# Changelog — NexusConsult Platform

All notable changes to the main platform are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.6.0] — 2026-06-29

### Added
- **nexus-analytics** microservice (port 8300): FastAPI service tracking API events with `POST /v1/analytics/events`, `GET /v1/analytics/summary`, `GET /v1/analytics/timeseries`, `GET /v1/analytics/top-endpoints`, `GET /v1/analytics/errors` endpoints; full test suite (42 unit + 6 BDD + 5 regression), Dockerfile, CI workflow
- **Shared color-coded structured logging** (`apps/_shared/logging_config.py`): ANSI-colored console output (DEBUG=cyan, INFO=green, WARNING=yellow, ERROR=red, CRITICAL=magenta) + rotating JSON-lines file output for all Python sub-apps
- **`/search` page** — BM25 full-text search UI proxying to nexus-search (port 8002): search box, tag filter pills, result cards with relevance scores, related projects panel, offline banner
- **`/ai` page** — NexusAI transformer playground UI proxying to nexus-ai (port 8001): 5-tab interface for Classify / Embed / Similarity / Fill-Mask / Status with vector visualization for embeddings
- **`/analytics` page** — Platform analytics dashboard connecting to nexus-analytics (port 8300): timeseries chart, top-endpoints bar chart, error breakdown, real-time event counters
- `/quantum`, `/search`, `/ai`, `/analytics` links added to Navbar (desktop + mobile)
- nexus-analytics registered in API gateway (`server/gateway.ts`), docker-compose.yml, docker-compose.dev.yml, and nginx config
- Architecture and Docs pages updated: service count 12→13, nexus-analytics node in all Mermaid diagrams, port 8300 in registry

### Changed
- All Python sub-app services (nexus-booking, nexus-tax, nexus-search, nexus-ai, nexus-quantum, _template) updated to use shared `configure_logging()` with graceful fallback to inline structlog
- Platform version bumped to `1.6.0` in `package.json`
- DocsPage sidebar now has dedicated "Nexus Analytics" section; `SUB_APPS.slice` indices adjusted for 13-entry array
- `tests/unit/pages.test.ts` updated: sub-app count assertion 12→13, expected names list includes `"analytics"`

---

## [1.5.0] — 2024-06-28

### Added
- GitHub Actions CI/CD workflows for all sub-apps (nexus-booking, nexus-tax, nexus-search, nexus-ai, nexus-quantum, nexus-crypto)
- Unified release workflow (`.github/workflows/release.yml`) triggered by versioned tags — builds Docker images, creates GitHub Releases, notifies via Slack
- Canonical CI workflow template at `apps/_template/.github/workflows/ci.yml`
- PR template (`.github/pull_request_template.md`) with standard checklist and label taxonomy
- `scripts/tag-release.sh` — interactive release script for all sub-apps and the platform
- `CHANGELOG.md` for each sub-app at `v0.1.0` (nexus-booking, nexus-tax, nexus-search, nexus-ai, nexus-quantum, nexus-crypto)
- `pyproject.toml` with `version = "0.1.0"` for nexus-booking, nexus-tax, nexus-search, nexus-ai, nexus-quantum
- Root `README.md` with Mermaid repository map diagram and release flow sequence diagram
- Root `CONTRIBUTING.md` with branch naming conventions, PR process, commit format, label taxonomy, and versioning strategy

### Changed
- Platform version bumped to `1.5.0` in `package.json`

---

## [1.4.0] — 2024-05-01

### Added
- Notification and scope approval system (`notifications`, `user_notification_prefs`, `scope_requests` tables)
- NotificationBell component in navbar with real-time unread badge
- `/notifications` page with filter tabs and bulk-clear
- `/admin/approvals` page for scope request review
- Twilio SMS delivery channel (graceful no-op when env vars absent)
- 20 new notification tests

---

## [1.3.0] — 2024-03-15

### Added
- Settings system — per-user UPSERT (`userSettings`) and admin email config (`emailConfig`)
- `/settings` page with 6-section sidebar: Profile, Notifications, Appearance, Security, Email Config, Integrations
- Nodemailer email service with dark HTML templates and console fallback
- Change-password endpoint with HMAC verification
- 23 settings tests

---

## [1.2.0] — 2024-02-01

### Added
- Corporate role hierarchy (8-level: `user` → `creator`) in `corp_roles` table
- Data ratings (7-tier: `G` → `None`) in `data_ratings` table with CLI access control
- Python CLI (`cli/python/`) with 7 command groups (auth, api, infra, portfolio, data, model, ai)
- Go CLI (`cli/go/`) with identical command structure via cobra
- Python FastAPI service (BM25, Jaccard, Levenshtein, BFS graph algorithms)
- AI/ML service — NexusTransformer (Pre-LN encoder) + BPE tokenizer + AdamW trainer

---

## [1.1.0] — 2024-01-15

### Added
- WebSocket pub/sub manager for real-time project and booking events
- Test dashboard page (`/tests`) with live vitest run trigger
- Playwright E2E booking flow tests
- Docker multi-stage build + `docker-compose.yml` + Kubernetes manifests

---

## [1.0.0] — 2024-01-01

### Added
- Initial platform release
- React 19 SPA with Wouter routing, TanStack Query, Framer Motion
- Express.js backend with HMAC-SHA256 JWT authentication
- PostgreSQL via Drizzle ORM (`users`, `projects`, `bookings`, `inquiries`)
- Step-based booking calendar (Date → Time → Details → Confirm)
- Interactive hero with 3-strategy load balancer simulation
- RBAC: `admin` and `user` roles

[Unreleased]: https://github.com/itkdaniel/nexusconsult/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/itkdaniel/nexusconsult/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/itkdaniel/nexusconsult/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/itkdaniel/nexusconsult/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/itkdaniel/nexusconsult/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/itkdaniel/nexusconsult/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/itkdaniel/nexusconsult/releases/tag/v1.0.0
