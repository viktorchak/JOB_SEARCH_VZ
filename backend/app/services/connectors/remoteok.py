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


class RemoteOkConnector:
    name = "remoteok"

    def __init__(self) -> None:
        self.timeout = get_settings().http_timeout_seconds

    def fetch_jobs(self) -> list[JobIngest]:
        payload = self._fetch_json("https://remoteok.com/api")
        jobs: list[JobIngest] = []
        for item in payload:
            if not isinstance(item, dict) or "id" not in item:
                continue
            title = (item.get("position") or "").strip()
            description = item.get("description") or ""
            if not matches_target_role(title, " ".join(item.get("tags") or []), description):
                continue
            jobs.append(
                JobIngest(
                    source="remoteok",
                    external_id=str(item.get("id")),
                    company=(item.get("company") or "Unknown").strip(),
                    title=title,
                    location=(item.get("location") or "Remote").strip() or "Remote",
                    remote_policy=classify_remote(item.get("location") or "", title, description),
                    jd_text=clean_html_to_text(description),
                    jd_url=(item.get("url") or item.get("apply_url") or "").strip(),
                    posted_at=parse_datetime(item.get("date") or item.get("epoch")),
                )
            )
        return jobs

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def _fetch_json(self, url: str) -> list[dict]:
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "JobSearchAssistant/1.0"})
            response.raise_for_status()
            return response.json()

