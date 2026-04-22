from __future__ import annotations

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


class RemotiveConnector:
    name = "remotive"

    def __init__(self) -> None:
        self.timeout = get_settings().http_timeout_seconds

    def fetch_jobs(self) -> list[JobIngest]:
        payload = self._fetch_json("https://remotive.com/api/remote-jobs")
        jobs: list[JobIngest] = []
        for item in payload.get("jobs", []):
            title = (item.get("title") or "").strip()
            description = item.get("description") or ""
            if not matches_target_role(title, item.get("category"), description):
                continue
            jobs.append(
                JobIngest(
                    source="remotive",
                    external_id=str(item.get("id")),
                    company=(item.get("company_name") or "Unknown").strip(),
                    title=title,
                    location=(item.get("candidate_required_location") or "Remote").strip(),
                    remote_policy=classify_remote(
                        item.get("candidate_required_location") or "",
                        title,
                        description,
                    ),
                    jd_text=clean_html_to_text(description),
                    jd_url=(item.get("url") or "").strip(),
                    posted_at=parse_datetime(item.get("publication_date")),
                )
            )
        return jobs

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _fetch_json(self, url: str) -> dict:
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "JobSearchAssistant/1.0"})
            response.raise_for_status()
            return response.json()

