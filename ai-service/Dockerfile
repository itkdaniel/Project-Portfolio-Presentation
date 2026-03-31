FROM python:3.11-slim

LABEL description="NexusConsult AI/ML Microservice — PyTorch Transformer"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1001 nexus && chown -R nexus /app
USER nexus

EXPOSE 8001

HEALTHCHECK --interval=60s --timeout=15s \
  CMD python -c "import httpx; httpx.get('http://localhost:8001/health', timeout=10)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]