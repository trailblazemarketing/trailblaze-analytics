# Stock fundamentals source catalogue

*Scope: per-listed-entity providers for valuation multiples (P/E, EV/EBITDA, EV/Sales), analyst ratings + price targets, earnings dates, consensus estimates, and sellside note provenance. Generated 2026-04-23. Covers the same 22 canonical listed entities as catalogue 02.*

## Provider landscape

"Fundamentals" is where the free-tier story degrades sharply relative to share prices. Raw daily OHLCV is commoditized; analyst consensus, forward estimates, and sellside notes are not. Three tiers of access exist:

1. **Self-computed from filings** — P/E, EV/EBITDA, EV/Sales etc. can be derived directly from SEC 10-Q filings + live market cap (both free). This is the cleanest, most auditable path for companies filing with the SEC. For non-US filers (LSE, OMX, ATSE, TSE, ASX) the primary filings must be parsed from IR PDFs, which the Trailblaze parser already does.
2. **API-provided ratios** — Yahoo Finance (free) publishes trailing P/E and forward P/E for most equities. Finnhub's free tier exposes basic financials (P/E, P/S, ROE, margins) and — critically — **analyst recommendation trends and price targets** on a monthly granularity. These are good enough for a heatmap / scorecard surface. Alpha Vantage's `OVERVIEW` endpoint is similar but with 25 calls/day free, too stingy for daily refresh of 22 tickers.
3. **Sellside notes themselves** — the individual analyst PDFs from Truist, Jefferies, Morgan Stanley, Redeye, Regulus, Eilers & Krejcik, Carnegie, Pareto etc. are either distributed through broker portals (subscription) or pushed via email by investor-relations teams. These are the highest-quality analyst commentary for iGaming specifically. **The existing Gmail ingestion pipeline already captures a subset** (Oyvind-forwarded analyst notes). There is no practical free API that aggregates the entire sellside universe — the best third-party aggregator is Refinitiv / Bloomberg (enterprise).

Two sector-specific signals that Trailblaze should prioritize collecting:

- **Consensus estimates for revenue + EBITDA**, next-year and two-years-out. Finnhub's `/stock/earnings` + `/stock/revenue-estimate` + `/stock/ebitda-estimate` endpoints give a company-level consensus and the number of analysts behind it. Gold-standard free source for this.
- **Analyst recommendation trend** (buy/hold/sell counts). Finnhub exposes this too. Useful for a "sentiment" pill on each company card.

## Recommended providers by tier

- **Tier 1 (production-ready):**
  - **Finnhub free tier** — analyst recommendation trends (`/stock/recommendation`), price targets (`/stock/price-target`), EPS estimates (`/stock/earnings`), revenue/EBITDA estimates (`/stock/<X>-estimate`), insider transactions (`/stock/insider-transactions`), earnings calendar. 60 calls/min is ample for nightly refresh of 22 tickers. **Anchor for everything beyond price.**
  - **Self-computed from SEC EDGAR + Yahoo market-cap** — for the 8+ US filers, derive P/E, EV/EBITDA, EV/Sales cleanly from structured filings. No third-party dependency. Works with Phase 2.4 SEC scraper.
  - **Yahoo Finance (`yfinance` statistics / info dicts)** — trailing P/E, forward P/E, enterprise value, profit margin, operating margin, 52-week range. Free, reliable, covers all exchanges.
- **Tier 2 (backup / coverage gaps):**
  - **Financial Modeling Prep (FMP)** — $22/mo starter, broader fundamentals coverage, global. Good for Nordic tickers where Yahoo's fundamental data is thinner (Kambi, Acroud, Angler Gaming often show gaps).
  - **Alpha Vantage OVERVIEW** — $50/mo for 75 rpm. Narrow benefit over Finnhub free; only worth it if you already have Alpha Vantage for something else.
  - **SEC EDGAR XBRL data** — the standardized financial-statement line items live in XBRL and are free to parse but require more engineering than Finnhub.
- **Tier 3 (sellside-specific, mostly paywalled):**
  - **Refinitiv Workspace / Bloomberg Terminal** — aggregated consensus, sellside notes. Enterprise only. **Not recommended** unless Andrew already has a license.
  - **Seeking Alpha API** — paywalled; retail-focused.
  - **Eilers & Krejcik subscription** — excellent US iGaming-specific research but expensive; worth it only if Trailblaze has a paid research budget.
  - **Scraping brokers' research portals** — TOS violation.

## Per-entity mapping — listed canonical entities

Same 22 listed entities as catalogue 02. "Sellside coverage depth" is my estimate of how many analysts actively cover the name — affects whether consensus is meaningful (20+ = robust, 5–15 = usable, <5 = sparse).

