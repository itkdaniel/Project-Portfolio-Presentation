# Contributing to NexusConsult

Thank you for considering a contribution. This document outlines the standards and workflow for this project.

---

## Development Setup

```bash
git clone https://github.com/your-org/nexusconsult
cd nexusconsult
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET
npm run db:push
npm run dev
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Protected. Requires PR + review. |
| `develop` | Integration branch. All features merge here first. |
| `feature/<name>` | Individual feature work. Branch from `develop`. |
| `fix/<name>` | Bug fixes. Branch from `main` for hotfixes, `develop` otherwise. |

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

Examples:
```
feat(booking): add 15-minute slot granularity
fix(auth): correct token expiry calculation
docs(readme): update k8s deployment instructions
test(api): add RBAC integration tests
```

---

## Code Standards

### TypeScript (server + client)

- Use `strict: true` TypeScript — all types must be explicit
- No `any` unless you add a `// eslint-disable-next-line` comment with justification
- Use Zod for all external input validation — never trust request bodies without parsing
- Prefer `async/await` over promise chains
- All API routes must validate input with `insertXSchema.parse(req.body)` before storage calls
- Export one thing per file when possible (keeps imports clear)

### Python (python-service, ai-service)

- Type annotations on all function signatures (PEP 484)
- Use `pydantic` for all request/response models
- `async def` for all I/O functions — no blocking calls in FastAPI handlers
- Document algorithm choices in docstrings: complexity, trade-offs, references
- Prefer `dataclasses` for config, `pydantic` for API schemas

### React (client)

- Functional components only — no class components
- `data-testid` attribute on every interactive element and meaningful display element
- Custom hooks for all data fetching logic (`useMutation`, `useQuery`)
- Form validation via `react-hook-form` + `zod` resolver
- No hardcoded strings in JSX — use constants or props

---

## Testing Requirements

All pull requests must:

1. **Pass existing tests** — `npm test` and `cd python-service && pytest tests/` must be green
2. **Add tests for new features** — minimum happy-path + one error case
3. **Not drop coverage** — check with `npm run test:coverage`

Test placement:
- Unit tests: `tests/unit/` (backend utilities, schemas, algorithms)
- Integration tests: `tests/unit/api.test.ts` (routes with real DB)
- E2E tests: `tests/e2e/` (Playwright browser tests)
- Regression tests: `tests/regression/` (API contract stability)
- Python unit tests: `python-service/tests/`

---

## Pull Request Process

1. Fork the repo and create your branch from `develop`
2. Write code, tests, and update docs
3. Run the full test suite locally
4. Open a PR against `develop` with:
   - Clear title (Conventional Commit format)
   - Description of _what_ changed and _why_
   - Screenshot or test output for UI changes
   - Linked issue number if applicable
5. CI must be green before review
6. One approval required from a maintainer
7. Squash merge with a clean commit message

---

## Adding a New API Endpoint

1. Add types to `shared/schema.ts` (Drizzle table + Zod schemas)
2. Run `npm run db:push` to sync schema
3. Add storage method to `server/storage.ts` (implement in `DatabaseStorage`)
4. Add route to `server/routes.ts` (thin controller, validate → storage → respond)
5. Update `client/src/lib/api.ts` if adding a client-side call
6. Write tests in `tests/unit/api.test.ts`

---

## Infrastructure Changes

- Docker changes: test with `docker-compose up --build`
- K8s changes: validate with `kubectl apply --dry-run=client -f k8s/`
- CI changes: test via GitHub Actions on a branch (not directly on `main`)
- Secrets: never commit real credentials. Use `.env` locally, GitHub Secrets in CI.

---

## Questions?

Open a GitHub Discussion or reach out at team@nexusconsult.dev.