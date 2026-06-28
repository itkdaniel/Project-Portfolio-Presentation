# NexusConsult Sub-App Template

Copy this directory to `apps/nexus-<name>/` to scaffold a new microservice that
follows the exact same structural conventions as all other NexusConsult sub-apps.

## Quick Start

```bash
# 1. Copy the template
bash apps/_template/scripts/new_subapp.sh my-feature 9001

# 2. Update app identity in app/config.py
#    - app_name, port, database_url

# 3. Add your ORM models to app/models.py

# 4. Implement your routers in app/routers/

# 5. Register the routers in app/main.py

# 6. Write Alembic migration in alembic/versions/

# 7. Register in server/gateway.ts (port + endpoints)

# 8. Add to docker-compose.yml (root)

# 9. Create .github/workflows/nexus-<name>-ci.yml
```

## Conventions

### File structure

```
apps/nexus-<name>/
├── app/
│   ├── __init__.py
│   ├── config.py          ← Settings (pydantic-settings)
│   ├── database.py        ← Async SQLAlchemy engine + session factory
│   ├── main.py            ← create_app() factory + /health + /info
│   ├── models.py          ← ORM models + Pydantic schemas
│   ├── routers/           ← One file per resource group
│   └── services/          ← Business logic (no FastAPI deps)
├── alembic/               ← DB migrations
├── tests/
│   ├── conftest.py        ← Fixtures (SQLite in-memory for CI)
│   ├── unit/              ← pytest unit tests
│   ├── bdd/               ← pytest-bdd feature files + steps
│   ├── regression/        ← Contract tests
│   └── e2e/               ← End-to-end httpx tests
├── Dockerfile             ← Multi-stage (builder → runtime)
├── docker-compose.yml     ← Standalone dev compose
├── requirements.txt
├── requirements-dev.txt
├── pytest.ini
├── alembic.ini
├── CI_CD.md
└── README.md
```

### Error envelope

All error responses must conform to:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {},
  "request_id": "<uuid>"
}
```

### Standard endpoints

Every sub-app must expose:
- `GET /health` → `{status, service, version, uptime}`
- `GET /info`   → `{name, version, port, description, endpoints[]}`
- `GET /docs`   → Swagger UI
- `GET /openapi.json` → OpenAPI spec

### Gateway registration

After building the sub-app, add an entry in `server/gateway.ts → buildRegistry()`
with all endpoints, port, and env var names following the pattern:

```typescript
baseUrl: resolveUrl("SUB_APP_MYNAME_URL", "NEXUS_MYNAME_URL", <port>),
```