| Slug | Ticker | Finnhub supports? | Sellside depth | Known sellside analysts | Notes |
|---|---|---|---|---|---|
| `flutter` | FLUT | **Yes** (US ticker) | 25+ | Morgan Stanley, Jefferies, Truist, Barclays, Macquarie, Bernstein, Deutsche Bank, JP Morgan, Citi, Goldman, UBS, Susquehanna, Redburn Atlantic, Berenberg, Peel Hunt, Kempen | Flagship coverage — best consensus quality |
| `draftkings` | DKNG | **Yes** | 25+ | Morgan Stanley, Jefferies, Truist, Needham, Wells Fargo, Benchmark, Citi, Barclays, Deutsche Bank, JP Morgan, Roth Capital, Oppenheimer, Stifel, B Riley, Susquehanna | Second-deepest coverage in sector |
| `mgm` | MGM | **Yes** | 20+ | Morgan Stanley, Wells Fargo, Susquehanna, Deutsche Bank, JP Morgan, CBRE, Truist, B Riley, Stifel | Bricks-and-mortar + iGaming hybrid |
| `ballys` | BALY | Yes (if still listed) | 10 | B Riley, Truist, Jefferies, Macquarie, Stifel | `FLAG` — coverage drops if taken private |
| `rush-street` | RSI | **Yes** | 10 | Jefferies, Susquehanna, Stifel, Macquarie, Craig-Hallum | Mid-cap US operator |
| `entain` | ENT | Yes | 20+ | Barclays, JP Morgan, Jefferies, Deutsche Bank, Morgan Stanley, Berenberg, Peel Hunt, Citi, Goldman, UBS, Redburn Atlantic | London primary; covered by most EU banks |
| `evoke` | EVOK | Yes | 8 | Peel Hunt, Jefferies, Barclays, Deutsche Bank | Thinner post-rebrand; pre-rebrand coverage stuck on `888.L` |
| `playtech` | PTEC | Yes | 12 | Peel Hunt, Barclays, Jefferies, Berenberg, Deutsche Bank, Morgan Stanley | Steady B2B coverage |
| `betsson` | BETS-B | Yes | 8 | Carnegie, Pareto, Redeye, DNB Markets, Nordea | Nordic specialist sellside |
| `evolution` | EVO | **Yes** | 15 | Morgan Stanley, DNB Markets, Carnegie, Pareto, Redeye, Nordea, Barclays, Jefferies, SEB | Mixed Nordic + global |
| `kindred-group` | KIND-SDB | **`FLAG`** (post-FDJ) | — | — | Coverage likely ceased post-acquisition |
| `better-collective` | BETCO | Yes | 6 | Carnegie, Pareto, Redeye, ABG Sundal Collier | Affiliate sector — thinner sellside |
| `catena-media` | CTM | Yes | 4 | Redeye, Pareto | Very thin; post-divestments |
| `kambi-group` | KAMBI | Yes | 5 | Pareto, Redeye, Carnegie, ABG Sundal Collier | First North Premier — smaller float |
| `acroud` | ACROUD | Yes (low quality) | 1–2 | Redeye only | Too thin for useful consensus |
| `angler-gaming` | ANGL | Yes (low quality) | 0–1 | — | No regular sellside; ignore consensus |
| `opap` | OPAP | Yes | 8 | Eurobank Equities, Alpha Finance, Piraeus Securities, Euroxx, JP Morgan | Strong Greek-domestic coverage |
| `sega-sammy` | 6460.T | Yes | 10 | Nomura, Daiwa, SMBC Nikko, Mizuho, Morgan Stanley MUFG | Gaming is a segment; consensus mixes pachinko + gaming |
| `aristocrat` | ALL | Yes | 12 | Macquarie, UBS, JP Morgan, Morgan Stanley, Goldman, Jefferies, Wilsons | AU-primary |
| `light-and-wonder` | LNW | **Yes** | 15 | Macquarie, Jefferies, Truist, Susquehanna, Stifel, B Riley, Morgan Stanley | Dual-listed gives dual consensus surfaces |
| `sportradar` | SRAD | **Yes** | 10 | Needham, Jefferies, Benchmark, Macquarie, Morgan Stanley | Data/tech tilt |
| `codere-online` | CDRO | Yes (low quality) | 2 | Benchmark only | Very thin SPAC-era coverage |
| `gambling-com-group` | GAMB | Yes | 5 | Susquehanna, Benchmark, Needham, B Riley | Affiliate coverage limited |
| `gan` | GAN | **`FLAG`** (post-SEGA Sammy) | — | — | Delisting removes active coverage |

## Sellside specialist publications worth monitoring

These are sector-specialty shops whose notes carry disproportionate signal. None has a free API; most are distributed via email or a broker portal. Best way to ingest: include their distribution aliases in the **`TRUSTED_SENDERS` allowlist** for the Gmail ingestion pipeline once Andrew has access.

