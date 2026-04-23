# Web traffic source catalogue

*Scope: per-entity mapping of primary consumer-facing domains + provider landscape for visitor / traffic metrics. Generated 2026-04-23 from the canonical entities list (44 non-review entities).*

## Provider landscape

The web-traffic measurement space is dominated by three SEO-oriented providers (SimilarWeb, Semrush, Ahrefs) and a handful of smaller / free alternatives. None are cheap at scale: enterprise APIs start around $500–1,000/month and pricing climbs with the number of domains or requests. SimilarWeb is the de facto standard for competitive-intelligence-grade numbers (monthly visits, bounce rate, channel mix); Semrush and Ahrefs are SEO-first but have decent "domain overview" endpoints. Alexa (historically used for rankings) was retired by Amazon in May 2022 and should be ignored.

For iGaming specifically, the challenge is **brand fragmentation**: a single parent entity (Flutter, Entain, Kindred) operates a dozen consumer domains across jurisdictions, each of which needs separate tracking. Some domains redirect across TLDs (bet365.com → bet365.de → bet365.it) and naive domain-level counts understate true reach. A traffic-enrichment pass should model `entity → one-to-many domain` explicitly.

Free options that return meaningful data: **Cloudflare Radar** (domain rank/trend only, no absolute visitor counts), **Tranco list** (academic global ranking, monthly), and the **SimilarWeb free web UI** (rate-limited HTML scrape, legally grey). None give the full metric suite needed for production scoring.

## Recommended providers by tier

- **Tier 1 (production-ready):**
  - **SimilarWeb Digital Intelligence API** — monthly visits, engagement, channel mix, country split. Best coverage for iGaming domains. ~$1,500/mo starter tier for ~100 domains. **Recommended anchor.**
  - **Semrush `domain_overview` + `domain_ranks`** — organic traffic estimates, keyword counts, authority score. ~$120–450/mo. Cheaper backup for domains SimilarWeb misses.
- **Tier 2 (backup / coverage gaps):**
  - **Ahrefs Site Explorer API** — organic traffic estimate, backlink profile. Strong on domains with lots of SEO content (affiliate sites). Enterprise tier.
  - **DataForSEO Traffic Analytics** — aggregates several providers into one API. API-first; usage-based pricing. Useful for long-tail regional domains.
  - **Cloudflare Radar API** — free, rank trend only. Good for "is this domain declining / growing?" sanity checks but no visitor counts.
- **Tier 3 (avoid):**
  - **Alexa** — retired 2022, any data referencing Alexa ranks is stale.
  - **SpyFu** — US-only focus, thin on non-US iGaming; skip for this workload.
  - **Scraping SimilarWeb free UI at scale** — bypassable TOS but risks IP bans and data-integrity problems; only acceptable for one-off research, not orchestrated enrichment.

## Per-entity mapping

Each entity's **primary consumer-facing domain(s)** below. For multi-brand groups (Flutter, Entain, Kindred, evoke) the top 3–5 brands by known scale are listed; fuller lists should be filled in during enrichment. "B2B / no consumer site" marks entities where only a corporate domain exists. `FLAG` notes where I'm not confident and human review is needed.

