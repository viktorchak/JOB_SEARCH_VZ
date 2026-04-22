import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getOptionalEnv, getRequiredEnv } from "./env";
import type { CloudflareEnv } from "./types";

export interface JobIngestRecord {
  source: string;
  external_id: string;
  company: string;
  title: string;
  location: string;
  remote_policy: string;
  jd_text: string;
  jd_url: string;
  posted_at: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}

export interface JobRecord extends JobIngestRecord {
  id: string;
  ingested_at: string;
}

export interface JobAttributeRecord {
  job_id: string;
  job_family: string;
  seniority_level: string;
  years_required_min: number | null;
  years_required_max: number | null;
  compensation_known: boolean;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  compensation_period: string | null;
  company_stage: string;
  learning_signal: number;
  ownership_signal: number;
  extracted_at: string;
}

export interface ScorePayload {
  total: number;
  dim_job_family_fit: number;
  dim_level_fit: number;
  dim_career_value_fit: number;
  dim_compensation_fit: number;
  dim_company_stage_fit: number;
  top_reasons: string[];
  rationale: string;
}

export interface ScoreRecord extends ScorePayload {
  id: string;
  job_id: string;
  rubric_version: string;
  scored_at: string;
}

export interface ActionRecord {
  id: string;
  job_id: string;
  type: string;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface UserProfileRecord {
  id: string;
  primary_job_family: string;
  seniority_level: string;
  years_experience_bucket: string;
  compensation_floor: number | null;
  company_stage_preference: string;
  career_priority: string;
  updated_at: string;
}

export interface JobSearchRow {
  job_id: string;
  source: string;
  external_id: string;
  company: string;
  title: string;
  location: string;
  remote_policy: string;
  jd_text: string;
  jd_url: string;
  posted_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  ingested_at: string;
  score_id: string | null;
  rubric_version: string | null;
  total: number | null;
  dim_job_family_fit: number | null;
  dim_level_fit: number | null;
  dim_career_value_fit: number | null;
  dim_compensation_fit: number | null;
  dim_company_stage_fit: number | null;
  top_reasons: string[] | null;
  rationale: string | null;
  scored_at: string | null;
  job_family: string | null;
  attr_seniority_level: string | null;
  years_required_min: number | null;
  years_required_max: number | null;
  compensation_known: boolean | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  compensation_period: string | null;
  company_stage: string | null;
  learning_signal: number | null;
  ownership_signal: number | null;
  extracted_at: string | null;
  latest_action_status: string | null;
  latest_action_created_at: string | null;
}

export interface ConnectorHealthRow {
  connector: string;
  last_success_at: string | null;
  last_error: string | null;
}

export interface GoogleTokenRow {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expiry_date: string | null;
  email_from: string | null;
  updated_at: string;
}

const DEFAULT_PROFILE_ID = "active-profile";
const GOOGLE_TOKEN_ID = "primary";

const DEFAULT_PROFILE: Omit<UserProfileRecord, "updated_at"> = {
  id: DEFAULT_PROFILE_ID,
  primary_job_family: "product_management",
  seniority_level: "mid_senior",
  years_experience_bucket: "5-7",
  compensation_floor: null,
  company_stage_preference: "no_preference",
  career_priority: "balanced",
};

let cachedClient: SupabaseClient | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function ensure<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

async function unwrap<T>(operation: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const result = await operation;
  if (result.error) {
    throw new Error(result.error.message);
  }
  return ensure(result.data, "Supabase returned no data");
}

export function getSupabase(env: CloudflareEnv): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = getRequiredEnv(env, "SUPABASE_URL");
  const serviceKey = getOptionalEnv(env, "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
  if (!serviceKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  cachedClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}

function jobCoreChanged(existing: JobRecord, next: JobIngestRecord): boolean {
  return (
    existing.company !== next.company ||
    existing.title !== next.title ||
    existing.location !== next.location ||
    existing.remote_policy !== next.remote_policy ||
    existing.jd_text !== next.jd_text ||
    existing.jd_url !== next.jd_url ||
    (existing.posted_at ?? null) !== (next.posted_at ?? null) ||
    (existing.salary_min ?? null) !== (next.salary_min ?? null) ||
    (existing.salary_max ?? null) !== (next.salary_max ?? null) ||
    (existing.salary_currency ?? null) !== (next.salary_currency ?? null) ||
    (existing.salary_period ?? null) !== (next.salary_period ?? null)
  );
}

export async function ensureActiveProfile(env: CloudflareEnv): Promise<UserProfileRecord> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("profiles").select("*").eq("id", DEFAULT_PROFILE_ID).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as UserProfileRecord;

  const payload = { ...DEFAULT_PROFILE, updated_at: nowIso() };
  return unwrap(
    supabase.from("profiles").upsert(payload, { onConflict: "id" }).select("*").single(),
  ) as Promise<UserProfileRecord>;
}

export async function saveActiveProfile(
  env: CloudflareEnv,
  payload: Omit<UserProfileRecord, "id" | "updated_at">,
): Promise<UserProfileRecord> {
  const supabase = getSupabase(env);
  return unwrap(
    supabase
      .from("profiles")
      .upsert({ id: DEFAULT_PROFILE_ID, ...payload, updated_at: nowIso() }, { onConflict: "id" })
      .select("*")
      .single(),
  ) as Promise<UserProfileRecord>;
}

export async function upsertJob(env: CloudflareEnv, payload: JobIngestRecord): Promise<{ job: JobRecord; created: boolean }> {
  const supabase = getSupabase(env);
  const { data: existing, error: existingError } = await supabase
    .from("jobs")
    .select("*")
    .eq("source", payload.source)
    .eq("external_id", payload.external_id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  const record = {
    id: existing?.id ?? crypto.randomUUID(),
    ...payload,
    salary_min: payload.salary_min ?? null,
    salary_max: payload.salary_max ?? null,
    salary_currency: payload.salary_currency ?? null,
    salary_period: payload.salary_period ?? null,
    ingested_at: nowIso(),
  };

  const job = (await unwrap(
    supabase.from("jobs").upsert(record, { onConflict: "source,external_id" }).select("*").single(),
  )) as JobRecord;

  if (existing && jobCoreChanged(existing as JobRecord, payload)) {
    const [{ error: attrError }, { error: scoreError }] = await Promise.all([
      supabase.from("job_attributes").delete().eq("job_id", job.id),
      supabase.from("fit_scores").delete().eq("job_id", job.id),
    ]);
    if (attrError) throw new Error(attrError.message);
    if (scoreError) throw new Error(scoreError.message);
  }

  return { job, created: !existing };
}

export async function batchUpsertJobs(env: CloudflareEnv, records: JobRecord[]): Promise<void> {
  const supabase = getSupabase(env);
  for (const batch of chunk(records, 200)) {
    const result = await supabase.from("jobs").upsert(batch, { onConflict: "source,external_id" });
    if (result.error) throw new Error(result.error.message);
  }
}

export async function listAllJobs(env: CloudflareEnv): Promise<JobRecord[]> {
  const supabase = getSupabase(env);
  return (await unwrap(
    supabase.from("jobs").select("*").order("ingested_at", { ascending: false }).limit(5000),
  )) as JobRecord[];
}

export async function listJobsMissingAttributes(env: CloudflareEnv): Promise<JobRecord[]> {
  const rows = await listJobSearchRows(env);
  return rows
    .filter((row) => !row.job_family)
    .map((row) => ({
      id: row.job_id,
      source: row.source,
      external_id: row.external_id,
      company: row.company,
      title: row.title,
      location: row.location,
      remote_policy: row.remote_policy,
      jd_text: row.jd_text,
      jd_url: row.jd_url,
      posted_at: row.posted_at,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      salary_currency: row.salary_currency,
      salary_period: row.salary_period,
      ingested_at: row.ingested_at,
    }));
}

export async function listUnscoredJobs(env: CloudflareEnv): Promise<JobRecord[]> {
  const rows = await listJobSearchRows(env);
  return rows
    .filter((row) => row.total === null)
    .map((row) => ({
      id: row.job_id,
      source: row.source,
      external_id: row.external_id,
      company: row.company,
      title: row.title,
      location: row.location,
      remote_policy: row.remote_policy,
      jd_text: row.jd_text,
      jd_url: row.jd_url,
      posted_at: row.posted_at,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      salary_currency: row.salary_currency,
      salary_period: row.salary_period,
      ingested_at: row.ingested_at,
    }));
}

export async function getJob(env: CloudflareEnv, jobId: string): Promise<JobRecord | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRecord | null) ?? null;
}

