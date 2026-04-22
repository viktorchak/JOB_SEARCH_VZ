from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import ROOT_DIR, get_settings
from app.repositories import Repository
from app.schemas import CompanyStage, JobAttributeRecord, JobFamily, JobRecord, ScoreBatchResponse, ScorePayload, UserProfile
from app.services.gemini_client import GeminiGateway


EMAIL_PROMPT = """
Draft a concise referral-request email for Viktor.
The tone should be credible, warm, and direct. Mention why the role is a fit in 2-3 concrete points.
Do not use placeholders. Do not invent facts beyond the provided background and job description.
"""

FAMILY_PATTERNS: list[tuple[JobFamily, tuple[str, ...]]] = [
    (
        "product_management",
        ("product manager", "product management", "group product", "principal product", "product lead", "product owner"),
    ),
    (
        "strategy_operations",
        (
            "strategy & operations",
            "strategy and operations",
            "chief of staff",
            "entrepreneur in residence",
            "eir",
            "corporate strategy",
            "strategic operations",
        ),
    ),
    (
        "engineering",
        (
            "software engineer",
            "engineering manager",
            "engineer",
            "developer",
            "full stack",
            "frontend engineer",
            "frontend developer",
            "backend engineer",
            "backend developer",
            "platform engineer",
            "data engineer",
            "machine learning engineer",
        ),
    ),
    ("program_management", ("program manager", "technical program manager", "tpm", "program management", "project manager")),
    ("business_operations", ("business operations", "bizops", "operations manager", "business manager", "operations lead")),
    ("partnerships_bd", ("partnerships", "business development", "partner manager", "alliances", "channel")),
    ("data_analytics", ("data analyst", "analytics", "business analyst", "data scientist", "business intelligence", "bi analyst")),
    ("design", ("designer", "product design", "ux", "ui", "researcher", "design lead")),
    (
        "sales_gtm",
        (
            "sales engineer",
            "solutions engineer",
            "solution engineer",
            "sales",
            "account executive",
            "revenue",
            "growth",
            "marketing",
            "customer acquisition",
            "gtm",
        ),
    ),
    ("non_technical_other", ("finance", "accounting", "legal", "people ops", "human resources", "recruiting", "talent acquisition", "customer success", "support")),
]

FAMILY_ADJACENCY: dict[JobFamily, set[JobFamily]] = {
    "product_management": {"program_management", "strategy_operations", "data_analytics"},
    "strategy_operations": {"business_operations", "program_management", "partnerships_bd", "product_management"},
    "engineering": {"data_analytics", "program_management", "product_management"},
    "program_management": {"product_management", "strategy_operations", "business_operations", "engineering"},
    "business_operations": {"strategy_operations", "program_management", "partnerships_bd"},
    "partnerships_bd": {"sales_gtm", "strategy_operations", "business_operations"},
    "data_analytics": {"product_management", "engineering", "business_operations"},
    "design": {"product_management"},
    "sales_gtm": {"partnerships_bd", "business_operations"},
    "non_technical_other": set(),
    "unknown": set(),
}

SENIORITY_KEYWORDS = [
    ("executive", ("chief", "cfo", "cto", "coo", "ceo", "vice president", "vp", "general manager")),
    ("director", ("director", "head of", "sr director", "senior director")),
    ("mid_senior", ("senior", "staff", "lead", "principal", "manager", "owner")),
    ("associate", ("associate",)),
    ("entry_level", ("entry level", "entry-level", "junior", "new grad", "graduate", "apprentice")),
    ("internship", ("intern", "internship", "co-op")),
]

COMPANY_STAGE_KEYWORDS: dict[CompanyStage, tuple[str, ...]] = {
    "startup": ("seed", "series a", "series-a", "early stage", "early-stage", "startup"),
    "growth": ("series b", "series c", "series d", "growth stage", "growth-stage", "scale-up", "scaleup", "hypergrowth"),
    "late_stage": ("late stage", "late-stage", "pre-ipo", "private equity backed", "private-equity-backed", "unicorn"),
    "public": ("publicly traded", "nasdaq", "nyse", "fortune 500", "listed on", "s&p 500"),
}

PUBLIC_COMPANY_HINTS = {
    "amazon",
    "netflix",
    "capital one",
    "mastercard",
    "coca cola",
    "walmart",
    "google",
    "meta",
    "microsoft",
    "apple",
    "uber",
    "spotify",
    "salesforce",
    "adobe",
    "linkedin",
}

