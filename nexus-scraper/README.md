# NexusScraper — Web Scraper + Entity Database

Part of the **NexusConsult** microservice portfolio.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         NexusScraper                             │
│                                                                  │
│  POST /v1/scrape/url ──► scraper.py (httpx + BeautifulSoup)     │
│         │                    │                                   │
│         │                    ▼                                   │
│         │             nlp_client.py ──► NexusAI /v1/ai/classify │
│         │                    │         NexusAI /v1/ai/embed      │
│         │                    ▼                                   │
│         └──────────► entities table (PostgreSQL)                 │
│                                                                  │
│  APScheduler ──► trending.py ──► HN API + Reddit API            │
│  (every 6 h)          │                                         │
│                        └──► deduplicate ──► scrape pipeline     │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/nexusdb"
export NEXUS_AI_URL="http://localhost:8001"   # optional — heuristic fallback if absent

# Run
uvicorn app.main:app --host 0.0.0.0 --port 8005 --reload

# Docker
docker build -t nexus-scraper .
docker run -p 8005:8005 -e DATABASE_URL=... nexus-scraper
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Health check — `{status, service, version, uptime}` |
| `GET`  | `/info` | Service metadata + endpoint list |
| `GET`  | `/openapi.json` | Auto-generated OpenAPI schema |
| `POST` | `/v1/scrape/url` | Scrape a URL — fetch HTML → extract text → NLP → store entity |
| `POST` | `/v1/scrape/onion` | Scrape a `.onion` URL via SOCKS5 Tor proxy |
| `GET`  | `/v1/scrape/jobs` | List recent scrape jobs `?limit=&offset=` |
| `GET`  | `/v1/scrape/jobs/{id}` | Job detail with extracted entities |
| `POST` | `/v1/scrape/trending` | Trigger a HN + Reddit trending scrape run |
| `GET`  | `/v1/entities` | Paginated entities `?limit=&offset=&type=&source=` |
| `GET`  | `/v1/entities/{id}` | Single entity with outgoing relations |
| `GET`  | `/v1/entity-types` | 10 available NLP classification types |

### Scrape a URL

```bash
curl -X POST http://localhost:8005/v1/scrape/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com", "source_label": "Manual"}'
```

### List entities filtered by type

```bash
curl "http://localhost:8005/v1/entities?type=Technology&limit=10"
```

### Trigger trending scrape manually

```bash
curl -X POST http://localhost:8005/v1/scrape/trending
```

## Entity Types

| Name | Color | Description |
|------|-------|-------------|
| Person | `#3b82f6` | Individual human — researcher, developer, executive |
| Organization | `#8b5cf6` | Company, institution, open-source project |
| Technology | `#06b6d4` | Language, framework, tool, protocol, standard |
| Concept | `#f59e0b` | Abstract idea, methodology, design pattern |
| Event | `#ef4444` | Conference, release, incident, announcement |
| Location | `#22c55e` | Country, city, cloud region, data-center |
| Product | `#f97316` | SaaS platform, hardware device, commercial offering |
| Article | `#a1a1aa` | Blog post, research paper, documentation page |
| Repository | `#ec4899` | Source-code repository (GitHub, GitLab, etc.) |
| Dataset | `#14b8a6` | Structured dataset, benchmark, corpus |

## Tor / Onion Scraping

The `POST /v1/scrape/onion` endpoint routes through SOCKS5. You must run Tor separately:

```bash
# Install Tor (macOS)
brew install tor && tor

# Default SOCKS5: 127.0.0.1:9050
# Override with env vars:
export TOR_SOCKS5_HOST=127.0.0.1
export TOR_SOCKS5_PORT=9050
```

## Tests

```bash
pytest tests/ -v --cov=app
```

## GitHub Actions CI

`.github/workflows/nexus-scraper-ci.yml` — lint → pytest → Docker build
