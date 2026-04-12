# InfraTrace — Distributed Tracing Platform

> OpenTelemetry-compatible distributed tracing collector and visualizer for microservice architectures. Stores spans in ClickHouse for sub-second queries over billions of spans.

[![Go](https://img.shields.io/badge/Go-1.22-blue)](https://go.dev)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-24-yellow)](https://clickhouse.com)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-compatible-blue)](https://opentelemetry.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
  Your Services (instrumented with OTEL SDK)
       │
       │  OTLP/gRPC (:4317) or OTLP/HTTP (:4318)
       ▼
┌──────────────────────────────────────────────────────────┐
│                    InfraTrace Collector                    │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  OTLP gRPC  │  │  OTLP HTTP   │  │  Zipkin Compat   │  │
│  │  Receiver   │  │  Receiver    │  │  Receiver        │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────┘  │
│         └────────────────┴──────────────────────┘          │
│                           │                                │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │                    Pipeline                          │   │
│  │  Sampling (tail-based) → Enrichment → Batching      │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           │                                │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │                  ClickHouse                          │   │
│  │  Distributed table: spans, services, operations      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
         │
         │  Query API (:8080)
         ▼
┌──────────────────────────────────────────────────────────┐
│                    InfraTrace UI                           │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Flame Graph  │  │ Service Map   │  │ Latency          │  │
│  │ (trace view) │  │ (dependency)  │  │ Histograms       │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Features

- **OpenTelemetry Compatible** — Accepts OTLP/gRPC (`:4317`) and OTLP/HTTP (`:4318`)
- **Zipkin Compatibility** — Drop-in Zipkin receiver for legacy instrumentation
- **Tail-Based Sampling** — Keeps 100% of error/slow traces, samples the rest
- **ClickHouse Storage** — Sub-second queries over billions of spans with columnar storage
- **Flame Graphs** — Hierarchical span visualization with critical path highlighting
- **Service Map** — Auto-generated dependency graph with error rate overlays
- **Latency Histograms** — p50/p95/p99 per service, operation, and span kind
- **Alert Rules** — Prometheus-compatible alerting on p99 latency, error rate
- **Retention Policies** — Configurable TTL per service

## Quick Start

```bash
# Clone
git clone https://github.com/itkdaniel/infratrace.git
cd infratrace

# Start all services
docker-compose up -d

# Verify collector is ready
curl http://localhost:8080/health
```

**Instrument your service:**

```go
// Go (using OpenTelemetry SDK)
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
)

exporter, _ := otlptracegrpc.New(ctx,
    otlptracegrpc.WithEndpoint("localhost:4317"),
    otlptracegrpc.WithInsecure(),
)
```

```python
# Python (using OpenTelemetry SDK)
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(endpoint="localhost:4317", insecure=True)
```

```javascript
// Node.js
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const exporter = new OTLPTraceExporter({ url: 'grpc://localhost:4317' });
```

Or set the environment variable:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Access the UI at `http://localhost:3000`.

## API Reference

### Traces

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/traces` | List recent traces (paginated) |
| `GET` | `/api/traces/{traceId}` | Get trace with all spans |
| `GET` | `/api/traces/search` | Search traces by attribute |

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/services` | List all instrumented services |
| `GET` | `/api/services/{name}/operations` | List service operations |
| `GET` | `/api/services/{name}/dependencies` | Service dependency graph |
| `GET` | `/api/services/{name}/metrics` | Latency, throughput, error rate |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metrics/latency` | Latency percentiles over time |
| `GET` | `/api/metrics/throughput` | Request throughput per service |
| `GET` | `/api/metrics/errors` | Error rates and top errors |

### Examples

**Search for slow traces:**
```bash
curl "http://localhost:8080/api/traces/search?min_duration_ms=500&service=api-service&limit=20"
```
```json
{
  "traces": [
    {
      "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
      "root_service": "api-service",
      "root_operation": "POST /orders",
      "duration_ms": 847,
      "span_count": 23,
      "error": false,
      "started_at": "2024-01-15T10:23:45.123Z"
    }
  ],
  "total": 147
}
```

**Get latency metrics:**
```bash
curl "http://localhost:8080/api/metrics/latency?service=api-service&operation=POST+/orders&window=1h"
```
```json
{
  "service": "api-service",
  "operation": "POST /orders",
  "window": "1h",
  "p50_ms": 42,
  "p95_ms": 210,
  "p99_ms": 847,
  "throughput_rps": 127.4
}
```

## ClickHouse Schema

```sql
CREATE TABLE spans (
  trace_id       String,
  span_id        String,
  parent_span_id Nullable(String),
  service_name   LowCardinality(String),
  operation_name LowCardinality(String),
  span_kind      LowCardinality(String),
  start_time     DateTime64(9, 'UTC'),
  end_time       DateTime64(9, 'UTC'),
  duration_ns    UInt64,
  status_code    UInt8,
  status_message Nullable(String),
  attributes     Map(String, String),
  events         Array(Tuple(String, DateTime64(9, 'UTC'), Map(String, String))),
  resource       Map(String, String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(start_time)
ORDER BY (service_name, operation_name, start_time)
TTL start_time + INTERVAL 30 DAY;
```

## Sampling Configuration

```yaml
# collector.yaml
sampling:
  # Keep 100% of traces with errors
  always_sample_on_error: true
  
  # Keep 100% of traces slower than threshold
  always_sample_above_ms: 500
  
  # Sample rate for normal traces
  default_rate: 0.1  # 10%
  
  # Per-service overrides
  services:
    auth-service: 1.0    # 100% - always trace auth
    batch-worker: 0.01   # 1% - noisy background jobs
```

## Building from Source

```bash
# Build collector
go build -o infratrace-collector ./cmd/collector

# Build UI
cd ui && npm install && npm run build

# Run tests
go test ./...
cd ui && npm test

# Build Docker images
docker-compose build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CLICKHOUSE_ADDR` | `localhost:9000` | ClickHouse address |
| `CLICKHOUSE_DB` | `infratrace` | Database name |
| `OTLP_GRPC_PORT` | `4317` | OTLP gRPC receiver port |
| `OTLP_HTTP_PORT` | `4318` | OTLP HTTP receiver port |
| `API_PORT` | `8080` | Query API port |
| `RETENTION_DAYS` | `30` | Span retention period |
| `BATCH_SIZE` | `1000` | Spans per ClickHouse batch |
| `FLUSH_INTERVAL_MS` | `1000` | Batch flush interval |

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
