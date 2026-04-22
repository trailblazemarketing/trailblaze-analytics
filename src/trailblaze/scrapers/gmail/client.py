"""Gmail API client — OAuth handshake, message fetch, label management.

The OAuth flow lives here so the rest of the pipeline can assume an
authenticated ``service`` object. The first run opens a browser for the
consent screen and writes a refresh token to ``secrets/gmail_token.json``;
subsequent runs silently reuse / refresh that token.

Label operations are idempotent at the Gmail side (``messages.modify`` with
an already-applied label is a no-op), so the orchestrator is free to call
``add_label`` / ``remove_label`` without pre-checking state.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from trailblaze.scrapers.gmail.config import (
    ALL_LABELS,
    CREDENTIALS_PATH,
    GMAIL_SCOPES,
    SECRETS_DIR,
    TOKEN_PATH,
)

log = logging.getLogger(__name__)


@dataclass
class ParsedMessage:
    """Normalised view of a Gmail message the orchestrator consumes."""

    message_id: str
    thread_id: str
    sender_email: str
    sender_name: str | None
    subject: str
    received_at: datetime | None
    html_body: str | None
    text_body: str | None
    label_ids: list[str]


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


def build_gmail_service():
    """Return an authenticated Gmail API service.

    On first run triggers the OAuth installed-app consent flow (browser). On
    subsequent runs loads the refresh token from disk and refreshes silently.
    Credentials file must exist at ``secrets/gmail_credentials.json``; token
    file is written to ``secrets/gmail_token.json``.
    """
    if not CREDENTIALS_PATH.exists():
        raise FileNotFoundError(
            f"Gmail OAuth client credentials not found at {CREDENTIALS_PATH}. "
            "Download the 'Desktop app' OAuth client from Google Cloud console "
            "and save it to that path."
        )

    SECRETS_DIR.mkdir(parents=True, exist_ok=True)

    creds: Credentials | None = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), GMAIL_SCOPES)

    if creds and creds.valid:
        pass
    elif creds and creds.expired and creds.refresh_token:
        log.info("refreshing Gmail OAuth token")
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    else:
        log.info(
            "no valid Gmail token — launching OAuth consent flow "
            "(browser will open; not suitable for unattended runs)"
        )
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CREDENTIALS_PATH), GMAIL_SCOPES
        )
        creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")

    return build("gmail", "v1", credentials=creds, cache_discovery=False)


# ---------------------------------------------------------------------------
# labels
# ---------------------------------------------------------------------------


def _list_label_map(service) -> dict[str, str]:
    """Return ``{label_name: label_id}`` for the authenticated user."""
    resp = service.users().labels().list(userId="me").execute()
    return {lbl["name"]: lbl["id"] for lbl in resp.get("labels", [])}


def ensure_labels_exist(service) -> dict[str, str]:
    """Create any Trailblaze labels that don't already exist. Return name→id map."""
    existing = _list_label_map(service)
    for name in ALL_LABELS:
        if name in existing:
            continue
        log.info("creating Gmail label %s", name)
        created = (
            service.users()
            .labels()
            .create(
                userId="me",
                body={
                    "name": name,
                    "labelListVisibility": "labelShow",
                    "messageListVisibility": "show",
                },
            )
            .execute()
        )
        existing[name] = created["id"]
    return existing


def _resolve_label(service, label_name: str, label_map: dict[str, str] | None = None) -> str:
    if label_map is None:
        label_map = _list_label_map(service)
    if label_name not in label_map:
        raise RuntimeError(f"label {label_name!r} does not exist on this account")
    return label_map[label_name]


def add_label(
    service,
    message_id: str,
    label_name: str,
    label_map: dict[str, str] | None = None,
) -> None:
    label_id = _resolve_label(service, label_name, label_map)
    service.users().messages().modify(
        userId="me", id=message_id, body={"addLabelIds": [label_id]}
    ).execute()


def remove_label(
    service,
    message_id: str,
    label_name: str,
    label_map: dict[str, str] | None = None,
) -> None:
    label_id = _resolve_label(service, label_name, label_map)
    try:
        service.users().messages().modify(
            userId="me", id=message_id, body={"removeLabelIds": [label_id]}
        ).execute()
    except HttpError as e:
        # Gmail raises 400 if the label isn't attached; treat as a no-op.
        log.debug("remove_label %s on %s: %s", label_name, message_id, e)


# ---------------------------------------------------------------------------
# message listing + fetch
# ---------------------------------------------------------------------------


def list_labeled_messages(
    service,
    label_name: str,
    label_map: dict[str, str] | None = None,
    max_results: int | None = None,
) -> list[str]:
    """Return all message IDs currently wearing ``label_name`` (paged)."""
    label_id = _resolve_label(service, label_name, label_map)
    ids: list[str] = []
    page_token: str | None = None
    while True:
        req_kwargs = {"userId": "me", "labelIds": [label_id], "maxResults": 100}
        if page_token:
            req_kwargs["pageToken"] = page_token
        resp = service.users().messages().list(**req_kwargs).execute()
        for m in resp.get("messages", []):
            ids.append(m["id"])
            if max_results is not None and len(ids) >= max_results:
                return ids
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


def _decode_b64url(data: str) -> bytes:
    # Gmail uses URL-safe base64 without padding.
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _walk_parts(payload: dict, html_parts: list[str], text_parts: list[str]) -> None:
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    data = body.get("data")
    if data:
        try:
            decoded = _decode_b64url(data).decode("utf-8", errors="replace")
        except Exception:
            decoded = ""
        if mime == "text/html":
            html_parts.append(decoded)
        elif mime == "text/plain":
            text_parts.append(decoded)
    for part in payload.get("parts", []) or []:
        _walk_parts(part, html_parts, text_parts)


def get_message(service, message_id: str) -> ParsedMessage:
    """Fetch and normalise one message."""
    msg = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}

    raw_from = headers.get("from", "")
    sender_name, sender_email = parseaddr(raw_from)
    subject = headers.get("subject", "") or ""

    received_at: datetime | None = None
    date_hdr = headers.get("date")
    if date_hdr:
        try:
            received_at = parsedate_to_datetime(date_hdr)
            if received_at.tzinfo is None:
                received_at = received_at.replace(tzinfo=timezone.utc)
        except Exception:
            received_at = None
    if received_at is None and msg.get("internalDate"):
        received_at = datetime.fromtimestamp(
            int(msg["internalDate"]) / 1000, tz=timezone.utc
        )

    html_parts: list[str] = []
    text_parts: list[str] = []
    _walk_parts(msg.get("payload", {}), html_parts, text_parts)

    return ParsedMessage(
        message_id=msg["id"],
        thread_id=msg.get("threadId", ""),
        sender_email=sender_email.strip().lower(),
        sender_name=sender_name or None,
        subject=subject,
        received_at=received_at,
        html_body="\n".join(html_parts) if html_parts else None,
        text_body="\n".join(text_parts) if text_parts else None,
        label_ids=msg.get("labelIds", []),
    )
