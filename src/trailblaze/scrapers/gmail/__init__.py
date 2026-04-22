"""Gmail ingestion pipeline — analyst notes arrive via labeled email.

Pipeline: list labeled Gmail messages → sender-allowlist gate → render to
synthetic PDF → hand off to the existing Trailblaze PDF parser → relabel
message as ingested. Idempotent by Gmail ``message_id`` (see
``gmail_ingested_messages`` table).
"""
