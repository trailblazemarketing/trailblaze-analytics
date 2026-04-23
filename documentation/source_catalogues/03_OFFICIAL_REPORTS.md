# Official reports source catalogue

*Scope: (A) company investor-relations pages per listed entity; (B) regulator filings per market. Generated 2026-04-23.*

## Provider landscape

"Official reports" splits into two disjoint problems with very different collection strategies.

**Company IR** is per-entity, per-listed-company. Every listed parent publishes quarterly earnings (10-Q in the US / interim + annual in the UK / Q-reports at Nordic exchanges / etc.), press releases, investor presentations, capital-markets-day decks. These are the highest-quality structured source for company-level metrics (revenue, EBITDA, ARPU, segment splits). Collection modes vary: SEC EDGAR offers a uniform JSON + XBRL feed for US filers; LSE RNS has an RSS feed per company; most Nordic issuers publish PDFs to their IR site with no machine-readable alternative. **Practical stance: SEC EDGAR for US filers, RSS scraping for UK/Nordic, PDF scraping + parser (the existing Trailblaze parser handles this well) for everything else.**

**Regulator filings** are per-market. They publish monthly or quarterly aggregates covering every licensed operator in the jurisdiction. Format varies wildly: NJ DGE publishes clean CSVs with per-operator breakdown; PA PGCB publishes PDFs; DK Spillemyndigheden publishes Excel with quarterly updates; DE GGL publishes nothing useful monthly. **Some regulators publish per-operator splits; others only publish totals** — this determines whether a market's operator leaderboard can be populated from regulator data or must wait for company IR disclosure. The DB already has four working US state scrapers (NJ, MI, PA, CT per the master plan) but the brief's Phase 2.2 notes four are broken and need fixing, and Phase 2.3 adds five EU regulators.

Aggregators (e.g. **Vixio Regulatory**, **H2 Gambling Capital**, **Gambling Compliance**) consolidate regulator data into paywalled subscriptions. High-quality but not a substitute for first-party collection — the UI needs provenance that leads back to the regulator, not to a paywall.

## Recommended providers by tier

### A. Company IR

- **Tier 1 (production-ready):**
  - **SEC EDGAR (`/cgi-bin/browse-edgar` + `data.sec.gov` JSON APIs)** — free, structured, covers all 8–10 US-listed iGaming entities (DKNG, MGM, BALY, RSI, CDRO, GAN, LNW, GAMB, FLUT dual-filer, SRAD). Parse 10-Q / 10-K / 8-K / proxy / Form 4. **Anchor for US filers.** Master plan Phase 2.4 already scheduled.
  - **LSE RNS RSS** (per-ticker feeds at `https://www.londonstockexchange.com/stock/<ticker>/<name>/rns`) — covers PTEC.L, ENT.L, EVOK.L, FLTR.L. Low-traffic RSS, polite 1/day refresh.
- **Tier 2 (backup / coverage gaps):**
  - **Per-company IR page scraping** — every listed entity publishes PDFs to their IR site. A per-entity config (URL + CSS selector pattern) feeds the existing parser. Works for OMX Nordic issuers (Betsson, Evolution, Kambi, BETCO, CTM, ACROUD, ANGL) where no good API exists.
  - **Business Wire / PR Newswire RSS** — carries the press-release fraction of the feed for most listed issuers; complements IR-site PDFs.
- **Tier 3 (avoid):**
  - **Seeking Alpha transcripts** — paywalled; use only if you already pay the subscription.
  - **Gurufocus / StockAnalysis.com** — second-hand rehosted filings; prefer the first party.

### B. Regulator filings

- **Tier 1 (production-ready):**
  - **Direct first-party scrapers** per regulator. Structured CSV/Excel first (NJ, MI, several EU), then PDF for the rest. Eight+ US states + 10+ EU regulators.
- **Tier 2 (backup / coverage gaps):**
  - **State-published press releases** — sometimes pre-announce monthly numbers before the CSV drops.
- **Tier 3 (avoid):**
  - **Vixio / Gambling Compliance paywalls** — cannot cite in the UI without licensing.
  - **Google/social aggregators that repost regulator numbers** — provenance rot.

