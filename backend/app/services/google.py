from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas import GoogleAuthStatus, JobRecord


SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
]


class GoogleService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.state_path = self.settings.token_file.with_suffix(".state")

    def auth_status(self) -> GoogleAuthStatus:
        configured = bool(self.settings.google_client_id and self.settings.google_client_secret)
        token_path = str(self.settings.token_file)
        if not configured:
            return GoogleAuthStatus(configured=False, authenticated=False, token_path=token_path)

        credentials = self._maybe_load_credentials()
        return GoogleAuthStatus(
            configured=True,
            authenticated=bool(credentials and credentials.valid),
            token_path=token_path,
        )

    def build_authorization_url(self) -> str:
        flow = self._build_flow()
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(state, encoding="utf-8")
        return authorization_url

    def exchange_code(self, code: str, state: str | None) -> None:
        expected_state = self.state_path.read_text(encoding="utf-8").strip() if self.state_path.exists() else None
        if expected_state and state and expected_state != state:
            raise ValueError("Google OAuth state mismatch")

        flow = self._build_flow(state=state or expected_state)
        flow.fetch_token(code=code)
        self.settings.token_file.parent.mkdir(parents=True, exist_ok=True)
        self.settings.token_file.write_text(flow.credentials.to_json(), encoding="utf-8")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def send_email(self, *, to_email: str, subject: str, body: str) -> dict:
        credentials = self._load_credentials()
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

        message = EmailMessage()
        message["To"] = to_email
        if self.settings.email_from:
            message["From"] = self.settings.email_from
        message["Subject"] = subject
        message.set_content(body)
        encoded = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        return service.users().messages().send(userId="me", body={"raw": encoded}).execute()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
    def create_follow_up_event(self, job: JobRecord, action_label: str) -> dict:
        credentials = self._load_credentials()
        service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
        start_at = self._five_business_days_out()
        end_at = start_at + timedelta(minutes=30)
        event = {
            "summary": f"Follow up: {job.company} — {job.title}",
            "description": f"Action: {action_label}\nJob URL: {job.jd_url}",
            "start": {
                "dateTime": start_at.isoformat(),
                "timeZone": self.settings.google_calendar_timezone,
            },
            "end": {
                "dateTime": end_at.isoformat(),
                "timeZone": self.settings.google_calendar_timezone,
            },
        }
        return (
            service.events()
            .insert(calendarId=self.settings.google_calendar_id, body=event)
            .execute()
        )

    def _build_flow(self, state: str | None = None) -> Flow:
        if not self.settings.google_client_id or not self.settings.google_client_secret:
            raise RuntimeError("Google OAuth is not configured")
        client_config = {
            "web": {
                "client_id": self.settings.google_client_id,
                "client_secret": self.settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [str(self.settings.google_redirect_uri)],
            }
        }
        flow = Flow.from_client_config(client_config, scopes=SCOPES, state=state)
        flow.redirect_uri = str(self.settings.google_redirect_uri)
        return flow

    def _load_credentials(self) -> Credentials:
        credentials = self._maybe_load_credentials()
        if not credentials:
            raise RuntimeError("Google OAuth token not found. Complete /auth/google/start first.")
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            self.settings.token_file.write_text(credentials.to_json(), encoding="utf-8")
        if not credentials.valid:
            raise RuntimeError("Google OAuth credentials are invalid")
        return credentials

    def _maybe_load_credentials(self) -> Credentials | None:
        token_file = self.settings.token_file
        if not token_file.exists():
            return None
        data = json.loads(token_file.read_text(encoding="utf-8"))
        return Credentials.from_authorized_user_info(data, scopes=SCOPES)

    def _five_business_days_out(self) -> datetime:
        current = datetime.now().replace(hour=9, minute=30, second=0, microsecond=0)
        days_added = 0
        while days_added < 5:
            current += timedelta(days=1)
            if current.weekday() < 5:
                days_added += 1
        return current

