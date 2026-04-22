import { getOptionalEnv } from "./env";
import type { CloudflareEnv } from "./types";
import type { JobIngestRecord } from "./supabase";

const INTEREST_KEYWORDS = [
  "product",
  "strategy",
  "operations",
  "bizops",
  "business operations",
  "chief of staff",
  "entrepreneur in residence",
  "eir",
  "general manager",
  "program manager",
];

const NOISE_KEYWORDS = [
  "recruiter",
  "sales",
  "account executive",
  "designer",
  "software engineer",
  "frontend engineer",
  "backend engineer",
  "data engineer",
  "customer success",
  "support engineer",
  "hr business partner",
  "marketing",
];

const JSEARCH_QUERIES = [
  "product management",
  "strategy and operations",
  "engineering",
  "program management",
  "business operations",
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyRemote(...segments: string[]): string {
  const text = segments.join(" ").toLowerCase();
  if (["remote", "distributed", "work from home", "anywhere"].some((keyword) => text.includes(keyword))) return "remote";
  if (["hybrid", "2 days", "3 days", "office days"].some((keyword) => text.includes(keyword))) return "hybrid";
  if (["onsite", "on-site", "relocation"].some((keyword) => text.includes(keyword))) return "onsite";
  return "unknown";
}

function parseDateTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  if (typeof value === "string") {
    const candidate = value.trim();
    if (!candidate) return null;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function matchesTargetRole(title: string, department?: string | null, description?: string | null): boolean {
  const haystack = [title, department ?? "", description ?? ""].join(" ").toLowerCase();
  const titleLower = title.toLowerCase();
  if (!INTEREST_KEYWORDS.some((keyword) => haystack.includes(keyword))) return false;
  if (NOISE_KEYWORDS.some((keyword) => titleLower.includes(keyword))) return false;
  return true;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "JobSearchAssistant/1.0",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url} with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchRemotiveJobs(): Promise<JobIngestRecord[]> {
  const payload = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>("https://remotive.com/api/remote-jobs");
  return (payload.jobs ?? [])
    .map((item) => {
      const title = String(item.title ?? "").trim();
      const description = String(item.description ?? "");
      if (!matchesTargetRole(title, String(item.category ?? ""), description)) return null;
      return {
        source: "remotive",
        external_id: String(item.id ?? ""),
        company: String(item.company_name ?? "Unknown").trim(),
        title,
        location: String(item.candidate_required_location ?? "Remote").trim(),
        remote_policy: classifyRemote(String(item.candidate_required_location ?? ""), title, description),
        jd_text: normalizeWhitespace(description),
        jd_url: String(item.url ?? "").trim(),
        posted_at: parseDateTime(item.publication_date),
      } satisfies JobIngestRecord;
    })
    .filter((item): item is JobIngestRecord => Boolean(item?.external_id));
}

export async function fetchRemoteOkJobs(): Promise<JobIngestRecord[]> {
  const payload = await fetchJson<Array<Record<string, unknown>>>("https://remoteok.com/api");
  return payload
    .map((item) => {
      if (!item || item.id === undefined) return null;
      const title = String(item.position ?? "").trim();
      const description = String(item.description ?? "");
      const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
      if (!matchesTargetRole(title, tags, description)) return null;
      return {
        source: "remoteok",
        external_id: String(item.id),
        company: String(item.company ?? "Unknown").trim(),
        title,
        location: String(item.location ?? "Remote").trim() || "Remote",
        remote_policy: classifyRemote(String(item.location ?? ""), title, description),
        jd_text: normalizeWhitespace(description),
        jd_url: String(item.url ?? item.apply_url ?? "").trim(),
        posted_at: parseDateTime(item.date ?? item.epoch),
      } satisfies JobIngestRecord;
    })
    .filter((item): item is JobIngestRecord => Boolean(item?.external_id));
}

export async function fetchJobicyJobs(): Promise<JobIngestRecord[]> {
  const payload = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>("https://jobicy.com/api/v2/remote-jobs?count=100");
  return (payload.jobs ?? [])
    .map((item) => {
      const title = String(item.jobTitle ?? "").trim();
      const description = String(item.jobDescription ?? item.jobExcerpt ?? "");
      const industry = Array.isArray(item.jobIndustry) ? item.jobIndustry.join(" ") : "";
      if (!matchesTargetRole(title, industry, description)) return null;
      return {
        source: "jobicy",
        external_id: String(item.id ?? ""),
        company: String(item.companyName ?? "Unknown").trim(),
        title,
        location: String(item.jobGeo ?? "Remote").trim() || "Remote",
        remote_policy: classifyRemote(String(item.jobGeo ?? ""), title, description),
        jd_text: normalizeWhitespace(description),
        jd_url: String(item.url ?? "").trim(),
        posted_at: parseDateTime(item.pubDate),
      } satisfies JobIngestRecord;
    })
    .filter((item): item is JobIngestRecord => Boolean(item?.external_id));
}

function buildJSearchLocation(item: Record<string, unknown>): string {
  const city = String(item.job_city ?? "").trim();
  const state = String(item.job_state ?? "").trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  if (item.job_is_remote === true) return "Remote";
  return "United States";
}

async function searchJSearch(env: CloudflareEnv, query: string, pages: number): Promise<Array<Record<string, unknown>>> {
  const apiKey = getOptionalEnv(env, "JSEARCH_API_KEY");
  if (!apiKey) throw new Error("JSEARCH_API_KEY is not configured");

  const allItems: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL("https://jsearch.p.rapidapi.com/search");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("num_pages", "1");
    url.searchParams.set("date_posted", "month");
    url.searchParams.set("country", "us");
    const response = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });
    if (!response.ok) {
      throw new Error(`JSearch query failed with status ${response.status}`);
    }
    const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const pageItems = payload.data ?? [];
    allItems.push(...pageItems);
    if (pageItems.length < 10) break;
  }
  return allItems;
}

