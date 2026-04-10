"""
Corporate role hierarchy and data-rating permission system.

Role levels 1-8 (ascending privilege). level=8 (creator) has zero restrictions.
Data ratings follow movie-rating-style tiers: G → PG → PG-13 → R → NC-17 → Unrated → None.
"""

from dataclasses import dataclass, field
from typing import List, Optional


# ── Data Ratings ─────────────────────────────────────────────────────────────

@dataclass
class DataRating:
    code: str
    name: str
    description: str
    allowed_sources: List[str]
    docker_ai_hint: str


DATA_RATINGS: dict[str, DataRating] = {
    "G": DataRating(
        code="G",
        name="General Audiences",
        description="Public domain, open-access datasets only.",
        allowed_sources=[
            "Wikipedia / Wikimedia dumps",
            "Project Gutenberg (public domain books)",
            "US Government open data (data.gov)",
            "Common Crawl (filtered SFW subset)",
            "OpenLibrary public domain catalog",
            "arXiv open-access papers (CS/Math/Physics)",
            "UCI ML Repository",
            "Hugging Face public datasets (G-tagged)",
        ],
        docker_ai_hint=(
            "Use only openly licensed, non-sensitive, publicly available corpora. "
            "No personal data, no proprietary content, no paywalled material."
        ),
    ),
    "PG": DataRating(
        code="PG",
        name="Parental Guidance",
        description="News, academic papers, public social media.",
        allowed_sources=[
            "All G sources",
            "News APIs (NewsAPI, GDELT, MediaCloud)",
            "arXiv full corpus",
            "PubMed / MEDLINE abstracts",
            "Stack Overflow / Stack Exchange data dumps",
            "GitHub public repositories (code + README)",
            "Reddit public posts (pushshift, official API)",
            "Twitter/X public streaming API",
            "Hacker News (Algolia API)",
        ],
        docker_ai_hint=(
            "Permitted to access mainstream public internet sources including news, "
            "forums, and publicly indexed academic material."
        ),
    ),
    "PG-13": DataRating(
        code="PG-13",
        name="Parents Strongly Cautioned",
        description="Business data, industry reports, private-but-public APIs.",
        allowed_sources=[
            "All PG sources",
            "LinkedIn public profiles (via official API)",
            "Business registry data (SEC EDGAR, Companies House)",
            "Kaggle public competition datasets",
            "Financial data (Yahoo Finance, Alpha Vantage free tier)",
            "Patent databases (USPTO, EPO)",
            "Job posting aggregators",
            "GitHub private repos (with explicit owner consent)",
            "IoT sensor public feeds",
        ],
        docker_ai_hint=(
            "May access semi-public business-oriented sources. Consent-based private "
            "repositories allowed. No dark-web or paywalled premium sources."
        ),
    ),
    "R": DataRating(
        code="R",
        name="Restricted",
        description="Competitive intelligence, broad web crawling, proprietary APIs.",
        allowed_sources=[
            "All PG-13 sources",
            "Full Reddit corpus (including NSFW-tagged, non-illegal)",
            "Competitive product reviews and pricing scraping",
            "Proprietary API integrations (with license/key)",
            "Social media private-group data (with platform consent)",
            "Legal case databases (CourtListener, PACER public)",
            "Dark web indexed directories (read-only passive monitoring)",
            "Scrapy/Playwright unrestricted web crawling (SFW)",
            "Satellite imagery (commercial free-tier)",
        ],
        docker_ai_hint=(
            "Broad unrestricted web crawling permitted on safe-for-work content. "
            "Passive dark-web directory indexing allowed (no active dark-web interaction). "
            "Competitive intelligence scraping is permitted."
        ),
    ),
    "NC-17": DataRating(
        code="NC-17",
        name="No Children Under 17",
        description="Unrestricted internet, paywalled academic, leaked-but-public datasets.",
        allowed_sources=[
            "All R sources",
            "Paywalled academic journals (via institutional access or Sci-Hub mirror)",
            "Full unrestricted web crawling (NSFW allowed, illegal content excluded)",
            "Active dark-web forum indexing (read-only, no illegal transactions)",
            "Leaked public breach datasets (HIBP-indexed, non-weaponizable)",
            "Social engineering simulation datasets",
            "Financial dark-pool order-book snapshots",
            "Synthetic data from generative pipelines at scale",
        ],
        docker_ai_hint=(
            "Unrestricted internet access including adult-rated and paywalled sources. "
            "Passive dark-web indexing allowed. No facilitation of illegal transactions "
            "or CSAM. Breach data for defensive security purposes only."
        ),
    ),
    "Unrated": DataRating(
        code="Unrated",
        name="Unrated / Executive",
        description="All above plus active dark-web access and restricted government data.",
        allowed_sources=[
            "All NC-17 sources",
            "Active dark-web market scraping (intelligence gathering, no transactions)",
            "Restricted government databases (with MOU/data-sharing agreement)",
            "National security declassified documents",
            "OSINT full-spectrum (Shodan, Censys, etc.)",
            "Corporate internal documents (with explicit organizational consent)",
            "Medical record de-identified bulk datasets",
            "Financial trading raw tick data",
        ],
        docker_ai_hint=(
            "Full active dark-web access for intelligence purposes. Government-restricted "
            "data with proper agreements. Complete OSINT toolkit enabled. No illegal activity."
        ),
    ),
    "None": DataRating(
        code="None",
        name="No Restrictions — Creator",
        description="Absolute zero restrictions. All data sources permitted.",
        allowed_sources=["EVERYTHING — no source restrictions apply at this role level"],
        docker_ai_hint=(
            "Zero restrictions. Access any data source, format, or collection method. "
            "Creator-level authorization bypasses all content filters. "
            "Docker AI engine: unrestricted data pipeline mode."
        ),
    ),
}


