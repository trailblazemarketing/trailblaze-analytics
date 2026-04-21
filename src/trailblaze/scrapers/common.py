"""HTTP + logging helpers shared by all scrapers."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
DEFAULT_HEADERS = {
    "User-Agent": (
        "TrailblazeAnalytics/0.1 (+https://trailblaze-marketing.com; "
        "contact=andrew@trailblaze-marketing.com) httpx"
    ),
    "Accept": "*/*",
}


def http_client(**overrides: Any) -> httpx.Client:
    """Return a configured httpx.Client. Caller owns the lifecycle (use as cm)."""
    kwargs: dict[str, Any] = {
        "timeout": DEFAULT_TIMEOUT,
        "headers": DEFAULT_HEADERS,
        "follow_redirects": True,
    }
    kwargs.update(overrides)
    return httpx.Client(**kwargs)


def get_with_retries(
    client: httpx.Client,
    url: str,
    *,
    max_attempts: int = 3,
    backoff: float = 1.5,
) -> httpx.Response:
    """GET with exponential backoff. Raises on final failure."""
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            resp = client.get(url)
            if resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"{resp.status_code} from {url}", request=resp.request, response=resp
                )
            resp.raise_for_status()
            return resp
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt == max_attempts:
                break
            sleep = backoff ** attempt
            log.warning("GET %s attempt %d/%d failed (%s); sleeping %.1fs",
                        url, attempt, max_attempts, exc, sleep)
            time.sleep(sleep)
    assert last_exc is not None
    raise last_exc


def configure_logging(level: int = logging.INFO) -> None:
    """Bootstrap logging when a scraper is invoked from a CLI."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
