export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unknown";
export type ActionType = "applied" | "emailed" | "dismissed" | "saved";
export type ActionStatus = ActionType | "unreviewed";
export type ConnectorName = "remotive" | "remoteok" | "jobicy" | "jsearch" | "greenhouse" | "lever" | "leena";

export interface ScoreRecord {
  id: string;
  job_id: string;
  rubric_version: string;
  total: number;
  dim_role_fit: number;
  dim_domain_leverage: number;
  dim_comp_level: number;
  dim_company_stage: number;
  dim_logistics: number;
  top_reasons: string[];
  rationale: string;
  scored_at: string;
}

export interface JobSummary {
  id: string;
  source: ConnectorName;
  company: string;
  title: string;
  location: string;
  remote_policy: RemotePolicy;
  jd_url: string;
  posted_at: string | null;
  ingested_at: string;
  latest_action_status: ActionStatus;
  score: ScoreRecord;
}

export interface ActionRecord {
  id: string;
  job_id: string;
  type: ActionType;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface JobDetail extends JobSummary {
  jd_text: string;
  actions: ActionRecord[];
}

export interface ConnectorStatus {
  connector: ConnectorName;
  last_success_at: string | null;
  last_error: string | null;
}

export interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  token_path: string | null;
}

export interface HealthResponse {
  connectors: ConnectorStatus[];
  google: GoogleAuthStatus;
}

export interface JobListResponse {
  items: JobSummary[];
  total: number;
  companies: string[];
  verification: {
    leena_eir_present: boolean;
    matched_job_id: string | null;
    matched_source: string | null;
    matched_title: string | null;
    matched_company: string | null;
  };
}

export interface JobSearchFilters {
  q: string;
  location: string;
  minScore: number;
  company: string;
  remoteOnly: boolean;
  remotePolicies: RemotePolicy[];
  source: ConnectorName | "";
  datePostedDays: number | null;
  actionStatus: ActionStatus | "";
  sort: "top" | "relevance" | "newest" | "recent" | "company";
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface ApplyActionResponse {
  action: ActionRecord;
  calendar_event_id?: string | null;
  calendar_event_url?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getHealth: () => request<HealthResponse>("/health"),
  getJobs: (filters: JobSearchFilters) => {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.location.trim()) params.set("location", filters.location.trim());
    if (filters.minScore > 0) params.set("min_score", String(filters.minScore));
    if (filters.company) params.set("company", filters.company);
    if (filters.remoteOnly) params.set("remote", "true");
    filters.remotePolicies.forEach((policy) => params.append("remote_policy", policy));
    if (filters.source) params.append("source", filters.source);
    if (filters.datePostedDays) params.set("date_posted_days", String(filters.datePostedDays));
    if (filters.actionStatus) params.append("action_status", filters.actionStatus);
    if (filters.sort) params.set("sort", filters.sort);
    const query = params.toString();
    return request<JobListResponse>(`/jobs${query ? `?${query}` : ""}`);
  },
  getJobDetail: (jobId: string) => request<JobDetail>(`/jobs/${jobId}`),
  refresh: async () => {
    await request("/ingest", { method: "POST" });
    await request("/score", { method: "POST" });
  },
  draftEmail: (jobId: string) => request<EmailDraft>(`/jobs/${jobId}/draft-email`, { method: "POST" }),
  apply: (jobId: string) => request<ApplyActionResponse>(`/jobs/${jobId}/actions/apply`, { method: "POST" }),
  save: (jobId: string) => request<{ action: ActionRecord }>(`/jobs/${jobId}/actions/save`, { method: "POST" }),
  dismiss: (jobId: string, reason: string) =>
    request<{ action: ActionRecord }>(`/jobs/${jobId}/actions/dismiss`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  sendEmail: (jobId: string, payload: { to_email: string; subject: string; body: string }) =>
    request<ApplyActionResponse>(`/jobs/${jobId}/actions/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getGoogleAuthUrl: () => request<{ authorization_url: string }>("/auth/google/start"),
};
