"""Per-regulator scrapers.

Each module exposes a concrete ``RegulatorScraper`` subclass. Add new scrapers
to ``ALL`` so ``trailblaze-scrape-regulators`` picks them up automatically.
"""

from __future__ import annotations

# US state regulators
from trailblaze.scrapers.regulators.az_gaming import ArizonaGamingScraper
from trailblaze.scrapers.regulators.co_gaming import ColoradoGamingScraper
from trailblaze.scrapers.regulators.ct_dcp import ConnecticutDCPScraper
from trailblaze.scrapers.regulators.de_lottery import DelawareLotteryScraper
from trailblaze.scrapers.regulators.ia_rgc import IowaRGCScraper
from trailblaze.scrapers.regulators.il_gaming import IllinoisGamingBoardScraper
from trailblaze.scrapers.regulators.in_gaming import IndianaGamingScraper
from trailblaze.scrapers.regulators.ma_gaming import MassachusettsGamingScraper
from trailblaze.scrapers.regulators.md_lottery import MarylandLotteryScraper
from trailblaze.scrapers.regulators.me_gcu import MaineGCUScraper
from trailblaze.scrapers.regulators.mi_mgcb import MichiganMGCBScraper
from trailblaze.scrapers.regulators.nc_lottery import NorthCarolinaLotteryScraper
from trailblaze.scrapers.regulators.nh_lottery import NewHampshireLotteryScraper
from trailblaze.scrapers.regulators.nj_dge import NewJerseyDGEScraper
from trailblaze.scrapers.regulators.nv_gcb import NevadaGCBScraper
from trailblaze.scrapers.regulators.ny_gaming import NewYorkGamingScraper
from trailblaze.scrapers.regulators.oh_ccc import OhioCCCScraper
from trailblaze.scrapers.regulators.pa_pgcb import PennsylvaniaPGCBScraper
from trailblaze.scrapers.regulators.ri_lottery import RhodeIslandLotteryScraper
from trailblaze.scrapers.regulators.tn_swac import TennesseeSWACScraper
from trailblaze.scrapers.regulators.va_lottery import VirginiaLotteryScraper
from trailblaze.scrapers.regulators.wv_lottery import WestVirginiaLotteryScraper

# International regulators
from trailblaze.scrapers.regulators.es_dgoj import DGOJSpainScraper
from trailblaze.scrapers.regulators.fr_anj import ANJFranceScraper
from trailblaze.scrapers.regulators.it_adm import ADMItalyScraper
from trailblaze.scrapers.regulators.mt_mga import MaltaGamingAuthorityScraper
from trailblaze.scrapers.regulators.on_igo import IGamingOntarioScraper
from trailblaze.scrapers.regulators.se_spelinspektionen import SpelinspektionenScraper
from trailblaze.scrapers.regulators.uk_ukgc import UKGCScraper

ALL = [
    # US states
    NewJerseyDGEScraper,
    PennsylvaniaPGCBScraper,
    MichiganMGCBScraper,
    ConnecticutDCPScraper,
    IllinoisGamingBoardScraper,
    NewYorkGamingScraper,
    NevadaGCBScraper,
    WestVirginiaLotteryScraper,
    DelawareLotteryScraper,
    RhodeIslandLotteryScraper,
    MassachusettsGamingScraper,
    MarylandLotteryScraper,
    OhioCCCScraper,
    TennesseeSWACScraper,
    VirginiaLotteryScraper,
    IndianaGamingScraper,
    IowaRGCScraper,
    ArizonaGamingScraper,
    ColoradoGamingScraper,
    NewHampshireLotteryScraper,
    NorthCarolinaLotteryScraper,
    MaineGCUScraper,
    # International
    UKGCScraper,
    SpelinspektionenScraper,
    MaltaGamingAuthorityScraper,
    IGamingOntarioScraper,
    DGOJSpainScraper,
    ANJFranceScraper,
    ADMItalyScraper,
]

__all__ = [
    "ALL",
    # Exported by name for direct imports.
    "ADMItalyScraper",
    "ANJFranceScraper",
    "ArizonaGamingScraper",
    "ColoradoGamingScraper",
    "ConnecticutDCPScraper",
    "DGOJSpainScraper",
    "DelawareLotteryScraper",
    "IGamingOntarioScraper",
    "IllinoisGamingBoardScraper",
    "IndianaGamingScraper",
    "IowaRGCScraper",
    "MaineGCUScraper",
    "MaltaGamingAuthorityScraper",
    "MarylandLotteryScraper",
    "MassachusettsGamingScraper",
    "MichiganMGCBScraper",
    "NevadaGCBScraper",
    "NewHampshireLotteryScraper",
    "NewJerseyDGEScraper",
    "NewYorkGamingScraper",
    "NorthCarolinaLotteryScraper",
    "OhioCCCScraper",
    "PennsylvaniaPGCBScraper",
    "RhodeIslandLotteryScraper",
    "SpelinspektionenScraper",
    "TennesseeSWACScraper",
    "UKGCScraper",
    "VirginiaLotteryScraper",
    "WestVirginiaLotteryScraper",
]
