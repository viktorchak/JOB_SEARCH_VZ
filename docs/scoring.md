# Scoring System Design

## What criteria did you use, why, and what did you exclude

The scoring system ranks every job on a 100-point rubric computed deterministically from extracted job attributes and an active user profile. The profile captures six preferences — primary job family, seniority level, years of experience, compensation floor, company stage preference, and career priority (learning vs. ownership vs. balanced) — and the system re-ranks the entire corpus instantly whenever the profile changes, without calling an LLM.

We chose five scoring dimensions weighted by how strongly each signal predicts real-world fit. **Job family fit (40 pts)** carries the most weight because a product manager searching for PM roles should never see nursing or warehouse jobs ranked highly; an exact family match earns full marks, an adjacent family (e.g., program management for a PM searcher) earns 24, and an unrelated family earns zero. **Level fit (25 pts)** combines seniority alignment (15 pts) with years-of-experience overlap (10 pts), because a mid-senior candidate applying to executive roles wastes both sides' time. **Career value fit (15 pts)** scores how well the job's learning or ownership signals match the user's stated priority — a candidate optimizing for learning benefits from roles mentioning mentorship and rotational programs, while one optimizing for ownership benefits from roles describing end-to-end mandate and zero-to-one building. **Compensation fit (10 pts)** checks whether known pay meets or approaches the user's floor; unknown compensation receives partial credit rather than a penalty, since most postings omit salary. **Company stage fit (10 pts)** rewards exact stage matches and gives partial credit to adjacent stages (e.g., growth when seeking startup).

Hard filters — location, remote policy, seniority level, years required, minimum compensation, company stage, and an option to hide jobs with unknown salary — are intentionally separated from scoring. A job that fails a hard filter is excluded from results entirely, while scoring produces a continuous ranking among jobs that pass. This separation prevents a single disqualifying attribute (like onsite-only for a remote-only searcher) from merely lowering a score when it should eliminate the result.

We exclude LLM-based scoring from the ranking path. The live system uses deterministic scoring from cached job attributes and an active user profile, which makes profile changes fast, repeatable, and explainable. Gemini is used for referral-email drafting, while attribute extraction is heuristic and deterministic. We also exclude broad, obviously irrelevant roles from the scored corpus by using a positive role-family matcher at ingestion. In practice, the system keeps roles that look like supported families (product, strategy/ops, engineering, program management, business operations, partnerships, analytics, design, sales/GTM, and non-technical business functions) and drops listings that do not match any supported family at all. Postings older than 30 days are filterable but not excluded by default, since some niche roles stay open longer.

---

## Rubric Detail

### Dimensions (100 points)

| Dimension | Weight | Inputs |
|---|---|---|
| Job Family Fit | 40 | Extracted job family vs. profile primary family. Exact match = 40, adjacent family = 24, unknown = 8, no match = 0. |
| Level Fit | 25 | Seniority delta (exact = 15, ±1 = 10, ±2 = 5, unknown = 8) + years overlap (in range = 10, overqualified = 4, unknown = 6, under = 0). |
| Career Value Fit | 15 | Learning or ownership keyword signal (0–10 scale) mapped to 0–15 based on profile career priority. |
| Compensation Fit | 10 | Known pay vs. floor: at or above = 10, within 90% = 7, within 75% = 4, below = 0, unknown = 4. |
| Company Stage Fit | 10 | Exact stage match = 10, adjacent = 7, unknown = 4, distant = 2, no preference = 10. |

### Job Family Adjacency

Adjacency determines partial credit (24/40) for related families:

| Profile Family | Adjacent Families |
|---|---|
| Product Management | Program Management, Strategy & Ops, Data / Analytics |
| Strategy & Operations | Business Ops, Program Management, Partnerships / BD, Product Management |
| Engineering | Data / Analytics, Program Management, Product Management |
| Program Management | Product Management, Strategy & Ops, Business Ops, Engineering |
| Business Operations | Strategy & Ops, Program Management, Partnerships / BD |
| Partnerships / BD | Sales / GTM, Strategy & Ops, Business Ops |
| Data / Analytics | Product Management, Engineering, Business Ops |
| Design | Product Management |
| Sales / GTM | Partnerships / BD, Business Ops |

### Seniority Ordering

Used for delta calculation in level fit:

| Level | Rank |
|---|---|
| Internship | 0 |
| Entry Level | 1 |
| Associate | 2 |
| Mid-Senior | 3 |
| Director | 4 |
| Executive | 5 |

### Hard Filters (pass/fail, not scored)

- **Location**: free-text match against job location
- **Remote policy**: remote / hybrid / onsite
- **Max years required**: exclude jobs requiring more than N years
- **Min compensation**: exclude jobs paying below threshold (with option to also hide unknown)
- **Seniority level**: restrict to specific level(s)
- **Company stage**: restrict to specific stage(s)

### Attribute Extraction

Job attributes are extracted once per job and cached. The current implementation uses heuristic pattern matching:

- **Job family**: longest keyword match against title (preferred) then description
- **Seniority**: word-boundary keyword match against title then description
- **Years required**: regex extraction of experience requirements from job text
- **Compensation**: from API salary fields, or regex extraction from job description
- **Company stage**: public company name list + keyword detection in description
- **Learning / ownership signals**: keyword hit count (0–10 scale)

The live implementation uses heuristic extraction rather than an LLM extractor.
