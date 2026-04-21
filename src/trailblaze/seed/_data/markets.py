"""Market hierarchy seed. Parent expressed via ``parent_slug`` (resolved to UUID
at insert time). Per SCHEMA_SPEC.md §markets initial set.
"""

from __future__ import annotations


def _m(slug: str, name: str, market_type: str, *,
       parent_slug: str | None = None,
       iso_country: str | None = None,
       iso_subdivision: str | None = None,
       aliases: list[str] | None = None,
       currency: str | None = None) -> dict:
    return {
        "slug": slug, "name": name, "market_type": market_type,
        "parent_slug": parent_slug,
        "iso_country": iso_country, "iso_subdivision": iso_subdivision,
        "aliases": aliases, "currency": currency,
    }


# Regions (top-level, no parent)
_REGIONS = [
    _m("north-america", "North America", "region"),
    _m("europe", "Europe", "region"),
    _m("latam", "Latin America", "region", aliases=["LatAm", "Latin America"]),
    _m("asia-pacific", "Asia-Pacific", "region", aliases=["APAC", "Asia Pacific"]),
    _m("africa", "Africa", "region"),
    _m("mena", "MENA", "region", aliases=["Middle East and North Africa"]),
    _m("ceeca", "CEECA", "region", aliases=["Central & Eastern Europe / Central Asia"]),
    _m("nordics", "Nordics", "region", aliases=["Nordic countries"]),
]

# Countries (parent = region)
_COUNTRIES = [
    # North America
    _m("united-states", "United States", "country", parent_slug="north-america",
       iso_country="US", aliases=["US", "USA", "U.S.", "U.S.A."], currency="USD"),
    _m("canada", "Canada", "country", parent_slug="north-america",
       iso_country="CA", currency="CAD"),
    # LatAm
    _m("mexico", "Mexico", "country", parent_slug="latam",
       iso_country="MX", currency="MXN"),
    _m("brazil", "Brazil", "country", parent_slug="latam",
       iso_country="BR", currency="BRL"),
    _m("argentina", "Argentina", "country", parent_slug="latam",
       iso_country="AR", currency="ARS"),
    _m("peru", "Peru", "country", parent_slug="latam",
       iso_country="PE", currency="PEN"),
    _m("colombia", "Colombia", "country", parent_slug="latam",
       iso_country="CO", currency="COP"),
    _m("chile", "Chile", "country", parent_slug="latam",
       iso_country="CL", currency="CLP"),
    # Europe
    _m("united-kingdom", "United Kingdom", "country", parent_slug="europe",
       iso_country="GB", aliases=["UK", "Britain", "Great Britain"], currency="GBP"),
    _m("ireland", "Ireland", "country", parent_slug="europe",
       iso_country="IE", currency="EUR"),
    _m("germany", "Germany", "country", parent_slug="europe",
       iso_country="DE", currency="EUR"),
    _m("france", "France", "country", parent_slug="europe",
       iso_country="FR", currency="EUR"),
    _m("italy", "Italy", "country", parent_slug="europe",
       iso_country="IT", currency="EUR"),
    _m("spain", "Spain", "country", parent_slug="europe",
       iso_country="ES", currency="EUR"),
    _m("portugal", "Portugal", "country", parent_slug="europe",
       iso_country="PT", currency="EUR"),
    _m("netherlands", "Netherlands", "country", parent_slug="europe",
       iso_country="NL", currency="EUR"),
    _m("belgium", "Belgium", "country", parent_slug="europe",
       iso_country="BE", currency="EUR"),
    _m("switzerland", "Switzerland", "country", parent_slug="europe",
       iso_country="CH", currency="CHF"),
    _m("austria", "Austria", "country", parent_slug="europe",
       iso_country="AT", currency="EUR"),
    _m("czech-republic", "Czech Republic", "country", parent_slug="europe",
       iso_country="CZ", aliases=["Czechia"], currency="CZK"),
    _m("greece", "Greece", "country", parent_slug="europe",
       iso_country="GR", currency="EUR"),
    _m("cyprus", "Cyprus", "country", parent_slug="europe",
       iso_country="CY", currency="EUR"),
    _m("croatia", "Croatia", "country", parent_slug="europe",
       iso_country="HR", currency="EUR"),
    _m("malta", "Malta", "country", parent_slug="europe",
       iso_country="MT", currency="EUR"),
    # Nordics
    _m("sweden", "Sweden", "country", parent_slug="nordics",
       iso_country="SE", currency="SEK"),
    _m("denmark", "Denmark", "country", parent_slug="nordics",
       iso_country="DK", currency="DKK"),
    _m("finland", "Finland", "country", parent_slug="nordics",
       iso_country="FI", currency="EUR"),
    _m("norway", "Norway", "country", parent_slug="nordics",
       iso_country="NO", currency="NOK"),
    # CEECA
    _m("lithuania", "Lithuania", "country", parent_slug="ceeca",
       iso_country="LT", currency="EUR"),
    _m("latvia", "Latvia", "country", parent_slug="ceeca",
       iso_country="LV", currency="EUR"),
    _m("estonia", "Estonia", "country", parent_slug="ceeca",
       iso_country="EE", currency="EUR"),
    _m("georgia", "Georgia", "country", parent_slug="ceeca",
       iso_country="GE", currency="GEL"),
    # APAC
    _m("australia", "Australia", "country", parent_slug="asia-pacific",
       iso_country="AU", currency="AUD"),
    _m("new-zealand", "New Zealand", "country", parent_slug="asia-pacific",
       iso_country="NZ", currency="NZD"),
    _m("japan", "Japan", "country", parent_slug="asia-pacific",
       iso_country="JP", currency="JPY"),
    _m("philippines", "Philippines", "country", parent_slug="asia-pacific",
       iso_country="PH", currency="PHP"),
]

# US states (parent = united-states). Only states flagged in spec for
# regulated iGaming and/or OSB.
_US_STATES_RAW: list[tuple[str, str]] = [
    ("NJ", "New Jersey"), ("PA", "Pennsylvania"), ("MI", "Michigan"),
    ("WV", "West Virginia"), ("CT", "Connecticut"), ("RI", "Rhode Island"),
    ("DE", "Delaware"), ("NV", "Nevada"), ("NY", "New York"),
    ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"),
    ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"),
    ("MA", "Massachusetts"), ("MD", "Maryland"), ("OH", "Ohio"),
    ("OR", "Oregon"), ("TN", "Tennessee"), ("VA", "Virginia"),
    ("VT", "Vermont"), ("WY", "Wyoming"), ("AZ", "Arizona"),
    ("CO", "Colorado"), ("NH", "New Hampshire"), ("NC", "North Carolina"),
    ("ME", "Maine"),
]
_US_STATES = [
    _m(
        slug=f"us-{name.lower().replace(' ', '-')}",
        name=name,
        market_type="state",
        parent_slug="united-states",
        iso_subdivision=f"US-{code}",
        aliases=[code, f"{code}."],
        currency="USD",
    )
    for code, name in _US_STATES_RAW
]

# Canadian provinces (parent = canada)
_CA_PROVINCES = [
    _m("ca-ontario", "Ontario", "province", parent_slug="canada",
       iso_subdivision="CA-ON", aliases=["ON"], currency="CAD"),
    _m("ca-alberta", "Alberta", "province", parent_slug="canada",
       iso_subdivision="CA-AB", aliases=["AB"], currency="CAD"),
]

MARKETS: list[dict] = _REGIONS + _COUNTRIES + _US_STATES + _CA_PROVINCES