| Entity | Type | Primary domains | Notes |
|---|---|---|---|
| **Operators (23)** | | | |
| Angler Gaming | operator | anglergaming.com (corporate); brand domains unknown | `FLAG` — brands include Hello Casino, LuckyMe Slots, SpinStation; confirm which are still live |
| Bally's Corporation | operator | ballybet.com, ballycasino.com; bally.com (corporate) | Virgin-branded online (virgingames.com) historically; confirm current ownership post-Intralot/divestments |
| Betano | operator | betano.com (primary), betano.de, betano.ro, betano.gr, betano.pt, betano.com.br | Operated by Kaizen Gaming — same traffic flow |
| BetFanatics | operator | sportsbook.fanatics.com | Fanatics main commerce site is separate; only sportsbook.fanatics.com is relevant |
| BetMGM | operator | betmgm.com (US), plus state subdomains | JV of MGM + Entain; traffic feeds into both parents |
| Betsson | operator | betsson.com, plus betsson.it, betsson.de, casinoeuro.com, nordicbet.com, betsafe.com | Multi-brand group |
| Codere Online | operator | codere.es, codere.com.mx, codere.com.co, codere.com.pa | Four-market LatAm / Spain focus |
| DraftKings | operator | draftkings.com (sportsbook + casino + DFS) | Single unified consumer domain; US-only access |
| Entain | operator | bwin.com, ladbrokes.com, coral.co.uk, partypoker.com, sportingbet.com, party.com | ~20+ brand domains globally |
| evoke plc | operator | williamhill.com, 888casino.com, 888sport.com, mrgreen.com | Rebranded from 888 Holdings Oct 2024 |
| FanDuel | operator | fanduel.com | Flutter-owned; single consumer domain |
| Flutter Entertainment | operator | fanduel.com, pokerstars.com, pokerstars.eu, sisal.it, paddypower.com, betfair.com, tombola.com, adjarabet.com | Parent of FanDuel + most global brands; aggregate traffic is sum of children |
| Higher Roller Technologies | operator | unknown | `FLAG` — likely a B2B or niche operator; confirm brand domain(s) |
| Kaizen Gaming | operator | betano.com (see above) | Kaizen = Betano's operator entity; overlap |
| Kindred Group | operator | unibet.com, 32red.com, maria-casino.com, stan-james.com (closed?), storspiller.com | Acquired by FDJ Oct 2024; watch for rebrand / consolidation |
| MGM Resorts International | operator | betmgm.com, mgmresorts.com (hotel/casino parent) | Online = JV, brick-and-mortar = mgmresorts.com |
| Premier Gaming | operator | unknown | `FLAG` — disambiguate vs "Premier Bet" (African-focused) |
| Realm Entertainment | operator | unknown | `FLAG` — low-visibility; confirm active brand(s) |
| Rush Street Interactive | operator | betrivers.com, playsugarhouse.com, rushgames.com | NYSE: RSI |
| Starcasino | operator | starcasino.be, starcasino.it | Twin-market brand |
| **Affiliates (5)** | | | |
| Acroud | affiliate | casinofeber.se, casinofeber.no, hobo-casino.com; acroud.com (corporate) | `FLAG` — full property list needs confirmation; historically strong in Nordics |
| Better Collective | affiliate | bettingexpert.com, action.network, vegasinsider.com, sportsvideo.net, bookmaker-ratings.com | Largest affiliate by traffic; action.network is the US cornerstone |
| Catena Media | affiliate | askgamblers.com, wsn.com, pokerscout.com, casino.com | Divested several properties 2023–24; confirm current portfolio |
| Gambling.com Group | affiliate | gambling.com, bookies.com, roto.com, bonusfinder.com | Clean TLD portfolio |
| Marlin Media | affiliate | unknown | `FLAG` — small affiliate; Gibraltar-based; confirm live sites |
| **B2B platforms (8)** | | | |
| Fennica Gaming | b2b_platform | fennicagaming.fi | B2B — corporate site only |
| GAN | b2b_platform | gan.com | B2B platform + Coolbet (B2C spin-off); coolbet.com was sold 2023 |
| Kambi Group | b2b_platform | kambi.com | B2B sportsbook platform |
| NeoGames | b2b_platform | neogames.com, aspireglobal.com | Parent of Aspire Global; acquired by Light & Wonder Jun 2024 |
| Playtech | b2b_platform | playtech.com; plus Snaitech brand snai.it (B2C in Italy) | Largest B2B by revenue; Snai is hybrid B2C exposure |
| Sega Sammy | b2b_platform | segasammy.co.jp | JP conglomerate; gaming tech + pachinko; not consumer iGaming |
| Sporting Solutions | b2b_platform | sportingsolutions.com | Pricing/trading services; B2B only |
| Sportradar | b2b_platform | sportradar.com | Data/streaming supplier; B2B only |
| **B2B suppliers (5)** | | | |
| Aristocrat | b2b_supplier | aristocrat.com | Slot/game supplier; B2B |
| Evolution | b2b_supplier | evolution.com | Live-casino supplier; B2B |
| Light & Wonder | b2b_supplier | lnw.com (plus legacy scientificgames.com) | B2B game supplier; swaps brand domains |
| NetEnt | b2b_supplier | netent.com | B2B supplier; owned by Evolution since 2020 |
| Stakelogic | b2b_supplier | stakelogic.com | B2B supplier |
| **DFS (1)** | | | |
| PrizePicks | dfs | prizepicks.com | Single consumer domain |
| **Lotteries (5)** | | | |
| Allwyn International | lottery | sazka.cz, opap.gr (via OPAP stake), illinoislottery.com (operator), allwynuk.co.uk (UK National Lottery) | Multi-jurisdiction lottery operator |
| ATG | lottery | atg.se | Swedish pari-mutuel; single domain |
| NeoPollard | lottery | neopollard.com | JV platform for US state lotteries; B2B-ish |
| OPAP | lottery | opap.gr, stoiximan.gr, pamestoixima.gr | Owns Stoiximan — both flows; FLAG on stoiximan vs tipsport/betano overlap |
| Veikkaus | lottery | veikkaus.fi | Finnish monopoly; single domain |

## Integration notes

- **Enrichment orchestrator fit:** one entity may have N domains, so the schema needs an `entity_domains` table (or `entities.metadata->>'domains'` JSON array) before a traffic scraper runs. Not in scope for this catalogue but flagged as blocking.
- **Update cadence:** monthly visits from SimilarWeb refresh monthly (~5-day lag); Cloudflare Radar weekly. A monthly scrape is fine — traffic doesn't move day-to-day in a way that matters for the analyst workflow.
- **Rate limits:** SimilarWeb enterprise API is typically 1,000 requests/month at starter tier — with ~100 entities × ~2 domains each × 1 call/month = 200 calls/month, well within budget. Semrush is stingier (100 req/day default) so parallel fan-out needs pacing.
- **Cost range:** Tier-1 anchor ~$1,500–2,000/mo (SimilarWeb); Tier-2 backup ~$120–450/mo (Semrush). Free Tier-3 options don't replace these for production numbers.
- **What to extract per domain:** monthly visits, unique visitors, bounce rate, avg session duration, organic vs paid vs direct vs referral % mix, top-5 countries by traffic, YoY trend. Matches the "Traffic widget" slot implied in `UI_SPEC_2` for B2C operators.
- **Known risks:** multi-brand parents (Flutter, Entain) will have distorted aggregate metrics if presented at the parent level without child roll-ups. The UI should expose per-brand and per-parent views separately.

## Known gaps (human review required before ingest)

- Angler Gaming, Higher Roller Technologies, Premier Gaming, Realm Entertainment, Marlin Media — brand-domain mapping uncertain. `FLAG` rows above.
- Several operators (Betsson, Entain, Flutter, Kindred, Allwyn) own 10+ brand domains; the per-entity tables should be extended via a dedicated `entity_domains` seed before traffic ingest starts.
- Historical brand changes (888 → evoke, Kindred → FDJ-owned, Coolbet divested from GAN) mean some domains shift ownership; a timestamp on domain ↔ entity mapping would help audit.
