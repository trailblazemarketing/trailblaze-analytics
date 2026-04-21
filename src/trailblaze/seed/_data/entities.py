"""Entity seed. Parents expressed via ``parent_slug`` for later resolution.

Per SCHEMA_SPEC.md §entities initial seed. Parents set only where spec
explicitly calls them out; the parser will extend the list and curate
parentage as it encounters new filings.

Each entity optionally gets a primary entity_type via ``primary_type``
(entity_type.code). Secondary type assignments (e.g. Allwyn = lottery +
operator + DFS) are left to manual curation — this seed only commits the
**primary** type so downstream code always has something to group by.
"""

from __future__ import annotations


def _e(slug: str, name: str, *,
       parent_slug: str | None = None,
       ticker: str | None = None,
       exchange: str | None = None,
       country_of_listing: str | None = None,
       headquarters_country: str | None = None,
       aliases: list[str] | None = None,
       primary_type: str | None = None,
       description: str | None = None) -> dict:
    return {
        "slug": slug, "name": name, "parent_slug": parent_slug,
        "ticker": ticker, "exchange": exchange,
        "country_of_listing": country_of_listing,
        "headquarters_country": headquarters_country,
        "aliases": aliases, "primary_type": primary_type,
        "description": description,
    }


ENTITIES: list[dict] = [
    # Allwyn & subsidiaries
    _e("allwyn-international", "Allwyn International",
       ticker=None, headquarters_country="CZ",
       aliases=["Allwyn", "Allwyn Intl.", "Allwyn Intl"],
       primary_type="lottery",
       description="Czech-headquartered international lottery and gaming group."),
    _e("prizepicks", "PrizePicks",
       parent_slug="allwyn-international",
       headquarters_country="US",
       primary_type="dfs"),
    _e("opap", "OPAP",
       ticker="OPAP", exchange="ATSE", country_of_listing="GR",
       headquarters_country="GR",
       primary_type="lottery",
       description="Greek lottery and sports betting operator."),

    # Kaizen Gaming
    _e("kaizen-gaming", "Kaizen Gaming",
       headquarters_country="GR",
       primary_type="operator"),
    _e("betano", "Betano",
       parent_slug="kaizen-gaming",
       primary_type="operator"),

    # ATG
    _e("atg", "ATG",
       headquarters_country="SE",
       aliases=["AB Trav och Galopp"],
       primary_type="lottery",
       description="Swedish state horse-racing operator."),

    # Angler Gaming & subsidiary
    _e("angler-gaming", "Angler Gaming",
       ticker="ANGL", exchange="NGM", country_of_listing="SE",
       headquarters_country="MT",
       primary_type="operator"),
    _e("premier-gaming", "Premier Gaming",
       parent_slug="angler-gaming",
       primary_type="operator"),

    # Marlin Media
    _e("marlin-media", "Marlin Media",
       primary_type="affiliate"),

    # Sega Sammy & subsidiary
    _e("sega-sammy", "Sega Sammy",
       ticker="6460", exchange="TSE", country_of_listing="JP",
       headquarters_country="JP",
       primary_type="b2b_platform"),
    _e("stakelogic", "Stakelogic",
       parent_slug="sega-sammy",
       primary_type="b2b_supplier"),

    # GAN
    _e("gan", "GAN",
       ticker="GAN", exchange="NASDAQ", country_of_listing="US",
       headquarters_country="US",
       primary_type="b2b_platform"),

    # Acroud
    _e("acroud", "Acroud",
       ticker="ACROUD", exchange="NGM", country_of_listing="SE",
       primary_type="affiliate"),

    # Aristocrat
    _e("aristocrat", "Aristocrat",
       ticker="ALL", exchange="ASX", country_of_listing="AU",
       headquarters_country="AU",
       aliases=["Aristocrat Leisure"],
       primary_type="b2b_supplier"),

    # NeoGames / NeoPollard
    _e("neogames", "NeoGames",
       headquarters_country="IL",
       primary_type="b2b_platform",
       description="Acquired by Aristocrat in 2024."),
    _e("neopollard", "NeoPollard",
       primary_type="lottery",
       description="JV between NeoGames and Pollard — parent left null."),

    # Higher Roller Technologies
    _e("higher-roller-technologies", "Higher Roller Technologies",
       aliases=["High Roller Technologies", "HRT"],
       primary_type="operator"),

    # Veikkaus & Fennica Gaming
    _e("veikkaus", "Veikkaus",
       headquarters_country="FI",
       primary_type="lottery",
       description="Finnish state gaming monopoly."),
    _e("fennica-gaming", "Fennica Gaming",
       headquarters_country="FI",
       primary_type="b2b_platform"),

    # Codere Online
    _e("codere-online", "Codere Online",
       ticker="CDRO", exchange="NASDAQ", country_of_listing="US",
       headquarters_country="ES",
       primary_type="operator"),

    # Betsson
    _e("betsson", "Betsson",
       ticker="BETS-B", exchange="OMX", country_of_listing="SE",
       primary_type="operator"),

    # Realm / Sporting / Starcasino
    _e("realm-entertainment", "Realm Entertainment",
       primary_type="operator"),
    _e("sporting-solutions", "Sporting Solutions",
       primary_type="b2b_platform"),
    _e("starcasino", "Starcasino",
       primary_type="operator"),

    # US operators
    _e("flutter", "Flutter Entertainment",
       ticker="FLUT", exchange="NYSE", country_of_listing="US",
       headquarters_country="IE",
       aliases=["Flutter", "Flutter Entertainment plc"],
       primary_type="operator"),
    _e("fanduel", "FanDuel",
       parent_slug="flutter",
       headquarters_country="US",
       primary_type="operator"),
    _e("draftkings", "DraftKings",
       ticker="DKNG", exchange="NASDAQ", country_of_listing="US",
       headquarters_country="US",
       primary_type="operator"),
    _e("betmgm", "BetMGM",
       headquarters_country="US",
       primary_type="operator",
       description="JV between MGM and Entain — parent left null."),
    _e("betfanatics", "BetFanatics",
       aliases=["Fanatics Betting and Gaming", "Fanatics Sportsbook"],
       primary_type="operator"),
    _e("rush-street", "Rush Street Interactive",
       ticker="RSI", exchange="NYSE", country_of_listing="US",
       aliases=["RSI", "Rush Street"],
       primary_type="operator"),
    _e("mgm", "MGM Resorts International",
       ticker="MGM", exchange="NYSE", country_of_listing="US",
       primary_type="operator"),
    _e("entain", "Entain",
       ticker="ENT", exchange="LSE", country_of_listing="GB",
       primary_type="operator"),
    _e("evoke", "evoke plc",
       ticker="EVOK", exchange="LSE", country_of_listing="GB",
       headquarters_country="GB",
       aliases=["Evoke", "evoke", "888", "888 Holdings", "888 Holdings plc",
                "William Hill International", "William Hill Online"],
       primary_type="operator",
       description="UK-listed operator; rebranded from 888 Holdings in 2024. Owns 888, William Hill International, Mr Green."),

    # B2B / suppliers
    _e("sportradar", "Sportradar",
       ticker="SRAD", exchange="NASDAQ", country_of_listing="US",
       primary_type="b2b_platform"),
    _e("playtech", "Playtech",
       ticker="PTEC", exchange="LSE", country_of_listing="GB",
       primary_type="b2b_platform"),
    _e("evolution", "Evolution",
       ticker="EVO", exchange="OMX", country_of_listing="SE",
       primary_type="b2b_supplier"),
    _e("netent", "NetEnt",
       parent_slug="evolution",
       primary_type="b2b_supplier",
       description="Acquired by Evolution in 2020."),
    _e("light-and-wonder", "Light & Wonder",
       ticker="LNW", exchange="NASDAQ", country_of_listing="US",
       aliases=["L&W", "Scientific Games"],
       primary_type="b2b_supplier"),

    # Additional listed operators (added for IR scraper coverage)
    _e("kindred-group", "Kindred Group",
       ticker="KIND-SDB", exchange="OMX", country_of_listing="SE",
       headquarters_country="MT",
       aliases=["Kindred", "Unibet", "Kindred plc"],
       primary_type="operator",
       description="Stockholm-listed operator; acquired by La Française des Jeux (FDJ) 2024."),
    _e("kambi-group", "Kambi Group",
       ticker="KAMBI", exchange="OMX", country_of_listing="SE",
       headquarters_country="MT",
       aliases=["Kambi"],
       primary_type="b2b_platform",
       description="B2B sportsbook platform; Stockholm-listed, Malta HQ."),
    _e("evoke", "Evoke plc",
       ticker="EVOK", exchange="LSE", country_of_listing="GB",
       headquarters_country="GB",
       aliases=["888", "888 Holdings", "888 plc", "William Hill", "Evoke"],
       primary_type="operator",
       description="Renamed from 888 Holdings in 2024; owns 888, William Hill, Mr Green."),
    _e("caesars", "Caesars Entertainment",
       ticker="CZR", exchange="NASDAQ", country_of_listing="US",
       headquarters_country="US",
       aliases=["Caesars", "Caesars Digital"],
       primary_type="operator"),
    _e("ballys", "Bally's Corporation",
       ticker="BALY", exchange="NYSE", country_of_listing="US",
       headquarters_country="US",
       aliases=["Bally's", "Bally Corp"],
       primary_type="operator"),
    _e("churchill-downs", "Churchill Downs Incorporated",
       ticker="CHDN", exchange="NASDAQ", country_of_listing="US",
       headquarters_country="US",
       aliases=["Churchill Downs", "CDI", "TwinSpires"],
       primary_type="operator"),
    _e("super-group", "Super Group (SGHC)",
       ticker="SGHC", exchange="NYSE", country_of_listing="US",
       headquarters_country="GG",
       aliases=["Super Group", "Betway", "Spin"],
       primary_type="operator"),

    # Affiliates
    _e("better-collective", "Better Collective",
       ticker="BETCO", exchange="OMX", country_of_listing="SE",
       primary_type="affiliate"),
    _e("catena-media", "Catena Media",
       ticker="CTM", exchange="OMX", country_of_listing="SE",
       primary_type="affiliate"),
    _e("gambling-com-group", "Gambling.com Group",
       ticker="GAMB", exchange="NASDAQ", country_of_listing="US",
       primary_type="affiliate"),
]