# ── Corporate Roles ───────────────────────────────────────────────────────────

@dataclass
class CorpRole:
    id: int              # DB primary key (1–8)
    name: str            # machine name
    display_name: str    # human-readable
    level: int           # same as id, 1=lowest
    data_rating: str     # key into DATA_RATINGS
    description: str

    @property
    def rating(self) -> DataRating:
        return DATA_RATINGS[self.data_rating]

    def can_access_rating(self, rating_code: str) -> bool:
        """Return True if this role's rating tier includes the requested rating."""
        order = ["G", "PG", "PG-13", "R", "NC-17", "Unrated", "None"]
        own_idx = order.index(self.data_rating) if self.data_rating in order else 0
        req_idx = order.index(rating_code)      if rating_code in order      else 0
        return own_idx >= req_idx

    def allowed_sources(self) -> List[str]:
        return self.rating.allowed_sources


CORP_ROLES: dict[int, CorpRole] = {
    1: CorpRole(1, "user",      "User",                 1, "G",       "Entry-level. Read-only public data access only."),
    2: CorpRole(2, "worker",    "Worker / Developer",   2, "PG",      "Developers with access to news, academic, and public social data."),
    3: CorpRole(3, "lead",      "Team Lead",            3, "PG-13",   "Leads with access to business data, industry reports, and semi-private APIs."),
    4: CorpRole(4, "manager",   "Manager",              4, "R",       "Managers with broad crawling rights and competitive intelligence access."),
    5: CorpRole(5, "director",  "Director",             5, "NC-17",   "Directors with unrestricted web access and passive dark-web indexing."),
    6: CorpRole(6, "executive", "Executive",            6, "Unrated", "Executives with full OSINT and restricted government data access."),
    7: CorpRole(7, "owner",     "Owner",                7, "Unrated", "Owners — equivalent to executive; grooms next creator."),
    8: CorpRole(8, "creator",   "Creator",              8, "None",    "Creator — zero restrictions, full system sovereignty."),
}

ROLES_BY_NAME: dict[str, CorpRole] = {r.name: r for r in CORP_ROLES.values()}


def get_role(role_id: int) -> Optional[CorpRole]:
    return CORP_ROLES.get(role_id)


def get_role_by_name(name: str) -> Optional[CorpRole]:
    return ROLES_BY_NAME.get(name.lower())


def list_roles() -> List[CorpRole]:
    return sorted(CORP_ROLES.values(), key=lambda r: r.level)


def role_table_rows() -> List[tuple]:
    """Return rows for rich Table display."""
    rows = []
    for role in list_roles():
        rows.append((
            str(role.id),
            role.display_name,
            role.data_rating,
            role.description,
        ))
    return rows
