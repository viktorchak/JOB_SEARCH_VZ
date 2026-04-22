from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas import JobIngest
from app.services.connectors.common import (
    absolute_url,
    classify_remote,
    clean_html_to_text,
    compact_external_id,
    extract_label_value,
    extract_meta_content,
    matches_target_role,
    normalize_whitespace,
    parse_datetime,
)


LOGGER = logging.getLogger(__name__)
ATS_HINTS = ("greenhouse", "lever", "workday", "ashby", "recruitee", "workable", "weekday")
JOB_PATH_HINTS = ("job", "jobs", "career", "position", "opening", "apply", "role")


class LeenaConnector:
    name = "leena"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.timeout = self.settings.http_timeout_seconds

    def fetch_jobs(self) -> list[JobIngest]:
        jobs: list[JobIngest] = []
        seen: set[str] = set()

        careers_html = self._fetch_html(str(self.settings.leena_careers_url))
        candidate_urls = self._discover_candidate_urls(careers_html)
        if not candidate_urls:
            candidate_urls = self.settings.leena_fallback_urls

        for url in candidate_urls:
            if url in seen:
                continue
            seen.add(url)
            try:
                html = self._fetch_html(url)
                job = self._parse_job_page(url, html)
            except Exception:
                LOGGER.exception("leena job detail fetch failed", extra={"url": url})
                continue
            if job:
                jobs.append(job)

        return jobs

    def _discover_candidate_urls(self, html: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"].strip()
            text = normalize_whitespace(anchor.get_text(" ", strip=True))
            absolute = absolute_url(str(self.settings.leena_careers_url), href)
            lower_absolute = absolute.lower()
            if any(hint in lower_absolute for hint in ATS_HINTS):
                urls.append(absolute)
                continue
            if any(hint in lower_absolute for hint in JOB_PATH_HINTS) and matches_target_role(text):
                urls.append(absolute)
        return urls

    def _parse_job_page(self, url: str, html: str) -> JobIngest | None:
        soup = BeautifulSoup(html, "html.parser")
        title = (
            extract_meta_content(soup, property_name="og:title")
            or extract_meta_content(soup, name="twitter:title")
            or (soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "")
            or (soup.title.get_text(" ", strip=True) if soup.title else "")
        )
        title = normalize_whitespace(title)

        description = self._extract_description(soup)
        if not matches_target_role(title, None, description):
            return None

        location = (
            extract_label_value(description, "Location")
            or extract_label_value(clean_html_to_text(str(soup)), "Location")
            or "Unknown"
        )
        posted_at = parse_datetime(
            extract_meta_content(soup, property_name="article:published_time")
            or extract_meta_content(soup, name="date")
        )

        slug = urlparse(url).path.strip("/").split("/")[-1] or "leena-role"
        external_id_match = re.search(r"(\d{6,})", url)
        external_id = external_id_match.group(1) if external_id_match else compact_external_id("leena", slug)

        return JobIngest(
            source="leena",
            external_id=external_id,
            company="Leena AI",
            title=title,
            location=location,
            remote_policy=classify_remote(location, title, description),
            jd_text=description,
            jd_url=url,
            posted_at=posted_at,
        )

    def _extract_description(self, soup: BeautifulSoup) -> str:
        candidates = []
        for selector in ("article", "main", "[role='main']", "body"):
            node = soup.select_one(selector)
            if node:
                candidates.append(node.get_text("\n", strip=True))
        if not candidates:
            return ""
        description = max(candidates, key=len)
        return normalize_whitespace(description)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _fetch_html(self, url: str) -> str:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
            )
        }
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            response = client.get(url, headers=headers)
            response.raise_for_status()
            return response.text

