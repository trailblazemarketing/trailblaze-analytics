# Share prices source catalogue

*Scope: per-listed-entity mapping of exchange + symbol format for each major data provider. Generated 2026-04-23 from `entities WHERE ticker IS NOT NULL` (22 canonical listed entities; the remaining 22 canonical entities are private, state-owned, or subsidiaries).*

## Provider landscape

The share-price space is the cleanest of the five in this series. End-of-day OHLCV for developed-market equities is commoditized — Yahoo Finance returns it for free, and several API-first providers wrap Yahoo or equivalent feeds at modest cost. The choice is really about **latency** (EOD vs 15-min-delayed vs real-time) and **coverage breadth** (US-only vs global). For a Trailblaze-style research workflow, real-time isn't needed; EOD or 15-min-delayed is sufficient for the stock heatmap + sparkline surfaces.

The iGaming-relevant exchange set is six: NYSE, NASDAQ, LSE, OMX Nordic (Stockholm), Nasdaq First North Growth Market (Stockholm small-cap), Athens (ATSE), Tokyo (TSE), ASX (Sydney). **yfinance** covers all of them. The main pitfalls are (a) ticker-format divergence across providers (Betsson: `BETS-B.ST` in Yahoo, `BETS-B.STO` in Finnhub, `BETSb.ST` in some SDK wrappers), and (b) recently-delisted entities (NeoGames acquired by LNW in Jun 2024; Kindred acquired by FDJ Oct 2024; GAN taken private by SEGA Sammy early 2025; Bally's taken private by Standard General 2024–25). Historical series for those tickers are still queryable but no live quote will return.

Currency handling is a non-trivial wrinkle: Betsson's native price is SEK, Playtech is GBp (pence, not pounds), Kambi is SEK, OPAP is EUR, Aristocrat is AUD, Sega Sammy is JPY. The existing `fx_rates` table must be consulted for EUR-comparable market-cap numbers; this is already done for `market_cap` metric in the operators heatmap query.

## Recommended providers by tier

- **Tier 1 (production-ready):**
  - **Yahoo Finance via `yfinance` Python package** — free, covers every exchange we need, EOD + 15-min quote + metadata + historical daily back to ~1970 for most symbols. **Primary anchor.** Unofficial API; occasional endpoint breakage but the library is actively maintained. Suitable for a nightly cron that refreshes `metric_values` for `stock_price`, `market_cap`, `volume`.
  - **Finnhub** (`finnhub-python`) — 60 calls/min free tier, stronger for US real-time + fundamentals in one call. Tier-1 backup for when Yahoo is unreliable; also the primary for Tier-04 fundamentals below.
- **Tier 2 (backup / coverage gaps):**
  - **Alpha Vantage** — 25 calls/day free is too stingy for daily refresh of 22 tickers; $50/mo Standard unlocks 75 rpm. Useful only as a second-opinion.
  - **Twelve Data** — 800 calls/day free, $29/mo Grow. Cleaner JSON than yfinance, good fallback for low-liquidity OMX First North names.
  - **Polygon.io Stocks** — $29/mo Starter is US-only; $200/mo Currencies + Stocks adds global. Not needed if yfinance + Finnhub suffice.
- **Tier 3 (avoid):**
  - **IEX Cloud** — discontinued August 2024; any tutorial referencing it is stale.
  - **Alexa / Morningstar rank endpoints** — not a share-price source in any modern product; skip.
  - **Scraping broker portals (IG, eToro, Saxo)** — TOS violation + no advantage over Yahoo.

## Per-entity mapping — listed canonical entities

Symbol format columns use each provider's convention:
- **Yahoo** — e.g. `FLUT`, `BETS-B.ST`, `PTEC.L`, `ALL.AX`
- **Finnhub** — same root + `.STO` / `.LON` / `.ATH` variants in some cases (API normalises most)
- **Currency** — native trading currency

| Slug | Ticker (DB) | Name | Exchange | Yahoo symbol | Currency | Listing status | Notes |
|---|---|---|---|---|---|---|---|
| `flutter` | FLUT | Flutter Entertainment | NYSE | `FLUT` | USD | Active | Secondary on LSE as `FLTR.L`; primary moved NYSE Jan 2024 |
| `draftkings` | DKNG | DraftKings | NASDAQ | `DKNG` | USD | Active | |
| `mgm` | MGM | MGM Resorts International | NYSE | `MGM` | USD | Active | BetMGM JV not separately listed |
| `ballys` | BALY | Bally's Corporation | NYSE | `BALY` | USD | **`FLAG` — verify** | Standard General take-private announced; confirm whether delisted and as-of date |
| `rush-street` | RSI | Rush Street Interactive | NYSE | `RSI` | USD | Active | |
| `entain` | ENT | Entain | LSE | `ENT.L` | GBp (pence) | Active | Divide by 100 for GBP |
| `evoke` | EVOK | evoke plc | LSE | `EVOK.L` | GBp | Active | Rebranded from 888 Holdings Oct 2024; historical data pre-rebrand filed under 888 |
| `playtech` | PTEC | Playtech | LSE | `PTEC.L` | GBp | Active | |
| `betsson` | BETS-B | Betsson | OMX Stockholm | `BETS-B.ST` | SEK | Active | B-share series |
| `evolution` | EVO | Evolution | OMX Stockholm | `EVO.ST` | SEK | Active | |
| `kindred-group` | KIND-SDB | Kindred Group | OMX Stockholm | `KIND-SDB.ST` | SEK | **`FLAG` — verify** | Acquired by FDJ Oct 2024; confirm delist date |
| `better-collective` | BETCO | Better Collective | OMX Stockholm | `BETCO.ST` | SEK | Active | |
| `catena-media` | CTM | Catena Media | OMX Stockholm | `CTM.ST` | SEK | Active | Large divestments 2023–24; equity thin |
| `kambi-group` | KAMBI | Kambi Group | Nasdaq First North Premier | `KAMBI.ST` | SEK | Active | |
| `acroud` | ACROUD | Acroud | Nasdaq First North Growth Market | `ACROUD.ST` | SEK | Active | Thin float; frequent trading halts |
| `angler-gaming` | ANGL | Angler Gaming | Nasdaq First North Growth Market | `ANGL.ST` | SEK | Active | Small-cap |
| `opap` | OPAP | OPAP | Athens (ATSE) | `OPAP.AT` | EUR | Active | |
| `sega-sammy` | 6460 | Sega Sammy | Tokyo (TSE) | `6460.T` | JPY | Active | JP conglomerate; gaming is one segment |
| `aristocrat` | ALL | Aristocrat | ASX | `ALL.AX` | AUD | Active | |
| `light-and-wonder` | LNW | Light & Wonder | NASDAQ (primary) + ASX | `LNW` (US), `LNW.AX` (AU) | USD / AUD | Active | Dual-listed after 2022 restructure; primary NASDAQ |
| `sportradar` | SRAD | Sportradar | NASDAQ | `SRAD` | USD | Active | |
| `codere-online` | CDRO | Codere Online | NASDAQ | `CDRO` | USD | Active | SPAC 2021; low liquidity |
| `gambling-com-group` | GAMB | Gambling.com Group | NASDAQ | `GAMB` | USD | Active | |
| `gan` | GAN | GAN | NASDAQ | `GAN` | USD | **`FLAG` — verify** | Acquired by SEGA Sammy; confirm delist completed and as-of date |

## Entities NOT listed (skip share-price enrichment)

| Slug | Reason |
|---|---|
| `allwyn-international` | Private; 2025 IPO filing rumoured — watch for listing |
| `atg` | State-owned (SE) |
| `betano` | Subsidiary of Kaizen Gaming (private) |
| `betfanatics` | Subsidiary of Fanatics Holdings (private) |
| `betmgm` | JV of MGM + Entain; no separate equity |
| `fanduel` | Subsidiary of Flutter — traffic rolls up to `FLUT` |
| `fennica-gaming` | Private (FI) |
| `higher-roller-technologies` | Private |
| `kaizen-gaming` | Private (GR); IPO discussed but not filed |
| `marlin-media` | Private |
| `neogames` | **Delisted Jun 2024** — acquired by Light & Wonder. Keep historical `NGMS` data if stored. |
| `neopollard` | Private JV |
| `netent` | **Delisted Dec 2020** — acquired by Evolution. Historical `NET-B.ST` only. |
| `premier-gaming` | Private / unverified |
| `prizepicks` | Private |
| `realm-entertainment` | Private / unverified |
| `sporting-solutions` | Private subsidiary of FSB Technology |
| `stakelogic` | Private (subsidiary of Stake Logic Holding) |
| `starcasino` | Private |
| `veikkaus` | State-owned (FI) |

## Integration notes

- **Enrichment orchestrator fit:** listed-entity scraper is straightforward — one-shot daily cron, ~22 HTTP calls to yfinance's cache, writes to `metric_values` with `source_type='stock_api'`, `metric_code IN ('stock_price','market_cap','volume','52wk_high','52wk_low')`. Idempotent by `(entity_id, period_id='daily:<date>')`.
- **Update cadence:** daily EOD run after the slowest market closes (ASX closes 16:00 AEST, i.e. 06:00 UTC; US closes 21:00 UTC). A 22:30 UTC daily cron is safe for same-day close across all exchanges.
- **Rate limits:** yfinance has no formal quota but 2+ req/sec from a single IP triggers temporary 429s. 22 symbols at 1 req/sec = 22 seconds. Trivial.
- **Cost range:** Tier-1 stack (yfinance + Finnhub free tier) is **$0/month** for this workload. Tier-2 only needed as a belt-and-suspenders fallback.
- **Currency conversion:** native-currency price must be stored alongside currency code so the existing `fx_rates` lookup can derive EUR for the heatmap + market-cap aggregations. The current schema already supports this via `metric_values.currency` — good.
- **Delisted-entity policy:** for the 3–4 flagged as possibly delisted (Bally's, Kindred, GAN, NeoGames), the scraper should detect quote absence and mark `entities.metadata->>'listing_status'='delisted_<YYYY-MM-DD>'`. Historical OHLCV series up to the delist date remain queryable. Treat these as "frozen" for the heatmap.
- **Known quirks:**
  - Betsson `BETS-B` has an `.ST` in yfinance but some libraries normalise to `BETSb.ST`; test both.
  - Light & Wonder's dual listing means two separate symbols; prefer `LNW` (NASDAQ) for primary metrics.
  - Playtech quotes in GBp (pence) — always divide by 100 for a cleaner GBP display, then convert to EUR.
  - Flutter's move from LSE primary to NYSE primary (Jan 2024) means pre-2024 daily series should pull from `FLTR.L` and post-2024 from `FLUT`; yfinance handles the redirect but the reported currency flips USD/GBp mid-series — the heatmap adapter must normalise.

## Known gaps (human review required before ingest)

- **Bally's (BALY), Kindred (KIND-SDB), GAN** — confirm delisting status and date. A single `curl` per ticker will answer whether yfinance still returns a quote.
- **evoke plc pre-rebrand history** — the rebrand from 888 Holdings happened Oct 2024; pre-rebrand data may live under ticker `888.L`. Verify whether yfinance stitches the two or returns them separately.
- **Light & Wonder dual listing** — decide whether to store both NASDAQ + ASX quotes or only the primary (NASDAQ). Current heatmap query assumes one ticker per entity.
- **Allwyn IPO watch** — if Allwyn lists in 2026, add a ticker + exchange and flip enrichment on. The master plan's Phase 2.7 "expanded stock data" should include an Allwyn-watch step.
