"""create quantum tables

Revision ID: 001
Revises:
Create Date: 2026-06-27

Creates quantum_jobs and quantum_circuits tables.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quantum_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("job_type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("backend", sa.Text(), nullable=True),
        sa.Column("input_payload", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("result_payload", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quantum_jobs_status", "quantum_jobs", ["status"])
    op.create_index("ix_quantum_jobs_job_type", "quantum_jobs", ["job_type"])

    op.create_table(
        "quantum_circuits",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("qasm", sa.Text(), nullable=False),
        sa.Column("num_qubits", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("format", sa.Text(), nullable=False, server_default="openqasm3"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quantum_circuits_name", "quantum_circuits", ["name"])


def downgrade() -> None:
    op.drop_index("ix_quantum_circuits_name", table_name="quantum_circuits")
    op.drop_table("quantum_circuits")
    op.drop_index("ix_quantum_jobs_job_type", table_name="quantum_jobs")
    op.drop_index("ix_quantum_jobs_status", table_name="quantum_jobs")
    op.drop_table("quantum_jobs")
