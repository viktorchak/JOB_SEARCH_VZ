# PRD v2: Job Search Assistant (Lean, Search-First)

**Owner:** Viktor  
**Status:** Ready for build  
**Target build time:** 10–14 hours  
**Audience:** Solo full-stack engineer (AI-assisted)  
**Submission:** Leena AI Sr. Mgr Strat & Ops take-home

---

## 1. Design Principle

**Use AI where it creates user-visible intelligence. Keep the stack and UI simple enough to demo reliably.**

This version optimizes for:

- live data over breadth
- search and ranking over workflow sprawl
- one polished primary surface over many partial surfaces
- demo-visible product judgment over architecture theater

Two constraints guide every decision:

1. It must map to a hard requirement in the assignment.
2. It must strengthen the demo the reviewer actually sees.

If neither is true, it should be cut.

---

## 2. What This Tool Does

A personal job search assistant that:

1. Pulls live PM and Strategy & Ops listings from 3 public job APIs
2. Scores each role against a personal rubric using Gemini
3. Lets me search, filter, review, and act on jobs from a single dashboard
4. Takes a real action per job on my behalf:
   - apply follow-up
   - referral email
   - save
   - dismiss

Leena is a **verification point**, not a dedicated ingestion source. The system should honestly report whether a Leena EIR role is present in the live scored corpus, but the product must not be tailored around Leena-specific search.

---

## 3. Hard Requirements Coverage

| Requirement (from brief) | How v2 meets it |
|---|---|
| Live data (no mocks) | Remotive + Remote OK + Jobicy live APIs |
| Scoring against defined criteria | Gemini scores 5 dimensions and returns structured JSON + rationale |
| At least one action per job | 4 actions: Apply, Email referral, Save, Dismiss |
| Min 3 live external systems with R/W | **5 systems**: Remotive (R), Remote OK (R), Jobicy (R), Gmail (W), Google Calendar (W) |
| Working dashboard | Next.js single page on `localhost:3000` |
| Search/filter UX | Google Jobs-style search-first layout with keyword search, chip filters, and persistent job detail |

**Leena-specific note:**  
Leena is treated as a corpus verification check. If a Leena EIR role appears in the live public-job corpus, it is scored and displayed like any other role. If it does not appear, the UI explicitly reports that it is not present.

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Database | **SQLite** (single `jobs.db` file) | Zero setup, zero infra, enough for hundreds of jobs |
| Backend | **Python 3.11+ + FastAPI** | Fast to ship, easy typed APIs, simple connector orchestration |
| LLM | **Gemini 2.5 Flash** via Google GenAI SDK | Strong structured-output support for scoring and email draft generation |
| Frontend | **Next.js 14 + Tailwind CSS + shadcn/ui primitives** | Fast single-page build, easy stateful search UI |
| Design system | **Custom warm editorial system** (`Lora/Georgia` + `Inter`, teal/cream palette, glass panels) | Matches the provided design-system handoff |
| Auth | **Google OAuth 2.0 web app flow** | Supports Gmail + Calendar via localhost callback |
| Deployment | localhost only | Per brief |

---

## 5. Architecture

```text
┌──────────────────────────┐
│      Read Connectors     │
│  - Remotive              │
│  - Remote OK             │
│  - Jobicy                │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│              FastAPI Core                │
│  - Ingest                                │
│  - Score                                 │
│  - Search / Filter                       │
│  - Actions                               │
│  - Leena verification check              │
└──────────────┬───────────────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────────┐   ┌──────────────┐
│   SQLite     │   │   Google     │
│   jobs.db    │   │ Gmail + Cal  │
└──────┬───────┘   └──────┬───────┘
       │                  │
       └──────────┬───────┘
                  ▼
         ┌──────────────────┐
         │    Next.js UI    │
         │ search-first app │
         └──────────────────┘
```

---

## 6. Data Model (SQLite)

Lean schema with only the fields required for live ingest, ranking, search, and actions.

### `jobs`

