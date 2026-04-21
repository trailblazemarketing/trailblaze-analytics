"""Stock price + valuation ingester.

Pulls daily close, market cap, P/E and EV/EBITDA for every entity with a
populated ``ticker`` column. Writes to ``metric_values`` with source_type
``stock_api``.

Ticker → yfinance symbol mapping
--------------------------------
US NASDAQ / NYSE tickers need no suffix. Foreign-listed entities in the seed
use their local ticker (e.g. ``ALL`` for Aristocrat) which collides with US
symbols on Yahoo, so we append an exchange suffix. The mapping below covers
every non-US exchange currently in our entity seed; add new rows here when
new tickers are introduced.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from trailblaze.scrapers.periods import PeriodCache
from trailblaze.scrapers.upsert import (
    UpsertStats,
    build_metric_code_map,
    build_ticker_entity_map,
    resolve_source_id,
    upsert_metric_value,
)

log = logging.getLogger(__name__)


# Exchange code (as stored in entities.exchange) → yfinance suffix.
_EXCHANGE_SUFFIX: dict[str, str] = {
    # US — no suffix.
    "NASDAQ": "",
    "NYSE": "",
    # International.
    "ASX": ".AX",     # Australia
    "TSE": ".T",      # Tokyo
    "LSE": ".L",      # London
    "OMX": ".ST",     # Nasdaq Stockholm
    "NGM": ".ST",     # Nordic Growth Market — routed through Stockholm
    "ATSE": ".AT",    # Athens
}

# Metric codes this ingester writes.
_DAILY_METRICS = ("stock_price", "market_cap")
_SNAPSHOT_METRICS = ("pe_ratio", "ev_ebitda_multiple")


def yahoo_symbol(ticker: str, exchange: str | None) -> str | None:
    """Return the yfinance-compatible symbol, or None if exchange unsupported."""
    if not ticker:
        return None
    if exchange is None:
        return ticker  # best guess — assume US
    suffix = _EXCHANGE_SUFFIX.get(exchange)
    if suffix is None:
        return None
    # Yahoo uses '-' to separate share class in US tickers but '.' in Nordics
    # (e.g. BETS-B on OMX → BETS-B.ST works as-is).
    return f"{ticker}{suffix}"


def _to_decimal(v: Any) -> Decimal | None:
    if v is None:
        return None
    if isinstance(v, float) and (v != v):  # NaN
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None


def _pull_history(
    symbol: str,
    lookback_days: int,
) -> pd.DataFrame | None:
    """yfinance daily bars for the last N days, or None on failure."""
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period=f"{lookback_days}d", auto_adjust=False, raise_errors=False)
    except Exception as exc:
        log.warning("yfinance history %s failed: %s", symbol, exc)
        return None
    if hist is None or hist.empty:
        log.info("yfinance: no history for %s", symbol)
        return None
    return hist


def _pull_info(symbol: str) -> dict[str, Any]:
    """Fetch the ``info`` dict used for market cap / P/E / EV-EBITDA snapshots."""
    try:
        return yf.Ticker(symbol).info or {}
    except Exception as exc:
        log.warning("yfinance info %s failed: %s", symbol, exc)
        return {}


def ingest_daily_bars(
    session: Session,
    *,
    entity_id: uuid.UUID,
    symbol: str,
    source_id: uuid.UUID,
    metric_ids: dict[str, uuid.UUID],
    periods: PeriodCache,
    lookback_days: int,
    info: dict[str, Any],
) -> UpsertStats:
    stats = UpsertStats()
    hist = _pull_history(symbol, lookback_days)
    if hist is None:
        return stats

    # Shares outstanding for per-day market-cap reconstruction, if available.
    shares_out = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding")
    currency = info.get("currency") or "USD"

    for ts, row in hist.iterrows():
        if not isinstance(ts, (datetime, pd.Timestamp)):
            continue
        trade_date: date = ts.date() if isinstance(ts, (datetime, pd.Timestamp)) else ts
        close = _to_decimal(row.get("Close"))
        if close is None:
            continue
        period_id = periods.daily(trade_date)

        new, changed = upsert_metric_value(
            session,
            metric_id=metric_ids["stock_price"],
            period_id=period_id,
            source_id=source_id,
            entity_id=entity_id,
            value_numeric=close,
            currency=currency,
            notes=f"yfinance {symbol} daily close",
        )
        stats.record(new=new, changed=changed)

        if shares_out:
            mcap = close * Decimal(str(shares_out))
            new, changed = upsert_metric_value(
                session,
                metric_id=metric_ids["market_cap"],
                period_id=period_id,
                source_id=source_id,
                entity_id=entity_id,
                value_numeric=mcap,
                currency=currency,
                notes=f"yfinance {symbol}: close × sharesOutstanding",
            )
            stats.record(new=new, changed=changed)

    return stats


def ingest_snapshot_multiples(
    session: Session,
    *,
    entity_id: uuid.UUID,
    symbol: str,
    source_id: uuid.UUID,
    metric_ids: dict[str, uuid.UUID],
    periods: PeriodCache,
    info: dict[str, Any],
    as_of: date,
) -> UpsertStats:
    """P/E and EV/EBITDA are trailing snapshots — tag them to ``as_of`` day."""
    stats = UpsertStats()
    period_id = periods.daily(as_of)

    pe = info.get("trailingPE")
    if pe is not None:
        pe_dec = _to_decimal(pe)
        if pe_dec is not None:
            new, changed = upsert_metric_value(
                session,
                metric_id=metric_ids["pe_ratio"],
                period_id=period_id,
                source_id=source_id,
                entity_id=entity_id,
                value_numeric=pe_dec,
                notes=f"yfinance {symbol} trailingPE as of {as_of}",
            )
            stats.record(new=new, changed=changed)

    ev = info.get("enterpriseValue")
    ebitda = info.get("ebitda")
    ev_ebitda = info.get("enterpriseToEbitda")
    if ev_ebitda is None and ev and ebitda:
        try:
            ev_ebitda = float(ev) / float(ebitda) if float(ebitda) != 0 else None
        except (TypeError, ZeroDivisionError):
            ev_ebitda = None

    if ev_ebitda is not None:
        ev_ebitda_dec = _to_decimal(ev_ebitda)
        if ev_ebitda_dec is not None:
            new, changed = upsert_metric_value(
                session,
                metric_id=metric_ids["ev_ebitda_multiple"],
                period_id=period_id,
                source_id=source_id,
                entity_id=entity_id,
                value_numeric=ev_ebitda_dec,
                notes=f"yfinance {symbol} EV/EBITDA as of {as_of}",
            )
            stats.record(new=new, changed=changed)

    return stats


def ingest_all_tickers(
    session: Session,
    *,
    lookback_days: int = 7,
) -> UpsertStats:
    """Main entry point: pull stock data for every tickered entity."""
    source_id = resolve_source_id(session, "stock_api")
    metric_ids = build_metric_code_map(session)
    required_missing = [
        c for c in (*_DAILY_METRICS, *_SNAPSHOT_METRICS) if c not in metric_ids
    ]
    if required_missing:
        raise RuntimeError(
            f"Required metric codes missing from seed: {required_missing!r}. "
            "Run `trailblaze-seed` first."
        )
    periods = PeriodCache(session)
    ticker_map = build_ticker_entity_map(session)
    as_of = date.today() - timedelta(days=1)  # yesterday, after market close

    total = UpsertStats()
    for ticker, (entity_id, exchange) in sorted(ticker_map.items()):
        symbol = yahoo_symbol(ticker, exchange)
        if symbol is None:
            log.warning("ticker %s exchange=%s: no yfinance mapping, skipping",
                        ticker, exchange)
            continue
        log.info("yfinance pull: %s → %s", ticker, symbol)
        info = _pull_info(symbol)

        total.merge(ingest_daily_bars(
            session,
            entity_id=entity_id,
            symbol=symbol,
            source_id=source_id,
            metric_ids=metric_ids,
            periods=periods,
            lookback_days=lookback_days,
            info=info,
        ))
        total.merge(ingest_snapshot_multiples(
            session,
            entity_id=entity_id,
            symbol=symbol,
            source_id=source_id,
            metric_ids=metric_ids,
            periods=periods,
            info=info,
            as_of=as_of,
        ))
        # Flush per-ticker so a mid-run failure still preserves earlier work.
        session.flush()

    log.info("stocks ingest totals: inserted=%d updated=%d unchanged=%d",
             total.inserted, total.updated, total.unchanged)
    return total
