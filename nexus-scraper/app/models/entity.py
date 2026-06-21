"""
SQLAlchemy ORM models for the NexusScraper entity database.
These mirror the Drizzle tables defined in shared/schema.ts.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EntityTypeORM(Base):
    __tablename__ = "entity_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    color: Mapped[str] = mapped_column(Text, nullable=False, default="#6366f1")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")


class EntityORM(Base):
    __tablename__ = "entities"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_label: Mapped[Optional[str]] = mapped_column(Text)
    raw_content: Mapped[Optional[str]] = mapped_column(Text)
    embedding: Mapped[Optional[List[float]]] = mapped_column(ARRAY(Double))
    confidence: Mapped[Optional[float]] = mapped_column(Double)
    trend_score: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, default=func.now()
    )
    classified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))

    relations_from: Mapped[List["EntityRelationORM"]] = relationship(
        "EntityRelationORM",
        foreign_keys="EntityRelationORM.from_entity_id",
        back_populates="from_entity",
        cascade="all, delete-orphan",
    )
    relations_to: Mapped[List["EntityRelationORM"]] = relationship(
        "EntityRelationORM",
        foreign_keys="EntityRelationORM.to_entity_id",
        back_populates="to_entity",
        cascade="all, delete-orphan",
    )


class EntityRelationORM(Base):
    __tablename__ = "entity_relations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_entity_id: Mapped[str] = mapped_column(
        String, ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    to_entity_id: Mapped[str] = mapped_column(
        String, ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    relation_type: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[float] = mapped_column(Double, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, default=func.now()
    )

    from_entity: Mapped["EntityORM"] = relationship(
        "EntityORM", foreign_keys=[from_entity_id], back_populates="relations_from"
    )
    to_entity: Mapped["EntityORM"] = relationship(
        "EntityORM", foreign_keys=[to_entity_id], back_populates="relations_to"
    )


class ScrapeJobORM(Base):
    __tablename__ = "scrape_jobs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    entity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))


class ScrapeSourceORM(Base):
    __tablename__ = "scrape_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    type: Mapped[str] = mapped_column(Text, nullable=False, default="html")
    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
