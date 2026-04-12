FROM python:3.11-slim AS base

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng \
    poppler-utils libmagic1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS builder
COPY requirements.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

FROM base AS production
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY . .
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "docuflow.main:app", "--host", "0.0.0.0", "--port", "8000"]
