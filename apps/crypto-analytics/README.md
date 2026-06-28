# Crypto Analytics

Portfolio analytics microservice for the NexusConsult platform.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness probe |
| GET | `/info` | No | Service metadata |
| GET | `/docs` | No | OpenAPI try-it UI |
| POST | `/v1/analytics/quantum/optimize` | No | QAOA portfolio optimization |

## Quantum Endpoint

### `POST /v1/analytics/quantum/optimize`

Applies QAOA-inspired simulated annealing to find Pareto-optimal portfolio
weights on the efficient frontier.

**Request:**
```json
{
  "assets": ["BTC", "ETH", "SOL"],
  "cov_matrix": [
    [0.04, 0.02, 0.01],
    [0.02, 0.03, 0.015],
    [0.01, 0.015, 0.02]
  ],
  "risk_tolerance": 0.5,
  "num_steps": 300
}
```

**Response:**
```json
{
  "quantum_weights":   {"BTC": 0.412, "ETH": 0.351, "SOL": 0.237},
  "classical_weights": {"BTC": 0.389, "ETH": 0.360, "SOL": 0.251},
  "quantum_sharpe":    1.234,
  "classical_sharpe":  1.189,
  "fallback_used":     true,
  "error":             null
}
```

**Algorithm:** QAOA-inspired weight annealing over the portfolio simplex, maximising
`expected_return - risk_tolerance * portfolio_variance`. Classical baseline uses
inverse-variance (Markowitz) weighting.

**Fallback:** When `AZURE_QUANTUM_WORKSPACE_ID` is absent, runs local simulation.
`fallback_used: true` indicates this.

## Quick Start

```bash
pip install -e ".[dev]"
uvicorn app.main:app --port 8104
```