export async function getJobAttributes(env: CloudflareEnv, jobId: string): Promise<JobAttributeRecord | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("job_attributes").select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobAttributeRecord | null) ?? null;
}

export async function saveJobAttributes(env: CloudflareEnv, payload: JobAttributeRecord): Promise<JobAttributeRecord> {
  const supabase = getSupabase(env);
  return unwrap(
    supabase.from("job_attributes").upsert(payload, { onConflict: "job_id" }).select("*").single(),
  ) as Promise<JobAttributeRecord>;
}

export async function batchUpsertJobAttributes(env: CloudflareEnv, payloads: JobAttributeRecord[]): Promise<void> {
  const supabase = getSupabase(env);
  for (const batch of chunk(payloads, 200)) {
    const result = await supabase.from("job_attributes").upsert(batch, { onConflict: "job_id" });
    if (result.error) throw new Error(result.error.message);
  }
}

export async function getScore(env: CloudflareEnv, jobId: string): Promise<ScoreRecord | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("fit_scores").select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScoreRecord | null) ?? null;
}

export async function saveScore(
  env: CloudflareEnv,
  jobId: string,
  rubricVersion: string,
  payload: ScorePayload,
): Promise<ScoreRecord> {
  const supabase = getSupabase(env);
  return unwrap(
    supabase
      .from("fit_scores")
      .upsert(
        {
          id: crypto.randomUUID(),
          job_id: jobId,
          rubric_version: rubricVersion,
          ...payload,
          top_reasons: payload.top_reasons,
          scored_at: nowIso(),
        },
        { onConflict: "job_id" },
      )
      .select("*")
      .single(),
  ) as Promise<ScoreRecord>;
}

