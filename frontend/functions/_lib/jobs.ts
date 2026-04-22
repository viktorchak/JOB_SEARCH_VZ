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
  getJobSearchRow,
  getJob,
  getScore,
  listAllJobs,
  listActions,
  listConnectorHealth,
  saveActiveProfile,
  searchJobSearchRows,
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
  const rows = await searchJobSearchRows(env, {
    q: filters.q,
    location: filters.location,
    min_score: filters.min_score,
    max_score: filters.max_score,
    remote_policy: filters.remote_policy,
    date_posted_days: filters.date_posted_days,
    action_status: filters.action_status,
    sort: filters.sort,
    limit: filters.limit,
    max_years_required: filters.max_years_required,
    min_compensation: filters.min_compensation,
    seniority_level: filters.seniority_level,
    company_stage: filters.company_stage,
    hide_unknown_compensation: filters.hide_unknown_compensation,
  });
  const companies = Array.from(new Set(rows.map((row) => row.company))).sort((left, right) => left.localeCompare(right));
  const items = rows.map((row) => buildSummary(row));

  return {
    items,
    total: items.length,
    companies,
    profile,
    verification: leenaVerification(rows),
  };
}

export async function getJobDetailResponse(env: CloudflareEnv, jobId: string) {
  const row = await getJobSearchRow(env, jobId);
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
