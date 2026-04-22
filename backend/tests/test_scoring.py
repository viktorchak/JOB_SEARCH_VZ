from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.config import get_settings
from app.repositories import Repository
from app.schemas import JobRecord, UserProfileUpdate
from app.services.scoring import ScoringService


class FakeGateway:
    def __init__(self, responses: list[dict]) -> None:
        self.responses = list(responses)
        self.calls = 0

    def run_tool(self, **_: dict) -> dict:
        self.calls += 1
        return self.responses.pop(0)


@pytest.fixture(autouse=True)
def temp_database(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test_jobs.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def build_job(
    *,
    title: str = "Senior Product Manager",
    jd_text: str = "Lead product strategy, own roadmap decisions, and drive cross-functional execution. Requires 6 years of experience.",
    salary_min: float | None = 210_000,
    salary_max: float | None = 240_000,
) -> JobRecord:
    return JobRecord(
        id="job-1",
        source="jsearch",
        external_id="ext-1",
        company="Example Co",
        title=title,
        location="New York, NY",
        remote_policy="hybrid",
        jd_text=jd_text,
        jd_url="https://example.com/jobs/1",
        posted_at=utc_now(),
        salary_min=salary_min,
        salary_max=salary_max,
        salary_currency="USD",
        salary_period="year",
        ingested_at=utc_now(),
    )


def test_exact_job_family_gets_full_family_points() -> None:
    repository = Repository()
    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="product_management",
            seniority_level="mid_senior",
            years_experience_bucket="5-7",
            compensation_floor=200_000,
            company_stage_preference="no_preference",
            career_priority="ownership_scope",
        )
    )
    service = ScoringService(repository=repository)

    score = service.score_job(build_job(), profile=repository.get_active_profile())

    assert score.dim_job_family_fit == 40
    assert score.total >= 70


def test_family_mismatch_lowers_score() -> None:
    repository = Repository()
    job = build_job()
    service = ScoringService(repository=repository)

    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="product_management",
            seniority_level="mid_senior",
            years_experience_bucket="5-7",
            compensation_floor=200_000,
            company_stage_preference="no_preference",
            career_priority="ownership_scope",
        )
    )
    product_score = service.score_job(job, profile=repository.get_active_profile())

    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="engineering",
            seniority_level="mid_senior",
            years_experience_bucket="5-7",
            compensation_floor=200_000,
            company_stage_preference="no_preference",
            career_priority="ownership_scope",
        )
    )
    engineering_score = service.score_job(job, profile=repository.get_active_profile())

    assert product_score.total > engineering_score.total
    assert engineering_score.dim_job_family_fit < product_score.dim_job_family_fit


def test_learning_priority_changes_career_value_dimension() -> None:
    repository = Repository()
    service = ScoringService(repository=repository)
    learning_job = build_job(
        title="Associate Product Manager",
        jd_text="Entry-level rotational product role with strong mentorship, training, coaching, and career development support. Requires 2 years of experience.",
        salary_min=120_000,
        salary_max=135_000,
    )

    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="product_management",
            seniority_level="associate",
            years_experience_bucket="2-4",
            compensation_floor=None,
            company_stage_preference="no_preference",
            career_priority="learning",
        )
    )
    learning_score = service.score_job(learning_job, profile=repository.get_active_profile())

    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="product_management",
            seniority_level="associate",
            years_experience_bucket="2-4",
            compensation_floor=None,
            company_stage_preference="no_preference",
            career_priority="ownership_scope",
        )
    )
    ownership_score = service.score_job(learning_job, profile=repository.get_active_profile())

    assert learning_score.dim_career_value_fit > ownership_score.dim_career_value_fit


def test_unknown_compensation_gets_partial_points_when_floor_exists() -> None:
    repository = Repository()
    repository.save_active_profile(
        UserProfileUpdate(
            primary_job_family="product_management",
            seniority_level="mid_senior",
            years_experience_bucket="5-7",
            compensation_floor=180_000,
            company_stage_preference="no_preference",
            career_priority="balanced",
        )
    )
    service = ScoringService(repository=repository)
    score = service.score_job(
        build_job(salary_min=None, salary_max=None),
        profile=repository.get_active_profile(),
    )

    assert score.dim_compensation_fit == 4


def test_title_beats_description_for_job_family() -> None:
    repository = Repository()
    service = ScoringService(repository=repository)
    job = build_job(
        title="Senior Software Engineer",
        jd_text="Build backend systems. Product management experience preferred for collaboration across teams.",
    )

    attributes = service.extract_job_attributes(job)

    assert attributes.job_family == "engineering"


def test_title_beats_description_for_seniority() -> None:
    repository = Repository()
    service = ScoringService(repository=repository)
    job = build_job(
        title="Entry-Level Product Analyst",
        jd_text="You will report to the Senior Director of Product and collaborate with senior leaders across the company.",
    )

    attributes = service.extract_job_attributes(job)

    assert attributes.seniority_level == "entry_level"


@pytest.mark.parametrize(
    ("jd_text", "expected_years"),
    [
        ("Candidates should bring 3+ years of relevant experience in analytics.", (3, 5)),
        ("Experience: 5 years minimum in growth strategy.", (5, 7)),
        ("This role requires a minimum 3 years working in product operations.", (3, 5)),
    ],
)
def test_extract_years_required_handles_common_variants(jd_text: str, expected_years: tuple[int, int]) -> None:
    repository = Repository()
    service = ScoringService(repository=repository)

    attributes = service.extract_job_attributes(build_job(jd_text=jd_text))

    assert (attributes.years_required_min, attributes.years_required_max) == expected_years


def test_hourly_compensation_is_not_scaled_like_annual_salary() -> None:
    repository = Repository()
    service = ScoringService(repository=repository)
    job = build_job(
        title="Contract Product Manager",
        jd_text="Compensation is $150 to $200 per hour depending on experience.",
        salary_min=None,
        salary_max=None,
    )

    attributes = service.extract_job_attributes(job)

    assert attributes.compensation_min == 150
    assert attributes.compensation_max == 200
    assert attributes.compensation_period == "hour"
    assert service._normalized_compensation(attributes) == 200 * 2080


def test_email_draft_is_validated() -> None:
    repository = Repository()
    gateway = FakeGateway(
        [
            {
                "subject": "Referral for Senior Product Manager at Example Co",
                "body": "I would value your help on this role because the ownership scope and product alignment match my background well.",
            }
        ]
    )
    service = ScoringService(repository=repository, gateway=gateway)

    draft = service.draft_email(build_job(), score=None)

    assert gateway.calls == 1
    assert "Referral" in draft.subject
    assert "ownership scope" in draft.body
