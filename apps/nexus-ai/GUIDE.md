# Developer Guide — nexus-ai

## Project Structure

```
apps/nexus-ai/
├── app/
│   ├── main.py           — create_app() factory, lifespan, /health, /info
│   ├── config.py         — pydantic-settings (injectable for tests)
│   ├── batch.py          — asyncio.Queue inference batcher
│   ├── model/
│   │   ├── transformer.py — NexusTransformer (MHSA, FFN, EncoderBlock, SinusoidalPE)
│   │   └── tokenizer.py   — BPE tokenizer from scratch
│   ├── training/
│   │   └── trainer.py    — AdamW + cosine LR + MLM collator (local use only)
│   └── routers/
│       └── ai.py         — /v1/ai/* endpoints
├── tests/
│   ├── conftest.py       — MockModel, MockTokenizer, test_app fixture
│   ├── unit/             — tokenizer BPE, transformer shapes, cosine math
│   ├── bdd/              — pytest-bdd classify/embed scenarios
│   ├── ddt/              — hypothesis tokenizer edge cases
│   ├── regression/       — output shape contracts
│   └── e2e/              — full HTTP round-trips with mock model
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Factory Pattern

```python
from app.main import create_app
from app.config import Settings

# Production (reads from env)
app = create_app()

# Test isolation (inject settings)
app = create_app(Settings(redis_url="redis://localhost:6380", debug=True))
```

## Adding a New Endpoint

1. Add schema classes (Request/Response Pydantic models) to `app/routers/ai.py`
2. Add the route function decorated with `@router.post("/v1/ai/your-endpoint")`
3. Use `_require_model(request)` and `_require_tokenizer(request)` as dependencies
4. Wrap sync torch calls: `await anyio.to_thread.run_sync(lambda: _sync_fn(...))`
5. Add E2E test in `tests/e2e/test_ai_flow.py`
6. Update README endpoint table

## Mock Model for Tests

`tests/conftest.py` provides `MockModel` and `MockTokenizer` that implement the
same interface as the real model but return deterministic random tensors.
This means the full test suite runs in seconds with no GPU and no training.

```python
from tests.conftest import _make_test_app, MockModel

app = _make_test_app(mock_model=MockModel())  # inject custom mock
```

## Cache Key Format

SHA-256 (not MD5) of sorted JSON of input texts:
```python
key = f"ai:embed:{hashlib.sha256(json.dumps(texts, sort_keys=True).encode()).hexdigest()}"
```

Changing input order changes the hash — pass `sort_keys=True` and sort input
texts if order doesn't matter for your use case.

## Inference Batcher

For batch inference, use `InferenceBatcher`:

```python
from app.batch import InferenceBatcher

def sync_embed_fn(texts):
    # pure sync; runs in thread pool
    return _sync_embed(model, tokenizer, texts, max_len, device).tolist()

batcher = InferenceBatcher(sync_embed_fn, drain_ms=10.0)
await batcher.start()
results = await batcher.submit(["text 1", "text 2"])  # futures resolved after batch
await batcher.stop()
```

## Running in Production

```bash
# With a real checkpoint
MODEL_CHECKPOINT=/path/to/best_model.pt \
REDIS_URL=redis://redis:6379 \
DEVICE=cuda \
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 1
```

Single-worker is recommended — the asyncio batch queue is per-process.
For multi-worker setups, use a message queue (Celery/ARQ) instead of asyncio.Queue.
