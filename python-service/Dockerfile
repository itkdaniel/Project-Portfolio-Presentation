FROM python:3.11-slim

LABEL description="NexusConsult Python FastAPI Microservice"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1001 nexus && chown -R nexus /app
USER nexus

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s \
  CMD python -c "import httpx; httpx.get('http://localhost:8000/health', timeout=5)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]