| Field | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| source | TEXT | `remotive` / `remoteok` / `jobicy` |
| external_id | TEXT | Source job ID |
| company | TEXT | Raw display company |
| company_normalized | TEXT | Lowercased company for filters |
| title | TEXT | Raw display title |
| title_normalized | TEXT | Lowercased title for search |
| location | TEXT | Raw display location |
| location_normalized | TEXT | Lowercased location for search |
| remote_policy | TEXT | `remote` / `hybrid` / `onsite` / `unknown` |
| jd_text | TEXT | Full normalized JD text |
| search_text | TEXT | Concatenated searchable text: title + company + jd_text |
| jd_url | TEXT | Apply/source link |
| posted_at | TEXT | ISO date |
| ingested_at | TEXT | ISO timestamp |

**Constraint:** `UNIQUE(source, external_id)` for idempotent upsert.

No embeddings, no semantic dedup, no extra warehouse. This is enough for keyword search and filtering with standard SQL.

### `scores`

| Field | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| job_id | TEXT FK | |
| rubric_version | TEXT | For future score changes |
| total | REAL | 0–100 |
| dim_role_fit | REAL | 0–25 |
| dim_domain_leverage | REAL | 0–25 |
| dim_comp_level | REAL | 0–20 |
| dim_company_stage | REAL | 0–20 |
| dim_logistics | REAL | 0–10 |
| top_reasons | TEXT | JSON array of 3 short strings |
| rationale | TEXT | 2–3 sentences |
| scored_at | TEXT | |

### `actions`

| Field | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| job_id | TEXT FK | |
| type | TEXT | `applied` / `emailed` / `dismissed` / `saved` |
| metadata | TEXT | JSON payload: email subject, event ID, dismiss reason, etc. |
| created_at | TEXT | |

### `connector_health`

| Field | Type | Notes |
|---|---|---|
| connector | TEXT PK | |
| last_success_at | TEXT | |
| last_error | TEXT | |

---

## 7. Connector Specs

### 7.1 Remotive (Read)

- Endpoint: `https://remotive.com/api/remote-jobs`
- Public, no auth
- Filter target roles after ingest fetch
- Persist normalized location and remote policy

### 7.2 Remote OK (Read)

- Endpoint: `https://remoteok.com/api`
- Public, no auth
- Filter target roles after fetch
- Use `position`, `company`, `location`, `description`, and date fields

### 7.3 Jobicy (Read)

- Endpoint: `https://jobicy.com/api/v2/remote-jobs?count=100`
- Public, no auth
- Filter target roles after fetch
- Normalize `jobTitle`, `companyName`, `jobGeo`, `jobDescription`

### 7.4 Gmail API (Write)

- OAuth scope: `gmail.send`
- Used to send referral-request emails drafted by Gemini
- Email is shown in an editable composer before sending

### 7.5 Google Calendar API (Write)

- OAuth scope: `calendar.events`
- On `Apply` or `Email sent`, create a follow-up event 5 business days out
- Event title: `Follow up: {company} — {title}`
- Description includes JD URL and action context

### 7.6 Leena Verification (Read-only logic, not a source connector)

- The app checks the scored corpus for a Leena EIR-like role
- UI displays:
  - present and matched source
  - or not present in current public feeds
- No dedicated Leena-only job source should be used in ranking or filtering

---

## 8. Scoring Logic

### Rubric (100 points)

| Dimension | Weight | What Gemini evaluates |
|---|---|---|
| **Role fit** | 25 | Sr. PM / Principal PM / Sr Mgr S&O / Director S&O. Penalize junior, contract, eng-manager mismatches |
| **Domain leverage** | 25 | Marketplaces, fintech, ops-heavy SaaS, vendor platforms, AI tooling |
| **Comp & level** | 20 | If band exists, use it. Otherwise infer from title and company stage conservatively |
| **Company stage** | 20 | Prefer strong scale-up or durable public-company opportunities |
| **Logistics** | 10 | NYC or remote strongest; heavy relocation weakest |

### Hard exclusions (before Gemini call)

- contract / contract-to-hire
- title contains `Associate` or `APM` without `Senior`
- posted > 30 days ago

### Gemini call

- Model: `gemini-2.5-flash`
- System prompt contains:
  - scoring rubric
  - Viktor bio
  - scoring output schema
- Input contains structured job fields + full JD text
- Output schema:
  - all 5 dimension scores
  - `total`
  - `top_reasons` (3 strings)
  - `rationale` (2–3 sentences)

### Validation

- Pydantic validates every model response
- If parsing fails, retry once with a stricter JSON-only instruction
- If second attempt fails, log and skip
- Never crash the ingest/score pipeline

