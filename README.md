# Job Search Assistant

A lean full-stack job search assistant built for the Leena AI take-home. It pulls live job listings, scores them against a defined rubric, and lets a single user act on jobs from one dashboard.

## Stack

- Backend: FastAPI + SQLite
- Frontend: Next.js 14 + Tailwind CSS
- LLM: Gemini via JSON-validated structured output
- Integrations: Remotive, Remote OK, Jobicy, Gmail, Google Calendar

## Quick start

1. `cp .env.example .env`
2. Fill the required API and Google OAuth values.
3. `make setup`
4. `make run-backend`
5. `make run-frontend`

The UI runs at `http://localhost:3000` and the API runs at `http://localhost:8000`.

## Deliverables

- PRD: `PRD_v2_JobSearchAssistant_Lean.md`
- Assignment brief: `Assignment_v3.docx.pdf`
- Scoring note: `docs/scoring.md`
- Hard-requirements audit: `docs/hard-requirements-check.md`
- Search/filter redesign: `docs/google-jobs-search-filter-redesign.md`

## Notes

- Read-side ingestion now uses broad public job APIs rather than company-specific ATS endpoints.
- Leena is treated as a verification point in the scored corpus, not as a dedicated source connector.
- Google actions require a valid OAuth client configured for localhost usage.
- The backend stores state in `backend/jobs.db`.
- In this workspace, live ingestion was verified on April 21, 2026 against Remotive, Remote OK, and Jobicy.
