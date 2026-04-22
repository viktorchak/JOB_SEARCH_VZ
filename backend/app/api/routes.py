from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.core.config import get_settings
from app.repositories import Repository
from app.schemas import (
    ActionResponse,
    ApplyActionResponse,
    DismissRequest,
    EmailDraft,
    EmailSendRequest,
    GoogleAuthUrl,
    HealthResponse,
    IngestResponse,
    JobDetail,
    JobListResponse,
    ScoreBatchResponse,
)
from app.services.google import GoogleService
from app.services.ingestion import IngestionService
from app.services.job_actions import JobActionService
from app.services.scoring import ScoringService

router = APIRouter()
repository = Repository()
google_service = GoogleService()
ingestion_service = IngestionService(repository)
scoring_service = ScoringService(repository)
job_action_service = JobActionService(repository, google_service)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    snapshot = {item.connector: item for item in repository.health_snapshot()}
    connector_names = ["remotive", "remoteok", "jobicy"]
    if get_settings().jsearch_api_key:
        connector_names.append("jsearch")
    connectors = [snapshot.get(name) or {"connector": name} for name in connector_names]
    return HealthResponse(connectors=connectors, google=google_service.auth_status())


@router.get("/auth/google/start", response_model=GoogleAuthUrl)
def auth_google_start() -> GoogleAuthUrl:
    try:
        return GoogleAuthUrl(authorization_url=google_service.build_authorization_url())
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/auth/google/callback", response_class=HTMLResponse)
def auth_google_callback(code: str, state: str | None = None) -> HTMLResponse:
    try:
        google_service.exchange_code(code=code, state=state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return HTMLResponse(
        """
        <html>
          <body style="font-family: sans-serif; padding: 24px;">
            <h2>Google authentication complete.</h2>
            <p>You can close this tab and return to the dashboard.</p>
          </body>
        </html>
        """
    )


@router.post("/ingest", response_model=IngestResponse)
def ingest() -> IngestResponse:
    return ingestion_service.ingest_all()


@router.post("/score", response_model=ScoreBatchResponse)
def score() -> ScoreBatchResponse:
    try:
        return scoring_service.score_unscored_jobs()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/jobs", response_model=JobListResponse)
def list_jobs(
    q: str | None = Query(default=None),
    location: str | None = Query(default=None),
    min_score: float = Query(default=0, ge=0, le=100),
    max_score: float | None = Query(default=None, ge=0, le=100),
    company: str | None = Query(default=None),
    remote: bool = Query(default=False),
    remote_policy: list[str] = Query(default=[]),
    source: list[str] = Query(default=[]),
    date_posted_days: int | None = Query(default=None, ge=1, le=30),
    action_status: list[str] = Query(default=[]),
    sort: str = Query(default="top"),
    limit: int = Query(default=200, ge=1, le=500),
    live_search: bool = Query(default=False),
) -> JobListResponse:
    if live_search and q and q.strip() and get_settings().jsearch_api_key:
        _ingest_live_jsearch(q.strip())

    items = repository.list_jobs(
        q=q,
        location=location,
        min_score=min_score,
        max_score=max_score,
        company=company,
        remote_only=remote,
        remote_policies=remote_policy,
        sources=source,
        date_posted_days=date_posted_days,
        action_statuses=action_status,
        sort=sort,
        limit=limit,
    )
    companies = repository.list_companies()
    verification = repository.leena_verification_status()
    return JobListResponse(
        items=items,
        total=len(items),
        companies=companies,
        verification=verification,
    )


def _ingest_live_jsearch(query: str) -> None:
    from app.services.connectors.jsearch import JSearchConnector

    connector = JSearchConnector()
    try:
        jobs = connector.search_on_demand(query)
    except Exception:
        return
    for job in jobs:
        record, _ = repository.upsert_job(job)
        if not repository.get_score(record.id):
            try:
                score = scoring_service.score_job(record)
                repository.save_score(record.id, get_settings().rubric_version, score)
            except Exception:
                pass


@router.get("/jobs/{job_id}", response_model=JobDetail)
def job_detail(job_id: str) -> JobDetail:
    job = repository.get_job_detail(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/draft-email", response_model=EmailDraft)
def draft_email(job_id: str) -> EmailDraft:
    job = repository.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    score = repository.get_score(job_id)
    try:
        return scoring_service.draft_email(job, score=score)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/actions/apply", response_model=ApplyActionResponse)
def apply(job_id: str) -> ApplyActionResponse:
    try:
        return job_action_service.apply(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/actions/email", response_model=ApplyActionResponse)
def email_referral(job_id: str, request: EmailSendRequest) -> ApplyActionResponse:
    try:
        return job_action_service.email_referral(job_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/actions/save", response_model=ActionResponse)
def save(job_id: str) -> ActionResponse:
    try:
        return job_action_service.save(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/actions/dismiss", response_model=ActionResponse)
def dismiss(job_id: str, request: DismissRequest) -> ActionResponse:
    try:
        return job_action_service.dismiss(job_id, request.reason)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
