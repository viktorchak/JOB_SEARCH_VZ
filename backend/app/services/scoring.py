from __future__ import annotations

import logging
from pathlib import Path

from pydantic import ValidationError

from app.core.config import ROOT_DIR, get_settings
from app.repositories import Repository
from app.schemas import EmailDraft, JobRecord, ScoreBatchResponse, ScorePayload
from app.services.connectors.common import is_recent
from app.services.gemini_client import GeminiGateway


LOGGER = logging.getLogger(__name__)


SCORING_PROMPT = """
You are scoring a job opportunity for Viktor on a 100-point rubric.

Rubric:
- Role fit: 25
- Domain leverage: 25
- Comp and level: 20
- Company stage: 20
- Logistics: 10

Hard exclusions:
- Contract or contract-to-hire
- Associate or APM without Senior
- Posted more than 30 days ago

Return a strict score that matches the rubric and avoid inflated scores.
"""

EMAIL_PROMPT = """
Draft a concise referral-request email for Viktor.
The tone should be credible, warm, and direct. Mention why the role is a fit in 2-3 concrete points.
Do not use placeholders. Do not invent facts beyond the provided background and job description.
"""


class ScoringService:
    def __init__(self, repository: Repository, gateway: GeminiGateway | None = None) -> None:
        self.repository = repository
        self.settings = get_settings()
        self.gateway = gateway
        self.bio_path = Path(ROOT_DIR) / "backend" / "bio.md"

    def score_unscored_jobs(self) -> ScoreBatchResponse:
        processed = 0
        skipped = 0
        failed = 0

        for job in self.repository.list_unscored_jobs(self.settings.rubric_version):
            try:
                score = self.score_job(job)
                self.repository.save_score(job.id, self.settings.rubric_version, score)
                processed += 1
            except ValueError as exc:
                failed += 1
                LOGGER.exception("job scoring failed", extra={"job_id": job.id, "error": str(exc)})

        return ScoreBatchResponse(processed=processed, skipped=skipped, failed=failed)

    def score_job(self, job: JobRecord) -> ScorePayload:
        exclusion = self._exclusion_reason(job)
        if exclusion:
            return self._build_exclusion_score(exclusion)

        gateway = self._get_gateway()
        attempts = [
            self._build_job_prompt(job),
            self._build_job_prompt(job)
            + "\n\nYour first attempt failed validation. Return ONLY valid tool input that matches the schema.",
        ]
        last_error: Exception | None = None
        for prompt in attempts:
            try:
                result = gateway.run_tool(
                    system_prompt=self._build_system_prompt(),
                    user_prompt=prompt,
                    tool_name="submit_score",
                    tool_description="Submit the scored rubric result for this job.",
                    input_schema=ScorePayload.model_json_schema(),
                )
                return ScorePayload.model_validate(result)
            except (ValidationError, ValueError) as exc:
                last_error = exc
                LOGGER.warning("score validation failed", extra={"job_id": job.id, "error": str(exc)})
                continue

        raise ValueError(f"Unable to parse score for {job.id}: {last_error}")

    def draft_email(self, job: JobRecord, score: ScorePayload | None = None) -> EmailDraft:
        gateway = self._get_gateway()
        result = gateway.run_tool(
            system_prompt=f"{EMAIL_PROMPT}\n\n{self._read_bio()}",
            user_prompt=self._build_email_prompt(job, score),
            tool_name="submit_email",
            tool_description="Submit a polished referral email draft.",
            input_schema=EmailDraft.model_json_schema(),
            max_tokens=700,
        )
        return EmailDraft.model_validate(result)

    def _build_system_prompt(self) -> str:
        return f"{SCORING_PROMPT}\n\nCandidate background:\n{self._read_bio()}"

    def _build_job_prompt(self, job: JobRecord) -> str:
        return f"""
Job title: {job.title}
Company: {job.company}
Location: {job.location}
Remote policy: {job.remote_policy}
Posted at: {job.posted_at.isoformat() if job.posted_at else "unknown"}
Job URL: {job.jd_url}

Full description:
{job.jd_text}
""".strip()

    def _build_email_prompt(self, job: JobRecord, score: ScorePayload | None) -> str:
        score_context = ""
        if score:
            score_context = (
                f"Existing score: {score.total}/100\n"
                f"Top reasons: {', '.join(score.top_reasons)}\n"
                f"Rationale: {score.rationale}\n"
            )
        return f"""
Role: {job.title}
Company: {job.company}
Location: {job.location}
Job URL: {job.jd_url}

{score_context}
Job description:
{job.jd_text}
""".strip()

    def _build_exclusion_score(self, reason: str) -> ScorePayload:
        return ScorePayload(
            total=0,
            dim_role_fit=0,
            dim_domain_leverage=0,
            dim_comp_level=0,
            dim_company_stage=0,
            dim_logistics=0,
            top_reasons=[reason, "Filtered before Gemini call", "Saved tokens on non-target role"],
            rationale=f"This role was excluded before model scoring because {reason.lower()}.",
        )

    def _exclusion_reason(self, job: JobRecord) -> str | None:
        title = job.title.lower()
        description = job.jd_text.lower()
        if "contract" in title or "contract-to-hire" in description:
            return "Contract role"
        if ("associate" in title or "apm" in title) and "senior" not in title:
            return "Junior title"
        if not is_recent(job.posted_at, days=30):
            return "Posting is older than 30 days"
        return None

    def _get_gateway(self) -> GeminiGateway:
        if self.gateway:
            return self.gateway
        self.gateway = GeminiGateway()
        return self.gateway

    def _read_bio(self) -> str:
        return self.bio_path.read_text(encoding="utf-8").strip()
