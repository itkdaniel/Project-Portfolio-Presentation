# Contributing to NexusConsult

Thank you for contributing! This guide covers the branch strategy, PR process,
commit conventions, and versioning approach for the platform and all sub-apps.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready. Protected — PRs only, CI must be green. |
| `develop` | Integration branch. Feature branches merge here first. |
| `feat/{ticket}-{slug}` | New feature (e.g. `feat/NX-42-quantum-qaoa`) |
| `fix/{ticket}-{slug}` | Bug fix (e.g. `fix/NX-87-double-booking-race`) |
| `chore/{slug}` | Non-functional work (deps, config, CI — e.g. `chore/update-ruff`) |
| `docs/{slug}` | Documentation-only changes |
| `refactor/{slug}` | Code restructure with no behaviour change |
| `perf/{slug}` | Performance improvement |

**Rules:**
- Branch names are lowercase, hyphen-separated.
- Include the ticket ID when one exists (`NX-42`, `GH-123`, etc.).
- Delete branches after merge.

---

## Commit Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer: BREAKING CHANGE: …, Closes #N]
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Build, deps, CI, non-code changes |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behaviour change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `style` | Formatting, whitespace |

**Examples:**

```
feat(nexus-booking): add reschedule endpoint with optimistic locking
fix(nexus-search): return 404 when index is empty instead of 500
chore(ci): add mypy to nexus-tax workflow
docs(readme): add release flow sequence diagram
```

---

## Label Taxonomy

Apply labels on every PR. GitHub label names:

### Type labels
| Label | Description |
|-------|-------------|
| `type:feat` | New feature |
| `type:fix` | Bug fix |
| `type:chore` | Non-functional (deps, CI, config) |
| `type:docs` | Documentation only |
| `type:refactor` | Restructure, no behaviour change |
| `type:perf` | Performance improvement |
| `type:test` | Tests only |

### Area labels
| Label | Description |
|-------|-------------|
| `area:platform` | Main web app / shared infrastructure |
| `area:booking` | `apps/nexus-booking` |
| `area:tax` | `apps/nexus-tax` |
| `area:search` | `apps/nexus-search` |
| `area:ai` | `apps/nexus-ai` |
| `area:graph` | `nexus-graph` |
| `area:scraper` | `nexus-scraper` |
| `area:quantum` | `apps/nexus-quantum` |
| `area:crypto` | `apps/crypto-analytics` |

### Status labels
| Label | Description |
|-------|-------------|
| `status:needs-review` | Waiting for code review |
| `status:blocked` | Blocked on another PR or external dependency |
| `status:wip` | Draft — not ready for review |

---

## Pull Request Process

1. **Open a draft PR early** — this signals work-in-progress and triggers CI.
2. **Fill in the PR template** — description, test evidence, screenshots for UI changes.
3. **Mark ready for review** — convert from draft when CI is green.
4. **Require at least 1 approval** — from a maintainer or a code owner for the affected area.
5. **CI must pass** — all jobs in the relevant workflow must be green.
6. **Squash merge** — prefer squash merges to main/develop to keep history linear.

### Branch Protection Rules (document for GitHub Admin to configure)

- `main`: require PR, require CI green, require 1 approval, no force push, no delete.
- `develop`: require PR, require CI green, no force push.

---

## Development Workflow

```bash
# 1. Create feature branch
git checkout -b feat/NX-42-my-feature

# 2. Install platform deps
npm install

# 3. For a sub-app (e.g. nexus-booking)
cd apps/nexus-booking
pip install -r requirements-dev.txt

# 4. Make changes + write tests

# 5. Lint
ruff check app/ tests/          # Python sub-apps
npx tsc --noEmit                # Platform (TypeScript)

# 6. Run tests
pytest tests/ -v                # Python sub-apps
npm run test:unit               # Platform
npm run test:e2e                # Platform E2E

# 7. Commit and push
git add -A
git commit -m "feat(nexus-booking): add reschedule endpoint"
git push -u origin feat/NX-42-my-feature
```

---

## Versioning Strategy

All repos use [Semantic Versioning 2.0.0](https://semver.org/):
`MAJOR.MINOR.PATCH` — increment MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

### Version files

| Target | File | Key |
|--------|------|-----|
| Platform | `package.json` | `"version"` |
| Python sub-apps | `{app}/pyproject.toml` | `version = "…"` |

### Creating a release

Use the interactive release script — it handles version bumps, CHANGELOG updates, commits, tagging, and pushing automatically:

```bash
chmod +x scripts/tag-release.sh
./scripts/tag-release.sh
```

The script will:
1. Ask you to choose a target (platform or sub-app).
2. Show the current version and ask for a bump type (major / minor / patch).
3. Update the version file and `CHANGELOG.md`.
4. Commit, tag (e.g. `nexus-tax/v0.2.0`), and push — triggering `.github/workflows/release.yml`.

### Release workflow

When a versioned tag is pushed, `release.yml` automatically:
1. Runs the full CI suite for the affected service.
2. Builds and pushes a versioned Docker image to GHCR: `ghcr.io/itkdaniel/{name}:v{semver}`.
3. Creates a GitHub Release with auto-generated notes and the CHANGELOG section.
4. Notifies via Slack.

### Versioning matrix

| Service | Initial version | Tag example |
|---------|----------------|-------------|
| Platform | `v1.5.0` | `v1.6.0` |
| nexus-booking | `v0.1.0` | `nexus-booking/v0.2.0` |
| nexus-tax | `v0.1.0` | `nexus-tax/v0.2.0` |
| nexus-search | `v0.1.0` | `nexus-search/v0.2.0` |
| nexus-ai | `v0.1.0` | `nexus-ai/v0.2.0` |
| nexus-graph | `v0.1.0` | `nexus-graph/v0.2.0` |
| nexus-scraper | `v0.1.0` | `nexus-scraper/v0.2.0` |
| nexus-quantum | `v0.1.0` | `nexus-quantum/v0.2.0` |
| nexus-crypto | `v0.1.0` | `nexus-crypto/v0.2.0` |

---

## CHANGELOG Format

Each sub-app has a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

When you add a feature or fix a bug, add an entry under `## [Unreleased]`:

```markdown
## [Unreleased]

### Added
- New endpoint `POST /reschedule` for booking updates

### Fixed
- Race condition in availability check under concurrent requests
```

The `tag-release.sh` script automatically converts the `[Unreleased]` section to a versioned heading when you create a release.

---

## Code Standards

### Python (sub-apps)
- **Formatter**: `ruff format` (Black-compatible)
- **Linter**: `ruff check` — rules E, W, F, I; E501 excluded by convention
- **Types**: `mypy` with `--ignore-missing-imports`
- **Tests**: `pytest` with `asyncio_mode = "auto"`; target ≥85% coverage
- **Docstrings**: Google style

### TypeScript (platform)
- **Types**: strict TypeScript (`tsc --noEmit` must pass)
- **Tests**: Vitest for unit/integration; Playwright for E2E
- **Schemas**: define in `shared/schema.ts` first; derive frontend and backend types from it

---

## Getting Help

- Open a GitHub Discussion for questions.
- File a GitHub Issue for bugs or feature requests.
- See [`README.md`](README.md) for architecture and quick-start.
