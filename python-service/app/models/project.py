"""
SQLAlchemy ORM models and Pydantic schemas for Projects.

Design:
  - SQLAlchemy model: maps to PostgreSQL 'projects' table
  - Pydantic schemas: request/response validation (Factory pattern via
    create_project_schemas() if needed for multi-tenancy variants)
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Boolean, Text, ARRAY, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from app.database import Base


# ── ORM Model ─────────────────────────────────────────────────────────────────
class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str]         = mapped_column(String, primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str]       = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    long_description: Mapped[Optional[str]] = mapped_column(Text)
    type: Mapped[str]       = mapped_column(String, nullable=False)
    tags: Mapped[List[str]] = mapped_column(ARRAY(String), server_default="{}")
    image_url: Mapped[Optional[str]]     = mapped_column(String)
    github_url: Mapped[Optional[str]]    = mapped_column(String)
    run_command: Mapped[Optional[str]]   = mapped_column(String)
    test_command: Mapped[Optional[str]]  = mapped_column(String)
    usage_instructions: Mapped[Optional[str]] = mapped_column(Text)
    download_url: Mapped[Optional[str]]  = mapped_column(String)
    sandbox_url: Mapped[Optional[str]]   = mapped_column(String)
    demo_api_endpoint: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str]     = mapped_column(String, default="active")
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    featured: Mapped[bool]  = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


# ── Pydantic Schemas ──────────────────────────────────────────────────────────
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    long_description: Optional[str] = None
    image_url: Optional[str] = None
    github_url: Optional[str] = None
    run_command: Optional[str] = None
    test_command: Optional[str] = None
    usage_instructions: Optional[str] = None
    download_url: Optional[str] = None
    sandbox_url: Optional[str] = None
    demo_api_endpoint: Optional[str] = None
    published: bool = True
    featured: bool = False
    status: str = "active"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    """Partial update — all fields optional."""
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    tags: Optional[List[str]] = None
    published: Optional[bool] = None
    featured: Optional[bool] = None
    status: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True