- **Eilers & Krejcik Gaming (E&K)** — US regulated iGaming monthly handle/GGR reports; operator share; extremely high-quality. Subscription. High-priority for future trusted-sender ingest.
- **Regulus Partners** — UK + European commentary, weekly `Winning Post`. Subscription.
- **Truist Securities — Barry Jonas** — US iGaming earnings primer + post-quarter notes on DKNG/FLUT/MGM. Sellside — distributed by Truist IR.
- **Jefferies — David Katz / James Wheatcroft** — US operators + EU operators. Sellside.
- **Deutsche Bank — Carlo Santarelli** — US operators heavyweight.
- **Morgan Stanley — Ed Young (Europe) / Thomas Allen (US)** — broad sector.
- **Macquarie — Chad Beynon** — dual US + LNW/ARB.
- **Redeye (SE)** — deep Nordic coverage of Kambi, Evolution, Betsson, BETCO, CTM, ACROUD. Public-ish; published as PDFs on redeye.se (often free).
- **Susquehanna — Joseph Stauff** — US iGaming + DFS.
- **B Riley — David Bain** — small/mid-cap US.
- **Bernstein — Chad Beynon** — US operators. Premium.

## Integration notes

- **Enrichment orchestrator fit:** a nightly `trailblaze-enrich --stocks-fundamentals` task fetches from Finnhub + yfinance for each listed entity. Writes `metric_values` with codes in: `pe_trailing`, `pe_forward`, `ev_ebitda`, `ev_sales`, `analyst_recommendation_buy`, `analyst_recommendation_hold`, `analyst_recommendation_sell`, `analyst_price_target_high`, `analyst_price_target_mean`, `analyst_price_target_low`, `earnings_date_next`, `eps_estimate_next_quarter`, `rev_estimate_next_quarter`, `rev_estimate_next_fy`, `ebitda_estimate_next_fy`. **Metric dictionary currently has some of these (`ev_ebitda_multiple`, `pe_ratio`) but not most — schema extension required before wire-up.**
- **Update cadence:** analyst ratings move after quarterly earnings (4× year per issuer) + occasional off-cycle upgrades/downgrades. A weekly refresh catches most moves; a daily refresh is polite-but-overkill.
- **Rate limits:** Finnhub 60 rpm free → 22 tickers × 5 endpoints = 110 calls, runnable in 2 minutes. Yahoo → free-text, polite 1 rps. SEC EDGAR → 10 rps with UA. Trivial at this scale.
- **Cost range:** Tier-1 stack (**Finnhub free + yfinance**) is $0/mo for this workload. Tier-2 (FMP starter) $22/mo if Nordic fundamental coverage gaps matter.
- **UI hooks:** the operator detail page already has a stock widget (CD4 Stock Row). The fundamentals catalogue makes it live — currently it reads `ev_ebitda` and `pe_ratio` from `metric_values` but those rows need to exist. A Finnhub-driven nightly fill is the smallest step to activate that widget.
- **Earnings-date hook:** Finnhub's earnings calendar should drive a "next earnings: T-12 days" badge on the entity scorecard. Also enables auto-scheduling of an IR-scrape T+1 minutes after expected earnings release.
- **Sellside note ingestion:** the existing Gmail pipeline is the right ingest point. Onboard one sellside distribution list at a time, starting with whatever Trailblaze already receives (Oyvind's feed likely includes Carnegie, Pareto, Redeye for Nordic names). Scaling this is mostly a sender-allowlist task, not a technology task.

## Known gaps (human review required)

- **Bally's, Kindred, GAN** — once delisted, Finnhub returns 404 for fundamental endpoints. Scraper must handle gracefully and mark the entity as `metadata.listing_status='delisted'`.
- **Metric dictionary extension** — before any fundamentals scraper runs, 10–12 new metric codes need seeding. Not a catalogue concern but a blocker; flag for a seed migration.
- **Sellside trust-allowlist expansion** — currently the Gmail pipeline trusts one sender (Oyvind). Broadening to sellside distribution lists (e.g. `research@redeye.se`, `securities.research@jefferies.com`) requires a manual per-sender verification step from Andrew. Phase 2.5 scope.
- **Consensus number reliability** — Finnhub's consensus data comes from Zacks and is sometimes stale for thinly-covered Nordic names (Acroud, Angler, Catena). For those, prefer self-computed ratios from IR filings over API consensus.
- **Sega Sammy consensus interpretation** — the company aggregates pachinko + gaming in its filings. Any extracted "EBITDA margin" needs a segment breakdown to be useful; the fundamentals API returns group numbers only.
- **SEC filings vs IR PDFs mapping** — for entities that dual-file (Flutter, Light & Wonder), decide whether SEC or LSE/ASX is canonical for the Trailblaze financial record. Recommend SEC for `FLUT` (since NYSE is now primary) and `LNW` (NASDAQ primary), LSE for `ENT` / `EVOK` / `PTEC`, and Nordic exchange for OMX issuers.
