"""Admin role + user profiles + session analytics log.

Extends the ``users`` table with profile fields + a ``role`` and ``state``
enum (as TEXT + CHECK constraints), seeds an ``admin`` user, promotes
``andrew`` to admin, and adds a ``user_sessions_log`` table for analytics.

NOT production auth — still demo-grade. Phase 7 swaps this for Supabase.

Revision ID: 0009
Revises: 0007
Create Date: 2026-04-24

Note: no 0008 exists. Day 3 sandbox-reported "migration 0008 not needed"
because ``sources.source_type`` already accepted ``'beacon_estimate'``.
This migration picks up at 0009 to match the brief's numbering.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0007"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # --- users: new profile columns -----------------------------------------
    op.add_column("users", sa.Column("role", sa.Text, nullable=False, server_default="user"))
    op.add_column("users", sa.Column("state", sa.Text, nullable=False, server_default="dormant"))
    op.add_column("users", sa.Column("email", sa.Text, nullable=True))
    op.add_column("users", sa.Column("first_name", sa.Text, nullable=True))
    op.add_column("users", sa.Column("last_name", sa.Text, nullable=True))
    op.add_column("users", sa.Column("company", sa.Text, nullable=True))
    op.add_column("users", sa.Column("profile_picture_path", sa.Text, nullable=True))

    op.execute(
        "CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL"
    )

    op.create_check_constraint(
        "users_role_check", "users", "role IN ('admin', 'user')"
    )
    op.create_check_constraint(
        "users_state_check",
        "users",
        "state IN ('dormant', 'subscription', 'admin')",
    )

    # --- user_sessions_log -------------------------------------------------
    op.create_table(
        "user_sessions_log",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("event_type", sa.Text, nullable=False),
        sa.Column("ip_address", sa.Text, nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("country", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_sessions_log_user_id", "user_sessions_log", ["user_id"])
    op.create_index(
        "idx_sessions_log_created_at",
        "user_sessions_log",
        [sa.text("created_at DESC")],
    )

    # --- seed / upgrade accounts -------------------------------------------
    # pgcrypto is already installed (seen during pre-flight). Using crypt()
    # here so the migration is self-contained — the existing bcryptjs in the
    # API routes accepts both $2a (pgcrypto) and $2b (bcryptjs) prefixes.
    op.execute(
        """
        INSERT INTO users (username, password_hash, role, state, email, first_name)
        VALUES ('admin', crypt('0000', gen_salt('bf')), 'admin', 'admin',
                'admin@trailblaze.local', 'Admin')
        ON CONFLICT (username) DO UPDATE SET
            role = 'admin',
            state = 'admin',
            password_hash = EXCLUDED.password_hash
        """
    )
    op.execute(
        "UPDATE users SET role = 'admin', state = 'admin' WHERE username = 'andrew'"
    )


def downgrade() -> None:
    op.drop_index("idx_sessions_log_created_at", table_name="user_sessions_log")
    op.drop_index("idx_sessions_log_user_id", table_name="user_sessions_log")
    op.drop_table("user_sessions_log")

    op.drop_constraint("users_state_check", "users", type_="check")
    op.drop_constraint("users_role_check", "users", type_="check")
    op.execute("DROP INDEX IF EXISTS idx_users_email")
    op.drop_column("users", "profile_picture_path")
    op.drop_column("users", "company")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
    op.drop_column("users", "email")
    op.drop_column("users", "state")
    op.drop_column("users", "role")
