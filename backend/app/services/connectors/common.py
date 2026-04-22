from __future__ import annotations

import html
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup


INTEREST_KEYWORDS = (
    "product",
    "strategy",
    "operations",
    "bizops",
    "business operations",
    "chief of staff",
    "entrepreneur in residence",
    "eir",
    "general manager",
    "program manager",
)
NOISE_KEYWORDS = (
    "recruiter",
    "sales",
    "account executive",
    "designer",
    "software engineer",
    "frontend engineer",
    "backend engineer",
    "data engineer",
    "customer success",
    "support engineer",
    "hr business partner",
    "marketing",
)


def load_company_slug_map(path: str) -> dict[str, list[str]]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def slug_to_company(slug: str) -> str:
    parts = slug.replace("_", "-").split("-")
    normalized = []
    for part in parts:
        if not part:
            continue
        normalized.append(part.upper() if len(part) <= 3 else part.capitalize())
    return " ".join(normalized)


def clean_html_to_text(raw_html: str) -> str:
    soup = BeautifulSoup(raw_html or "", "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    text = soup.get_text("\n", strip=True)
    return normalize_whitespace(text)


def normalize_whitespace(value: str) -> str:
    collapsed = re.sub(r"[ \t]+", " ", value or "")
    collapsed = re.sub(r"\n{3,}", "\n\n", collapsed)
    return html.unescape(collapsed).strip()


def classify_remote(*segments: str) -> str:
    text = " ".join(segment for segment in segments if segment).lower()
    if any(keyword in text for keyword in ("remote", "distributed", "work from home", "anywhere")):
        return "remote"
    if any(keyword in text for keyword in ("hybrid", "2 days", "3 days", "office days")):
        return "hybrid"
    if any(keyword in text for keyword in ("onsite", "on-site", "relocation")):
        return "onsite"
    return "unknown"


def parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(timestamp, tz=UTC).replace(tzinfo=None)

    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            return datetime.fromisoformat(candidate.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d %b %Y", "%B %d, %Y"):
            try:
                return datetime.strptime(candidate, fmt)
            except ValueError:
                continue
    return None


def is_recent(posted_at: datetime | None, days: int = 30) -> bool:
    if posted_at is None:
        return True
    return posted_at >= datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)


def matches_target_role(title: str, department: str | None = None, description: str | None = None) -> bool:
    haystack = " ".join(filter(None, [title, department or "", description or ""])).lower()
    title_lower = (title or "").lower()
    if not any(keyword in haystack for keyword in INTEREST_KEYWORDS):
        return False
    if any(keyword in title_lower for keyword in NOISE_KEYWORDS):
        return False
    return True


def absolute_url(base_url: str, href: str) -> str:
    return urljoin(base_url, href)


def compact_external_id(prefix: str, source: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]+", "-", source).strip("-").lower()
    return f"{prefix}-{safe}"


def extract_meta_content(soup: BeautifulSoup, *, name: str | None = None, property_name: str | None = None) -> str | None:
    attrs: dict[str, str] = {}
    if name:
        attrs["name"] = name
    if property_name:
        attrs["property"] = property_name
    tag = soup.find("meta", attrs=attrs)
    if tag and tag.get("content"):
        return normalize_whitespace(tag["content"])
    return None


def extract_label_value(text: str, label: str) -> str | None:
    pattern = rf"{re.escape(label)}\s*[:\n]\s*(.+)"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if match:
        value = match.group(1).splitlines()[0].strip()
        return normalize_whitespace(value)
    return None
