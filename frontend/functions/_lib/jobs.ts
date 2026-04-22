import { getOptionalEnv } from "./env";
import { fetchJSearchJobs, ingestAllLiveSources, searchJSearchOnDemand } from "./connectors";
import { buildGoogleAuthorizationUrl, createFollowUpEvent, googleAuthStatus, sendGoogleEmail } from "./google";
import { draftEmail, ensureJobScored, extractJobAttributes, rescoreActiveProfile, scoreJob, scoreUnscoredJobs } from "./scoring";
import type { CloudflareEnv } from "./types";
import {
  addAction,
  batchUpsertJobAttributes,
  batchUpsertJobs,
  batchUpsertScores,
  deleteDerivedForJobs,
  ensureActiveProfile,
  getJob,
  getScore,
  listAllJobs,
  listActions,
  listConnectorHealth,
  listJobSearchRows,
  saveActiveProfile,
  setConnectorHealth,
  upsertJob,
  type JobRecord,
  type JobSearchRow,
  type UserProfileRecord,
} from "./supabase";

function expectedConnectorNames(env: CloudflareEnv): string[] {
  if (getOptionalEnv(env, "JSEARCH_API_KEY")) {
    return ["jsearch"];
  }
  return ["remotive", "remoteok", "jobicy"];
}

function toReasons(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildScore(row: JobSearchRow) {
  return {
    id: row.score_id ?? "",
    job_id: row.job_id,
    rubric_version: row.rubric_version ?? "v1",
    total: row.total ?? 0,
    dim_job_family_fit: row.dim_job_family_fit ?? 0,
    dim_level_fit: row.dim_level_fit ?? 0,
    dim_career_value_fit: row.dim_career_value_fit ?? 0,
    dim_compensation_fit: row.dim_compensation_fit ?? 0,
    dim_company_stage_fit: row.dim_company_stage_fit ?? 0,
    top_reasons: toReasons(row.top_reasons),
    rationale: row.rationale ?? "",
    scored_at: row.scored_at ?? row.ingested_at,
  };
}

function buildAttributes(row: JobSearchRow) {
  return {
    job_id: row.job_id,
    job_family: row.job_family ?? "unknown",
    seniority_level: row.attr_seniority_level ?? "unknown",
    years_required_min: row.years_required_min,
    years_required_max: row.years_required_max,
    compensation_known: Boolean(row.compensation_known),
    compensation_min: row.compensation_min,
    compensation_max: row.compensation_max,
    compensation_currency: row.compensation_currency,
    compensation_period: row.compensation_period,
    company_stage: row.company_stage ?? "unknown",
    learning_signal: row.learning_signal ?? 0,
    ownership_signal: row.ownership_signal ?? 0,
    extracted_at: row.extracted_at ?? row.ingested_at,
  };
}

function buildSummary(row: JobSearchRow) {
  return {
    id: row.job_id,
    source: row.source,
    company: row.company,
    title: row.title,
    location: row.location,
    remote_policy: row.remote_policy,
    jd_url: row.jd_url,
    posted_at: row.posted_at,
    ingested_at: row.ingested_at,
    latest_action_status: row.latest_action_status ?? "unreviewed",
    score: buildScore(row),
    attributes: buildAttributes(row),
  };
}

function relevanceScore(row: JobSearchRow, terms: string[]): number {
  if (!terms.length) return 0;
  const title = row.title.toLowerCase();
  const company = row.company.toLowerCase();
  const jd = row.jd_text.toLowerCase();
  return terms.reduce((score, term) => {
    let next = score;
    if (title.includes(term)) next += 6;
    if (company.includes(term)) next += 3;
    if (jd.includes(term)) next += 1;
    return next;
  }, 0);
}

function leenaVerification(rows: JobSearchRow[]) {
  const match = rows
    .filter(
      (row) =>
        row.company.toLowerCase().includes("leena") &&
        ["entrepreneur in residence", "eir", "strategy & operations"].some((token) => row.title.toLowerCase().includes(token)),
    )
    .sort((left, right) => (right.total ?? 0) - (left.total ?? 0))[0];

  if (!match) {
    return {
      leena_eir_present: false,
      matched_job_id: null,
      matched_source: null,
      matched_title: null,
      matched_company: null,
    };
  }

  return {
    leena_eir_present: true,
    matched_job_id: match.job_id,
    matched_source: match.source,
    matched_title: match.title,
    matched_company: match.company,
  };
}

function sortRows(rows: Array<JobSearchRow & { _relevance: number }>, sort: string, hasQuery: boolean) {
  if (sort === "newest") {
    rows.sort((left, right) => (right.posted_at ?? "").localeCompare(left.posted_at ?? "") || (right.total ?? 0) - (left.total ?? 0));
    return;
  }
  if (sort === "recent") {
    rows.sort((left, right) => right.ingested_at.localeCompare(left.ingested_at) || (right.total ?? 0) - (left.total ?? 0));
    return;
  }
  if (sort === "relevance" || hasQuery) {
    rows.sort((left, right) => right._relevance - left._relevance || (right.total ?? 0) - (left.total ?? 0) || right.ingested_at.localeCompare(left.ingested_at));
    return;
  }
  rows.sort((left, right) => (right.total ?? 0) - (left.total ?? 0) || right.ingested_at.localeCompare(left.ingested_at));
}

export async function getHealth(env: CloudflareEnv) {
  const snapshot = new Map((await listConnectorHealth(env)).map((item) => [item.connector, item]));
  const connectors = expectedConnectorNames(env).map((connector) => snapshot.get(connector) ?? { connector, last_success_at: null, last_error: null });
  return {
    connectors,
    google: await googleAuthStatus(env),
  };
}

export async function ingestAll(env: CloudflareEnv) {
  const connectorResults = await ingestAllLiveSources(env);
  const profile = await ensureActiveProfile(env);
  const existingJobs = await listAllJobs(env);
  const existingByKey = new Map(existingJobs.map((job) => [`${job.source}:${job.external_id}`, job]));
  let totalPulled = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const connector of connectorResults) {
    try {
      const now = new Date().toISOString();
      const changedExistingJobIds: string[] = [];
      const upsertRecords: JobRecord[] = connector.jobs.map((job) => {
        const existing = existingByKey.get(`${job.source}:${job.external_id}`);
        const record: JobRecord = {
          id: existing?.id ?? crypto.randomUUID(),
          ...job,
          salary_min: job.salary_min ?? null,
          salary_max: job.salary_max ?? null,
          salary_currency: job.salary_currency ?? null,
          salary_period: job.salary_period ?? null,
          ingested_at: now,
        };
        if (!existing) {
          connector.inserted += 1;
        } else {
          connector.updated += 1;
          if (
            existing.company !== record.company ||
            existing.title !== record.title ||
            existing.location !== record.location ||
            existing.remote_policy !== record.remote_policy ||
            existing.jd_text !== record.jd_text ||
            existing.jd_url !== record.jd_url ||
            (existing.posted_at ?? null) !== (record.posted_at ?? null) ||
            (existing.salary_min ?? null) !== (record.salary_min ?? null) ||
            (existing.salary_max ?? null) !== (record.salary_max ?? null) ||
            (existing.salary_currency ?? null) !== (record.salary_currency ?? null) ||
            (existing.salary_period ?? null) !== (record.salary_period ?? null)
          ) {
            changedExistingJobIds.push(record.id);
          }
        }
        existingByKey.set(`${record.source}:${record.external_id}`, record);
        return record;
      });

      await batchUpsertJobs(env, upsertRecords);
      await deleteDerivedForJobs(env, changedExistingJobIds);

      const attributes = upsertRecords.map((job) => extractJobAttributes(job));
      const scores = upsertRecords.map((job) => {
        const payload = scoreJob(profile, extractJobAttributes(job));
        return {
          id: crypto.randomUUID(),
          job_id: job.id,
          rubric_version: getOptionalEnv(env, "RUBRIC_VERSION") ?? "v1",
          ...payload,
          scored_at: now,
        };
      });

      await batchUpsertJobAttributes(env, attributes);
      await batchUpsertScores(env, scores);
      await setConnectorHealth(env, connector.connector, { last_success_at: new Date().toISOString(), last_error: null });
    } catch (error) {
      await setConnectorHealth(env, connector.connector, { last_error: error instanceof Error ? error.message : "Unknown error" });
    }

    totalPulled += connector.pulled;
    totalInserted += connector.inserted;
    totalUpdated += connector.updated;
  }

  return {
    total_pulled: totalPulled,
    total_inserted: totalInserted,
    total_updated: totalUpdated,
    connectors: connectorResults.map(({ connector, pulled, inserted, updated }) => ({ connector, pulled, inserted, updated })),
  };
}