### Caching

- Skip re-scoring any `(job_id, rubric_version)` already in the `scores` table

---

## 9. Product Surface and UX Spec

Single page at `localhost:3000`.

The primary surface should follow a **Google Jobs-style search-first layout**, skinned with the provided design system.

### 9.1 Layout

#### Desktop

1. **Top search bar**
   - keyword input: `Search jobs, companies, or skills`
   - location input: `Location`
   - search action
   - refresh button
   - connect Google button

2. **Connector status rail**
   - source pills with last sync times

3. **Filter chip rail**
   - Remote
   - Date posted
   - Source
   - Company
   - Score
   - Action status
   - More filters

4. **Active filter row**
   - removable pills reflecting current state

5. **Two-pane browse view**
   - left pane: job results list
   - right pane: sticky selected-job detail

#### Mobile

- stacked list-first layout
- detail opens as full-screen panel
- chip rail horizontally scrollable

### 9.2 Search and Filter Model

#### Search fields

- keyword search across:
  - title
  - company
  - jd_text
- location search against normalized location

#### Filters that ship in v2

- remote policy
- date posted
- source
- company
- score
- action status

#### Deferred filters

Only add these after reliable normalization exists:

- job type
- salary
- benefits

The UI must not pretend these filters are available if the underlying public APIs do not provide structured data consistently.

### 9.3 Result List

Each job result should show:

- score badge
- company
- title
- location
- remote policy
- posted date
- source
- one-line match reason
- quick actions:
  - save
  - dismiss

`Apply` and `Email referral` should remain accessible without leaving the result context, but the richer action experience belongs in the selected-job pane.

### 9.4 Selected Job Detail Pane

The right pane should include:

- title, company, location, source, posted date
- score badge
- primary actions:
  - Apply
  - Draft email
  - Save
  - Dismiss
- `Why this matches you`
  - top reasons
  - rationale
  - rubric breakdown
- job description
- action history
- email composer

### 9.5 Tabs

Top-level tabs should mirror workflow state rather than invent new concepts:

- All jobs
- Saved
- Applied
- Dismissed

### 9.6 Design System Foundations

The Google Jobs-style layout should use the provided design system, not Google’s visual branding.

#### Visual direction

- warm cream background with subtle teal + ember glows
- frosted white panels with soft borders
- large rounded containers and pill controls
- serif display typography with sans-serif UI chrome

#### Typography

- display/body serif: `Lora` or `Georgia`
- UI sans: `Inter`
- uppercase, widely tracked eyebrows and column labels

#### Color

- primary accent: teal `#0f766e`
- warm neutral background range: `#f7f2ea` to `#efe6d8`
- warning/dismiss accent: ember `#c2410c`
- score badges:
  - emerald for 85+
  - teal for 70+
  - amber for 50+
  - slate below 50

#### Interaction language

- direct and functional
- sentence case
- no emoji
- honest status/error messages

---

## 10. API Endpoints (FastAPI)

| Method | Path | Purpose |
|---|---|---|
| POST | `/ingest` | Pulls from all 3 read connectors, upserts to `jobs` |
| POST | `/score` | Scores all unscored jobs |
| GET | `/jobs` | Returns scored jobs with search + filters |
| GET | `/jobs/{id}` | Single job + score + action history |
| POST | `/jobs/{id}/draft-email` | Gemini drafts referral email, returns `{subject, body}` |
| POST | `/jobs/{id}/actions/apply` | Logs apply + creates calendar event |
| POST | `/jobs/{id}/actions/email` | Sends via Gmail + logs + creates calendar event |
| POST | `/jobs/{id}/actions/save` | Logs save |
| POST | `/jobs/{id}/actions/dismiss` | Logs dismiss with reason |
| GET | `/health` | Returns last successful sync time per connector |

### `/jobs` query parameters

`GET /jobs` should support:

- `q`
- `location`
- `remote_policy`
- `date_posted_days`
- `source`
- `company`
- `min_score`
- `max_score`
- `action_status`
- `sort`
- `limit`
- `cursor` or page token

Example:

```http
GET /jobs?q=strategy%20operations&location=new%20york&remote_policy=remote&date_posted_days=7&min_score=70&sort=relevance
```