LEARNING_TERMS = (
    "mentorship",
    "mentor",
    "training",
    "rotation",
    "rotational",
    "career development",
    "learn",
    "growth mindset",
    "early career",
    "entry-level",
    "coaching",
)
OWNERSHIP_TERMS = (
    "own",
    "ownership",
    "end-to-end",
    "0-to-1",
    "zero-to-one",
    "roadmap",
    "strategy",
    "c-suite",
    "executive",
    "autonomy",
    "decision",
    "mandate",
    "cross-functional leadership",
    "build",
)

YEARS_BUCKETS = {
    "0-1": (0, 1),
    "2-4": (2, 4),
    "5-7": (5, 7),
    "8-10": (8, 10),
    "10+": (10, 15),
}

SENIORITY_ORDER = {
    "internship": 0,
    "entry_level": 1,
    "associate": 2,
    "mid_senior": 3,
    "director": 4,
    "executive": 5,
    "unknown": 2,
}


class ScoringService:
    def __init__(self, repository: Repository, gateway: GeminiGateway | None = None) -> None:
        self.repository = repository
        self.settings = get_settings()
        self.gateway = gateway
        self.bio_path = Path(ROOT_DIR) / "backend" / "bio.md"

    def score_unscored_jobs(self) -> ScoreBatchResponse:
        profile = self.repository.get_active_profile()
        jobs_by_id = {
            job.id: job for job in self.repository.list_unscored_jobs(self.settings.rubric_version)
        }
        for job in self.repository.list_jobs_missing_attributes():
            jobs_by_id.setdefault(job.id, job)
        jobs = list(jobs_by_id.values())
        processed = 0
        failed = 0
        for job in jobs:
            try:
                self.ensure_job_scored(job, profile=profile)
                processed += 1
            except ValueError:
                failed += 1
        return ScoreBatchResponse(processed=processed, skipped=0, failed=failed)

    def rescore_active_profile(self) -> ScoreBatchResponse:
        profile = self.repository.get_active_profile()
        jobs = self.repository.list_all_jobs()
        processed = 0
        failed = 0
        for job in jobs:
            try:
                self.ensure_job_scored(job, profile=profile)
                processed += 1
            except ValueError:
                failed += 1
        return ScoreBatchResponse(processed=processed, skipped=0, failed=failed)

    def ensure_job_scored(self, job: JobRecord, *, profile: UserProfile | None = None) -> ScorePayload:
        active_profile = profile or self.repository.get_active_profile()
        attributes = self.repository.get_job_attributes(job.id)
        if not attributes:
            attributes = self.extract_job_attributes(job)
            self.repository.save_job_attributes(attributes)
        score = self.score_job(job, profile=active_profile, attributes=attributes)
        existing = self.repository.get_score(job.id)
        if not existing or self._score_changed(existing, score):
            self.repository.save_score(job.id, self.settings.rubric_version, score)
        return score

    def extract_job_attributes(self, job: JobRecord) -> JobAttributeRecord:
        title = self._normalize_text(job.title)
        description = self._normalize_text(job.jd_text)
        combined = f"{title}\n{description}".strip()
        salary_min, salary_max, salary_currency, salary_period = self._extract_compensation(job)
        years_required_min, years_required_max = self._extract_years_required(combined)
        return JobAttributeRecord(
            job_id=job.id,
            job_family=self._extract_job_family(title, description),
            seniority_level=self._extract_seniority(title, description),
            years_required_min=years_required_min,
            years_required_max=years_required_max,
            compensation_known=salary_min is not None or salary_max is not None,
            compensation_min=salary_min,
            compensation_max=salary_max,
            compensation_currency=salary_currency,
            compensation_period=salary_period,
            company_stage=self._extract_company_stage(job.company, combined),
            learning_signal=self._signal_score(combined, LEARNING_TERMS),
            ownership_signal=self._signal_score(combined, OWNERSHIP_TERMS),
            extracted_at=self._utc_now(),
        )

    def score_job(
        self,
        job: JobRecord,
        *,
        profile: UserProfile | None = None,
        attributes: JobAttributeRecord | None = None,
    ) -> ScorePayload:
        active_profile = profile or self.repository.get_active_profile()
        job_attributes = attributes or self.repository.get_job_attributes(job.id) or self.extract_job_attributes(job)

        dim_job_family_fit = self._score_job_family(active_profile, job_attributes)
        dim_level_fit = self._score_level_fit(active_profile, job_attributes)
        dim_career_value_fit = self._score_career_value(active_profile, job_attributes)
        dim_compensation_fit = self._score_compensation_fit(active_profile, job_attributes)
        dim_company_stage_fit = self._score_company_stage_fit(active_profile, job_attributes)
        total = round(
            dim_job_family_fit
            + dim_level_fit
            + dim_career_value_fit
            + dim_compensation_fit
            + dim_company_stage_fit,
            1,
        )
        reasons = self._build_top_reasons(active_profile, job_attributes, total)
        rationale = self._build_rationale(active_profile, job_attributes, total, reasons)
        return ScorePayload(
            total=total,
            dim_job_family_fit=round(dim_job_family_fit, 1),
            dim_level_fit=round(dim_level_fit, 1),
            dim_career_value_fit=round(dim_career_value_fit, 1),
            dim_compensation_fit=round(dim_compensation_fit, 1),
            dim_company_stage_fit=round(dim_company_stage_fit, 1),
            top_reasons=reasons,
            rationale=rationale,
        )

    def draft_email(self, job: JobRecord, score: ScorePayload | None = None):
        from app.schemas import EmailDraft

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

    def _score_job_family(self, profile: UserProfile, attributes: JobAttributeRecord) -> float:
        if attributes.job_family == profile.primary_job_family:
            return 40
        if attributes.job_family == "unknown":
            return 8
        if attributes.job_family in FAMILY_ADJACENCY.get(profile.primary_job_family, set()):
            return 24
        return 0

    def _score_level_fit(self, profile: UserProfile, attributes: JobAttributeRecord) -> float:
        seniority_delta = abs(
            SENIORITY_ORDER.get(profile.seniority_level, 2) - SENIORITY_ORDER.get(attributes.seniority_level, 2)
        )
        if attributes.seniority_level == "unknown":
            seniority_points = 8
        elif seniority_delta == 0:
            seniority_points = 15
        elif seniority_delta == 1:
            seniority_points = 10
        elif seniority_delta == 2:
            seniority_points = 5
        else:
            seniority_points = 0

        profile_min, profile_max = YEARS_BUCKETS[profile.years_experience_bucket]
        if attributes.years_required_min is None and attributes.years_required_max is None:
            years_points = 6
        else:
            job_min = attributes.years_required_min if attributes.years_required_min is not None else attributes.years_required_max or 0
            job_max = attributes.years_required_max if attributes.years_required_max is not None else max(job_min + 2, job_min)
            if profile_max < job_min:
                years_points = 0
            elif profile_min > job_max + 2:
                years_points = 4
            elif profile_min <= job_max and profile_max >= job_min:
                years_points = 10
            else:
                years_points = 6
        return seniority_points + years_points

    def _score_career_value(self, profile: UserProfile, attributes: JobAttributeRecord) -> float:
        if profile.career_priority == "learning":
            signal = attributes.learning_signal
        elif profile.career_priority == "ownership_scope":
            signal = attributes.ownership_signal
        else:
            signal = (attributes.learning_signal + attributes.ownership_signal) / 2
        return min(15, (signal / 10) * 15)

    def _score_compensation_fit(self, profile: UserProfile, attributes: JobAttributeRecord) -> float:
        if profile.compensation_floor is None:
            return 10
        normalized = self._normalized_compensation(attributes)
        if normalized is None:
            return 4
        if normalized >= profile.compensation_floor:
            return 10
        if normalized >= profile.compensation_floor * 0.9:
            return 7
        if normalized >= profile.compensation_floor * 0.75:
            return 4
        return 0

    def _score_company_stage_fit(self, profile: UserProfile, attributes: JobAttributeRecord) -> float:
        if profile.company_stage_preference == "no_preference":
            return 10
        if attributes.company_stage == profile.company_stage_preference:
            return 10
        if attributes.company_stage == "unknown":
            return 4
        order = {"startup": 0, "growth": 1, "late_stage": 2, "public": 3, "unknown": 1}
        if abs(order[attributes.company_stage] - order[profile.company_stage_preference]) == 1:
            return 7
        return 2

    def _build_top_reasons(
        self,
        profile: UserProfile,
        attributes: JobAttributeRecord,
        total: float,
    ) -> list[str]:
        reasons: list[str] = []
        if attributes.job_family == profile.primary_job_family:
            reasons.append(f"Primary job family aligns with {self._label_job_family(profile.primary_job_family)}.")
        if self._score_level_fit(profile, attributes) >= 18:
            reasons.append(
                f"Level fit is strong for a {self._label_seniority(profile.seniority_level)} profile with {profile.years_experience_bucket} years."
            )
        if profile.career_priority == "learning" and attributes.learning_signal >= 6:
            reasons.append("The role shows strong learning and mentorship signals.")
        if profile.career_priority == "ownership_scope" and attributes.ownership_signal >= 6:
            reasons.append("The role offers clear ownership and scope signals.")
        if profile.career_priority == "balanced" and (attributes.learning_signal + attributes.ownership_signal) >= 12:
            reasons.append("The role balances learning upside with meaningful ownership.")
        if profile.compensation_floor and self._score_compensation_fit(profile, attributes) >= 7:
            reasons.append("Known compensation is close to or above your target floor.")
        if profile.company_stage_preference != "no_preference" and attributes.company_stage == profile.company_stage_preference:
            reasons.append(f"Company stage matches your preference for {self._label_company_stage(profile.company_stage_preference)} roles.")
        if not reasons:
            reasons.append(f"This role is a moderate fit for your {self._label_job_family(profile.primary_job_family)} profile.")
        while len(reasons) < 3:
            if total >= 75:
                reasons.append("Overall fit is strong enough to prioritize in the current search.")
            elif total >= 55:
                reasons.append("The role has a mixed fit and needs closer review before acting.")
            else:
                reasons.append("The role is currently a weaker fit against your active profile.")
        return reasons[:3]

    def _build_rationale(
        self,
        profile: UserProfile,
        attributes: JobAttributeRecord,
        total: float,
        reasons: list[str],
    ) -> str:
        stage_label = self._label_company_stage(attributes.company_stage)
        family_label = self._label_job_family(attributes.job_family)
        return (
            f"This role scores {int(round(total))}/100 against your active profile because it reads as a "
            f"{family_label} opportunity at the {self._label_seniority(attributes.seniority_level)} level. "
            f"Company stage is classified as {stage_label}, and the strongest fit signals are: {reasons[0]} {reasons[1]}"
        )

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

    def _extract_job_family(self, title: str, description: str) -> JobFamily:
        return self._best_family_match(title) or self._best_family_match(description) or "unknown"

    def _extract_seniority(self, title: str, description: str):
        return self._best_seniority_match(title) or self._best_seniority_match(description) or "unknown"

    def _extract_years_required(self, combined: str) -> tuple[int | None, int | None]:
        range_patterns = [
            r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to|–|—)\s*(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"between\s+(\d{1,2})\s+and\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})\s+yrs?\b",
        ]
        for pattern in range_patterns:
            match = re.search(pattern, combined)
            if match:
                low = int(match.group(1))
                high = int(match.group(2))
                if 0 <= low <= high <= 50:
                    return low, high

        single_patterns = [
            r"minimum of\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"at least\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"(\d{1,2})\+\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b",
            r"experience:\s*(\d{1,2})\s+years?\s+minimum\b",
            r"requires?\s+(?:a\s+)?minimum\s+(?:of\s+)?(\d{1,2})\s+years?\b",
        ]
        for pattern in single_patterns:
            match = re.search(pattern, combined)
            if match:
                years = int(match.group(1))
                if 0 <= years <= 50:
                    return years, years + 2
        return None, None

    def _extract_company_stage(self, company: str, combined: str) -> CompanyStage:
        company_lower = company.lower()
        if any(hint in company_lower for hint in PUBLIC_COMPANY_HINTS):
            return "public"
        for stage, keywords in COMPANY_STAGE_KEYWORDS.items():
            if any(keyword in combined for keyword in keywords):
                return stage
        return "unknown"

    def _extract_compensation(
        self, job: JobRecord
    ) -> tuple[float | None, float | None, str | None, str | None]:
        if job.salary_min is not None or job.salary_max is not None:
            return job.salary_min, job.salary_max, job.salary_currency or "USD", job.salary_period or "year"

        text = job.jd_text
        match = re.search(
            r"\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?)\s*(k|m)?\s*(?:-|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?)\s*(k|m)?\s*(per\s+year|a\s+year|annually|year|per\s+hour|an\s+hour|hourly|hour|per\s+hr|hr)?",
            text,
            re.IGNORECASE,
        )
        if not match:
            return None, None, None, None
        period_token = (match.group(5) or "year").lower()
        period = "hour" if "hour" in period_token or "hr" in period_token else "year"
        low = self._normalize_money_value(match.group(1), match.group(2), period=period)
        high = self._normalize_money_value(match.group(3), match.group(4), period=period)
        return low, high, "USD", period

    def _normalized_compensation(self, attributes: JobAttributeRecord) -> float | None:
        if not attributes.compensation_known:
            return None
        value = attributes.compensation_max or attributes.compensation_min
        if value is None:
            return None
        if attributes.compensation_period == "hour":
            return value * 2080
        return value

    def _signal_score(self, combined: str, terms: tuple[str, ...]) -> float:
        hits = sum(1 for term in terms if term in combined)
        return float(min(10, hits * 2.5))

    def _label_job_family(self, family: JobFamily) -> str:
        labels = {
            "product_management": "Product Management",
            "strategy_operations": "Strategy & Operations",
            "engineering": "Engineering",
            "program_management": "Program Management",
            "business_operations": "Business Operations",
            "partnerships_bd": "Partnerships / BD",
            "data_analytics": "Data / Analytics",
            "design": "Design",
            "sales_gtm": "Sales / GTM",
            "non_technical_other": "Non-technical / Other",
            "unknown": "Unknown",
        }
        return labels[family]

    def _label_seniority(self, seniority: str) -> str:
        labels = {
            "internship": "Internship",
            "entry_level": "Entry level",
            "associate": "Associate",
            "mid_senior": "Mid-Senior",
            "director": "Director",
            "executive": "Executive",
            "unknown": "Unknown",
        }
        return labels[seniority]

    def _label_company_stage(self, stage: str) -> str:
        labels = {
            "startup": "startup",
            "growth": "growth-stage",
            "late_stage": "late-stage",
            "public": "public-company",
            "unknown": "unknown",
            "no_preference": "any",
        }
        return labels[stage]

    def _normalize_money_value(self, raw: str, multiplier: str | None, *, period: str = "year") -> float:
        value = float(raw.replace(",", ""))
        if multiplier:
            if multiplier.lower() == "k":
                return value * 1_000
            if multiplier.lower() == "m":
                return value * 1_000_000
        if value < 1_000 and period != "hour":
            return value * 1_000
        return value

    def _best_family_match(self, text: str) -> JobFamily | None:
        best_match: tuple[tuple[int, int], JobFamily] | None = None
        for index, (family, patterns) in enumerate(FAMILY_PATTERNS):
            for pattern in patterns:
                if self._pattern_matches(text, pattern):
                    rank = (len(pattern), -index)
                    if not best_match or rank > best_match[0]:
                        best_match = (rank, family)
        return best_match[1] if best_match else None

    def _best_seniority_match(self, text: str):
        best_match: tuple[tuple[int, int], str] | None = None
        for index, (seniority, patterns) in enumerate(SENIORITY_KEYWORDS):
            for pattern in patterns:
                if self._pattern_matches(text, pattern):
                    rank = (len(pattern), -index)
                    if not best_match or rank > best_match[0]:
                        best_match = (rank, seniority)
        return best_match[1] if best_match else None

    def _pattern_matches(self, text: str, pattern: str) -> bool:
        escaped = re.escape(pattern).replace(r"\ ", r"\s+")
        return re.search(rf"(?<!\w){escaped}(?!\w)", text) is not None

    def _normalize_text(self, value: str) -> str:
        return re.sub(r"\s+", " ", value.lower()).strip()

    def _score_changed(self, existing: ScorePayload, current: ScorePayload) -> bool:
        existing_payload = ScorePayload.model_validate(existing.model_dump()).model_dump()
        return existing_payload != current.model_dump()

    def _get_gateway(self) -> GeminiGateway:
        if self.gateway:
            return self.gateway
        self.gateway = GeminiGateway()
        return self.gateway

    def _read_bio(self) -> str:
        return self.bio_path.read_text(encoding="utf-8").strip()

    def _utc_now(self) -> datetime:
        return datetime.now(UTC).replace(tzinfo=None)
