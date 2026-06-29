# Build context must be the apps/ directory (one level above this file):
#   docker build -f nexus-ai/Dockerfile .
# from the apps/ parent directory, or via docker-compose with context: ./apps

FROM python:3.11-slim AS builder

WORKDIR /build

# Install the shared quantum package first (requires apps/ build context)
COPY _shared/ /nexus_shared_src/
RUN pip install --no-cache-dir --prefix=/install /nexus_shared_src/

# Install app dependencies
COPY nexus-ai/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.11-slim AS runtime

RUN useradd -m -u 1001 nexus
WORKDIR /app

COPY --from=builder /install /usr/local
COPY nexus-ai/ .

RUN chown -R nexus:nexus /app
USER nexus

ENV PYTHONUNBUFFERED=1
ENV PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
