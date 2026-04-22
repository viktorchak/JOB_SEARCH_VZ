from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import Repository
from app.schemas import IngestConnectorStat, IngestResponse
from app.core.config import get_settings
from app.services.connectors.jobicy import JobicyConnector
from app.services.connectors.jsearch import JSearchConnector
from app.services.connectors.remotive import RemotiveConnector
from app.services.connectors.remoteok import RemoteOkConnector


class IngestionService:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository
        self.connectors = [RemotiveConnector(), RemoteOkConnector(), JobicyConnector()]
        if get_settings().jsearch_api_key:
            self.connectors.append(JSearchConnector())

    def ingest_all(self) -> IngestResponse:
        connector_stats: list[IngestConnectorStat] = []
        total_pulled = 0
        total_inserted = 0
        total_updated = 0

        for connector in self.connectors:
            pulled = 0
            inserted = 0
            updated = 0
            try:
                jobs = connector.fetch_jobs()
                pulled = len(jobs)
                for job in jobs:
                    _, created = self.repository.upsert_job(job)
                    if created:
                        inserted += 1
                    else:
                        updated += 1
                self.repository.set_connector_health(
                    connector.name,
                    last_success_at=datetime.now(UTC).replace(tzinfo=None),
                    last_error=None,
                )
            except Exception as exc:
                self.repository.set_connector_health(connector.name, last_success_at=None, last_error=str(exc))
                jobs = []

            total_pulled += pulled
            total_inserted += inserted
            total_updated += updated
            connector_stats.append(
                IngestConnectorStat(
                    connector=connector.name,
                    pulled=pulled,
                    inserted=inserted,
                    updated=updated,
                )
            )

        return IngestResponse(
            total_pulled=total_pulled,
            total_inserted=total_inserted,
            total_updated=total_updated,
            connectors=connector_stats,
        )
