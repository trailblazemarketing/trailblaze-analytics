"""Company IR (investor relations) scrapers.

Each module exposes a concrete ``IRScraper`` subclass. Add new scrapers to
``ALL`` so ``trailblaze-scrape-companies`` picks them up automatically.
"""

from __future__ import annotations

from trailblaze.scrapers.companies.ballys import BallysIRScraper
from trailblaze.scrapers.companies.betsson import BetssonIRScraper
from trailblaze.scrapers.companies.caesars import CaesarsIRScraper
from trailblaze.scrapers.companies.churchill_downs import ChurchillDownsIRScraper
from trailblaze.scrapers.companies.draftkings import DraftKingsIRScraper
from trailblaze.scrapers.companies.entain import EntainIRScraper
from trailblaze.scrapers.companies.evoke import EvokeIRScraper
from trailblaze.scrapers.companies.evolution import EvolutionIRScraper
from trailblaze.scrapers.companies.flutter import FlutterIRScraper
from trailblaze.scrapers.companies.kambi import KambiIRScraper
from trailblaze.scrapers.companies.kindred import KindredIRScraper
from trailblaze.scrapers.companies.mgm import MGMIRScraper
from trailblaze.scrapers.companies.playtech import PlaytechIRScraper
from trailblaze.scrapers.companies.rush_street import RushStreetIRScraper
from trailblaze.scrapers.companies.super_group import SuperGroupIRScraper

ALL = [
    BetssonIRScraper,
    KindredIRScraper,
    KambiIRScraper,
    EntainIRScraper,
    FlutterIRScraper,
    PlaytechIRScraper,
    EvolutionIRScraper,
    EvokeIRScraper,
    DraftKingsIRScraper,
    MGMIRScraper,
    CaesarsIRScraper,
    RushStreetIRScraper,
    BallysIRScraper,
    ChurchillDownsIRScraper,
    SuperGroupIRScraper,
]

__all__ = [
    "ALL",
    "BallysIRScraper",
    "BetssonIRScraper",
    "CaesarsIRScraper",
    "ChurchillDownsIRScraper",
    "DraftKingsIRScraper",
    "EntainIRScraper",
    "EvokeIRScraper",
    "EvolutionIRScraper",
    "FlutterIRScraper",
    "KambiIRScraper",
    "KindredIRScraper",
    "MGMIRScraper",
    "PlaytechIRScraper",
    "RushStreetIRScraper",
    "SuperGroupIRScraper",
]
