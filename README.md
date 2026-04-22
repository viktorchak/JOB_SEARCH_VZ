# Job Search Assistant

A lean job search assistant built for the Leena AI take-home. It pulls live public job data, ranks jobs against a saved profile, and lets one user take action from a Google Jobs-style dashboard.

## Stack

- Frontend: Next.js 14 + Tailwind CSS, exported to Cloudflare Pages
- Backend: Cloudflare Pages Functions
- Database: Supabase
- LLM: Gemini
- Read connector: JSearch live public job API
- Write connectors: Gmail API, Google Calendar API

## Production

- Website: `https://job-search-vz.pages.dev`
- Same-origin API: `/api/*`

## Local quick start

1. `cp .env.example .env`
2. Fill the required API values.
3. `cd frontend`
4. `npm install`
5. `npm run build`
6. `npx wrangler pages dev out --port 8788`

The local Cloudflare-style app runs at `http://localhost:8788`.

## Required environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JSEARCH_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

For production OAuth, the redirect URI should be:

- `https://job-search-vz.pages.dev/api/auth/google/callback`

## Deliverables

- PRD: `PRD_v2_JobSearchAssistant_Lean.md`
- Assignment brief: `Assignment_v3.docx.pdf`
- Scoring note: `docs/scoring.md`
- Hard-requirements audit: `docs/hard-requirements-check.md`
- Search/filter redesign: `docs/google-jobs-search-filter-redesign.md`

## Notes

- Read-side ingestion is now centered on `JSearch` for broad company coverage, while live search still queries JSearch on demand from the search box.
- Leena remains a verification point, not a dedicated company connector.
- Google actions now require a valid OAuth client configured for the deployed Pages callback URL.
- Persistent state lives in Supabase instead of the old local SQLite file.
