from __future__ import annotations

import logging
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import BACKEND_DIR, get_settings
from app.schemas import JobIngest
from app.services.connectors.common import (
    classify_remote,
    clean_html_to_text,
    load_company_slug_map,
    matches_target_role,
    parse_datetime,
    slug_to_company,
)


LOGGER = logging.getLogger(__name__)


class LeverConnector:
    name = "lever"

    def __init__(self) -> None:
        settings = get_settings()
        self.timeout = settings.http_timeout_seconds
        company_path = Path(BACKEND_DIR) / "data" / "companies.json"
        self.slugs = load_company_slug_map(str(company_path)).get("lever", [])

    def fetch_jobs(self) -> list[JobIngest]:
        jobs: list[JobIngest] = []
        for slug in self.slugs:
            try:
                payload = self._fetch_json(f"https://api.lever.co/v0/postings/{slug}?mode=json")
            except Exception:
                LOGGER.exception("lever fetch failed", extra={"company_slug": slug})
                continue

            for item in payload:
                title = (item.get("text") or "").strip()
                description = item.get("descriptionPlain") or item.get("description") or ""
                department = (item.get("categories") or {}).get("team", "")
                if not matches_target_role(title, department, description):
                    continue

                categories = item.get("categories") or {}
                location = categories.get("location") or "Unknown"
                jobs.append(
                    JobIngest(
                        source="lever",
                        external_id=str(item.get("id")),
                        company=slug_to_company(slug),
                        title=title,
                        location=location,
                        remote_policy=classify_remote(
                            location,
                            title,
                            categories.get("workplaceType", ""),
                            description,
                        ),
                        jd_text=clean_html_to_text(description),
                        jd_url=(item.get("hostedUrl") or "").strip(),
                        posted_at=parse_datetime(item.get("createdAt")),
                    )
                )

        return jobs

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _fetch_json(self, url: str) -> list[dict]:
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "JobSearchAssistant/1.0"})
            response.raise_for_status()
            return response.json()

