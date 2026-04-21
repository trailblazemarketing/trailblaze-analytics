"""New Jersey Division of Gaming Enforcement.

NJ DGE publishes three monthly documents we care about:

* ``PressRelease{YYYY}/{Month}{YYYY}.pdf`` — narrative + MONTH table with
  state totals (casino win, internet gaming win, sports wagering revenue).
* ``IGRTaxReturns/{YYYY}/{Month}{YYYY}.pdf`` — per-license internet gaming
  tax returns (DGE-105). Each license's skin-detail section breaks out
  monthly win by partner/operator.
* ``SWRTaxReturns/{YYYY}/{Month}{YYYY}.pdf`` — per-license sports wagering
  tax returns (DGE-107). Each skin-detail section breaks out monthly
  online sportsbook gross revenue by partner/operator.

State totals → ``market_id``. Operator breakdowns → ``entity_id`` + ``market_id``.
"""

from __future__ import annotations

import calendar
import io
import logging
import re
from datetime import date
from decimal import Decimal

import httpx
import pypdf

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import DEFAULT_TIMEOUT
from trailblaze.scrapers.operator_resolver import OperatorResolver
from trailblaze.scrapers.regulators._pdf import find_labeled_amount

log = logging.getLogger(__name__)


# NJ DGE (incapsula-gated) rejects minimal UAs. A normal browser UA works.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)

_MONTH_NAMES = [calendar.month_name[i] for i in range(1, 13)]


# Known skin/partner brand names appearing in NJ DGE monthly IGR + SWR returns.
# Ordered longest-first so the greedy tokeniser matches multi-word brands before
# single-word prefixes (e.g. "Bally Bet" before "Bally").
_NJ_SKIN_VOCABULARY: tuple[str, ...] = (
    "Caesars Sportsbook", "Caesars Palace", "Resorts Casino", "Mohegan Sun",
    "Party Poker", "Pala/Stardust", "Wheel of Fortune", "Hard Rock Bet",
    "Golden Nugget", "theScore Bet", "Bet365", "bet365",
    "BetFanatics", "Fanatics", "BetMGM", "BetRivers", "betParx", "BetParx",
    "DraftKings", "FanDuel", "PokerStars", "Jackpocket", "PlayStar", "PLAYSTAR",
    "Hard Rock", "Bally Bet", "Borgata", "Monopoly", "Tropicana", "Stardust",
    "Sporttrade", "SPORTTRADE", "Betinia", "Caesars", "Resorts", "Ocean",
    "OCEAN", "Bally", "WSOP", "Pala", "Prime", "PRIME",
)


def _tokenise_header(header: str, vocabulary: tuple[str, ...]) -> list[str]:
    """Greedy-longest-match against ``vocabulary``. Strips trailing 'Total'."""
    h = header.strip()
    if h.endswith("Total"):
        h = h[: -len("Total")].rstrip()
    result: list[str] = []
    i = 0
    while i < len(h):
        # Skip whitespace
        if h[i].isspace():
            i += 1
            continue
        matched = False
        for name in vocabulary:
            # Case-insensitive compare on a slice of equal length.
            end = i + len(name)
            if end <= len(h) and h[i:end].lower() == name.lower():
                # Must be followed by whitespace/EOL (avoid prefix matches).
                if end == len(h) or h[end].isspace():
                    result.append(h[i:end])
                    i = end
                    matched = True
                    break
        if not matched:
            # Consume a single word as an unknown-operator segment.
            m = re.match(r"\S+", h[i:])
            if not m:
                break
            result.append(m.group(0))
            i += len(m.group(0))
    return result


def _press_release_url(year: int, month: int) -> str:
    mname = _MONTH_NAMES[month - 1]
    return f"https://www.nj.gov/oag/ge/docs/Financials/PressRelease{year}/{mname}{year}.pdf"