export async function batchUpsertScores(
  env: CloudflareEnv,
  payloads: Array<ScoreRecord>,
): Promise<void> {
  const supabase = getSupabase(env);
  for (const batch of chunk(payloads, 200)) {
    const result = await supabase.from("fit_scores").upsert(batch, { onConflict: "job_id" });
    if (result.error) throw new Error(result.error.message);
  }
}

export async function deleteDerivedForJobs(env: CloudflareEnv, jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;
  const supabase = getSupabase(env);
  for (const batch of chunk(jobIds, 200)) {
    const [attrResult, scoreResult] = await Promise.all([
      supabase.from("job_attributes").delete().in("job_id", batch),
      supabase.from("fit_scores").delete().in("job_id", batch),
    ]);
    if (attrResult.error) throw new Error(attrResult.error.message);
    if (scoreResult.error) throw new Error(scoreResult.error.message);
  }
}

export async function listActions(env: CloudflareEnv, jobId: string): Promise<ActionRecord[]> {
  const supabase = getSupabase(env);
  return (await unwrap(
    supabase.from("actions").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
  )) as ActionRecord[];
}

export async function addAction(
  env: CloudflareEnv,
  jobId: string,
  type: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<ActionRecord> {
  const supabase = getSupabase(env);
  return unwrap(
    supabase
      .from("actions")
      .insert({ id: crypto.randomUUID(), job_id: jobId, type, metadata, created_at: nowIso() })
      .select("*")
      .single(),
  ) as Promise<ActionRecord>;
}

export async function setConnectorHealth(
  env: CloudflareEnv,
  connector: string,
  payload: { last_success_at?: string | null; last_error?: string | null },
): Promise<void> {
  const supabase = getSupabase(env);
  const current = await getConnectorHealth(env, connector);
  const result = await supabase.from("connector_health").upsert(
    {
      connector,
      last_success_at: payload.last_success_at ?? current?.last_success_at ?? null,
      last_error: payload.last_error ?? null,
    },
    { onConflict: "connector" },
  );
  if (result.error) throw new Error(result.error.message);
}

export async function getConnectorHealth(env: CloudflareEnv, connector: string): Promise<ConnectorHealthRow | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("connector_health").select("*").eq("connector", connector).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConnectorHealthRow | null) ?? null;
}

export async function listConnectorHealth(env: CloudflareEnv): Promise<ConnectorHealthRow[]> {
  const supabase = getSupabase(env);
  return (await unwrap(
    supabase.from("connector_health").select("*").order("connector", { ascending: true }),
  )) as ConnectorHealthRow[];
}

export async function listJobSearchRows(env: CloudflareEnv): Promise<JobSearchRow[]> {
  const supabase = getSupabase(env);
  return (await unwrap(
    supabase.from("job_search_rows").select("*").order("ingested_at", { ascending: false }).limit(5000),
  )) as JobSearchRow[];
}

export async function saveGoogleOAuthState(env: CloudflareEnv, state: string): Promise<void> {
  const supabase = getSupabase(env);
  const { error } = await supabase.from("google_oauth_states").upsert({ state, created_at: nowIso() });
  if (error) throw new Error(error.message);
}

export async function consumeGoogleOAuthState(env: CloudflareEnv, state: string): Promise<boolean> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("google_oauth_states").select("state").eq("state", state).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const deleteResult = await supabase.from("google_oauth_states").delete().eq("state", state);
  if (deleteResult.error) throw new Error(deleteResult.error.message);
  return true;
}

export async function getGoogleToken(env: CloudflareEnv): Promise<GoogleTokenRow | null> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("google_tokens").select("*").eq("id", GOOGLE_TOKEN_ID).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GoogleTokenRow | null) ?? null;
}

export async function saveGoogleToken(
  env: CloudflareEnv,
  payload: Omit<GoogleTokenRow, "id" | "updated_at">,
): Promise<GoogleTokenRow> {
  const supabase = getSupabase(env);
  return unwrap(
    supabase
      .from("google_tokens")
      .upsert({ id: GOOGLE_TOKEN_ID, ...payload, updated_at: nowIso() }, { onConflict: "id" })
      .select("*")
      .single(),
  ) as Promise<GoogleTokenRow>;
}
