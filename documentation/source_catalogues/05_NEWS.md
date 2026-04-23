# News source catalogue

*Scope: trade press, mainstream financial press, company press-release feeds, and news aggregators. Per-entity news-beat recommendations and per-market regulator-announcement feeds. Generated 2026-04-23.*

## Provider landscape

Three concentric rings around iGaming news.

**Ring 1 — Trade press** is the densest signal. A handful of publications cover nothing but online gambling: iGaming Business, SBC News, EGR Global, GGB Magazine, Gambling Insider, Yogonet (LatAm), Focus Gaming News (LatAm + Europe), CDC Gaming Reports (US). Coverage overlaps substantially between them; any one of iGB + SBC News will hit 80% of notable stories. Most publish free RSS feeds; a few (EGR, Gambling Compliance) gate deeper analysis behind a subscription. RSS polling is cheap (100–500 articles/week across the set) and the existing Trailblaze parser can lift metric mentions from article bodies — worth doing even if the article is just a summary of a regulator release.

**Ring 2 — Mainstream financial press** — Reuters, Bloomberg, FT, WSJ, Barron's. Coverage is thinner but higher-impact: M&A, earnings previews, regulatory shocks, activist investor moves. Most have per-ticker pages with RSS (Reuters, Bloomberg), but full articles are often paywalled. For a research tool, the headline + timestamp is often enough — full-text fetches can be skipped when they hit a paywall.

**Ring 3 — Company press releases + aggregators**. Each listed entity publishes PR through Business Wire / PR Newswire / GlobeNewswire / Cision; these aggregators offer per-ticker RSS that captures every wire release. Add Google News RSS search queries (free) and GDELT (free global event database) and coverage widens to include local-language press and regulator press releases that trade press doesn't pick up. NewsAPI's free tier (100 req/day) and Bing News are usable backups but duplicate what Google News + company wires already capture.

The Trailblaze **Gmail ingestion pipeline** is effectively a fourth ring — Oyvind-forwarded analyst distributions. That's orthogonal to this catalogue (and already in production) but worth noting: a broader news feed reduces reliance on Oyvind as the single breaking-news channel.

## Recommended providers by tier

- **Tier 1 (production-ready):**
  - **Trade-press RSS (iGB, SBC News, Gambling Insider, GGB, CDC Gaming)** — free, dense, mostly well-formed feeds. ~60% of usable news volume comes from these three. **Anchor.**
  - **Google News RSS search per entity** — free, global, handles name + ticker queries. URL pattern: `https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=<country>`. One feed per entity keyword; dedup by URL hash. **Best free aggregator for non-trade-press coverage.**
  - **Company wire RSS** — Business Wire / PR Newswire / GlobeNewswire / Cision per-ticker feeds. Free. Fastest path to official press releases (Reuters and Bloomberg repackage these but lag 10–30 min).
- **Tier 2 (backup / coverage gaps):**
  - **GDELT 2.0** — free global event database, 15-minute update cadence, queryable via BigQuery or REST. Strong on local-language press and regulator announcements. Overkill for most iGaming use but useful for emerging markets (BR, CO, PH).
  - **Yogonet + Focus Gaming News** — LatAm + EU coverage, fills geographic gaps trade press leaves. RSS available.
  - **Reuters company pages** — free RSS per ticker; headlines not full text.
  - **NewsAPI** — free 100/day, paid $449/mo. Duplicates Google News without much upside; skip unless quota becomes a real constraint.
- **Tier 3 (avoid):**
  - **Webhose.io / NewsData.io scrapers** — pricey, often duplicate the free sources with extra noise.
  - **Twitter/X API** — expensive post-2023 pricing, TOS hostile; social signal via X is no longer a practical free input.
  - **Reddit API** — free-ish but unstructured; skip for a research product.
  - **Scraping EGR / Gambling Compliance paywalls** — TOS violation.

## Per-entity news-beat mapping

For each entity, the recommended Google News RSS query + primary wire service. For listed entities, both name-string and ticker matches; for private, name only.