def _igr_tax_return_url(year: int, month: int) -> str:
    mname = _MONTH_NAMES[month - 1]
    return f"https://www.nj.gov/oag/ge/docs/Financials/IGRTaxReturns/{year}/{mname}{year}.pdf"


def _swr_tax_return_url(year: int, month: int) -> str:
    mname = _MONTH_NAMES[month - 1]
    return f"https://www.nj.gov/oag/ge/docs/Financials/SWRTaxReturns/{year}/{mname}{year}.pdf"


def _download_pdf_text(client: httpx.Client, url: str) -> str | None:
    try:
        resp = client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("NJ DGE: fetch %s failed (%s)", url, exc)
        return None
    try:
        reader = pypdf.PdfReader(io.BytesIO(resp.content))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as exc:
        log.warning("NJ DGE: PDF parse %s failed (%s)", url, exc)
        return None


class NewJerseyDGEScraper(RegulatorScraper):
    name = "NJ DGE"
    market_slug = "us-new-jersey"
    base_url = "https://www.nj.gov/oag/ge/"
    scraper_status = "production"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months
        self.operator_resolver: OperatorResolver | None = None

    def _candidate_months(self) -> list[tuple[int, int]]:
        today = date.today()
        out: list[tuple[int, int]] = []
        y, m = today.year, today.month
        for _ in range(self.months):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
            out.append((y, m))
        return out

    def scrape(self) -> list[ScrapedMetric]:
        records: list[ScrapedMetric] = []
        self.operator_resolver = OperatorResolver.build(
            self.session, self.market_id, self.market_slug,
        )
        headers = {"User-Agent": _BROWSER_UA, "Accept": "application/pdf,*/*"}
        with httpx.Client(headers=headers, timeout=DEFAULT_TIMEOUT,
                          follow_redirects=True) as client:
            for year, month in self._candidate_months():
                records.extend(self._pull_month(client, year, month))
        return records

    # ---- per-month pipeline -----------------------------------------------

    def _pull_month(self, client: httpx.Client, year: int,
                    month: int) -> list[ScrapedMetric]:
        out: list[ScrapedMetric] = []

        # 1. State totals from the press release.
        pr_text = _download_pdf_text(client, _press_release_url(year, month))
        if pr_text:
            out.extend(self._parse_press_release(pr_text, year, month))
        else:
            self.log.info("NJ %04d-%02d: no press release yet", year, month)

        # 2. Operator-level iGaming from the IGR tax return.
        igr_text = _download_pdf_text(client, _igr_tax_return_url(year, month))
        if igr_text:
            out.extend(self._parse_igr(igr_text, year, month))

        # 3. Operator-level online sportsbook from the SWR tax return.
        swr_text = _download_pdf_text(client, _swr_tax_return_url(year, month))
        if swr_text:
            out.extend(self._parse_swr(swr_text, year, month))

        return out

    # ---- press release (state totals) -------------------------------------

    def _parse_press_release(self, text: str, year: int,
                             month: int) -> list[ScrapedMetric]:
        recs: list[ScrapedMetric] = []
        src_url = _press_release_url(year, month)

        def push(code: str, amt: Decimal | None, label: str) -> None:
            if amt is None:
                return
            recs.append(ScrapedMetric(
                metric_code=code,
                period_year=year,
                period_month=month,
                value_numeric=amt,
                currency="USD",
                market_id=self.market_id,
                notes=f"NJ DGE press release {year}-{month:02d}: {label}",
                source_url=src_url,
            ))

        # Prefer the MONTH table rows (exact dollars); fall back to narrative sentences.
        push("casino_revenue", self._amount_on_line(text, "Casino Win"),
             "Casino Win (MONTH table)")
        push("online_ggr", self._amount_on_line(text, "Internet Gaming Win"),
             "Internet Gaming Win (MONTH table)")
        push("sportsbook_revenue", self._amount_on_line(text, "Sports Wagering Revenue"),
             "Sports Wagering Revenue (MONTH table)")
        push("ggr", self._amount_on_line(text, "Total Gaming Revenue"),
             "Total Gaming Revenue (MONTH table)")

        # Backfill from narrative if any row missed.
        if not any(r.metric_code == "online_ggr" for r in recs):
            push("online_ggr",
                 find_labeled_amount(text, [r"internet\s+gaming\s+win\s+for\s+the\s+casinos"]),
                 "Internet Gaming Win (narrative)")
        if not any(r.metric_code == "sportsbook_revenue" for r in recs):
            push("sportsbook_revenue",
                 find_labeled_amount(text, [r"sports?\s*wagering\s+gross\s+revenue"]),
                 "Sports Wagering Gross Revenue (narrative)")
        return recs

    _MONEY_TOKEN = re.compile(r"([\d,]+\.\d+|[\d,]+)")

    def _amount_on_line(self, text: str, label: str) -> Decimal | None:
        """Extract the first dollar figure on the line that starts with ``label``.

        The MONTH table is one-value-per-row in column (c); we grab the first number.
        """
        for line in text.splitlines():
            stripped = line.lstrip()
            if stripped.lower().startswith(label.lower()):
                # Numbers are embedded with ``$`` and commas; parse the first numeric token.
                for m in self._MONEY_TOKEN.finditer(stripped):
                    raw = m.group(1).replace(",", "")
                    if "." in raw and len(raw.split(".")[1]) <= 2:
                        try:
                            return Decimal(raw)
                        except Exception:
                            continue
                    if raw.isdigit() and len(raw) >= 4:
                        try:
                            return Decimal(raw)
                        except Exception:
                            continue
        return None

    # ---- IGR (per-operator internet gaming) -------------------------------

    def _parse_igr(self, text: str, year: int,
                   month: int) -> list[ScrapedMetric]:
        """Walk the DGE-105 skin detail sections.

        Each casino block contains a header line listing skin/partner names,
        and three numeric rows (Peer-to-Peer, Other Authorized, Total) with
        one figure per partner plus a grand total.
        """
        src_url = _igr_tax_return_url(year, month)
        assert self.operator_resolver is not None
        recs: list[ScrapedMetric] = []

        for block in self._split_skin_blocks(text, anchor="MONTHLY INTERNET GAMING"):
            per_skin = self._extract_skin_amounts(
                block,
                total_line_re=re.compile(r"^\s*3\s+Total\b", re.MULTILINE),
            )
            for operator_name, amount in per_skin:
                try:
                    entity_id = self.operator_resolver.resolve(operator_name)
                except ValueError:
                    continue
                recs.append(ScrapedMetric(
                    metric_code="online_ggr",
                    period_year=year,
                    period_month=month,
                    value_numeric=amount,
                    currency="USD",
                    entity_id=entity_id,
                    market_id=self.market_id,
                    notes=f"NJ DGE DGE-105 skin win {year}-{month:02d}",
                    source_url=src_url,
                ))
        return recs

    # ---- SWR (per-operator online sportsbook) -----------------------------

    def _parse_swr(self, text: str, year: int,
                   month: int) -> list[ScrapedMetric]:
        src_url = _swr_tax_return_url(year, month)
        assert self.operator_resolver is not None
        recs: list[ScrapedMetric] = []

        for block in self._split_skin_blocks(text, anchor="ONLINE SPORTSBOOK SKIN DETAIL"):
            per_skin = self._extract_skin_amounts(
                block,
                total_line_re=re.compile(r"16\s+Monthly\s+Online\s+Sportsbook\s+Gross\s+Revenue",
                                          re.IGNORECASE),
            )
            for operator_name, amount in per_skin:
                try:
                    entity_id = self.operator_resolver.resolve(operator_name)
                except ValueError:
                    continue
                recs.append(ScrapedMetric(
                    metric_code="sportsbook_revenue",
                    period_year=year,
                    period_month=month,
                    value_numeric=amount,
                    currency="USD",
                    entity_id=entity_id,
                    market_id=self.market_id,
                    notes=f"NJ DGE DGE-107 skin GR {year}-{month:02d}",
                    source_url=src_url,
                ))
        return recs

    # ---- shared table parsing ---------------------------------------------

    def _split_skin_blocks(self, text: str, *, anchor: str) -> list[str]:
        """Split the full PDF text into per-casino skin-detail blocks.

        A block runs from one occurrence of ``anchor`` up to (but not including)
        the next occurrence.
        """
        # Use anchor-offset search on upper-cased text; slice original.
        upper = text.upper()
        positions: list[int] = []
        i = 0
        anchor_u = anchor.upper()
        while True:
            j = upper.find(anchor_u, i)
            if j == -1:
                break
            positions.append(j)
            i = j + len(anchor_u)
        if not positions:
            return []
        positions.append(len(text))
        return [text[positions[k]:positions[k + 1]] for k in range(len(positions) - 1)]

    _NUMBER_RE = re.compile(r"\$?\s*\(?[\d,]+(?:\.\d+)?\)?")

    def _extract_skin_amounts(
        self, block: str, *, total_line_re: re.Pattern,
    ) -> list[tuple[str, Decimal]]:
        """From one skin-detail block, return list of (operator_name, amount).

        Strategy:
          1. Find the header row — the line in the block that contains
             column names and ends with "Total".
          2. Split that row into tokens; everything before the last 'Total' is a skin name.
          3. Find the target numeric row (matches ``total_line_re``).
          4. Extract numeric tokens from the numeric row; the last is the grand
             total, preceding ones map to each skin column.
        """
        lines = block.splitlines()
        header_idx = None
        for idx, line in enumerate(lines):
            if "Total" in line and "Description" not in line:
                # Plausible header: contains multiple uppercase or title-cased tokens
                # and ends in 'Total'.
                stripped = line.strip()
                if stripped.endswith("Total") and len(stripped.split()) >= 2:
                    header_idx = idx
                    break
        if header_idx is None:
            return []

        header_line = lines[header_idx].strip()
        skin_names = _tokenise_header(header_line, _NJ_SKIN_VOCABULARY)
        if not skin_names:
            return []

        # Find the numeric row after the header.
        numeric_line = None
        for idx in range(header_idx + 1, min(header_idx + 30, len(lines))):
            if total_line_re.search(lines[idx]):
                numeric_line = lines[idx]
                break
        if numeric_line is None:
            return []

        # Strip the leading line number (e.g. "3 Total ..." or "16 Monthly ...")
        # so it doesn't get picked up as the first amount.
        stripped_numeric = re.sub(r"^\s*\d+\s+", "", numeric_line)
        # Extract amounts in order.
        amounts_raw = self._NUMBER_RE.findall(stripped_numeric)
        amounts: list[Decimal] = []
        for raw in amounts_raw:
            clean = raw.replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
            clean = clean.strip()
            if not clean:
                continue
            try:
                amounts.append(Decimal(clean))
            except Exception:
                continue
        if len(amounts) < 2:
            return []

        # Last amount is the grand total; preceding ones map to skins positionally.
        per_skin_amounts = amounts[:-1]

        # Mismatched column counts mean our tokenisation vocabulary missed a skin;
        # better to skip the block than publish rows keyed to the wrong brand.
        if len(skin_names) != len(per_skin_amounts):
            log.info(
                "NJ DGE: column-count mismatch in skin block "
                "(header skins=%d, amounts=%d) — skipping",
                len(skin_names), len(per_skin_amounts),
            )
            return []

        pairs: list[tuple[str, Decimal]] = []
        for name, amt in zip(skin_names, per_skin_amounts):
            if amt == 0:
                continue  # skip zero rows — many skins are dormant
            pairs.append((name, amt))
        return pairs
