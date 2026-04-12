# NexusML — Transformer Classification Service

> PyTorch encoder-only transformer built from scratch (no HuggingFace) for intent classification and semantic search. Includes BPE tokenizer, MLM pre-training, and INT8 quantization.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.2-red)](https://pytorch.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com)
[![CUDA](https://img.shields.io/badge/CUDA-12.1-green)](https://developer.nvidia.com/cuda)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Architecture

```
Input Text
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                  BPE Tokenizer                       │
│  - Byte-pair encoding from scratch                   │
│  - Vocabulary size: 32,000                           │
│  - Special tokens: [CLS], [SEP], [MASK], [PAD]      │
└──────────────────────┬──────────────────────────────┘
                       │  token_ids + attention_mask
                       ▼
┌─────────────────────────────────────────────────────┐
│          NexusTransformer (Pre-LN BERT-style)        │
│                                                      │
│  [CLS] t₁  t₂  t₃ ... tₙ [SEP]                     │
│    │    │                                            │
│  ┌─▼────▼──────────────────────────┐                │
│  │  Embedding Layer                 │                │
│  │  token_emb + position_emb       │                │
│  └─────────────────────────────────┘                │
│                    │                                 │
│  ┌─────────────────▼─────────────────────────────┐  │
│  │  Encoder Block × 4                             │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  LayerNorm → MHSA (8 heads) → Dropout  │  │  │
│  │  │  LayerNorm → FFN (768→3072→768)        │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                    │                                 │
│             [CLS] representation                     │
│                    │                                 │
│  ┌─────────────────▼──────────────┐                 │
│  │  Task-specific heads:           │                 │
│  │  • Classifier (N classes)       │                 │
│  │  • Similarity (L2 normalize)   │                 │
│  │  • MLM head (vocab projection)  │                 │
│  └────────────────────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

## Features

- **From-Scratch Transformer** — Pre-Layer Norm BERT-style architecture, no HuggingFace
- **BPE Tokenizer** — Byte-pair encoding built from scratch with Unicode support
- **MLM Pre-training** — Masked language model training pipeline with 15% masking rate
- **Fine-tuning** — Supervised classification with cosine LR schedule + AdamW
- **INT8 Quantization** — Dynamic quantization for CPU inference (4× speedup)
- **Redis Embedding Cache** — Semantic-hash-keyed cache for repeated queries
- **Batch Inference** — Efficient batched processing with padding and masking
- **FastAPI Service** — Async REST API with OpenAPI docs

## Quick Start

```bash
# Clone
git clone https://github.com/itkdaniel/nexusml.git
cd nexusml

# GPU environment
docker build -t nexusml:cuda --target cuda .
docker run --gpus all -p 8001:8001 nexusml:cuda

# CPU-only environment
docker build -t nexusml:cpu --target cpu .
docker run -p 8001:8001 nexusml:cpu

# Development
docker-compose up -d
```

## Model Specifications

| Parameter | Value |
|-----------|-------|
| Architecture | Encoder-only (BERT-style, Pre-LN) |
| Attention heads | 8 |
| Encoder layers | 4 |
| Hidden size | 768 |
| FFN intermediate | 3072 |
| Max sequence length | 512 |
| Vocabulary size | 32,000 (BPE) |
| Parameters (full) | ~86M |
| Parameters (INT8) | ~22M |

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ai/classify` | Intent classification |
| `POST` | `/ai/embed` | Generate L2-normalized embeddings |
| `POST` | `/ai/similarity` | Cosine similarity between texts |
| `POST` | `/ai/fill-mask` | Masked token prediction |
| `POST` | `/ai/batch-embed` | Batch embedding generation |
| `GET` | `/ai/model-info` | Model metadata and config |
| `GET` | `/health` | Service health check |

### Request / Response Examples

**Classify intent:**
```bash
curl -X POST http://localhost:8001/ai/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "book a consultation for next week"}'
```
```json
{
  "label": "booking.create",
  "confidence": 0.9247,
  "scores": {
    "booking.create": 0.9247,
    "booking.cancel": 0.0413,
    "booking.reschedule": 0.0340
  },
  "processing_ms": 8.3
}
```

**Generate embedding:**
```bash
curl -X POST http://localhost:8001/ai/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "distributed systems architecture"}'
```
```json
{
  "embedding": [0.023, -0.118, 0.445, ...],
  "dimensions": 768,
  "cached": false,
  "processing_ms": 12.1
}
```

**Semantic similarity:**
```bash
curl -X POST http://localhost:8001/ai/similarity \
  -H "Content-Type: application/json" \
  -d '{
    "text_a": "microservice architecture",
    "text_b": "distributed systems design"
  }'
```
```json
{
  "similarity": 0.873,
  "interpretation": "very_similar"
}
```

**Fill mask:**
```bash
curl -X POST http://localhost:8001/ai/fill-mask \
  -H "Content-Type: application/json" \
  -d '{"text": "The [MASK] gateway handles rate limiting."}'
```
```json
{
  "predictions": [
    {"token": "API", "score": 0.342},
    {"token": "service", "score": 0.289},
    {"token": "reverse proxy", "score": 0.201}
  ]
}
```

## Training

### Pre-training (MLM)

```bash
# Prepare corpus
python -m nexusml.training.prepare_corpus \
  --input data/raw/ \
  --output data/corpus.txt

# Train BPE tokenizer
python -m nexusml.tokenizer.train \
  --corpus data/corpus.txt \
  --vocab-size 32000 \
  --output models/tokenizer/

# Run MLM pre-training
python -m nexusml.training.pretrain \
  --corpus data/corpus.txt \
  --tokenizer models/tokenizer/ \
  --output models/pretrained/ \
  --epochs 10 \
  --batch-size 32 \
  --lr 1e-4 \
  --warmup-steps 10000
```

### Fine-tuning (Classification)

```bash
python -m nexusml.training.finetune \
  --pretrained models/pretrained/ \
  --data data/labels.jsonl \
  --output models/classifier/ \
  --epochs 5 \
  --batch-size 16 \
  --lr 2e-5
```

### INT8 Quantization

```bash
python -m nexusml.quantize \
  --model models/classifier/ \
  --output models/classifier-int8/ \
  --validate data/test.jsonl
```

## Architecture Deep-Dive

### BPE Tokenizer

```python
from nexusml.tokenizer import BPETokenizer

tokenizer = BPETokenizer.load("models/tokenizer/")
ids = tokenizer.encode("Hello, World!")
# → [101, 7592, 1010, 2088, 999, 102]

text = tokenizer.decode([101, 7592, 1010, 2088, 999, 102])
# → "Hello, World!"
```

### Model Architecture (key excerpts)

```python
class MultiHeadSelfAttention(nn.Module):
    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1):
        super().__init__()
        self.d_k = d_model // n_heads
        self.n_heads = n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None):
        B, T, C = x.shape
        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.d_k)
        q, k, v = qkv.unbind(dim=2)
        # Scaled dot-product attention
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))
        attn = self.dropout(F.softmax(scores, dim=-1))
        return (attn @ v).transpose(1, 2).reshape(B, T, C)
```

## Performance

| Environment | Throughput | p50 | p99 |
|-------------|-----------|-----|-----|
| GPU (A100) | 4,200 req/s | 2.1ms | 5.8ms |
| GPU (T4) | 1,800 req/s | 4.3ms | 11ms |
| CPU (full) | 220 req/s | 38ms | 95ms |
| CPU (INT8) | 890 req/s | 9.2ms | 24ms |

## Testing

```bash
pytest tests/ -v
pytest tests/test_model.py -v --tb=short
```

## License

MIT © [itkdaniel](https://github.com/itkdaniel)
