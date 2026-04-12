# GraphShield — API Gateway with Rate Limiting

> High-performance API gateway in Go with token-bucket rate limiting, circuit breaker, request deduplication, and header-based routing. Handles 100K+ req/sec per instance.

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://go.dev)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
 Incoming           │            GraphShield Gateway           │
 Requests           │                                          │
 ──────────▶  ┌─────┴──────┐   ┌──────────┐   ┌───────────┐  │
              │  Rate       │   │ Circuit  │   │  Request  │  │
              │  Limiter    │──▶│ Breaker  │──▶│  Dedup    │  │
              │ (token-bkt) │   │          │   │  Cache    │  │
              └─────────────┘   └──────────┘   └─────┬─────┘  │
                    │                                 │         │
              ┌─────▼──────────────────────────────── ▼──────┐  │
              │              Router / Proxy                    │  │
              │  Header-based routing + load balancing        │  │
              └────────────────────────────────────────┬──────┘  │
                    │                                   │         │
              ┌─────▼──────┐   ┌──────────┐   ┌────── ▼──────┐  │
              │  Upstream   │   │  Redis   │   │  Prometheus  │  │
              │  Services   │   │  Cluster │   │  Metrics     │  │
              └────────────┘   └──────────┘   └─────────────┘  │
                    │                                            │
                    └────────────────────────────────────────────┘
```

## Features

- **Token Bucket Rate Limiting** — O(1) per request using Redis atomic Lua scripts
- **Circuit Breaker** — Half-open probing, configurable failure thresholds
- **Request Deduplication** — Idempotency key-based deduplication with configurable TTL
- **Header-Based Routing** — Route by `X-Service`, `Host`, path prefix, or custom headers
- **Load Balancing** — Round-robin, least-connections, consistent-hash strategies
- **Backpressure** — Queue depth limits + Retry-After headers
- **Prometheus Metrics** — Per-route latency histograms, error rates, queue depth
- **Graceful Shutdown** — Drains in-flight requests before stopping
- **mTLS Support** — Optional mutual TLS for upstream connections
- **Admin API** — Live rule management without restarts

## Quick Start

```bash
# Clone
git clone https://github.com/itkdaniel/graphshield.git
cd graphshield

# Build
go build -o graphshield ./cmd/graphshield

# Run with example config
./graphshield --config=examples/config.yaml

# Or with Docker
docker-compose up -d
```

The gateway starts on `:8080`, admin API on `:9090`.

## Configuration

```yaml
# config.yaml
server:
  port: 8080
  read_timeout: 30s
  write_timeout: 30s
  idle_timeout: 120s

admin:
  port: 9090
  enabled: true
  auth_token: "your-admin-token"

redis:
  addr: "localhost:6379"
  password: ""
  db: 0

rate_limiting:
  enabled: true
  default_rpm: 1000
  burst: 50
  key_prefix: "graphshield:rl:"

circuit_breaker:
  enabled: true
  failure_threshold: 5
  success_threshold: 2
  timeout: 30s

deduplication:
  enabled: true
  ttl: 60s
  header: "Idempotency-Key"

routes:
  - name: "api-service"
    match:
      path_prefix: "/api/"
      headers:
        X-Service: "api"
    upstream:
      urls:
        - "http://api-1:8000"
        - "http://api-2:8000"
      strategy: "round_robin"  # round_robin | least_conn | consistent_hash
      health_check:
        path: "/health"
        interval: 10s
    rate_limit:
      rpm: 500
      burst: 25

  - name: "auth-service"
    match:
      path_prefix: "/auth/"
    upstream:
      urls:
        - "http://nexusauth:3001"
      strategy: "round_robin"
    rate_limit:
      rpm: 100
      burst: 10

metrics:
  enabled: true
  path: "/metrics"
  port: 2112
```

## API Reference

### Proxy (Port 8080)

All traffic is proxied — GraphShield is transparent to clients. Request and response headers pass through, with the following additions:

| Header (added) | Description |
|---------------|-------------|
| `X-Request-ID` | Unique request identifier |
| `X-Response-Time` | Upstream latency in ms |
| `X-Rate-Limit-Remaining` | Remaining requests in window |
| `X-Rate-Limit-Reset` | Unix timestamp of window reset |

### Admin API (Port 9090)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/routes` | List all routes |
| `POST` | `/admin/routes` | Add a route |
| `PUT` | `/admin/routes/:name` | Update a route |
| `DELETE` | `/admin/routes/:name` | Remove a route |
| `GET` | `/admin/stats` | Global gateway stats |
| `GET` | `/admin/upstreams` | Upstream health status |
| `POST` | `/admin/circuit-breaker/:name/reset` | Force-reset circuit breaker |

```bash
# Check upstream health
curl http://localhost:9090/admin/upstreams \
  -H "Authorization: Bearer your-admin-token"
```
```json
{
  "upstreams": [
    {
      "name": "api-service",
      "healthy": 2,
      "unhealthy": 0,
      "circuit_state": "closed"
    }
  ]
}
```

### Metrics (Port 2112)

Prometheus-compatible `/metrics` endpoint exposes:

```
graphshield_requests_total{route, method, status}
graphshield_request_duration_seconds{route, le}
graphshield_active_connections
graphshield_rate_limited_total{route}
graphshield_circuit_breaker_state{route}  # 0=closed, 1=open, 2=half-open
graphshield_upstream_health{route, upstream}
```

## Rate Limiting Details

Uses Redis atomic Lua scripts for O(1) token bucket:

```
Token refill rate:  rpm / 60 tokens per second
Bucket capacity:    burst size
Cost per request:   1 token (configurable per route)
```

When the bucket is empty:
- Response: `429 Too Many Requests`
- Headers: `Retry-After: <seconds>`, `X-Rate-Limit-Reset: <unix-ts>`

Distributed across instances via Redis:
```lua
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
-- atomic token bucket logic...
```

## Circuit Breaker States

```
         ┌──────────────┐
  ──────▶│    CLOSED    │──── failures ≥ threshold ────▶┐
  reset  └──────────────┘                               │
    ▲                                                   ▼
    │                                          ┌──────────────┐
    │                                          │     OPEN     │
    │                                          └──────────────┘
    │                                                   │
    │                                              timeout
    │                                                   │
    │                                                   ▼
    └──── success ────────────────────────── ┌──────────────┐
                                              │  HALF-OPEN   │
                                              └──────────────┘
```

## Building from Source

```bash
# Run tests
go test ./...

# Run tests with race detector
go test -race ./...

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o graphshield-linux ./cmd/graphshield

# Build Docker image
docker build -t graphshield:latest .
```

## Kubernetes Deployment

```bash
kubectl apply -f k8s/

# Scale
kubectl scale deployment graphshield --replicas=3
```

Includes Horizontal Pod Autoscaler targeting 70% CPU.

## Benchmarks

Single instance on 4-core VM:

| Scenario | RPS | p50 | p95 | p99 |
|----------|-----|-----|-----|-----|
| Pass-through (no features) | 180K | 0.4ms | 0.9ms | 2.1ms |
| Rate limiting enabled | 140K | 0.6ms | 1.2ms | 2.8ms |
| Full feature stack | 95K | 0.9ms | 2.1ms | 4.5ms |

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