export async function ingestLiveSearch(env: CloudflareEnv, query: string) {
  if (!query.trim() || !getOptionalEnv(env, "JSEARCH_API_KEY")) return;
  const profile = await ensureActiveProfile(env);
  for (const job of await searchJSearchOnDemand(env, query.trim())) {
    const { job: savedJob } = await upsertJob(env, job);
    await ensureJobScored(env, savedJob, profile);
  }
}

export async function listJobsResponse(
  env: CloudflareEnv,
  filters: {
    q?: string | null;
    location?: string | null;
    min_score?: number;
    max_score?: number | null;
    remote_policy?: string[];
    date_posted_days?: number | null;
    action_status?: string[];
    sort?: string;
    limit?: number;
    live_search?: boolean;
    max_years_required?: number | null;
    min_compensation?: number | null;
    seniority_level?: string[];
    company_stage?: string[];
    hide_unknown_compensation?: boolean;
  },
) {
  if (filters.live_search && filters.q?.trim()) {
    await ingestLiveSearch(env, filters.q);
  }

  const profile = await ensureActiveProfile(env);
  const allRows = (await listJobSearchRows(env)).filter((row) => row.total !== null);
  const companies = Array.from(new Set(allRows.map((row) => row.company))).sort((left, right) => left.localeCompare(right));

  const qTerms = (filters.q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const locationTerms = (filters.location ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const rows = allRows
    .filter((row) => (filters.min_score ?? 0) <= (row.total ?? 0))
    .filter((row) => (filters.max_score === null || filters.max_score === undefined ? true : (row.total ?? 0) <= filters.max_score))
    .filter((row) => !filters.remote_policy?.length || filters.remote_policy.includes(row.remote_policy))
    .filter((row) => !filters.date_posted_days || (row.posted_at ? new Date(row.posted_at).getTime() >= Date.now() - filters.date_posted_days * 86_400_000 : false))
    .filter((row) => !locationTerms.length || locationTerms.every((term) => row.location.toLowerCase().includes(term)))
    .filter((row) => !qTerms.length || qTerms.every((term) => row.title.toLowerCase().includes(term) || row.company.toLowerCase().includes(term) || row.jd_text.toLowerCase().includes(term)))
    .filter((row) => {
      if (!filters.action_status?.length) return true;
      return filters.action_status.includes(row.latest_action_status ?? "unreviewed");
    })
    .filter((row) => filters.max_years_required === null || filters.max_years_required === undefined || row.years_required_min === null || row.years_required_min <= filters.max_years_required)
    .filter((row) => {
      if (filters.min_compensation === null || filters.min_compensation === undefined) {
        return !filters.hide_unknown_compensation || Boolean(row.compensation_known);
      }
      const value = row.compensation_max ?? row.compensation_min ?? 0;
      if (filters.hide_unknown_compensation) {
        return Boolean(row.compensation_known) && value >= filters.min_compensation;
      }
      return !row.compensation_known || value >= filters.min_compensation;
    })
    .filter((row) => !filters.seniority_level?.length || filters.seniority_level.includes(row.attr_seniority_level ?? "unknown"))
    .filter((row) => !filters.company_stage?.length || filters.company_stage.includes(row.company_stage ?? "unknown"))
    .map((row) => ({ ...row, _relevance: relevanceScore(row, qTerms) }));

  sortRows(rows, filters.sort ?? "top", qTerms.length > 0);
  const limit = filters.limit ?? 200;
  const items = rows.slice(0, limit).map((row) => buildSummary(row));

  return {
    items,
    total: items.length,
    companies,
    profile,
    verification: leenaVerification(allRows),
  };
}

export async function getJobDetailResponse(env: CloudflareEnv, jobId: string) {
  const row = (await listJobSearchRows(env)).find((item) => item.job_id === jobId && item.total !== null);
  if (!row) return null;
  return {
    ...buildSummary(row),
    jd_text: row.jd_text,
    actions: await listActions(env, jobId),
  };
}

export async function getProfile(env: CloudflareEnv) {
  return ensureActiveProfile(env);
}

export async function updateProfile(
  env: CloudflareEnv,
  payload: Omit<UserProfileRecord, "id" | "updated_at">,
) {
  const profile = await saveActiveProfile(env, payload);
  await rescoreActiveProfile(env);
  return profile;
}

export async function draftJobEmail(env: CloudflareEnv, jobId: string) {
  const job = await getJob(env, jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  const score = await getScore(env, jobId);
  return draftEmail(env, job, score);
}

async function requireJob(env: CloudflareEnv, jobId: string): Promise<JobRecord> {
  const job = await getJob(env, jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  return job;
}

export async function applyToJob(env: CloudflareEnv, jobId: string) {
  const job = await requireJob(env, jobId);
  const event = await createFollowUpEvent(env, job, "applied");
  const action = await addAction(env, jobId, "applied", {
    calendar_event_id: event.id ?? null,
    calendar_event_url: event.htmlLink ?? null,
    job_url: job.jd_url,
  });
  return {
    action,
    calendar_event_id: event.id ?? null,
    calendar_event_url: event.htmlLink ?? null,
  };
}

export async function emailReferral(
  env: CloudflareEnv,
  jobId: string,
  payload: { to_email: string; subject: string; body: string },
) {
  const job = await requireJob(env, jobId);
  const gmail = await sendGoogleEmail(env, payload);
  const event = await createFollowUpEvent(env, job, "emailed referral");
  const action = await addAction(env, jobId, "emailed", {
    to_email: payload.to_email,
    subject: payload.subject,
    gmail_message_id: gmail.id ?? null,
    calendar_event_id: event.id ?? null,
    calendar_event_url: event.htmlLink ?? null,
  });
  return {
    action,
    calendar_event_id: event.id ?? null,
    calendar_event_url: event.htmlLink ?? null,
  };
}

export async function saveJob(env: CloudflareEnv, jobId: string) {
  await requireJob(env, jobId);
  return {
    action: await addAction(env, jobId, "saved", {}),
  };
}

export async function dismissJob(env: CloudflareEnv, jobId: string, reason: string) {
  await requireJob(env, jobId);
  return {
    action: await addAction(env, jobId, "dismissed", { reason }),
  };
}

export { buildGoogleAuthorizationUrl, scoreUnscoredJobs, fetchJSearchJobs };
