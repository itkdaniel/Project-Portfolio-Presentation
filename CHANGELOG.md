# Changelog — NexusConsult Platform

All notable changes to the main platform are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
