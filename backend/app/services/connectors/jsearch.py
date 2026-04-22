from __future__ import annotations

import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas import JobIngest
from app.services.connectors.common import (
    classify_remote,
    clean_html_to_text,
    matches_target_role,
    parse_datetime,
)


LOGGER = logging.getLogger(__name__)

SEARCH_QUERIES = [
    "product manager OR strategy and operations",
    "chief of staff OR entrepreneur in residence",
    "general manager OR program manager OR business operations",
]


class JSearchConnector:
    name = "jsearch"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.jsearch_api_key
        self.timeout = settings.http_timeout_seconds

    def fetch_jobs(self) -> list[JobIngest]:
        if not self.api_key:
            raise RuntimeError("JSEARCH_API_KEY is not configured")

        jobs: list[JobIngest] = []
        seen: set[str] = set()

        for query in SEARCH_QUERIES:
            try:
                items = self._search(query)
            except Exception:
                LOGGER.exception("jsearch query failed", extra={"query": query})
                continue

            for item in items:
                job_id = item.get("job_id") or ""
                if not job_id or job_id in seen:
                    continue
                seen.add(job_id)

                title = (item.get("job_title") or "").strip()
                description = clean_html_to_text(item.get("job_description") or "")
                if not matches_target_role(title, None, description):
                    continue

                location = self._build_location(item)
                remote_flag = item.get("job_is_remote") is True

                jobs.append(
                    JobIngest(
                        source="jsearch",
                        external_id=job_id,
                        company=(item.get("employer_name") or "Unknown").strip(),
                        title=title,
                        location=location,
                        remote_policy="remote" if remote_flag else classify_remote(location, title, description),
                        jd_text=description,
                        jd_url=(item.get("job_apply_link") or item.get("job_google_link") or "").strip(),
                        posted_at=parse_datetime(item.get("job_posted_at_datetime_utc")),
                    )
                )

        return jobs

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _search(self, query: str, num_pages: int = 2) -> list[dict]:
        all_items: list[dict] = []
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            for page in range(1, num_pages + 1):
                response = client.get(
                    "https://jsearch.p.rapidapi.com/search",
                    params={
                        "query": f"{query} in United States",
                        "page": str(page),
                        "num_pages": "1",
                        "date_posted": "month",
                        "country": "us",
                    },
                    headers={
                        "X-RapidAPI-Key": self.api_key,
                        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
                    },
                )
                response.raise_for_status()
                page_data = response.json().get("data") or []
                all_items.extend(page_data)
                if len(page_data) < 10:
                    break
        return all_items

    def search_on_demand(self, query: str) -> list[JobIngest]:
        if not self.api_key:
            raise RuntimeError("JSEARCH_API_KEY is not configured")

        jobs: list[JobIngest] = []
        seen: set[str] = set()

        try:
            items = self._search(query, num_pages=1)
        except Exception:
            LOGGER.exception("jsearch on-demand search failed", extra={"query": query})
            return jobs

        for item in items:
            job_id = item.get("job_id") or ""
            if not job_id or job_id in seen:
                continue
            seen.add(job_id)

            title = (item.get("job_title") or "").strip()
            description = clean_html_to_text(item.get("job_description") or "")
            if not matches_target_role(title, None, description):
                continue

            location = self._build_location(item)
            remote_flag = item.get("job_is_remote") is True

            jobs.append(
                JobIngest(
                    source="jsearch",
                    external_id=job_id,
                    company=(item.get("employer_name") or "Unknown").strip(),
                    title=title,
                    location=location,
                    remote_policy="remote" if remote_flag else classify_remote(location, title, description),
                    jd_text=description,
                    jd_url=(item.get("job_apply_link") or item.get("job_google_link") or "").strip(),
                    posted_at=parse_datetime(item.get("job_posted_at_datetime_utc")),
                )
            )

        return jobs

    @staticmethod
    def _build_location(item: dict) -> str:
        city = (item.get("job_city") or "").strip()
        state = (item.get("job_state") or "").strip()
        if city and state:
            return f"{city}, {state}"
        if city:
            return city
        if state:
            return state
        if item.get("job_is_remote"):
            return "Remote"
        return "United States"
