# Hard Requirements Check

Verified against the current codebase and local checks on April 21, 2026.

## Requirement Audit

| Requirement | Current status | Evidence | If missing, options to fix |
| --- | --- | --- | --- |
| Live data: pull real, current job listings | `Implemented and live-verified` | `IngestionService` now uses Remotive, Remote OK, and Jobicy public APIs. A live ingestion run inserted 148 jobs: 10 from Remotive, 69 from Remote OK, 69 from Jobicy. | No fix required for the connector model. If reliability becomes an issue, add one more broad feed as redundancy. |
| Scoring: jobs must be ranked or scored against defined criteria | `Implemented and partially live-verified` | `ScoringService` defines a rubric, exclusion rules, Gemini structured-output parsing, retry logic, and tests. Backend tests pass. A live Gemini score was verified on a real job in this workspace. | `Option 1:` run a full `/score` pass for the whole corpus before the demo. `Option 2:` add a deterministic fallback scorer behind an env flag for demo continuity if the LLM is unavailable. |
| Actions: at least one action per job on your behalf | `Implemented, partially live-verified` | `Save` and `Dismiss` persist real action records to SQLite. `Apply` creates a calendar follow-up. `Email referral` sends through Gmail and also creates a calendar event. Google actions are coded but not live-verified because Google OAuth is not configured yet. | `Option 1:` configure Google OAuth and verify `Apply` + `Email referral` end to end. `Option 2:` if demo time is tight, use `Save`/`Dismiss` as local actions and make Google setup the first follow-up task, but this is weaker than the preferred demo path. |
| Connectors: minimum 3 live external systems with real read/write operations | `Implemented, not fully live-verified end to end` | Read connectors: Remotive, Remote OK, Jobicy. Write connectors: Gmail, Google Calendar. That is 5 external systems in code. Only the 3 read connectors were live-verified here; Gmail and Calendar remain blocked on OAuth credentials. | `Option 1:` complete Google OAuth and run a real Gmail send plus a real Calendar event. `Option 2:` if you want stricter proof, add a tiny verification script that pings each connector and writes a timestamped report before the demo. |
| UI: working dashboard where actions can be triggered per job | `Implemented and build-verified` | The Next.js app builds successfully with `npm run build`. The dashboard includes refresh, filters, ranked table, drawer, and per-job action buttons. | No structural fix required. For stronger demo readiness, run backend + frontend together after scoring is configured and confirm the live flow on `localhost`. |

## Concrete Verification Results

- Backend syntax check: passed
- Backend tests: `5 passed`
- Frontend production build: passed
- Live ingestion run: passed outside sandbox network restrictions
- Live scoring run: single-job Gemini verification passed
- Live Gmail / Calendar actions: blocked by missing Google OAuth config

## Recommended Next Fix Order

1. Run a full `/score` pass for the whole corpus before the demo so all rows are ranked.
2. Configure Google OAuth and verify one real Gmail send plus one Calendar follow-up.
3. Run a full localhost walkthrough: refresh -> score -> open job -> send email or apply -> confirm logged action.
