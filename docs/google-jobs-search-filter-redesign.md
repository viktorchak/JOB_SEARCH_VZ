# Google Jobs-Inspired Search And Filter Redesign

## Objective

Redesign the current dashboard so job discovery feels closer to Google Jobs:

- search-first
- chip-based filtering
- fast list refinement without page reloads
- persistent detail view for the selected job
- clear per-job actions from the same workspace

This document is based on the current app architecture:

- frontend: Next.js
- backend: FastAPI
- storage: SQLite
- data sources: Remotive, Remote OK, Jobicy
- scoring: Gemini
- actions: Gmail, Google Calendar, local action logging

It follows the interaction model shown in the provided Google Jobs screenshot, but does not attempt to copy Google branding or replicate unavailable data fields with fake values.

## Current Problem

The current dashboard is functional but not search-native.

Current state:

- filters are limited to `min score`, `company`, and `remote only`
- jobs are shown in a large table, which is efficient for auditing but weak for browsing
- job detail opens in a drawer instead of staying visible as a side-by-side context pane
- there is no keyword search
- there is no location search
- there is no filter chip model
- there is no notion of active filters as removable pills
- there is no result sorting model beyond backend score ordering

This makes the product feel like an internal admin tool, not a job search tool.

## Design Principles

1. Search comes first.
2. Filters should feel lightweight and removable.
3. Browsing should happen in a split-pane layout.
4. Detail should stay visible without losing the results list.
5. Actions should remain attached to each job, not hidden behind navigation.
6. Filters must be honest to the live data we actually have.

## Goals

- Reduce time to first relevant job.
- Make it obvious how to narrow a broad public-job feed.
- Support Google Jobs-style exploration patterns:
  - type query
  - add filter chips
  - click result
  - inspect detail without leaving the list
- Preserve assignment-specific strengths:
  - ranking
  - per-job actions
  - Leena verification

## Non-Goals

- Replicating Google’s visual identity
- Scraping Google Jobs
- Showing salary, benefits, or job type for every job before the connectors actually provide that data
- Introducing user login in this phase

## Proposed Information Architecture

### 1. Top Search Bar

Replace the current dashboard header controls with a search-first header:

- keyword input: `Search jobs, companies, or skills`
- location input: `Location`
- search submit button
- optional clear button
- `Refresh` remains visible but secondary
- `Connect Google` moves to utility/header right rail

Behavior:

- keyword search matches against `title`, `company`, and `jd_text`
- location search matches normalized `location`
- search updates URL state
- search is debounced for typing, immediate on submit

### 2. Filter Chip Rail

Directly below the search bar, add horizontal filter chips similar to Google Jobs.

Ship-now chips:

- `Remote`
- `Date posted`
- `Source`
- `Company`
- `Score`
- `Action status`
- `More filters`

Deferred chips, only after enrichment exists:

- `Job type`
- `Salary`
- `Benefits`

Chip behavior:

- closed state shows label only
- open state reveals popover or dropdown
- selected state shows active value
- active chips can be removed with one click
- all active filters also appear in a second “active filters” row as removable pills

### 3. Split-Pane Results Layout

Replace the current table-first layout with a 2-column browse view:

- left column: search results list
- right column: sticky job detail pane

Desktop layout:

- results pane: `40%`
- detail pane: `60%`

Tablet:

- results pane collapses to `45%`
- detail remains persistent

Mobile:

- list-first
- detail opens as a full-screen panel

### 4. Results List

Each job card in the left pane should include:

- title
- company
- location
- remote policy badge
- posted date
- source badge
- score badge
- one-line “why this matches” snippet
- quick controls:
  - save
  - dismiss

Primary actions like `Apply` and `Email` should remain visible, but on desktop they belong in the detail pane rather than repeated as noisy inline buttons on every row.

### 5. Persistent Detail Pane

The selected result should populate a right-side pane, inspired by Google Jobs detail behavior.

Pane sections:

- job header
  - title
  - company
  - location
  - source
  - posted date
  - score
- primary action bar
  - `Apply`
  - `Draft email`
  - `Save`
  - `Dismiss`
- `Why this matches you`
  - Gemini top reasons
  - rubric breakdown
- `Job highlights`
  - extracted metadata if available
- `Job description`
- `Action history`
- `Referral email composer`

This keeps the Google Jobs browse pattern while preserving the assignment’s differentiator: ranking and outbound action.

## Recommended UX Flow

1. User lands on the page and sees a prominent search bar.
2. User enters a keyword like `strategy operations` and optionally a location.
3. Results update in the left pane.
4. User adds chips like `Remote`, `Last 7 days`, and `Score 70+`.
5. User clicks a result.
6. The detail pane updates in place.
7. User reviews Gemini reasons.
8. User clicks `Apply` or `Draft email`.
9. The action is logged without losing search context.