function normalizeJSearchItems(items: Array<Record<string, unknown>>): JobIngestRecord[] {
  const seen = new Set<string>();
  const jobs: JobIngestRecord[] = [];
  for (const item of items) {
    const jobId = String(item.job_id ?? "");
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);

    const title = String(item.job_title ?? "").trim();
    const description = normalizeWhitespace(String(item.job_description ?? ""));
    if (!matchesTargetRole(title, null, description)) continue;

    const location = buildJSearchLocation(item);
    jobs.push({
      source: "jsearch",
      external_id: jobId,
      company: String(item.employer_name ?? "Unknown").trim(),
      title,
      location,
      remote_policy: item.job_is_remote === true ? "remote" : classifyRemote(location, title, description),
      jd_text: description,
      jd_url: String(item.job_apply_link ?? item.job_google_link ?? "").trim(),
      posted_at: parseDateTime(item.job_posted_at_datetime_utc),
      salary_min: typeof item.job_min_salary === "number" ? item.job_min_salary : null,
      salary_max: typeof item.job_max_salary === "number" ? item.job_max_salary : null,
      salary_currency: item.job_salary_currency ? String(item.job_salary_currency) : null,
      salary_period: item.job_salary_period ? String(item.job_salary_period) : null,
    });
  }
  return jobs;
}

export async function fetchJSearchJobs(env: CloudflareEnv): Promise<JobIngestRecord[]> {
  const items: Array<Record<string, unknown>> = [];
  for (const query of JSEARCH_QUERIES) {
    try {
      items.push(...(await searchJSearch(env, query, 1)));
    } catch {
      continue;
    }
  }
  return normalizeJSearchItems(items);
}

export async function searchJSearchOnDemand(env: CloudflareEnv, query: string): Promise<JobIngestRecord[]> {
  const items: Array<Record<string, unknown>> = [];
  for (const q of [query, `${query} jobs`]) {
    try {
      items.push(...(await searchJSearch(env, q, 1)));
    } catch {
      continue;
    }
  }
  return normalizeJSearchItems(items);
}

export async function ingestAllLiveSources(env: CloudflareEnv): Promise<
  Array<{ connector: string; pulled: number; inserted: number; updated: number; jobs: JobIngestRecord[] }>
> {
  const connectors: Array<{ name: string; load: () => Promise<JobIngestRecord[]> }> = getOptionalEnv(env, "JSEARCH_API_KEY")
    ? [{ name: "jsearch", load: () => fetchJSearchJobs(env) }]
    : [
        { name: "remotive", load: fetchRemotiveJobs },
        { name: "remoteok", load: fetchRemoteOkJobs },
        { name: "jobicy", load: fetchJobicyJobs },
      ];

  const results: Array<{ connector: string; pulled: number; inserted: number; updated: number; jobs: JobIngestRecord[] }> = [];
  for (const connector of connectors) {
    try {
      const jobs = await connector.load();
      results.push({ connector: connector.name, pulled: jobs.length, inserted: 0, updated: 0, jobs });
    } catch {
      results.push({ connector: connector.name, pulled: 0, inserted: 0, updated: 0, jobs: [] });
    }
  }
  return results;
}
