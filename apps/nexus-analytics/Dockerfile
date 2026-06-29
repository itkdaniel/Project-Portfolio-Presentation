# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build tools
RUN pip install --no-cache-dir pip==24.0 setuptools wheel

# Copy shared library first (needed for editable install)
COPY _shared/ /build/_shared/
RUN pip install --no-cache-dir /build/_shared/

# Copy service dependencies and install
COPY nexus-analytics/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir -r /build/requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY nexus-analytics/app ./app

# Non-root user for security
RUN adduser --disabled-password --gecos "" nexus
RUN mkdir -p /app/logs && chown nexus:nexus /app/logs
USER nexus

EXPOSE 8300

# Colour logs are rendered in the container console; JSON logs written to /app/logs/
ENV LOG_FILE=logs/nexus-analytics.jsonl \
    LOG_LEVEL=INFO

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8300"]
