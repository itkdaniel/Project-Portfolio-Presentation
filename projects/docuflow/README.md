# DocuFlow — Async Document Processing Pipeline

> Distributed document processing pipeline with OCR, structured data extraction, and vector indexing. Handles PDF, DOCX, HTML, and image files at scale using Celery workers.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com)
[![Celery](https://img.shields.io/badge/Celery-5.3-lime)](https://docs.celeryq.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
                           ┌──────────────────────────────────────────┐
 Client                    │              DocuFlow                      │
 ──────▶ POST /documents   │                                            │
         (multipart/form)  │  ┌─────────────┐     ┌────────────────┐   │
                           │  │  FastAPI     │─────▶ Redis (Broker) │   │
                           │  │  REST API    │     └────────────────┘   │
                           │  └──────┬──────┘              │            │
 Client                    │         │              ┌───────▼──────────┐ │
 ◀────── GET /docs/{id}    │         │              │  Celery Workers   │ │
         (status/result)   │         │              │  ┌─────────────┐  │ │
                           │         │              │  │  OCR Engine │  │ │
                           │         │              │  │ (Tesseract) │  │ │
                           │         │              │  └─────────────┘  │ │
                           │         │              │  ┌─────────────┐  │ │
                           │         │              │  │  Extractor  │  │ │
                           │         │              │  │  (schemas)  │  │ │
                           │         │              │  └─────────────┘  │ │
                           │         │              │  ┌─────────────┐  │ │
                           │         │              │  │  Embeddings │  │ │
                           │         │              │  │  (vectors)  │  │ │
                           │  ┌──────▼──────┐       │  └─────────────┘  │ │
                           │  │ PostgreSQL  │◀──────└───────────────────┘ │
                           │  │ (jobs,docs) │       ┌────────────────────┐ │
                           │  └─────────────┘       │  S3 / MinIO        │ │
                           │                         │  (file storage)    │ │
                           │                         └────────────────────┘ │
                           └──────────────────────────────────────────────┘
```

## Features

- **Multi-Format OCR** — PDF, DOCX, HTML, PNG, JPEG via Tesseract 5 + pdfplumber
- **Schema Inference** — Automatically detects invoice, receipt, form, table structures
- **Structured Extraction** — Rule-based + ML extraction for key-value pairs and tables
- **Vector Indexing** — Generates sentence embeddings for semantic search (pgvector)
- **Pluggable Storage** — S3, GCS, Azure Blob, or local filesystem
- **Job Queue** — Celery + Redis with priority queues and dead-letter handling
- **Retry Logic** — Exponential backoff with configurable max attempts
- **Webhook Callbacks** — POST to your URL when processing completes
- **REST API** — Full OpenAPI/Swagger docs at `/docs`

## Quick Start

```bash
# Clone
git clone https://github.com/itkdaniel/docuflow.git
cd docuflow

# Start all services with Docker Compose
docker-compose up -d

# Check status
docker-compose ps

# View worker logs
docker-compose logs -f worker
```

Services:
- API: `http://localhost:8000`
- Flower (queue monitor): `http://localhost:5555`
- MinIO console: `http://localhost:9001`

## Installation (without Docker)

```bash
# Install system dependencies
apt-get install -y tesseract-ocr tesseract-ocr-eng poppler-utils

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Run migrations
alembic upgrade head

# Start API server
uvicorn docuflow.main:app --reload --port 8000

# Start worker (separate terminal)
celery -A docuflow.worker worker --loglevel=info --concurrency=4
```

## API Reference

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/documents` | Upload document for processing |
| `GET` | `/documents/{id}` | Get job status and result |
| `GET` | `/documents/{id}/download` | Download extracted data |
| `GET` | `/documents` | List all documents (paginated) |
| `DELETE` | `/documents/{id}` | Delete document and data |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/search` | Semantic search across indexed documents |

### Examples

**Upload a PDF:**
```bash
curl -X POST http://localhost:8000/documents \
  -F "file=@invoice.pdf" \
  -F "schema=invoice" \
  -F "webhook_url=https://your-app.com/webhook"
```
```json
{
  "id": "doc_01HXK9...",
  "status": "queued",
  "filename": "invoice.pdf",
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Poll for results:**
```bash
curl http://localhost:8000/documents/doc_01HXK9...
```
```json
{
  "id": "doc_01HXK9...",
  "status": "completed",
  "filename": "invoice.pdf",
  "processing_time_ms": 1247,
  "result": {
    "schema": "invoice",
    "confidence": 0.94,
    "fields": {
      "invoice_number": "INV-2024-001",
      "vendor": "Acme Corp",
      "date": "2024-01-15",
      "total": 4250.00,
      "currency": "USD",
      "line_items": [
        {"description": "Engineering Services", "quantity": 10, "unit_price": 425.00}
      ]
    },
    "raw_text": "INVOICE\nAcme Corp\n...",
    "pages": 2
  }
}
```

**Semantic search:**
```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "engineering invoices over $1000", "limit": 10}'
```

## Supported Schemas

| Schema | Description |
|--------|-------------|
| `invoice` | Vendor invoices, purchase orders |
| `receipt` | Sales receipts, expense receipts |
| `form` | Generic key-value forms |
| `table` | Documents with tabular data |
| `contract` | Legal agreements (party extraction) |
| `auto` | Auto-detect schema (default) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | ✓ | — | Redis connection string (broker) |
| `STORAGE_BACKEND` | — | `local` | `local`, `s3`, `gcs`, `azure` |
| `S3_BUCKET` | * | — | S3 bucket name (if backend=s3) |
| `AWS_REGION` | * | — | AWS region |
| `MAX_FILE_SIZE_MB` | — | `50` | Maximum upload size |
| `WORKER_CONCURRENCY` | — | `4` | Celery worker threads |
| `OCR_LANGUAGE` | — | `eng` | Tesseract language code |
| `EMBEDDING_MODEL` | — | `all-MiniLM-L6-v2` | Sentence transformer model |
| `WEBHOOK_TIMEOUT_S` | — | `10` | Webhook delivery timeout |

## Testing

```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests (requires Docker services)
pytest tests/integration/ -v

# Full suite with coverage
pytest tests/ --cov=docuflow --cov-report=html

# Load test
locust -f tests/load/locustfile.py
```

## Monitoring

- **Flower** — Celery queue monitor at `http://localhost:5555`
- **Prometheus** — Metrics at `http://localhost:8000/metrics`
- **Grafana Dashboard** — Pre-built dashboard in `monitoring/dashboards/`

Key metrics:
- `docuflow_documents_processed_total` — Total documents processed
- `docuflow_processing_duration_seconds` — Per-schema processing time histogram
- `docuflow_queue_depth` — Current queue depth by priority
- `docuflow_worker_active` — Active workers

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
