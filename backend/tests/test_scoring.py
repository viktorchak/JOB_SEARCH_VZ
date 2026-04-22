from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.repositories import Repository
from app.schemas import JobRecord
from app.services.scoring import ScoringService


class FakeGateway:
    def __init__(self, responses: list[dict]) -> None:
        self.responses = list(responses)
        self.calls = 0

    def run_tool(self, **_: dict) -> dict:
        self.calls += 1
        return self.responses.pop(0)


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def build_job(
    *,
    title: str = "Senior Product Manager",
    jd_text: str = "Lead product strategy for a fintech platform in New York.",
    posted_at: datetime | None = None,
) -> JobRecord:
    return JobRecord(
        id="job-1",
        source="greenhouse",
        external_id="ext-1",
        company="Example Co",
        title=title,
        location="New York, NY",
        remote_policy="hybrid",
        jd_text=jd_text,
        jd_url="https://example.com/jobs/1",
        posted_at=posted_at or utc_now(),
        ingested_at=utc_now(),
    )


def valid_score() -> dict:
    return {
        "total": 88,
        "dim_role_fit": 22,
        "dim_domain_leverage": 23,
        "dim_comp_level": 17,
        "dim_company_stage": 17,
        "dim_logistics": 9,
        "top_reasons": ["Strong PM scope", "Fintech leverage", "NYC logistics"],
        "rationale": "This role aligns closely with Viktor's target path and domain strengths.",
    }


def test_contract_roles_are_excluded_before_gemini() -> None:
    service = ScoringService(repository=Repository(), gateway=FakeGateway([valid_score()]))
    job = build_job(title="Senior Product Manager (Contract)")

    score = service.score_job(job)

    assert score.total == 0
    assert "Contract role" in score.top_reasons[0]


def test_stale_roles_are_excluded_before_gemini() -> None:
    service = ScoringService(repository=Repository(), gateway=FakeGateway([valid_score()]))
    old_job = build_job(posted_at=utc_now() - timedelta(days=45))

    score = service.score_job(old_job)

    assert score.total == 0
    assert "older than 30 days" in score.rationale


def test_valid_gemini_score_is_parsed() -> None:
    gateway = FakeGateway([valid_score()])
    service = ScoringService(repository=Repository(), gateway=gateway)

    score = service.score_job(build_job())

    assert gateway.calls == 1
    assert score.total == 88
    assert len(score.top_reasons) == 3
    assert score.dim_role_fit > 0
    assert score.dim_domain_leverage > 0


def test_invalid_first_payload_retries_once() -> None:
    gateway = FakeGateway(
        [
            {
                "total": 88,
                "dim_role_fit": 22,
                "dim_domain_leverage": 23,
                "dim_comp_level": 17,
                "dim_company_stage": 17,
                "dim_logistics": 9,
                "top_reasons": ["Only one"],
                "rationale": "Too short.",
            },
            valid_score(),
        ]
    )
    service = ScoringService(repository=Repository(), gateway=gateway)

    score = service.score_job(build_job())

    assert gateway.calls == 2
    assert score.total == 88


def test_email_draft_is_validated() -> None:
    gateway = FakeGateway(
        [{"subject": "Referral for Senior Product Manager at Example Co", "body": "I would love your help on this role because the product scope and market fit align well with my background."}]
    )
    service = ScoringService(repository=Repository(), gateway=gateway)

    draft = service.draft_email(build_job(), score=None)

    assert "Referral" in draft.subject
    assert "product scope" in draft.body
