# nexus-ai

Standalone PyTorch transformer inference service for NexusConsult. Serves the
NexusTransformer for intent classification, semantic similarity, fill-mask prediction,
and L2-normalized embedding generation.

```
┌─────────────────────────────────────────────────────────────────┐
│                     NexusTransformer Architecture               │
│                                                                 │
│  Input Text                                                     │
│      │                                                          │
│      ▼                                                          │
│  [BPE Tokenizer] ──► token_ids + attention_mask                 │
│      │                                                          │
│      ▼                                                          │
│  [Token Embedding] ──► (B, S, d_model)                         │
│      │                                                          │
│      ▼                                                          │
│  [Sinusoidal PE]   ──► adds position info (no parameters)       │
│      │                                                          │
│  ┌───┴──────────────────────────────────────────┐              │
│  │  ×N  EncoderBlock (Pre-LayerNorm)             │              │
│  │                                               │              │
│  │  x = x + Dropout(MHSA(LN(x)))                │              │
│  │  x = x + Dropout(FFN(LN(x)))                 │              │
│  │                                               │              │
│  │  MHSA: Q·K^T/√d_k → softmax → ·V → proj      │              │
│  │  FFN:  GELU(xW₁)W₂                            │              │
│  └───────────────────────────────────────────────┘              │
│      │                                                          │
│      ▼                                                          │
│  [LayerNorm] + [CLS] pooling ──► (B, d_model)                  │
│      │                                                          │
│      ├──► [Pooler (Linear+Tanh)] ──► [Classifier] ──► logits   │
│      └──► [L2-Normalize]         ──► embeddings                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

OpenAPI docs: http://localhost:8001/docs

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | `{status, service, version, uptime, device, model_loaded}` |
| `GET`  | `/info` | `{name, version, endpoints[], port}` |
| `POST` | `/v1/ai/classify` | Intent classification, top-k predictions |
| `POST` | `/v1/ai/embed` | L2-normalized embedding generation (cached) |
| `POST` | `/v1/ai/similarity` | Cosine similarity between two texts |
| `POST` | `/v1/ai/fill-mask` | Masked token prediction |
| `GET`  | `/v1/ai/models` | List available model checkpoints |
| `POST` | `/v1/ai/quantum/embed` | VQE quantum feature projection (see below) |

### Quantum Endpoint — `POST /v1/ai/quantum/embed`

Applies a VQE-inspired variational feature map to transformer embeddings,
projecting them from the model's hidden dimension into a smaller Hilbert space.

**Request**
```json
{
  "texts":      ["string", ...],   // 1–32 input texts
  "target_dim": 8,                 // 2–64, default 8
  "num_layers": 3                  // 1–8 variational circuit layers
}
```

**Response**
```json
{
  "classical_embeddings": [[float, ...]],  // PCA baseline projections
  "quantum_embeddings":   [[float, ...]],  // VQE-projected vectors
  "fidelity":             0.94,            // mean overlap ∈ [0, 1]
  "target_dim":           8,
  "fallback_used":        true,            // true when Azure Quantum absent
  "error":                null
}
```

**Graceful fallback**: when `AZURE_QUANTUM_WORKSPACE_ID` is absent the
simulation runs locally on CPU; `fallback_used` is `true`.  
**Error shape on failure**: `{"error": "...", "fallback_used": bool}` with the
appropriate HTTP status code.

## Inference Architecture

### Batching (asyncio.Queue)
Concurrent requests are collected for 10ms then run as a single forward pass,
reducing GPU/CPU overhead from O(n·seq²) to O(batch·seq²/batch):

```
req1 ──┐
req2 ──┤──► Queue ──► [drain every 10ms] ──► single model.forward(batch) ──► futures resolved
req3 ──┘
```

### Non-blocking Inference
All `torch` calls run in a thread pool via `anyio.to_thread.run_sync()` so the
FastAPI event loop never blocks during CPU/GPU compute.

### Embedding Cache
SHA-256 keyed Redis cache with 30-minute TTL. Multi-key lookups use Redis
pipelines (O(1) RTT regardless of batch size):

```python
cache_key = f"ai:embed:{sha256(json.dumps(texts)).hexdigest()}"
```

## Testing

```bash
pip install -r requirements-dev.txt

# Unit: tokenizer BPE correctness, transformer shapes, cosine math
pytest tests/unit/ -v

# BDD: classify and embed flows
pytest tests/bdd/ -v

# DDT: hypothesis-based tokenizer edge cases
pytest tests/ddt/ -v

# Regression: output shape contracts
pytest tests/regression/ -v

# E2E: full HTTP round-trips with mock model
pytest tests/e2e/ -v

# All
pytest -v
```

## Docker

```bash
docker-compose up --build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `MODEL_CHECKPOINT` | `""` | Path to `.pt` checkpoint file |
| `DEVICE` | `auto` | `auto`, `cpu`, or `cuda` |
| `MAX_SEQ_LEN` | `256` | Maximum token sequence length |
| `EMBED_CACHE_TTL` | `1800` | Embedding cache TTL (seconds) |
| `BATCH_DRAIN_MS` | `10.0` | Inference batch drain window (ms) |
| `PORT` | `8001` | Server port |

## Training (local only)

```bash
python -c "
from app.model.transformer import build_model
from app.model.tokenizer import BPETokenizer
from app.training.trainer import Trainer, TrainingConfig
# ... wire up dataset + loader
"
```

See `app/training/trainer.py` for the full AdamW + cosine LR + MLM pipeline.

## Error Responses

All errors return the standard envelope:
```json
{
  "error": "Human-readable message",
  "code": "SNAKE_CASE_CODE",
  "details": {},
  "request_id": "uuid-v4"
}
```