## Functional Search Model

### Keyword Search

Search across:

- `title`
- `company`
- `jd_text`

Matching rules for phase 1:

- case-insensitive
- token-based partial match
- basic ranking:
  - title match > company match > description match

Matching rules for phase 2:

- SQLite FTS5 or equivalent full-text index
- phrase search
- stemming or synonym support for common role variants

### Location Search

Phase 1:

- string match on normalized `location`

Phase 2:

- split normalized fields:
  - city
  - region/state
  - country
- support location aliases like `NYC` -> `New York`

## Filter Model

### Ship Now

#### Remote

Options:

- `Remote only`
- `Hybrid`
- `Onsite`

#### Date Posted

Options:

- `Past 24 hours`
- `Past 3 days`
- `Past 7 days`
- `Past 14 days`
- `Past 30 days`

#### Source

Options:

- `Remotive`
- `Remote OK`
- `Jobicy`

#### Company

Options:

- searchable multi-select
- top companies by result count

#### Score

Options:

- `90+`
- `80+`
- `70+`
- `60+`
- custom range

#### Action Status

Options:

- `Unreviewed`
- `Saved`
- `Applied`
- `Emailed`
- `Dismissed`

This filter is important because it gives the app a workflow dimension that Google Jobs does not have.

### Defer Until Data Exists

#### Job Type

Show only after we normalize it from connector payloads or extraction:

- full-time
- part-time
- contract
- internship

#### Salary

Show only after we persist normalized compensation fields:

- min salary
- max salary
- currency
- cadence

#### Benefits

Show only when enough sources expose reliable structured benefits.

## Sorting Model

Default sort:

- `Relevance` when a keyword query exists
- `Top matches` when there is no query

Available sorts:

- `Relevance`
- `Top matches`
- `Newest`
- `Recently ingested`
- `Company A-Z`

Sorting should never remove score visibility; score remains a visible signal even when it is not the active sort.

## Tabs

Google Jobs uses tabs such as job postings and saved jobs. We should adapt that pattern to this product’s real workflow.

Recommended tabs:

- `All jobs`
- `Saved`
- `Applied`
- `Dismissed`

Do not add `Following` in this phase because the product has no follow/followed-company model.

## Layout Wireframe

```text
+----------------------------------------------------------------------------------+
| Search jobs, companies, or skills | Location | Search | Refresh | Connect Google |
+----------------------------------------------------------------------------------+
| Remote | Date posted | Source | Company | Score | Action status | More filters   |
| strategy operations | Remote only | 7 days | 70+ | Remotive x | Clear all       |
+--------------------------------------------+-------------------------------------+
| All jobs | Saved | Applied | Dismissed    | Selected Job Detail                  |
+--------------------------------------------+-------------------------------------+
| [78] Billtrust                            | Director, Customer Operations...      |
| Jobicy • USA • Remote • 4/20             | Company, source, location, posted     |
| Strong fit for Strategy & Ops...         | Score badge + Apply + Email + Save    |
|------------------------------------------|--------------------------------------|
| [75] Gong.io                             | Why this matches you                  |
| Remote OK • Multi-city • 4/16            | - Top reason 1                        |
| Role aligns with senior director...      | - Top reason 2                        |
|------------------------------------------|                                      |
| [73] Hightouch                           | Gemini breakdown                      |
| ...                                      | Job highlights                        |
|                                          | Job description                       |
|                                          | Action history                        |
|                                          | Email composer                        |
+--------------------------------------------+-------------------------------------+
```

## Visual Design Direction

The current UI is already soft and editorial. Keep that tone, but move it toward a cleaner search product.

Recommended direction:

- cleaner white search surface
- less glassmorphism in the results area
- stronger border hierarchy
- tighter vertical rhythm in job cards
- sticky detail pane with subtle separation
- chips styled like lightweight search filters, not dashboard controls

Visual rules:

- search bar must be the dominant affordance
- filter chips must look tappable and stateful
- selected job row should be obvious but not heavy
- action buttons in detail should have one clear primary CTA
- score badge should stay compact and legible

## API Changes

### Current

Current `GET /jobs` supports only:

- `min_score`
- `company`
- `remote`

### Proposed

Expand `GET /jobs` to support:

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
- `cursor`
- `limit`

Example:

```http
GET /jobs?q=strategy%20operations&location=new%20york&remote_policy=remote&date_posted_days=7&source=jobicy&min_score=70&sort=relevance&limit=25
```

### Response Shape

Add metadata and facets:

```json
{
  "items": [],
  "total": 148,
  "next_cursor": "abc123",
  "facets": {
    "source": [
      { "value": "jobicy", "count": 69 },
      { "value": "remoteok", "count": 69 },
      { "value": "remotive", "count": 10 }
    ],
    "remote_policy": [
      { "value": "remote", "count": 120 },
      { "value": "hybrid", "count": 18 },
      { "value": "onsite", "count": 10 }
    ],
    "action_status": [
      { "value": "saved", "count": 12 },
      { "value": "applied", "count": 3 }
    ]
  },
  "verification": {}
}
```

Facet counts are necessary if the filter chips are going to feel credible.

## Data Model Changes

### Current Job Table

Current `jobs` schema is too thin for Google Jobs-style filtering.

It only stores:

- source
- external_id
- company
- title
- location
- remote_policy
- jd_text
- jd_url
- posted_at
- ingested_at

### Proposed Additions

Add normalized fields to `jobs`:

- `title_normalized`
- `company_normalized`
- `search_text`
- `city`
- `region`
- `country`
- `job_type`
- `comp_min`
- `comp_max`
- `comp_currency`
- `comp_interval`
- `benefits_json`
- `role_family`

Add useful indexes:

- `(posted_at)`
- `(remote_policy)`
- `(source)`
- `(company_normalized)`
- full-text index on `search_text`

### Action State

Keep actions event-based, but expose a derived “latest action state” for filtering:

- saved
- applied
- emailed
- dismissed
- unreviewed

This can be computed in SQL or materialized in a view.

## Frontend Component Changes

### Replace

- table-first dashboard layout
- drawer as the primary detail interaction

### Add

- `JobSearchHeader`
- `FilterChipBar`
- `ActiveFilterRow`
- `JobResultsPane`
- `JobResultCard`
- `JobDetailPane`
- `JobTabs`

### Reuse

- action handlers
- email composer logic
- save/dismiss/apply actions
- Gemini score presentation, adapted into the detail pane

## State Model

Frontend state should move from ad hoc filter booleans to a structured search model.

Recommended state shape:

```ts
type JobSearchState = {
  q: string;
  location: string;
  remotePolicy: Array<"remote" | "hybrid" | "onsite">;
  datePostedDays: number | null;
  sources: string[];
  companies: string[];
  minScore: number | null;
  maxScore: number | null;
  actionStatus: string[];
  sort: "relevance" | "score" | "newest" | "ingested_at" | "company";
  tab: "all" | "saved" | "applied" | "dismissed";
  selectedJobId: string | null;
};
```

This state should sync to the URL so the search page is shareable and refresh-safe.

## Performance Expectations

- query input debounce: `250-300ms`
- filter updates should not full-refresh the page shell
- preserve selected job when possible during filter changes
- use cursor-based pagination or infinite scroll after 25-50 rows
- avoid refetching job detail if the selected job is already loaded and unchanged

## Accessibility Requirements

- keyboard focus must move logically from search to chips to results to detail
- all chips must be keyboard-operable
- selected result row must have visible focus and selected state
- detail pane must announce loading and selection changes to screen readers
- mobile filter controls must work without hover

## Mobile Behavior

Mobile should not attempt to preserve the exact desktop split-pane.

Recommended mobile behavior:

- sticky search bar
- horizontal scroll chip rail
- result list below
- tap result -> full-screen detail panel
- bottom action bar in detail:
  - apply
  - email
  - save
  - dismiss

## Phased Delivery

### Phase 1: Search-Native Redesign

Ship with current live data and honest filters:

- top search bar
- keyword search
- location search
- chip filters for remote, date posted, source, company, score, action status
- tabs for all/saved/applied/dismissed
- split-pane layout
- persistent detail pane
- URL-synced search state

### Phase 2: Data Enrichment

- normalize salary where source data exists
- normalize job type where source data exists
- derive structured location fields
- add FTS search
- add facet counts for richer filtering

### Phase 3: Polish

- keyboard navigation across result rows
- infinite scroll
- company logo fallback system
- extracted job highlights
- saved search presets

## Risks And Mitigations

### Risk: Public APIs do not expose Google-level metadata richness

Mitigation:

- ship only filters backed by real fields
- hide salary/job type filters until normalized data exists
- show missing metadata as absent, not guessed

### Risk: Search becomes slow as corpus grows

Mitigation:

- start with indexed SQL filtering
- move to FTS5 for description search

### Risk: Too many filters make the app feel heavy

Mitigation:

- keep the first row to 5-6 primary chips
- place advanced filters under `More filters`

## Success Criteria

- User can search by keyword and location from the top bar
- User can add and remove filters using chips
- User can inspect a selected job without leaving the list
- User can act on a job from the detail pane
- The filter system uses only live data-backed fields
- The UI feels closer to a search product than a dashboard table

## Recommendation

Implement Phase 1 first.

That gets the product materially closer to the Google Jobs interaction model without pretending the current public APIs provide full salary, benefits, and job-type coverage. It also keeps the assignment aligned with the current no-login, send-from-my-Gmail workflow.
