"""Gmail ingest: analyst_note source type + gmail_ingested_messages table.

Adds ``analyst_note`` to the ``sources.source_type`` check constraint so the
Gmail pipeline can attribute metric_values to an analyst-note provenance, and
creates ``gmail_ingested_messages`` as the idempotency + audit log for the
``trailblaze-scrape-gmail`` CLI.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-22
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Widen the sources.source_type check to include 'analyst_note'.
    op.drop_constraint("ck_sources_source_type", "sources", type_="check")
    op.create_check_constraint(
        "ck_sources_source_type",
        "sources",
        "source_type in ('trailblaze_pdf','regulator_filing','sec_filing','company_ir',"
        "'stock_api','industry_trade','social_media','beacon_estimate','manual_entry',"
        "'analyst_note')",
    )

    op.create_table(
        "gmail_ingested_messages",
        sa.Column("message_id", sa.Text, primary_key=True),
        sa.Column("sender_email", sa.Text, nullable=False),
        sa.Column("sender_name", sa.Text),
        sa.Column("subject", sa.Text),
        sa.Column("received_at", sa.TIMESTAMP(timezone=True)),
        sa.Column(
            "ingested_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("error_message", sa.Text),
        sa.Column("pdf_filename", sa.Text),
        sa.CheckConstraint(
            "status in ('ingested','error','rejected_sender','skipped_duplicate')",
            name="ck_gmail_ingested_messages_status",
        ),
    )
    op.create_index(
        "ix_gmail_ingested_messages_sender", "gmail_ingested_messages", ["sender_email"]
    )
    op.create_index(
        "ix_gmail_ingested_messages_status", "gmail_ingested_messages", ["status"]
    )


def downgrade() -> None:
    op.drop_index("ix_gmail_ingested_messages_status", table_name="gmail_ingested_messages")
    op.drop_index("ix_gmail_ingested_messages_sender", table_name="gmail_ingested_messages")
    op.drop_table("gmail_ingested_messages")

    op.drop_constraint("ck_sources_source_type", "sources", type_="check")
    op.create_check_constraint(
        "ck_sources_source_type",
        "sources",
        "source_type in ('trailblaze_pdf','regulator_filing','sec_filing','company_ir',"
        "'stock_api','industry_trade','social_media','beacon_estimate','manual_entry')",
    )
