# ── CPU build ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS cpu
WORKDIR /app
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY . .
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8001/health || exit 1
CMD ["uvicorn", "nexusml.main:app", "--host", "0.0.0.0", "--port", "8001"]

# ── CUDA build ────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04 AS cuda
WORKDIR /app
ENV PYTHONUNBUFFERED=1 DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8001/health || exit 1
CMD ["uvicorn", "nexusml.main:app", "--host", "0.0.0.0", "--port", "8001"]
