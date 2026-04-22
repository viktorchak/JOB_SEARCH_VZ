from __future__ import annotations

from app.repositories import Repository
from app.schemas import ActionResponse, ApplyActionResponse, EmailSendRequest
from app.services.google import GoogleService


class JobActionService:
    def __init__(self, repository: Repository, google: GoogleService) -> None:
        self.repository = repository
        self.google = google

    def apply(self, job_id: str) -> ApplyActionResponse:
        job = self._require_job(job_id)
        event = self.google.create_follow_up_event(job, "applied")
        action = self.repository.add_action(
            job_id,
            "applied",
            {
                "calendar_event_id": event.get("id"),
                "calendar_event_url": event.get("htmlLink"),
                "job_url": job.jd_url,
            },
        )
        return ApplyActionResponse(
            action=action,
            calendar_event_id=event.get("id"),
            calendar_event_url=event.get("htmlLink"),
        )

    def email_referral(self, job_id: str, request: EmailSendRequest) -> ApplyActionResponse:
        job = self._require_job(job_id)
        gmail_result = self.google.send_email(
            to_email=request.to_email,
            subject=request.subject,
            body=request.body,
        )
        event = self.google.create_follow_up_event(job, "emailed referral")
        action = self.repository.add_action(
            job_id,
            "emailed",
            {
                "to_email": request.to_email,
                "subject": request.subject,
                "gmail_message_id": gmail_result.get("id"),
                "calendar_event_id": event.get("id"),
                "calendar_event_url": event.get("htmlLink"),
            },
        )
        return ApplyActionResponse(
            action=action,
            calendar_event_id=event.get("id"),
            calendar_event_url=event.get("htmlLink"),
        )

    def save(self, job_id: str) -> ActionResponse:
        self._require_job(job_id)
        action = self.repository.add_action(job_id, "saved", {})
        return ActionResponse(action=action)

    def dismiss(self, job_id: str, reason: str) -> ActionResponse:
        self._require_job(job_id)
        action = self.repository.add_action(job_id, "dismissed", {"reason": reason})
        return ActionResponse(action=action)

    def _require_job(self, job_id: str):
        job = self.repository.get_job(job_id)
        if not job:
            raise ValueError("Job not found")
        return job

