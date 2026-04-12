# StreamForge — Kafka Event Pipeline

> High-throughput event streaming pipeline processing 50K+ events/sec with at-least-once delivery, outbox pattern, dead-letter queues, and reactive backpressure-aware consumers.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![Kafka](https://img.shields.io/badge/Kafka-3.7-black)](https://kafka.apache.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       StreamForge                              │
│                                                                │
│  Publishers                                                    │
│  ──────────▶ POST /events/{topic}                             │
│                    │                                           │
│              ┌─────▼──────┐     ┌───────────────────────┐     │
│              │  Outbox     │────▶│   Apache Kafka         │     │
│              │  Writer     │     │   ┌────────────────┐   │     │
│              │  (Postgres) │     │   │  Topic: orders  │   │     │
│              └────────────┘     │   ├────────────────┤   │     │
│                    ▲            │   │  Topic: events  │   │     │
│              ┌─────┴──────┐     │   ├────────────────┤   │     │
│              │  Outbox     │     │   │  Topic: DLQ     │   │     │
│              │  Relay      │     │   └────────────────┘   │     │
│              │  (Poller)   │     └──────────┬────────────┘     │
│              └────────────┘                │                    │
│                                    ┌───────▼────────────┐      │
│                                    │  Consumer Groups    │      │
│                                    │  ┌──────────────┐  │      │
│                                    │  │  CG: billing │  │      │
│                                    │  ├──────────────┤  │      │
│                                    │  │  CG: notify  │  │      │
│                                    │  ├──────────────┤  │      │
│                                    │  │  CG: audit   │  │      │
│                                    │  └──────────────┘  │      │
│                                    └────────────────────┘      │
│                                                                  │
│  Monitoring: GET /consumers/status   Prometheus: :9090/metrics  │
└──────────────────────────────────────────────────────────────────┘
```

## Features

- **Outbox Pattern** — Transactional event publishing via PostgreSQL outbox table
- **At-Least-Once Delivery** — Configurable consumer group offsets with manual commit
- **Dead-Letter Queue** — Failed messages routed to DLQ topic with retry metadata
- **DLQ Replay** — Replay DLQ messages back to the original topic on demand
- **Backpressure** — Consumer pause/resume based on downstream queue depth
- **Partition Rebalancing Alerts** — Prometheus alerts on lag spikes
- **Schema Registry** — Avro/JSON schema validation per topic
- **REST API** — Publish events and manage consumers via HTTP
- **Monitoring Dashboard** — Grafana dashboard with consumer lag, throughput, error rates

## Quick Start

```bash
# Clone
git clone https://github.com/itkdaniel/streamforge.git
cd streamforge

# Start infrastructure
docker-compose up -d

# Wait for Kafka to be ready
./scripts/wait-for-kafka.sh

# Run migrations
python -m alembic upgrade head

# Start the API server
uvicorn streamforge.main:app --reload --port 8002

# Start a consumer (separate terminal)
python -m streamforge.consumers.billing_consumer
```

Services available:
- API: `http://localhost:8002`
- Kafka UI: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin/admin)

## API Reference

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/events/{topic}` | Publish event to topic |
| `GET` | `/events/{topic}/schema` | Get topic schema |
| `POST` | `/events/batch` | Publish batch of events |

### Consumers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/consumers/status` | Consumer group lag and health |
| `POST` | `/consumers/{group}/pause` | Pause consumer group |
| `POST` | `/consumers/{group}/resume` | Resume consumer group |
| `GET` | `/consumers/{group}/offsets` | Current committed offsets |

### DLQ

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dlq` | List DLQ messages |
| `POST` | `/dlq/replay` | Replay all DLQ messages |
| `POST` | `/dlq/replay/{id}` | Replay specific DLQ message |
| `DELETE` | `/dlq/{id}` | Discard a DLQ message |

### Examples

**Publish an event:**
```bash
curl -X POST http://localhost:8002/events/orders \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "order.created",
    "payload": {
      "order_id": "ord_123",
      "user_id": "usr_456",
      "amount": 99.99,
      "items": [{"sku": "PROD-001", "qty": 2}]
    }
  }'
```
```json
{
  "event_id": "evt_01HXK...",
  "topic": "orders",
  "partition": 2,
  "offset": 10483,
  "status": "published"
}
```

**Check consumer lag:**
```bash
curl http://localhost:8002/consumers/status
```
```json
{
  "consumer_groups": [
    {
      "name": "billing",
      "topics": {
        "orders": {
          "partitions": 6,
          "total_lag": 0,
          "throughput_eps": 1247
        }
      },
      "state": "Stable"
    }
  ]
}
```

**Replay DLQ:**
```bash
curl -X POST http://localhost:8002/dlq/replay \
  -H "Content-Type: application/json" \
  -d '{"topic": "orders", "limit": 100}'
```

## Outbox Pattern

Events are written to a PostgreSQL `outbox` table within the same transaction as your business logic, then relayed to Kafka by the background poller:

```python
async with db.transaction():
    # Your business logic
    await db.execute("INSERT INTO orders ...")
    
    # Write to outbox in same transaction
    await publish_to_outbox(
        topic="orders",
        event_type="order.created",
        payload={"order_id": order.id, ...}
    )
# Outbox relay picks this up and publishes to Kafka
```

## Consumer Implementation

```python
from streamforge.consumers.base import BaseConsumer

class BillingConsumer(BaseConsumer):
    topic = "orders"
    group_id = "billing"
    
    async def process(self, event: Event) -> None:
        if event.event_type == "order.created":
            await billing_service.charge(event.payload["order_id"])
    
    async def on_error(self, event: Event, error: Exception) -> None:
        # Send to DLQ with metadata
        await self.send_to_dlq(event, error)
```

## Configuration

```yaml
# streamforge.yaml
kafka:
  brokers:
    - "kafka:9092"
  security_protocol: PLAINTEXT  # or SSL, SASL_SSL
  consumer:
    auto_offset_reset: earliest
    max_poll_records: 500
    session_timeout_ms: 30000
  producer:
    acks: all
    retries: 3
    linger_ms: 5

topics:
  orders:
    partitions: 6
    replication_factor: 3
    retention_ms: 604800000  # 7 days
    schema: schemas/order_event.json

  dlq:
    partitions: 3
    replication_factor: 3
    retention_ms: 2592000000  # 30 days

outbox:
  poll_interval_ms: 100
  batch_size: 100
  lock_timeout_ms: 5000

backpressure:
  max_queue_depth: 10000
  pause_threshold: 0.9   # pause at 90% queue depth
  resume_threshold: 0.5  # resume at 50%
```

## Testing

```bash
pytest tests/ -v
pytest tests/ --cov=streamforge --cov-report=html
```

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
