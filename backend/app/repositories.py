from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app.db import get_connection
from app.schemas import (
    ActionRecord,
    ActionType,
    ConnectorStatus,
    JobDetail,
    JobIngest,
    JobRecord,
    JobSummary,
    ScorePayload,
    ScoreRecord,
    VerificationStatus,
)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _serialize_datetime(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Repository:
    def upsert_job(self, job: JobIngest) -> tuple[JobRecord, bool]:
        now = _utc_now()
        with get_connection() as connection:
            existing = connection.execute(
                "SELECT id, ingested_at FROM jobs WHERE source = ? AND external_id = ?",
                (job.source, job.external_id),
            ).fetchone()

            if existing:
                connection.execute(
                    """
                    UPDATE jobs
                    SET company = ?, title = ?, location = ?, remote_policy = ?, jd_text = ?,
                        jd_url = ?, posted_at = ?, ingested_at = ?
                    WHERE id = ?
                    """,
                    (
                        job.company,
                        job.title,
                        job.location,
                        job.remote_policy,
                        job.jd_text,
                        job.jd_url,
                        _serialize_datetime(job.posted_at),
                        _serialize_datetime(now),
                        existing["id"],
                    ),
                )
                row = connection.execute("SELECT * FROM jobs WHERE id = ?", (existing["id"],)).fetchone()
                return self._row_to_job(row), False

            job_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO jobs (
                    id, source, external_id, company, title, location, remote_policy,
                    jd_text, jd_url, posted_at, ingested_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    job.source,
                    job.external_id,
                    job.company,
                    job.title,
                    job.location,
                    job.remote_policy,
                    job.jd_text,
                    job.jd_url,
                    _serialize_datetime(job.posted_at),
                    _serialize_datetime(now),
                ),
            )
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return self._row_to_job(row), True

    def get_job(self, job_id: str) -> JobRecord | None:
        with get_connection() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_unscored_jobs(self, rubric_version: str) -> list[JobRecord]:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT j.*
                FROM jobs j
                LEFT JOIN scores s
                  ON s.job_id = j.id AND s.rubric_version = ?
                WHERE s.id IS NULL
                ORDER BY j.ingested_at DESC
                """,
                (rubric_version,),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def save_score(self, job_id: str, rubric_version: str, payload: ScorePayload) -> ScoreRecord:
        now = _utc_now()
        score_id = str(uuid.uuid4())
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO scores (
                    id, job_id, rubric_version, total, dim_role_fit, dim_domain_leverage,
                    dim_comp_level, dim_company_stage, dim_logistics, top_reasons, rationale, scored_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    rubric_version = excluded.rubric_version,
                    total = excluded.total,
                    dim_role_fit = excluded.dim_role_fit,
                    dim_domain_leverage = excluded.dim_domain_leverage,
                    dim_comp_level = excluded.dim_comp_level,
                    dim_company_stage = excluded.dim_company_stage,
                    dim_logistics = excluded.dim_logistics,
                    top_reasons = excluded.top_reasons,
                    rationale = excluded.rationale,
                    scored_at = excluded.scored_at
                """,
                (
                    score_id,
                    job_id,
                    rubric_version,
                    payload.total,
                    payload.dim_role_fit,
                    payload.dim_domain_leverage,
                    payload.dim_comp_level,
                    payload.dim_company_stage,
                    payload.dim_logistics,
                    json.dumps(payload.top_reasons),
                    payload.rationale,
                    _serialize_datetime(now),
                ),
            )
            row = connection.execute("SELECT * FROM scores WHERE job_id = ?", (job_id,)).fetchone()
        return self._row_to_score(row)

    def get_score(self, job_id: str) -> ScoreRecord | None:
        with get_connection() as connection:
            row = connection.execute("SELECT * FROM scores WHERE job_id = ?", (job_id,)).fetchone()
        return self._row_to_score(row) if row else None

    def list_jobs(
        self,
        q: str | None = None,
        location: str | None = None,
        min_score: float = 0,
        max_score: float | None = None,
        company: str | None = None,
        remote_only: bool = False,
        remote_policies: list[str] | None = None,
        sources: list[str] | None = None,
        date_posted_days: int | None = None,
        action_statuses: list[str] | None = None,
        sort: str = "top",
        limit: int = 200,
    ) -> list[JobSummary]:
        q_terms = [term.strip().lower() for term in (q or "").split() if term.strip()]
        relevance_parts: list[str] = []
        relevance_params: list[Any] = []
        for term in q_terms:
            pattern = f"%{term}%"
            relevance_parts.append(
                "("
                "CASE WHEN lower(j.title) LIKE ? THEN 6 ELSE 0 END + "
                "CASE WHEN lower(j.company) LIKE ? THEN 3 ELSE 0 END + "
                "CASE WHEN lower(j.jd_text) LIKE ? THEN 1 ELSE 0 END"
                ")"
            )
            relevance_params.extend([pattern, pattern, pattern])
        relevance_expr = " + ".join(relevance_parts) if relevance_parts else "0"

        query = """
            SELECT
                j.id AS job_id,
                j.source,
                j.external_id,
                j.company,
                j.title,
                j.location,
                j.remote_policy,
                j.jd_text,
                j.jd_url,
                j.posted_at,
                j.ingested_at,
                s.id AS score_id,
                s.rubric_version,
                s.total,
                s.dim_role_fit,
                s.dim_domain_leverage,
                s.dim_comp_level,
                s.dim_company_stage,
                s.dim_logistics,
                s.top_reasons,
                s.rationale,
                s.scored_at,
                COALESCE(latest_action.type, 'unreviewed') AS latest_action_status,
                {relevance_expr} AS relevance_score
            FROM jobs j
            JOIN scores s ON s.job_id = j.id
            LEFT JOIN (
                SELECT a.job_id, a.type, a.created_at
                FROM actions a
                INNER JOIN (
                    SELECT job_id, MAX(created_at) AS latest_created_at
                    FROM actions
                    GROUP BY job_id
                ) latest
                  ON latest.job_id = a.job_id
                 AND latest.latest_created_at = a.created_at
            ) latest_action ON latest_action.job_id = j.id
            WHERE s.total >= ?
        """.format(relevance_expr=relevance_expr)
        params: list[Any] = [*relevance_params, min_score]

        if max_score is not None:
            query += " AND s.total <= ?"
            params.append(max_score)

        if company:
            query += " AND lower(j.company) = lower(?)"
            params.append(company)

        effective_remote_policies = [policy for policy in (remote_policies or []) if policy]
        if remote_only and "remote" not in effective_remote_policies:
            effective_remote_policies.append("remote")

        if effective_remote_policies:
            placeholders = ", ".join("?" for _ in effective_remote_policies)
            query += f" AND j.remote_policy IN ({placeholders})"
            params.extend(effective_remote_policies)

        if sources:
            filtered_sources = [source for source in sources if source]
            if filtered_sources:
                placeholders = ", ".join("?" for _ in filtered_sources)
                query += f" AND j.source IN ({placeholders})"
                params.extend(filtered_sources)

        if date_posted_days is not None:
            cutoff = _utc_now() - timedelta(days=date_posted_days)
            query += " AND j.posted_at IS NOT NULL AND j.posted_at >= ?"
            params.append(_serialize_datetime(cutoff))

        if location:
            for term in [part.strip().lower() for part in location.split() if part.strip()]:
                pattern = f"%{term}%"
                query += " AND lower(j.location) LIKE ?"
                params.append(pattern)

        if q_terms:
            for term in q_terms:
                pattern = f"%{term}%"
                query += (
                    " AND (lower(j.title) LIKE ? OR lower(j.company) LIKE ? OR lower(j.jd_text) LIKE ?)"
                )
                params.extend([pattern, pattern, pattern])

        if action_statuses:
            normalized_statuses = [status for status in action_statuses if status]
            if normalized_statuses:
                status_parts: list[str] = []
                for status in normalized_statuses:
                    if status == "unreviewed":
                        status_parts.append("latest_action.type IS NULL")
                    else:
                        status_parts.append("latest_action.type = ?")
                        params.append(status)
                query += f" AND ({' OR '.join(status_parts)})"

        if sort == "newest":
            query += " ORDER BY COALESCE(j.posted_at, '') DESC, s.total DESC, j.ingested_at DESC"
        elif sort == "company":
            query += " ORDER BY j.company COLLATE NOCASE ASC, s.total DESC, j.ingested_at DESC"
        elif sort == "recent":
            query += " ORDER BY j.ingested_at DESC, s.total DESC"
        elif sort == "relevance" and q_terms:
            query += " ORDER BY relevance_score DESC, s.total DESC, j.ingested_at DESC"
        else:
            if q_terms:
                query += " ORDER BY relevance_score DESC, s.total DESC, j.ingested_at DESC"
            else:
                query += " ORDER BY s.total DESC, j.ingested_at DESC"

        query += " LIMIT ?"
        params.append(limit)

        with get_connection() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self._row_to_summary(row) for row in rows]

    def list_companies(self) -> list[str]:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT j.company
                FROM jobs j
                JOIN scores s ON s.job_id = j.id
                ORDER BY j.company COLLATE NOCASE ASC
                """
            ).fetchall()
        return [row["company"] for row in rows]

    def leena_verification_status(self) -> VerificationStatus:
        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT
                    j.id AS job_id,
                    j.source,
                    j.company,
                    j.title
                FROM jobs j
                JOIN scores s ON s.job_id = j.id
                WHERE lower(j.company) LIKE '%leena%'
                  AND (
                    lower(j.title) LIKE '%entrepreneur in residence%'
                    OR lower(j.title) LIKE '%eir%'
                  )
                ORDER BY s.total DESC, s.scored_at DESC
                LIMIT 1
                """
            ).fetchone()
        if not row:
            return VerificationStatus(leena_eir_present=False)
        return VerificationStatus(
            leena_eir_present=True,
            matched_job_id=row["job_id"],
            matched_source=row["source"],
            matched_title=row["title"],
            matched_company=row["company"],
        )

    def get_job_detail(self, job_id: str) -> JobDetail | None:
        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT
                    j.id AS job_id,
                    j.source,
                    j.external_id,
                    j.company,
                    j.title,
                    j.location,
                    j.remote_policy,
                    j.jd_text,
                    j.jd_url,
                    j.posted_at,
                    j.ingested_at,
                    s.id AS score_id,
                    s.rubric_version,
                    s.total,
                    s.dim_role_fit,
                    s.dim_domain_leverage,
                    s.dim_comp_level,
                    s.dim_company_stage,
                    s.dim_logistics,
                    s.top_reasons,
                    s.rationale,
                    s.scored_at,
                    COALESCE(latest_action.type, 'unreviewed') AS latest_action_status
                FROM jobs j
                JOIN scores s ON s.job_id = j.id
                LEFT JOIN (
                    SELECT a.job_id, a.type, a.created_at
                    FROM actions a
                    INNER JOIN (
                        SELECT job_id, MAX(created_at) AS latest_created_at
                        FROM actions
                        GROUP BY job_id
                    ) latest
                      ON latest.job_id = a.job_id
                     AND latest.latest_created_at = a.created_at
                ) latest_action ON latest_action.job_id = j.id
                WHERE j.id = ?
                """,
                (job_id,),
            ).fetchone()

        if not row:
            return None

        summary = self._row_to_summary(row)
        return JobDetail(**summary.model_dump(), jd_text=row["jd_text"], actions=self.list_actions(job_id))

    def add_action(self, job_id: str, action_type: ActionType, metadata: dict[str, Any]) -> ActionRecord:
        action_id = str(uuid.uuid4())
        created_at = _utc_now()
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO actions (id, job_id, type, metadata, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    action_id,
                    job_id,
                    action_type,
                    json.dumps(metadata),
                    _serialize_datetime(created_at),
                ),
            )
            row = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        return self._row_to_action(row)

    def list_actions(self, job_id: str) -> list[ActionRecord]:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM actions
                WHERE job_id = ?
                ORDER BY created_at DESC
                """,
                (job_id,),
            ).fetchall()
        return [self._row_to_action(row) for row in rows]

    def set_connector_health(
        self,
        connector: str,
        last_success_at: datetime | None = None,
        last_error: str | None = None,
    ) -> None:
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO connector_health (connector, last_success_at, last_error)
                VALUES (?, ?, ?)
                ON CONFLICT(connector) DO UPDATE SET
                    last_success_at = COALESCE(excluded.last_success_at, connector_health.last_success_at),
                    last_error = excluded.last_error
                """,
                (connector, _serialize_datetime(last_success_at), last_error),
            )

    def health_snapshot(self) -> list[ConnectorStatus]:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT connector, last_success_at, last_error FROM connector_health ORDER BY connector ASC"
            ).fetchall()
        return [
            ConnectorStatus(
                connector=row["connector"],
                last_success_at=_parse_datetime(row["last_success_at"]),
                last_error=row["last_error"],
            )
            for row in rows
        ]

    def _row_to_job(self, row) -> JobRecord:
        return JobRecord(
            id=row["id"],
            source=row["source"],
            external_id=row["external_id"],
            company=row["company"],
            title=row["title"],
            location=row["location"],
            remote_policy=row["remote_policy"],
            jd_text=row["jd_text"],
            jd_url=row["jd_url"],
            posted_at=_parse_datetime(row["posted_at"]),
            ingested_at=_parse_datetime(row["ingested_at"]) or _utc_now(),
        )

    def _row_to_score(self, row) -> ScoreRecord:
        return ScoreRecord(
            id=row["id"],
            job_id=row["job_id"],
            rubric_version=row["rubric_version"],
            total=row["total"],
            dim_role_fit=row["dim_role_fit"],
            dim_domain_leverage=row["dim_domain_leverage"],
            dim_comp_level=row["dim_comp_level"],
            dim_company_stage=row["dim_company_stage"],
            dim_logistics=row["dim_logistics"],
            top_reasons=json.loads(row["top_reasons"]),
            rationale=row["rationale"],
            scored_at=_parse_datetime(row["scored_at"]) or _utc_now(),
        )

    def _row_to_action(self, row) -> ActionRecord:
        return ActionRecord(
            id=row["id"],
            job_id=row["job_id"],
            type=row["type"],
            metadata=json.loads(row["metadata"]),
            created_at=_parse_datetime(row["created_at"]) or _utc_now(),
        )

    def _row_to_summary(self, row) -> JobSummary:
        score = ScoreRecord(
            id=row["score_id"],
            job_id=row["job_id"],
            rubric_version=row["rubric_version"],
            total=row["total"],
            dim_role_fit=row["dim_role_fit"],
            dim_domain_leverage=row["dim_domain_leverage"],
            dim_comp_level=row["dim_comp_level"],
            dim_company_stage=row["dim_company_stage"],
            dim_logistics=row["dim_logistics"],
            top_reasons=json.loads(row["top_reasons"]),
            rationale=row["rationale"],
            scored_at=_parse_datetime(row["scored_at"]) or _utc_now(),
        )
        return JobSummary(
            id=row["job_id"],
            source=row["source"],
            company=row["company"],
            title=row["title"],
            location=row["location"],
            remote_policy=row["remote_policy"],
            jd_url=row["jd_url"],
            posted_at=_parse_datetime(row["posted_at"]),
            ingested_at=_parse_datetime(row["ingested_at"]) or _utc_now(),
            latest_action_status=row["latest_action_status"] or "unreviewed",
            score=score,
        )