---

## 11. Production-Quality Bar (within lean scope)

Things that make this feel real without expanding scope:

- typed request/response models at every API boundary
- Gemini outputs validated with Pydantic
- retry with backoff on every external connector call
- structured logging to `logs/app.log`
- `/health` endpoint with per-connector last sync status
- loading skeletons, toasts, empty states, connector health pills
- URL-synced search state for the search-first UI
- focused test coverage around:
  - scoring pipeline
  - search filtering
  - action logging

---

## 12. Build Sequence (10–14 hour budget)

| Hr | Task | Risk-mitigation note |
|---|---|---|
| 0–1 | Repo scaffold, SQLite schema, `.env.example`, FastAPI hello world | — |
| 1–2 | Validate Remotive, Remote OK, Jobicy live ingestion | Highest demo-risk dependency first |
| 2–3 | `/ingest` end-to-end with real rows in SQLite | — |
| 3–5 | Gemini scoring with structured output, retry logic, validation | Core product intelligence |
| 5–6 | Validate Google OAuth web flow + send a real email | Highest write-path risk first |
| 6–8 | Build search-first Next.js UI with design-system foundations | Main reviewer-facing surface |
| 8–9 | Add detail pane, email composer, save/dismiss/apply actions | — |
| 9–10 | Add chip filters, active pills, URL state, empty/loading/error states | — |
| 10–11 | Calendar integration + action history | — |
| 11–12 | Tests, README, `.env.example`, scoring note doc | — |
| 12–14 | Bug fixes, walkthrough prep, GitHub push | Buffer |

---

## 13. What We Deliberately Did Not Build (and Why)

| Cut | Reason |
|---|---|
| Greenhouse + Lever ATS connectors | Public job APIs already satisfy the live-data requirement with lower integration risk |
| Dedicated Leena-only connector | Violates the product principle; Leena is a verification point, not a tailored source |
| Google Jobs scraping | Adds fragility and legal/product ambiguity; the app should use first-party public APIs |
| Salary / job type / benefits filters on day 1 | Public feed metadata is not reliable enough yet; fake precision would weaken the product |
| Supabase + Postgres | SQLite covers the assignment cleanly with zero setup |
| Vector search / embeddings | Keyword search is sufficient for this scope |
| User auth | Single-user localhost demo |
| Gmail read / inbox parsing | Adds OAuth scope and complexity without improving the demo materially |
| Browser automation for real application submission | Out of scope; opening the source listing + logging + follow-up scheduling is sufficient |
| Pixel-perfect Google clone | We want Google-style interaction patterns, not brand mimicry |

---

## 14. Acceptance Criteria

- [ ] Clicking `Refresh` pulls fresh jobs from Remotive, Remote OK, and Jobicy with no mock data
- [ ] Every displayed job has a visible score and Gemini rationale data
- [ ] Keyword search works across title, company, and JD text
- [ ] Location search and chip-based filtering refine results without losing app state
- [ ] The main screen uses a Google Jobs-style search-first layout with persistent job detail on desktop
- [ ] The UI follows the provided design system: warm editorial theme, pill controls, serif display + sans UI
- [ ] `Apply` opens the source listing and creates a real calendar follow-up
- [ ] `Email referral` generates a draft, allows editing, and sends via Gmail
- [ ] `Save` and `Dismiss` are persisted and reflected in action history
- [ ] `/health` reports last successful sync per connector
- [ ] The app honestly reports whether a Leena EIR role is present in the live corpus
- [ ] Repo includes README, `.env.example`, `/docs/scoring.md`, and this PRD
- [ ] Demo can run end-to-end repeatedly without silent failures

---

## 15. Open Questions for Build

1. **Exact phase-1 search scope**  
   Should `q` be simple token match with SQL `LIKE`, or do we want SQLite FTS5 immediately?

2. **Google Jobs-style tabs**  
   Are `All / Saved / Applied / Dismissed` sufficient, or do we want an explicit `Unreviewed` tab?

3. **Typography finalization**  
   Is `Lora + Inter` the approved implementation pair, or should production remain `Georgia + system sans`?

4. **Leena verification policy**  
   If the current live corpus does not contain a Leena EIR role, is an explicit “not present” state acceptable for the take-home? It should be, but this should be agreed up front.
