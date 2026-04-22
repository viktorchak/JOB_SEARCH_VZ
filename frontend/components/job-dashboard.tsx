"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { JobDetailPane } from "@/components/job-detail-pane";
import { JobFilterToolbar } from "@/components/job-filter-toolbar";
import { JobResultsList } from "@/components/job-results-list";
import { JobSearchHeader } from "@/components/job-search-header";
import { ToastStack, type ToastMessage } from "@/components/toast-stack";
import {
  api,
  type ActionStatus,
  type ConnectorName,
  type HealthResponse,
  type JobDetail,
  type JobSearchFilters,
  type JobListResponse,
  type JobSummary,
  type RemotePolicy,
} from "@/lib/api";

type DetailMode = "view" | "email" | "dismiss";
type JobTab = "all" | Extract<ActionStatus, "saved" | "applied" | "dismissed">;

const DISMISS_DEFAULT = "Overqualified";

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function toMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function JobDashboard() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("view");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState(DISMISS_DEFAULT);
  const [emailForm, setEmailForm] = useState({ to_email: "", subject: "", body: "" });
  const [verification, setVerification] = useState<JobListResponse["verification"] | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [query, setQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [remotePolicy, setRemotePolicy] = useState<RemotePolicy | "">("");
  const [datePostedDays, setDatePostedDays] = useState<number | null>(null);
  const [source, setSource] = useState<ConnectorName | "">("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [minScore, setMinScore] = useState(60);
  const [sort, setSort] = useState<JobSearchFilters["sort"]>("top");
  const [tab, setTab] = useState<JobTab>("all");

  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const deferredLocationQuery = useDeferredValue(locationQuery);

  const filters = useMemo<JobSearchFilters>(
    () => ({
      q: debouncedQuery,
      location: deferredLocationQuery,
      minScore,
      company: selectedCompany,
      remoteOnly: false,
      remotePolicies: remotePolicy ? [remotePolicy] : [],
      source,
      datePostedDays,
      actionStatus: tab === "all" ? "" : tab,
      sort,
    }),
    [datePostedDays, deferredLocationQuery, debouncedQuery, minScore, remotePolicy, selectedCompany, sort, source, tab],
  );

  useEffect(() => {
    void loadHealth();
  }, []);

  useEffect(() => {
    void loadJobs(filters);
  }, [filters]);

  useEffect(() => {
    if (!jobs.length) {
      setSelectedJob(null);
      setSelectedJobId(null);
      return;
    }

    const nextSelectedId =
      selectedJobId && jobs.some((job) => job.id === selectedJobId) ? selectedJobId : jobs[0].id;

    if (nextSelectedId !== selectedJobId) {
      const nextJob = jobs.find((job) => job.id === nextSelectedId);
      if (nextJob) {
        void selectJob(nextJob, "view");
      }
    }
  }, [jobs, selectedJobId]);

  async function loadHealth() {
    try {
      setHealth(await api.getHealth());
    } catch (error) {
      toast("error", toMessage(error));
    }
  }

  async function loadJobs(nextFilters: JobSearchFilters) {
    setLoadingJobs(true);
    try {
      const response = await api.getJobs(nextFilters);
      setJobs(response.items);
      setTotal(response.total);
      setCompanies(response.companies);
      setVerification(response.verification);
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setLoadingJobs(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await api.refresh();
      await Promise.all([loadJobs(filters), loadHealth()]);
      toast("success", "Refreshed live connectors and rescored unscored jobs.");
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function selectJob(job: JobSummary, mode: DetailMode = "view") {
    setSelectedJobId(job.id);
    setDetailMode(mode);
    setDetailLoading(true);
    try {
      const detail = await api.getJobDetail(job.id);
      setSelectedJob(detail);
      if (mode === "email") {
        setEmailForm((current) => ({ ...current, subject: "", body: "" }));
        await generateDraft(detail.id);
      }
      if (mode === "dismiss") {
        setDismissReason(DISMISS_DEFAULT);
      }
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshSelectedJob(jobId?: string) {
    const id = jobId ?? selectedJob?.id;
    if (!id) return;
    try {
      const detail = await api.getJobDetail(id);
      setSelectedJob(detail);
      setSelectedJobId(id);
    } catch (error) {
      toast("error", toMessage(error));
    }
  }

  async function generateDraft(jobId?: string) {
    const targetId = jobId ?? selectedJob?.id;
    if (!targetId) return;
    setDraftLoading(true);
    try {
      const draft = await api.draftEmail(targetId);
      setEmailForm((current) => ({ ...current, subject: draft.subject, body: draft.body }));
      toast("success", "Generated a fresh referral draft.");
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setDraftLoading(false);
    }
  }

  async function connectGoogle() {
    try {
      const response = await api.getGoogleAuthUrl();
      window.open(response.authorization_url, "_blank", "noopener,noreferrer");
      toast("success", "Opened Google OAuth in a new tab.");
    } catch (error) {
      toast("error", toMessage(error));
    }
  }

  async function handleApply(job: JobSummary | JobDetail) {
    setActionLoading("apply");
    window.open(job.jd_url, "_blank", "noopener,noreferrer");
    try {
      await api.apply(job.id);
      toast("success", "Opened the job page and scheduled a follow-up event.");
      if (selectedJobId === job.id) {
        await refreshSelectedJob(job.id);
      }
      await loadJobs(filters);
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSave(job: JobSummary | JobDetail) {
    setActionLoading("save");
    try {
      await api.save(job.id);
      toast("success", "Saved this role to the action history.");
      if (selectedJobId === job.id) {
        await refreshSelectedJob(job.id);
      }
      await loadJobs(filters);
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDismiss(job: JobSummary | JobDetail) {
    setActionLoading("dismiss");
    try {
      await api.dismiss(job.id, dismissReason);
      toast("success", "Dismiss reason captured.");
      await refreshSelectedJob(job.id);
      await loadJobs(filters);
      setDetailMode("view");
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendEmail() {
    if (!selectedJob) return;
    if (!emailForm.to_email || !emailForm.subject || !emailForm.body) {
      toast("error", "Recipient, subject, and body are required before sending.");
      return;
    }
    setActionLoading("email");
    try {
      await api.sendEmail(selectedJob.id, emailForm);
      toast("success", "Referral email sent and follow-up event created.");
      await refreshSelectedJob(selectedJob.id);
      await loadHealth();
      await loadJobs(filters);
      setDetailMode("view");
    } catch (error) {
      toast("error", toMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  function clearSearch() {
    setQuery("");
    setLocationQuery("");
  }

  function clearFilter(key: "remote" | "date" | "source" | "company" | "score" | "tab") {
    if (key === "remote") setRemotePolicy("");
    if (key === "date") setDatePostedDays(null);
    if (key === "source") setSource("");
    if (key === "company") setSelectedCompany("");
    if (key === "score") setMinScore(0);
    if (key === "tab") setTab("all");
  }

  function toast(tone: ToastMessage["tone"], message: string) {
    setToasts((current) => [...current, { id: Date.now() + Math.random(), tone, message }]);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  const googleConfigured = Boolean(health?.google.configured);
  const googleAuthenticated = Boolean(health?.google.authenticated);

  return (
    <>
      <main className="relative min-h-screen overflow-hidden px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[36px] border border-black/10 bg-[rgba(255,255,255,0.74)] p-5 shadow-[0_28px_120px_rgba(15,23,42,0.1)] backdrop-blur md:p-7">
            <JobSearchHeader
              q={query}
              location={locationQuery}
              googleConfigured={googleConfigured}
              googleAuthenticated={googleAuthenticated}
              refreshing={refreshing}
              connectors={health?.connectors ?? []}
              onQueryChange={setQuery}
              onLocationChange={setLocationQuery}
              onClearSearch={clearSearch}
              onConnectGoogle={connectGoogle}
              onRefresh={refreshAll}
              formatDateTime={formatDateTime}
            />

            <div className="mt-6">
              <JobFilterToolbar
                remotePolicy={remotePolicy}
                datePostedDays={datePostedDays}
                source={source}
                company={selectedCompany}
                minScore={minScore}
                sort={sort}
                tab={tab}
                companies={companies}
                verification={verification}
                onRemotePolicyChange={setRemotePolicy}
                onDatePostedDaysChange={setDatePostedDays}
                onSourceChange={setSource}
                onCompanyChange={setSelectedCompany}
                onMinScoreChange={setMinScore}
                onSortChange={setSort}
                onTabChange={setTab}
                onClearFilter={clearFilter}
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.9fr)]">
              <JobResultsList
                jobs={jobs}
                total={total}
                loading={loadingJobs}
                selectedJobId={selectedJobId}
                onSelectJob={selectJob}
                onApply={handleApply}
                onSave={handleSave}
                formatDate={formatDate}
              />

              <JobDetailPane
                job={selectedJob}
                mode={detailMode}
                loading={detailLoading}
                draftLoading={draftLoading}
                emailForm={emailForm}
                dismissReason={dismissReason}
                actionLoading={actionLoading}
                onModeChange={setDetailMode}
                onEmailFormChange={(field, value) =>
                  setEmailForm((current) => ({ ...current, [field]: value }))
                }
                onDismissReasonChange={setDismissReason}
                onGenerateDraft={() => void generateDraft()}
                onSendEmail={() => void handleSendEmail()}
                onApply={() => {
                  if (selectedJob) void handleApply(selectedJob);
                }}
                onSave={() => {
                  if (selectedJob) void handleSave(selectedJob);
                }}
                onDismiss={() => {
                  if (selectedJob) void handleDismiss(selectedJob);
                }}
              />
            </div>
          </div>
        </div>
      </main>

      <ToastStack items={toasts} onDismiss={dismissToast} />
    </>
  );
}
