# Changelog — nexus-ai

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Custom Pre-LN encoder transformer (NexusTransformer) built from scratch in PyTorch
- BPE tokenizer with byte-pair encoding, vocabulary persistence, and special-token handling
- Intent classification endpoint with softmax probability distribution
- L2-normalized semantic embedding generation endpoint
- Cosine semantic similarity scoring endpoint
- Fill-mask (MLM) prediction endpoint for top-k token candidates
- AdamW optimizer with cosine+warmup learning-rate schedule and gradient clipping
- FastAPI REST API with authentication middleware
- HMAC-SHA256 JWT authentication with role-based access control (admin / user)
- Unit tests, BDD scenarios (pytest-bdd), and regression contract tests
- Docker image with multi-stage build (CUDA-optional)
- `docker-compose.yml` for local development
- `CONTRIBUTING.md` with branch strategy and PR process

[Unreleased]: https://github.com/itkdaniel/nexus-ai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-ai/releases/tag/v0.1.0
