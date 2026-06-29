# Build context must be the repository root (two levels above nexus-graph/app/):
#   docker build -f nexus-graph/Dockerfile .
# from the repo root, or via docker-compose with context: .

# ── Stage 1: build React frontend ────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY nexus-graph/frontend/package*.json ./
RUN npm ci
COPY nexus-graph/frontend/ ./
RUN npm run build

# ── Stage 2: Python service ───────────────────────────────────────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install the shared quantum package first (requires repo-root build context)
COPY apps/_shared/ /nexus_shared_src/
RUN pip install --no-cache-dir /nexus_shared_src/

# Install the app (pyproject.toml declares nexus-shared as a dep, already met above)
COPY nexus-graph/pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY nexus-graph/app/ ./app/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8006
ENV PORT=8006

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8006"]