## Per-entity mapping — company IR (listed entities)

| Slug | IR landing page | Primary filing feed | Notes |
|---|---|---|---|
| `flutter` | https://www.flutter.com/investors/ | SEC EDGAR (`0001934468`) + LSE RNS `FLTR` | Dual-filer since Jan 2024 NYSE primary move |
| `draftkings` | https://investors.draftkings.com/ | SEC EDGAR (`0001883685`) | |
| `mgm` | https://investors.mgmresorts.com/ | SEC EDGAR (`0000789570`) | |
| `ballys` | https://investors.ballys.com/ | SEC EDGAR (`0001747079`) | `FLAG` if take-private completed — filings cease |
| `rush-street` | https://investors.rushstreetinteractive.com/ | SEC EDGAR (`0001793659`) | |
| `entain` | https://entaingroup.com/investors/ | LSE RNS `ENT` | PDF releases + RNS alerts |
| `evoke` | https://www.evokeplc.com/investors/ | LSE RNS `EVOK` | Pre-rebrand history under RNS `888` |
| `playtech` | https://www.playtech.com/investors | LSE RNS `PTEC` | |
| `betsson` | https://www.betssonab.com/en/investor-relations/ | Nasdaq Stockholm issuer feed + IR PDFs | |
| `evolution` | https://www.evolution.com/investors/ | Nasdaq Stockholm + IR PDFs | |
| `kindred-group` | https://www.kindredgroup.com/investors/ | `FLAG` post-FDJ acquisition | Feed likely rerouted to FDJ IR |
| `better-collective` | https://bettercollective.com/investor-relations/ | Nasdaq Stockholm + IR PDFs | |
| `catena-media` | https://www.catenamedia.com/investor-relations/ | Nasdaq Stockholm + IR PDFs | |
| `kambi-group` | https://www.kambi.com/investors | Nasdaq First North Premier + IR PDFs | |
| `acroud` | https://acroud.com/investors | Nasdaq First North Growth + IR PDFs | Low-volume issuer |
| `angler-gaming` | https://www.anglergaming.com/investor-relations | Nasdaq First North Growth + IR PDFs | |
| `opap` | https://www.opap.gr/en/investor-relations | Athens Stock Exchange RNS equivalent (HCMC announcements) + IR PDFs | |
| `sega-sammy` | https://www.segasammy.co.jp/english/ir/ | TSE TDnet filings + IR PDFs | EN IR site exists but many filings JP-only |
| `aristocrat` | https://www.aristocrat.com/investors/ | ASX announcements feed (`ALL.AX`) + IR PDFs | |
| `light-and-wonder` | https://explore.lnw.com/investors | SEC EDGAR (`0000750004`) + ASX (`LNW.AX`) | Dual disclosure |
| `sportradar` | https://investors.sportradar.com/ | SEC EDGAR (`0001836470`) | |
| `codere-online` | https://www.codereonline.com/investors | SEC EDGAR (`0001857951`) | |
| `gambling-com-group` | https://gambling.com/corporate/investor-relations | SEC EDGAR (`0001846975`) | |
| `gan` | https://invest.gan.com/ | SEC EDGAR (`0001799332`) | `FLAG` — confirm delisting; if delisted, cease 10-Q collection |

### Entities without IR feed (private, state-owned, or subsidiary)

Skip IR collection for these; data only via parent IR or regulator filings:

