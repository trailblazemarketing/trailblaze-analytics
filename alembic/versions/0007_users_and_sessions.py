"""Demo-grade auth: users + sessions tables, seed `andrew` user.

This is the pilot-demo gate for logged-out visitors. NOT production auth —
Supabase (already scaffolded under `web/lib/supabase/`) is still the Phase 7
target. The intent here is a single-user-ish gate so a splash page can front
the current app home while Christian / the pilot group passes around a URL.

Schema
------
* ``users(id, username, password_hash, created_at, last_login_at)``
* ``sessions(id, user_id, token, created_at, expires_at, last_seen_at)``

``sessions.token`` is a 32-byte hex random generated in the Next.js API
route; stored plaintext here (token itself is the secret, same pattern as
most session-cookie libraries). Cascade delete when the user goes.

Seed
----
One user: ``andrew`` / ``trailblaze`` (low-stakes demo password, hashed
with bcrypt cost 10). Hash pre-computed via Node's bcryptjs so this
migration doesn't require a Python bcrypt install at apply-time.

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | None = None
depends_on: str | None = None


# Bcrypt hash of the string "trailblaze" at cost 10. Generated locally via:
#   node -e "console.log(require('bcryptjs').hashSync('trailblaze', 10))"
# Same salt/format the Next.js API route's `bcryptjs.compare` will accept.
# Demo-grade: the plaintext is in the migration comments + commit msg; if
# the hash ever needs rotating, just re-seed.
_ANDREW_HASH = "$2b$10$M7sizHwTcYpYmfs53BcYGuc8dH.5u0C.Nvo9gxfHYd0qN4lLop1z."


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("username", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    op.create_table(
        "sessions",
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
        sa.Column("token", sa.Text, nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "last_seen_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_sessions_token", "sessions", ["token"])
    op.create_index("idx_sessions_user_id", "sessions", ["user_id"])

    # Seed andrew / trailblaze. Idempotent via ON CONFLICT on the unique
    # username column so re-applying (e.g. after a local reset) is safe.
    op.execute(
        sa.text(
            "INSERT INTO users (username, password_hash) VALUES "
            "('andrew', :hash) ON CONFLICT (username) DO NOTHING"
        ).bindparams(hash=_ANDREW_HASH)
    )


def downgrade() -> None:
    op.drop_index("idx_sessions_user_id", table_name="sessions")
    op.drop_index("idx_sessions_token", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("users")
