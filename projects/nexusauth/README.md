# NexusAuth — JWT + RBAC Microservice

> Production-grade authentication and authorization microservice with role-based access control, refresh token rotation, device fingerprinting, and OAuth2 support.

[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     NexusAuth Service                     │
│                                                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐  │
│  │  Express  │──▶│  RBAC    │──▶│  JWT Engine           │  │
│  │  Router   │   │  Engine  │   │  (HMAC-SHA256)        │  │
│  └──────────┘   └──────────┘   └──────────────────────┘  │
│        │                               │                  │
│  ┌─────▼──────┐              ┌─────────▼──────┐           │
│  │ PostgreSQL  │              │    Redis Cache  │           │
│  │ (sessions, │              │  (token store,  │           │
│  │  users,    │              │   rate limits)  │           │
│  │  roles)    │              └────────────────┘           │
│  └────────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

## Features

- **JWT Authentication** — HMAC-SHA256 signed access tokens (15min) + refresh tokens (7 days)
- **Refresh Token Rotation** — Single-use refresh tokens with automatic rotation
- **Device Fingerprinting** — Binds sessions to user agent + IP hash
- **RBAC Engine** — Hierarchical role system: `viewer < user < moderator < admin < superadmin`
- **OAuth2 Ready** — Pluggable OAuth2 provider abstraction (GitHub, Google)
- **Rate Limiting** — Redis-backed token bucket per IP and per user
- **Audit Logging** — Every auth event logged with timestamp, IP, device
- **Password Policy** — zxcvbn strength estimation, breach detection via HaveIBeenPwned API

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/itkdaniel/nexusauth.git
cd nexusauth
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and REDIS_URL

# 3. Run with Docker Compose
docker-compose up -d

# 4. Run migrations
npm run db:migrate

# 5. Seed roles
npm run db:seed

# 6. Start dev server
npm run dev
```

The service starts on `http://localhost:3001`.

## Docker

```bash
# Development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker-compose up -d

# View logs
docker-compose logs -f nexusauth
```

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | — | Issue access + refresh tokens |
| `POST` | `/auth/register` | — | Register new user account |
| `POST` | `/auth/refresh` | Bearer | Rotate refresh token |
| `POST` | `/auth/logout` | Bearer | Revoke session |
| `POST` | `/auth/logout/all` | Bearer | Revoke all user sessions |
| `GET` | `/auth/me` | Bearer | Current user profile |

### Users & Roles

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | Admin | List all users |
| `GET` | `/users/:id` | Admin | Get user by ID |
| `PATCH` | `/users/:id/role` | Admin | Change user role |
| `DELETE` | `/users/:id` | Superadmin | Delete user |

### Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/sessions` | Bearer | List active sessions |
| `DELETE` | `/sessions/:id` | Bearer | Revoke specific session |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check |
| `GET` | `/health/ready` | Readiness check (DB + Redis) |

### Request / Response Examples

**Login:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"SecurePass123!"}'
```
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "rt_a1b2c3d4e5f6...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "usr_01HXK...",
    "email": "admin@example.com",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Using the token:**
```bash
curl http://localhost:3001/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Role Hierarchy

```
superadmin  ← can do everything + manage admins
    │
  admin     ← user management, system config
    │
moderator   ← content moderation
    │
   user     ← standard access
    │
  viewer    ← read-only access
```

Roles are enforced via the `requireRole(minRole)` middleware:

```typescript
router.get("/admin/stats", requireRole("admin"), statsController.get);
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | ✓ | — | Redis connection string |
| `JWT_SECRET` | ✓ | — | HMAC signing secret (min 32 chars) |
| `JWT_ACCESS_TTL` | — | `900` | Access token TTL (seconds) |
| `JWT_REFRESH_TTL` | — | `604800` | Refresh token TTL (seconds) |
| `PORT` | — | `3001` | Server port |
| `NODE_ENV` | — | `development` | Environment |
| `RATE_LIMIT_WINDOW` | — | `60` | Rate limit window (seconds) |
| `RATE_LIMIT_MAX` | — | `100` | Max requests per window |
| `HIBP_API_KEY` | — | — | HaveIBeenPwned API key |
| `LOG_LEVEL` | — | `info` | Logging level |

## Database Schema

```sql
-- Users table
CREATE TABLE users (
  id          VARCHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        role_enum NOT NULL DEFAULT 'user',
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions table (refresh tokens)
CREATE TABLE sessions (
  id              VARCHAR(26) PRIMARY KEY DEFAULT gen_ulid(),
  user_id         VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token   VARCHAR(255) NOT NULL UNIQUE,
  device_hash     VARCHAR(64),
  ip_address      INET,
  expires_at      TIMESTAMP NOT NULL,
  revoked_at      TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    VARCHAR(26) REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(64) NOT NULL,
  ip_address INET,
  metadata   JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Testing

```bash
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests (requires DB + Redis)
npm run test:coverage       # Coverage report
```

## Security Considerations

- JWT secrets must be ≥ 32 characters and stored in environment variables
- Refresh tokens are single-use (rotated on each use)
- Passwords are hashed with `bcrypt` (cost factor 12)
- All endpoints return generic error messages to prevent user enumeration
- Rate limiting applied per IP and per user to prevent brute force

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