### Operators (23)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `flutter` | `"Flutter Entertainment" OR $FLUT` | Business Wire (via NYSE) | **High** | Single biggest news volume in sector |
| `draftkings` | `"DraftKings" OR $DKNG` | GlobeNewswire | **High** | US-centric; heavy earnings + regulatory news |
| `mgm` | `"MGM Resorts" OR $MGM` | Business Wire | **High** | Bricks + iGaming + BetMGM JV coverage |
| `fanduel` | `"FanDuel"` | Parent wire (FLUT) | **High** | Covered alongside Flutter |
| `betmgm` | `"BetMGM"` | Both parent wires | **High** | JV news split between MGM and Entain |
| `entain` | `"Entain" OR $ENT.L` | LSE RNS + Business Wire | **Medium-high** | UK + multi-brand coverage |
| `evoke` | `"evoke plc" OR "888 Holdings" OR $EVOK` | LSE RNS | **Medium** | Rebrand transition still surfaces old name |
| `betsson` | `"Betsson"` | Cision Sweden | **Medium** | Nordic press weighted |
| `kindred-group` | `"Kindred Group" OR "Unibet" OR $KIND-SDB` | Cision Sweden | **Medium** | `FLAG` — post-FDJ acquisition news routes through parent |
| `rush-street` | `"Rush Street" OR $RSI` | GlobeNewswire | **Medium** | BetRivers brand often named separately |
| `ballys` | `"Bally's Corporation" OR $BALY` | Business Wire | **Medium** | `FLAG` — take-private news dominates feed |
| `codere-online` | `"Codere Online" OR $CDRO` | GlobeNewswire | **Low** | Spanish-language press often first |
| `betano` | `"Betano"` | Reuters-EU aggregated | **Medium** | Kaizen parent private, so brand is the search key |
| `betfanatics` | `"Fanatics Sportsbook" OR "BetFanatics"` | GlobeNewswire (Fanatics parent) | **Medium** | US-only |
| `kaizen-gaming` | `"Kaizen Gaming"` | Greek press | **Low-medium** | Private; coverage rises near IPO chatter |
| `ballys` (duplicate removed) | | | | |
| `angler-gaming` | `"Angler Gaming"` | Cision Sweden | **Low** | Small-cap |
| `higher-roller-technologies` | `"Higher Roller"` | — | **Low** | `FLAG` — brand disambiguation needed |
| `marlin-media` | `"Marlin Media" gaming` | — | **Very low** | |
| `premier-gaming` | `"Premier Gaming"` | — | **Low** | `FLAG` — disambiguate from Premier Bet |
| `realm-entertainment` | `"Realm Entertainment"` | — | **Very low** | `FLAG` — low-visibility |
| `starcasino` | `"Starcasino" Belgium Italy` | — | **Low** | Brand search only |

### Affiliates (5)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `better-collective` | `"Better Collective" OR $BETCO` | Cision Denmark | **Medium** | M&A-heavy; covers both company and property acquisitions |
| `catena-media` | `"Catena Media" OR $CTM` | Cision Sweden | **Low-medium** | Divestment-heavy |
| `gambling-com-group` | `"Gambling.com Group" OR $GAMB` | GlobeNewswire | **Low-medium** | Quiet but steady |
| `acroud` | `"Acroud"` | Cision Sweden | **Low** | Thin coverage |
| `marlin-media` | (covered above) | | | |

### B2B platforms (8)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `playtech` | `"Playtech" OR $PTEC.L` | LSE RNS | **Medium** | Largest B2B coverage |
| `evolution` | `"Evolution" live casino OR $EVO.ST` | Cision Sweden | **Medium** | Disambiguate from other Evolution-named firms |
| `kambi-group` | `"Kambi" sportsbook OR $KAMBI.ST` | Cision Sweden | **Low-medium** | |
| `sportradar` | `"Sportradar" OR $SRAD` | GlobeNewswire | **Medium** | Data + streaming news |
| `gan` | `"GAN Limited" OR $GAN` | GlobeNewswire | **Low** | `FLAG` — post-SEGA Sammy, route through parent |
| `neogames` | `"NeoGames"` | (delisted, coverage thin) | **Low** | Routes via Light & Wonder |
| `sega-sammy` | `"Sega Sammy" OR 6460` | TSE TDnet | **Medium** | Gaming is one segment; use JP-localised feed |
| `fennica-gaming` | `"Fennica Gaming"` | — | **Very low** | Private + niche |
| `sporting-solutions` | `"Sporting Solutions" betting` | — | **Low** | Disambiguate from unrelated firms |

### B2B suppliers (5)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `aristocrat` | `"Aristocrat Leisure" OR $ALL.AX` | ASX announcements | **Medium** | Broad gaming news |
| `evolution` (covered above) | | | | |
| `light-and-wonder` | `"Light & Wonder" OR $LNW` | GlobeNewswire | **Medium** | Ex-Scientific Games — legacy name still appears |
| `netent` | `"NetEnt"` | Evolution parent wire | **Low** | Rolled into Evolution post-2020 |
| `stakelogic` | `"Stakelogic"` | — | **Low** | |

### Lotteries (5)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `allwyn-international` | `"Allwyn"` | European wire services | **High** (during UK licence transition, IPO watch) | IPO rumours keep it in financial press |
| `opap` | `"OPAP" OR $OPAP.AT` | Athens Stock Exchange | **Medium** | Greek press dense |
| `veikkaus` | `"Veikkaus"` | Finnish press | **Low-medium** | Finnish monopoly; regulator changes drive news |
| `atg` | `"ATG" horseracing Sweden` | Swedish press | **Low** | Disambiguate (many "ATG" entities) |
| `neopollard` | `"NeoPollard"` | — | **Very low** | B2B JV |

### DFS (1)

| Slug | Google News query | Primary wire | News volume | Notes |
|---|---|---|---|---|
| `prizepicks` | `"PrizePicks"` | — (private) | **Medium** | US DFS regulatory battle keeps them in news |

## Per-market news sources

### Regulator announcement feeds (distinct from filings)

Most regulators have a news section. The Phase 2 orchestrator should poll these when a market is mentioned in an Oyvind email:

- UKGC: https://www.gamblingcommission.gov.uk/news (RSS)
- UKGC press releases: RSS available
- DGOJ (ES): https://www.ordenacionjuego.es/es/noticias
- ADM (IT): https://www.adm.gov.it/portale/comunicati-stampa
- Spelinspektionen (SE): https://www.spelinspektionen.se/press-och-publicerat/
- Spillemyndigheden (DK): https://www.spillemyndigheden.dk/nyheder
- iGaming Ontario: https://igamingontario.ca/en/media-releases
- MGA (MT): https://www.mga.org.mt/news-and-events/
- US states: NJ DGE, PA PGCB, MI MGCB each maintain separate press/news pages — worth a dedicated RSS scrape per state

### Industry conferences (scheduled events with announcement peaks)

These clusters drive spikes in news volume and often carry M&A / partnership announcements:

| Conference | Timing | Location | Relevance |
|---|---|---|---|
| ICE Barcelona | Jan–Feb | Barcelona | Biggest global iGaming trade show (moved from London 2025) |
| G2E Las Vegas | October | Las Vegas | US-focused, land-based + online |
| SiGMA Europe | November | Malta | Operator-licensee networking + affiliate-heavy |
| SBC Summit Barcelona | September | Barcelona | Sportsbook + payments focus |
| iGB Live | July | Amsterdam | European affiliate-heavy show |
| EiG (Excellence in iGaming) | October | Berlin | Regulatory-focused |
| CasinoBeats Summit | May | Malta | Casino B2B focus |
| Gaming in Holland / Spain / Germany | Various | EU | Regional regulatory updates |
| SBC Summit Latinoamérica | November | Miami | LatAm market |
| Japan Gaming Congress | March | Tokyo | Asia Pac commercial-casino watch |

Scraping conference sessions/press-releases is low-ROI; monitoring trade-press coverage during the event captures the signal without engineering effort.

## Integration notes

- **Enrichment orchestrator fit:** a nightly `trailblaze-enrich --news` task fans out ~50 RSS feeds (trade press + regulator + wire + per-entity Google News queries), dedups by URL hash, pushes text into the parser with `source_type='news'` and classifier hint `document_type='news_article'`. Parser's existing "extract metrics from narrative" path handles article body → `metric_values` + `narrative` rows naturally.
- **Update cadence:** hourly for trade press (news breaks fast); daily for Google News queries; daily for regulator announcement pages; post-earnings burst polling (T-1h to T+4h around scheduled earnings) for the listed set.
- **Rate limits:** RSS is free and cooperative — polite 1 req/feed/hour is fine. Google News RSS is untagged (no documented limit) but respect 1 RPS. GDELT's BigQuery is metered by BigQuery pricing.
- **Cost range:** Tier-1 stack (trade-press RSS + Google News + company wires) is **$0/month**. GDELT is free but BigQuery query costs accumulate at scale; ignore until Tier-1 exhausted.
- **Deduplication:** trade press + Google News + wire services will deliver the same story 3–5 times. Dedup key = URL hash + similarity (title + first 300 chars) via simhash. Prefer wire → trade press → aggregator in that precedence order (first-party > second-party > third-party).
- **Language coverage:** Greek (OPAP), Finnish (Veikkaus), Japanese (Sega Sammy), Spanish + Portuguese (LatAm operators), Swedish (Nordic issuers) all need local-language queries. The parser doesn't translate — downstream analyst workflow assumes English — but ingesting foreign-language headlines as pointers is still valuable.
- **UI hook:** the existing "Recent Reports" module on the Overview page + the per-entity Source Reports module on Company Detail already have a slot for news. Currently both surface only Gmail-ingested + regulator-scraped reports; adding news-article reports would broaden the feed without UI change.

## Known gaps (human review required)

- **RSS feed URLs** for each trade-press publication were listed by brand, not by URL — a one-off scraping session should catalogue every feed URL into a `news_sources` seed table. Flagged as a pre-integration task (~2h of browser work).
- **Low-visibility entities** (Higher Roller, Realm Entertainment, Marlin Media, Premier Gaming) — Google News often returns zero hits or noise. Decide whether to skip news enrichment for these or ingest with a de-emphasis flag.
- **Entity-name disambiguation** — "Evolution" (the B2B supplier) vs "Evolution Mining" (not gambling). "Aristocrat" (gambling) vs "Aristocrat" (other brands). "ATG" (Swedish pari-mutuel) vs many unrelated "ATG" companies. Each Google News query must include a disambiguator like `gaming`, `casino`, or a ticker when possible.
- **Post-acquisition routing** — Kindred news after FDJ acquisition, NeoGames after Light & Wonder, GAN after SEGA Sammy: for 3–6 months post-acquisition the children still generate news flow under old names. Keep both queries active temporarily.
- **Regulator press pages** are not uniformly available as RSS — some need HTML scraping with a polite rate. Catalogue feed format per regulator in the same seed table proposed above.
- **GDELT integration decision** — high value for non-English markets but not trivial to wire up. Defer until Phase 3 if possible.