- **Private, no listed parent:** Betano (via Kaizen parent — private), BetFanatics (Fanatics private), BetMGM (JV — data split between MGM + Entain filings), FanDuel (folded into Flutter's segment reporting), Fennica Gaming, Higher Roller, Kaizen Gaming, Marlin Media, NeoPollard, Premier Gaming, PrizePicks, Realm Entertainment, Sporting Solutions, Stakelogic, Starcasino.
- **Delisted, parent absorbs:** NeoGames (→ Light & Wonder 10-Q segment), NetEnt (→ Evolution segment).
- **State-owned / monopoly:** Allwyn International (private; pre-IPO filing), ATG (SE monopoly — publishes annual report only), Veikkaus (FI monopoly — publishes annual report only).

## Per-market mapping — regulator filings

For each regulator: URL, data format, **per-operator breakdown available?** (yes = per-operator leaderboard can be populated; no = totals only).

### US states

| Market | Regulator | URL | Format | Per-op? | Notes |
|---|---|---|---|---|---|
| `us-new-jersey` | DGE (Div. of Gaming Enforcement) | https://www.nj.gov/oag/ge/financials.html | CSV + PDF | **Yes** | Gold standard. Monthly. Parser already working. |
| `us-pennsylvania` | PGCB | https://gamingcontrolboard.pa.gov/?pg=12 | PDF (monthly + quarterly) | **Yes** | `FLAG` — master plan says scraper is broken |
| `us-michigan` | MGCB | https://www.michigan.gov/mgcb/resources/adjusted-gross-receipts | PDF + Excel | **Yes** | `FLAG` — scraper broken |
| `us-connecticut` | DCP (Consumer Protection) | https://portal.ct.gov/DCP/Gaming/Sports-Wagering-and-Online-Casino-Gaming | PDF | **Yes** | `FLAG` — scraper broken |
| `us-illinois` | IGB (Gaming Board) | https://www.igb.illinois.gov/SportsReports.aspx | PDF | Partial | `FLAG` — scraper broken. Per-sportsbook totals but no casino yet (casino launches 2025) |
| `us-colorado` | DOR Division of Gaming | https://sbg.colorado.gov/sports-betting-proceeds | Excel (monthly) | **Yes** | |
| `us-new-york` | NYSGC (Gaming Commission) | https://www.gaming.ny.gov/gaming/ | PDF (weekly) | **Yes** | Sports only; casino live launch 2028+ pending legalization |
| `us-indiana` | IGC (Gaming Commission) | https://www.in.gov/igc/revenue/monthly-revenue-reports/ | Excel | **Yes** | |
| `us-ohio` | OCCC (Casino Control Commission) | https://casinocontrol.ohio.gov/Information/Reports | PDF + Excel | **Yes** | |
| `us-iowa` | IRGC | https://irgc.iowa.gov/publications-reports | PDF (monthly) | **Yes** | |
| `us-kansas` | KS Racing & Gaming | https://krgc.ks.gov/licensing-and-gaming/sports-wagering | PDF | **Yes** | |
| `us-tennessee` | SWAC (Sports Wagering) | https://www.tn.gov/swc/revenue.html | PDF | **Yes** | Online sports only |
| `us-kentucky` | KHRC | https://khrc.ky.gov/sports-wagering/ | PDF | Totals | |
| `us-louisiana` | LGCB | https://lgcb.dps.louisiana.gov/SportsWagering | PDF | Partial | |
| `us-maryland` | MD Lottery/Gaming | https://www.mdgaming.com/monthly-program-review/ | PDF (monthly) | **Yes** | |
| `us-massachusetts` | MGC | https://massgaming.com/about/sports-wagering-revenue/ | PDF + Excel | **Yes** | Master plan Unit A ship gate |
| `us-virginia` | VA Lottery | https://www.valottery.com/aboutus/sportsbetting | PDF | **Yes** | |
| `us-arizona` | AZ DOG (Dept. of Gaming) | https://gaming.az.gov/resources/reports | PDF | Partial | Some months totals-only |
| `us-north-carolina` | NC Education Lottery | https://nclottery.com/SportsBettingReports | PDF | **Yes** | |
| `us-wyoming` | WY Gaming | https://gaming.wyo.gov/operators/sports-wagering-reports | PDF | Totals | |
| `us-maine` | ME Gambling Control | https://www.maine.gov/dps/gambling-control-unit/ | PDF | Totals | Tribal exclusivity |
| `us-west-virginia` | WV Lottery | https://wvlottery.com/financials/reports/ | PDF | **Yes** | |
| `us-new-hampshire` | NH Lottery | https://www.nhlottery.com/About-Us/Sports-Wagering | PDF | Totals | DraftKings exclusive contract |
| `us-vermont` | VT DLL | https://vtlottery.com/sports-wagering-reports | PDF | **Yes** | Three licensees |
| `us-rhode-island` | RI Lottery | https://www.rilot.com/en/about-us/financial-reports | PDF | Totals | IGT exclusive |
| `us-oregon` | OR Lottery | https://www.oregonlottery.org/about/financials/ | PDF | Totals | DraftKings exclusive (Oregon Sports Action) |
| `us-delaware` | DE Lottery | https://delottery.com/retailer-vendor-info/financials | PDF | Totals | BetRivers monopoly |
| `us-nevada` | NV Gaming Control | https://gaming.nv.gov/index.aspx?page=149 | PDF + Excel | Partial | Historic totals + post-2019 per-operator |

### European regulators

| Market | Regulator | URL | Format | Per-op? | Notes |
|---|---|---|---|---|---|
| `united-kingdom` | UKGC (Gambling Commission) | https://www.gamblingcommission.gov.uk/statistics-and-research | CSV + PDF (quarterly + annual) | **Yes** | Industry stats portal. Operator data via operator licence register |
| `malta` | MGA (Gaming Authority) | https://www.mga.org.mt/publications/ | PDF (annual) | **No** (totals) | Licensing hub — gross pipeline but regulates operators serving elsewhere |
| `spain` | DGOJ (Dir. Gen. de Ordenación del Juego) | https://www.ordenacionjuego.es/en/mercado-mensuales | CSV + Excel | **Yes** | Monthly market report is high-quality |
| `italy` | ADM (Agenzia Dogane e Monopoli) | https://www.adm.gov.it/portale/monopoli/giochi | XLS + PDF | **Yes** | Monthly `andamento giochi pubblici` series |
| `france` | ANJ (Autorité Nationale des Jeux) | https://anj.fr/les-chiffres-du-marche | PDF (quarterly) | Partial | Aggregated by vertical; operator splits in annual report |
| `germany` | GGL (Gemeinsame Glücksspielbehörde) | https://www.gluecksspiel-behoerde.de/de/ | PDF (annual) | Totals | Sparse publication cadence |
| `sweden` | Spelinspektionen | https://www.spelinspektionen.se/en/press-and-publications/statistics/ | XLS (quarterly) | **Yes** | Published quarterly; includes licensee breakdown |
| `denmark` | Spillemyndigheden | https://www.spillemyndigheden.dk/en/statistics | XLS (monthly) | **Yes** | Clean API-like downloads |
| `finland` | Veikkaus (monopoly) | https://www.veikkaus.fi/en/yritys/tiedotteet/raportointi | PDF (annual) | N/A | State monopoly = single entity |
| `portugal` | SRIJ (Serviço de Regulação do Jogo) | https://www.srij.turismodeportugal.pt/en/estatisticas/ | PDF (quarterly) | **Yes** | |
| `netherlands` | KSA (Kansspelautoriteit) | https://kansspelautoriteit.nl/en/publications/ | PDF (semi-annual) | Partial | Monitoring reports aggregate; per-licensee splits absent from most reports |
| `belgium` | BGC (Gaming Commission) | https://www.gamingcommission.be/en | PDF (annual) | **No** | Licensee list public, revenue not per-op |
| `greece` | HGC (Hellenic Gaming Commission) | https://www.gamingcommission.gov.gr/en/ | PDF (quarterly) | **Yes** | |
| `ireland` | GRAI (Gambling Regulatory Authority, est. 2024) | https://grai.ie/ | **`FLAG` — not yet publishing data** | — | New regulator; data expected 2026+ |
| `switzerland` | ESBK / GESPA | https://www.esbk.admin.ch/ | PDF (annual) | Totals | Cantonal operator (Swiss Casinos, Swiss Lotto) only |
| `czech-republic` | MFCR | https://www.mfcr.cz/ | PDF (annual) | Partial | |

### Rest-of-world regulators (most have minimal public data)

| Market | Regulator | URL | Per-op? | Notes |
|---|---|---|---|---|
| `australia` | Per-state (e.g. NSW L&GA, VIC VGCCC) | various state URLs | Partial | No federal aggregator; per-state PDFs |
| `brazil` | SPA / SECAP | https://www.gov.br/fazenda/pt-br/assuntos/prg | **`FLAG`** | Market just regulated Jan 2025; data publication cadence TBD |
| `colombia` | Coljuegos | https://www.coljuegos.gov.co/ | PDF | Partial | Quarterly operator list |
| `argentina` | Per-province (BA has LOTBA, CABA LOTBA) | province-specific | Totals | Fragmented |
| `chile` | Superintendencia Casinos | https://www.scj.gob.cl/ | PDF | Totals | Online not yet legal (pending) |
| `peru` | MINCETUR | https://www.gob.pe/mincetur | PDF | Totals | |
| `mexico` | DGJS (SEGOB) | https://dgjs.segob.gob.mx/ | PDF | Totals | |
| `philippines` | PAGCOR | https://www.pagcor.ph/regulatory/ | PDF (annual) | Totals | POGO sector data uncertain |
| `japan` | Casino Regulatory Commission (IR) | https://www.casino.go.jp/ | PDF | N/A | IR casinos not yet live; no online igaming legal |
| `new-zealand` | DIA | https://www.dia.govt.nz/Gambling | PDF (annual) | **No** | TAB monopoly + Lotto NZ |
| `ca-ontario` | AGCO + iGO (iGaming Ontario) | https://igamingontario.ca/en/data-and-reports | XLS (monthly) | **Yes** | Best-quality CA data source |
| `ca-alberta` | AGLC | https://aglc.ca/gaming/gaming-data | PDF | Totals | Limited online data |

## Integration notes

- **Enrichment orchestrator fit:** Phase 2.1 triggers a regulator scrape per market mentioned in an Oyvind email + an IR scrape per listed entity mentioned. Each writes to `reports` + `metric_values` with `source_type` in (`regulator_filing`, `sec_filing`, `company_ir`). Uniqueness key: `(source_url, published_timestamp)`.
- **Update cadence:** most regulators publish 5–20 days after period close. A weekly cron catches all monthly regulators; a daily cron on SEC EDGAR catches 10-Q/K filings promptly. IR sites drift more — a daily check suffices, with dedup on filename hash (already implemented).
- **Rate limits:** SEC EDGAR has a 10 req/sec fair-use limit with a declared User-Agent required. LSE RNS is RSS — no rate limit concern. State regulators are low-volume; polite scraping (1 req/sec) is fine.
- **Cost range:** **$0/month** for all Tier-1 sources — these are public-data obligations. Human-time cost is the scraper-build effort (Phase 2.2/2.3 estimates 4 + 5 units).
- **Per-operator breakdown is the gating signal** for Phase 2 ROI: each regulator with "Yes" above unlocks a new per-market operator leaderboard. The highest-value regulators to (re)build scrapers for, ranked by operator-count × market-cap attention:
  1. PA PGCB (25 operators, flagship market) — **already in Phase 2.2**
  2. MI MGCB (17 operators) — **already in Phase 2.2**
  3. IL IGB (9 operators, launching casino 2025) — **already in Phase 2.2**
  4. ADM (IT — ~60 licensed brands, dense consumer market)
  5. DGOJ (ES — per-operator monthly)
  6. iGaming Ontario (CA — first full year of data 2023 stabilising)
  7. Spelinspektionen (SE — per-operator quarterly)
  8. Spillemyndigheden (DK — per-operator monthly)

## Known gaps (human review required)

- **Bally's, Kindred, GAN, NeoGames** — confirm SEC / Nasdaq filing status post-acquisition. Delisted filers stop producing 10-Q; ingest pipeline must handle gracefully.
- **UK UKGC pre-2023 scope** — the Commission changed its statistics framework in 2023; older-series column names differ from newer downloads. Schema mapping will need a cutover rule.
- **New Brazil SPA regulator** — market just opened; publication cadence + data format not yet established. Watch Q2 2026 for first usable drops.
- **Malta MGA** — publishes licensee lists but not revenue. Malta licensees serve *other* markets, so MGA is a licensee-discovery source, not a revenue source.
- **iGaming Ontario data structure** — moved from `agco.ca` to `igamingontario.ca` in 2023; make sure the scraper points at the iGO URL, not the AGCO one.
- **Ireland GRAI** — new regulator (Gambling Regulatory Authority of Ireland), stood up 2024. First data drop expected 2026 once licensing finishes; add a watch hook.
