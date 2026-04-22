"use client";

import type { ReactNode } from "react";
import { BookmarkPlus, ExternalLink, Mail, Sparkles, XCircle } from "lucide-react";

import { ScoreBadge } from "@/components/score-badge";
import type { JobFamily, JobSummary } from "@/lib/api";

type DetailMode = "view" | "email" | "dismiss";

interface JobResultsListProps {
  jobs: JobSummary[];
  total: number;
  loading: boolean;
  hasSyncedJobs: boolean;
  profileIsDefault: boolean;
  hasActiveSearch: boolean;
  hasActiveFilters: boolean;
  selectedJobId: string | null;
  onSelectJob: (job: JobSummary, mode?: DetailMode) => Promise<void>;
  onApply: (job: JobSummary) => Promise<void>;
  onSave: (job: JobSummary) => Promise<void>;
  onRefresh: () => Promise<void>;
  onFocusProfile: () => void;
  formatDate: (value: string | null) => string;
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-ui inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-black/20 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function familyLabel(value: JobFamily) {
  const labels: Record<JobFamily, string> = {
    product_management: "Product",
    strategy_operations: "Strategy & Ops",
    engineering: "Engineering",
    program_management: "Program Mgmt",
    business_operations: "BizOps",
    partnerships_bd: "Partnerships",
    data_analytics: "Data / Analytics",
    design: "Design",
    sales_gtm: "Sales / GTM",
    non_technical_other: "Other",
    unknown: "Unknown",
  };
  return labels[value];
}

function compensationSnippet(job: JobSummary) {
  if (!job.attributes.compensation_known) return "Comp unknown";
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const min = job.attributes.compensation_min ? formatter.format(job.attributes.compensation_min) : null;
  const max = job.attributes.compensation_max ? formatter.format(job.attributes.compensation_max) : null;
  return min && max ? `${min} - ${max}` : min ?? max ?? "Comp unknown";
}

export function JobResultsList({
  jobs,
  total,
  loading,
  hasSyncedJobs,
  profileIsDefault,
  hasActiveSearch,
  hasActiveFilters,
  selectedJobId,
  onSelectJob,
  onApply,
  onSave,
  onRefresh,
  onFocusProfile,
  formatDate,
}: JobResultsListProps) {
  const showFirstRunEmpty = !loading && !jobs.length && !hasSyncedJobs;
  const showFilteredEmpty = !loading && !jobs.length && (hasActiveSearch || hasActiveFilters);
  const showProfileEmpty = !loading && !jobs.length && hasSyncedJobs && profileIsDefault;

  return (
    <section className="rounded-[32px] border border-black/10 bg-white/85 p-4 backdrop-blur">
      <div className="mb-4 flex items-center justify-between border-b border-black/10 pb-4">
        <div>
          <p className="font-ui text-xs uppercase tracking-[0.32em] text-slate-500">Jobs</p>
          <p className="font-ui mt-2 text-sm text-slate-600">
            {loading ? "Loading results..." : `${total} matches`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[28px] border border-black/5 bg-slate-50 p-5">
              <div className="mb-4 h-5 w-24 rounded-full bg-slate-200" />
              <div className="h-5 w-2/3 rounded-full bg-slate-200" />
              <div className="mt-3 h-4 w-1/3 rounded-full bg-slate-200" />
              <div className="mt-5 h-20 rounded-[24px] bg-slate-100" />
            </div>
          ))}
        </div>
      ) : jobs.length ? (
        <div className="space-y-3">
          {jobs.map((job) => {
            const active = selectedJobId === job.id;
            return (
              <article
                key={job.id}
                onClick={() => void onSelectJob(job, "view")}
                className={`cursor-pointer rounded-[28px] border p-5 transition ${
                  active
                    ? "border-teal-200 bg-[#f7f4ee] shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                    : "border-black/8 bg-white hover:border-black/12 hover:bg-[#fbf8f2]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex items-center gap-3">
                      <ScoreBadge score={job.score.total} />
                      <span className="font-ui rounded-full bg-slate-100 px-3 py-1 text-xs capitalize text-slate-600">
                        {familyLabel(job.attributes.job_family)}
                      </span>
                      <span className="font-ui rounded-full bg-teal-50 px-3 py-1 text-xs capitalize text-teal-900">
                        {job.remote_policy}
                      </span>
                    </div>

                    <h2 className="font-ui truncate text-lg font-semibold text-slate-950">
                      {job.title}
                    </h2>
                    <p className="font-ui mt-1 text-sm text-slate-600">
                      {job.company} • {job.location}
                    </p>
                    <p className="font-ui mt-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                      {job.source} • {compensationSnippet(job)}
                    </p>
                    <p className="font-display mt-4 line-clamp-3 text-[15px] leading-7 text-slate-700">
                      {job.score.top_reasons[0]}
                    </p>
                  </div>

                  <div className="font-ui shrink-0 text-right text-sm text-slate-500">
                    <p>{formatDate(job.posted_at)}</p>
                    <p className="mt-2 capitalize">{job.latest_action_status}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  <ActionButton onClick={() => void onApply(job)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Apply
                  </ActionButton>
                  <ActionButton onClick={() => void onSelectJob(job, "email")}>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </ActionButton>
                  <ActionButton onClick={() => void onSave(job)}>
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Save
                  </ActionButton>
                  <ActionButton onClick={() => void onSelectJob(job, "dismiss")}>
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss
                  </ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      ) : showFirstRunEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] bg-[#f7f4ee] px-6 py-20 text-center">
          <div className="rounded-full bg-teal-50 p-4">
            <Sparkles className="h-6 w-6 text-teal-800" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-slate-950">
            Run your first live sync
          </h2>
          <p className="font-ui mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Save your profile, then pull the current JSearch corpus into Supabase. After that, the list
            will fill with ranked jobs and live search will expand it on demand.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onFocusProfile}
              className="font-ui rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-slate-800 transition hover:border-black/20"
            >
              Review profile
            </button>
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="font-ui rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800"
            >
              Sync live jobs
            </button>
          </div>
        </div>
      ) : showProfileEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] bg-[#f7f4ee] px-6 py-20 text-center">
          <div className="rounded-full bg-amber-50 p-4">
            <Sparkles className="h-6 w-6 text-amber-800" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-slate-950">
            Personalize ranking before filtering hard
          </h2>
          <p className="font-ui mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Jobs have synced, but the current ranking still uses the starter profile. Save your job family,
            level, and career priority so the list reflects your actual search.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onFocusProfile}
              className="font-ui rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800"
            >
              Complete profile
            </button>
          </div>
        </div>
      ) : showFilteredEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] bg-[#f7f4ee] px-6 py-20 text-center">
          <div className="rounded-full bg-teal-50 p-4">
            <Sparkles className="h-6 w-6 text-teal-800" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-slate-950">
            No jobs match this search
          </h2>
          <p className="font-ui mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Adjust the query, remove a filter chip, or lower the match score threshold.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-[28px] bg-[#f7f4ee] px-6 py-20 text-center">
          <div className="rounded-full bg-teal-50 p-4">
            <Sparkles className="h-6 w-6 text-teal-800" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-slate-950">
            No ranked jobs yet
          </h2>
          <p className="font-ui mt-3 max-w-xl text-sm leading-7 text-slate-600">
            The live corpus is available, but there are no scored rows matching the current view yet. Run a
            refresh or search a company directly to pull targeted live jobs.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="font-ui rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800"
            >
              Refresh jobs
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
