"""
ORM models and Pydantic schemas for nexus-analytics.

Table layout
────────────
api_events
  id          INTEGER  PK autoincrement
  service     TEXT     sub-app / gateway name  (e.g. "nexus-quantum")
  method      TEXT     HTTP verb               (e.g. "POST")
  endpoint    TEXT     path template           (e.g. "/v1/quantum/jobs")
  status_code INTEGER  HTTP response code
  latency_ms  REAL     round-trip latency in milliseconds
  error       TEXT     error class name (NULL on success)
  ts          REAL     Unix epoch (seconds, float)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ── ORM ───────────────────────────────────────────────────────────────────────

class ApiEvent(Base):
    """One row per API call recorded by any NexusConsult service."""
    __tablename__ = "api_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ts: Mapped[float] = mapped_column(Float, nullable=False, index=True)

    __table_args__ = (
        Index("ix_api_events_service_ts", "service", "ts"),
        Index("ix_api_events_endpoint_ts", "endpoint", "ts"),
    )


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    """Payload accepted by POST /v1/analytics/events."""
    service: str = Field(..., min_length=1, max_length=64,
                         description="Sub-app name, e.g. 'nexus-quantum'")
    method: str = Field(..., pattern=r"^[A-Z]{3,7}$",
                        description="HTTP verb, e.g. 'GET'")
    endpoint: str = Field(..., min_length=1, max_length=256,
                          description="Path template, e.g. '/v1/quantum/jobs'")
    status_code: int = Field(..., ge=100, le=599)
    latency_ms: float = Field(..., ge=0, description="Round-trip latency ms")
    error: Optional[str] = Field(None, description="Error class name on failure")
    ts: Optional[float] = Field(
        None,
        description="Unix epoch in seconds; defaults to server time when omitted",
    )


class EventOut(BaseModel):
    """Single event response."""
    id: int
    service: str
    method: str
    endpoint: str
    status_code: int
    latency_ms: float
    error: Optional[str]
    ts: float

    class Config:
        from_attributes = True


class ServiceSummary(BaseModel):
    """Aggregate stats for one service."""
    service: str
    total_calls: int
    success_calls: int
    error_calls: int
    success_rate: float = Field(..., description="0–1 fraction of 2xx responses")
    avg_latency_ms: float
    p95_latency_ms: float


class EndpointSummary(BaseModel):
    """Stats for a single endpoint."""
    service: str
    method: str
    endpoint: str
    total_calls: int
    avg_latency_ms: float
    error_rate: float


class TimeseriesPoint(BaseModel):
    """One time bucket in the timeseries response."""
    bucket: str = Field(..., description="ISO-8601 bucket start timestamp")
    calls: int
    errors: int
    avg_latency_ms: float


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    uptime: float


class InfoResponse(BaseModel):
    name: str
    version: str
    port: int
    description: str
    endpoints: list[dict]
