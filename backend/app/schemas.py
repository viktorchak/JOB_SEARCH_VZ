from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ConnectorName = Literal["remotive", "remoteok", "jobicy", "jsearch", "greenhouse", "lever", "leena"]
RemotePolicy = Literal["remote", "hybrid", "onsite", "unknown"]
ActionType = Literal["applied", "emailed", "dismissed", "saved"]
ActionStatus = Literal["applied", "emailed", "dismissed", "saved", "unreviewed"]


class JobIngest(BaseModel):
    source: ConnectorName
    external_id: str
    company: str
    title: str
    location: str = "Unknown"
    remote_policy: RemotePolicy = "unknown"
    jd_text: str
    jd_url: str
    posted_at: datetime | None = None

    @field_validator("external_id", "company", "title", "location", "jd_text", "jd_url")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field must not be empty")
        return cleaned


class JobRecord(JobIngest):
    id: str
    ingested_at: datetime


class ScorePayload(BaseModel):
    total: float = Field(ge=0, le=100)
    dim_role_fit: float = Field(ge=0, le=25)
    dim_domain_leverage: float = Field(ge=0, le=25)
    dim_comp_level: float = Field(ge=0, le=20)
    dim_company_stage: float = Field(ge=0, le=20)
    dim_logistics: float = Field(ge=0, le=10)
    top_reasons: list[str] = Field(min_length=3, max_length=3)
    rationale: str = Field(min_length=10)

    @field_validator("top_reasons")
    @classmethod
    def normalize_reasons(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value if item and item.strip()]
        if len(normalized) != 3:
            raise ValueError("top_reasons must contain exactly three populated strings")
        return normalized

    @field_validator("rationale")
    @classmethod
    def normalize_rationale(cls, value: str) -> str:
        return value.strip()


class ScoreRecord(ScorePayload):
    id: str
    job_id: str
    rubric_version: str
    scored_at: datetime


class ActionRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    job_id: str
    type: ActionType
    metadata: dict[str, Any]
    created_at: datetime


class JobSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    source: ConnectorName
    company: str
    title: str
    location: str
    remote_policy: RemotePolicy
    jd_url: str
    posted_at: datetime | None = None
    ingested_at: datetime
    latest_action_status: ActionStatus = "unreviewed"
    score: ScoreRecord


class JobDetail(JobSummary):
    jd_text: str
    actions: list[ActionRecord]


class VerificationStatus(BaseModel):
    leena_eir_present: bool
    matched_job_id: str | None = None
    matched_source: str | None = None
    matched_title: str | None = None
    matched_company: str | None = None


class JobListResponse(BaseModel):
    items: list[JobSummary]
    total: int
    companies: list[str]
    verification: VerificationStatus


class ConnectorStatus(BaseModel):
    connector: ConnectorName
    last_success_at: datetime | None = None
    last_error: str | None = None


class GoogleAuthStatus(BaseModel):
    configured: bool
    authenticated: bool
    token_path: str | None = None


class HealthResponse(BaseModel):
    connectors: list[ConnectorStatus]
    google: GoogleAuthStatus


class IngestConnectorStat(BaseModel):
    connector: ConnectorName
    pulled: int
    inserted: int
    updated: int


class IngestResponse(BaseModel):
    total_pulled: int
    total_inserted: int
    total_updated: int
    connectors: list[IngestConnectorStat]


class ScoreBatchResponse(BaseModel):
    processed: int
    skipped: int
    failed: int


class EmailDraft(BaseModel):
    subject: str = Field(min_length=3)
    body: str = Field(min_length=20)


class EmailSendRequest(EmailDraft):
    to_email: str = Field(min_length=5)


class DismissRequest(BaseModel):
    reason: str = Field(min_length=3)


class ActionResponse(BaseModel):
    action: ActionRecord


class ApplyActionResponse(BaseModel):
    action: ActionRecord
    calendar_event_id: str | None = None
    calendar_event_url: str | None = None


class GoogleAuthUrl(BaseModel):
    authorization_url: str
