# Changelog — nexus-quantum

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Azure Quantum circuit simulation with local fallback (no Azure credentials required in dev)
- QAOA (Quantum Approximate Optimisation Algorithm) endpoint for combinatorial optimisation
- VQE (Variational Quantum Eigensolver) endpoint for ground-state energy estimation
- Quantum-inspired annealing endpoint for scheduling and resource allocation problems
- Clean REST API with consistent request/response schemas (Pydantic v2)
- HMAC-SHA256 JWT authentication with role-based access control
- SQLite in-memory backend for CI tests with zero external dependencies
- Unit tests, BDD scenarios (pytest-bdd), E2E integration tests, and regression contract tests
- Docker image with multi-stage build
- `CONTRIBUTING.md` with branch strategy and PR process

[Unreleased]: https://github.com/itkdaniel/nexus-quantum/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-quantum/releases/tag/v0.1.0
