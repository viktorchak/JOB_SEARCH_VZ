"use client";

import type { ReactNode } from "react";
import { BookmarkPlus, ExternalLink, Mail, RefreshCw, Sparkles, XCircle } from "lucide-react";

import { ScoreBadge } from "@/components/score-badge";
import type { JobSummary } from "@/lib/api";

type DrawerMode = "view" | "email" | "dismiss";

interface JobTableProps {
  jobs: JobSummary[];
  loading: boolean;
  onOpenJob: (job: JobSummary, mode?: DrawerMode) => Promise<void>;
  onApply: (job: JobSummary) => Promise<void>;
  onSave: (job: JobSummary) => Promise<void>;
  onRefresh: () => Promise<void>;
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

export function JobTable({
  jobs,
  loading,
  onOpenJob,
  onApply,
  onSave,
  onRefresh,
  formatDate,
}: JobTableProps) {
  return (
    <section className="mt-6 overflow-hidden rounded-[32px] border border-black/10 bg-white">
      <div className="font-ui grid grid-cols-[110px_1.1fr_1.1fr_160px_110px_260px] gap-4 border-b border-black/10 px-5 py-4 text-xs uppercase tracking-[0.3em] text-slate-500">
        <span>Score</span>
        <span>Company</span>
        <span>Title</span>
        <span>Location</span>
        <span>Posted</span>
        <span>Actions</span>
      </div>

      {loading ? (
        <div className="divide-y divide-black/5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[110px_1.1fr_1.1fr_160px_110px_260px] gap-4 px-5 py-4"
            >
              {Array.from({ length: 6 }).map((__, cell) => (
                <div key={cell} className="h-10 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ))}
        </div>
      ) : jobs.length ? (
        <div className="divide-y divide-black/5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="grid cursor-pointer grid-cols-[110px_1.1fr_1.1fr_160px_110px_260px] gap-4 px-5 py-4 transition hover:bg-[#f8f5ef]"
              onClick={() => void onOpenJob(job, "view")}
            >
              <div>
                <ScoreBadge score={job.score.total} />
              </div>
              <div className="min-w-0">
                <p className="font-ui truncate text-sm font-medium text-slate-950">{job.company}</p>
                <p className="font-ui mt-1 text-sm capitalize text-slate-500">{job.source}</p>
              </div>
              <div className="min-w-0">
                <p className="font-ui truncate text-sm font-medium text-slate-950">{job.title}</p>
                <p className="font-ui mt-1 text-sm text-slate-500">{job.score.top_reasons[0]}</p>
              </div>
              <div className="font-ui text-sm text-slate-700">
                <p>{job.location}</p>
                <p className="mt-1 capitalize text-slate-500">{job.remote_policy}</p>
              </div>
              <div className="font-ui text-sm text-slate-700">{formatDate(job.posted_at)}</div>
              <div
                className="flex flex-wrap items-center gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                <ActionButton onClick={() => void onApply(job)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Apply
                </ActionButton>
                <ActionButton onClick={() => void onOpenJob(job, "email")}>
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </ActionButton>
                <ActionButton onClick={() => void onSave(job)}>
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Save
                </ActionButton>
                <ActionButton onClick={() => void onOpenJob(job, "dismiss")}>
                  <XCircle className="h-3.5 w-3.5" />
                  Dismiss
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="rounded-full bg-teal-50 p-4">
            <Sparkles className="h-6 w-6 text-teal-800" />
          </div>
          <h2 className="font-display mt-5 text-2xl font-semibold text-slate-950">
            No jobs match these filters
          </h2>
          <p className="font-ui mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Loosen the score threshold, remove the company filter, or hit Refresh to pull the
            latest live roles from Remotive, Remote OK, and Jobicy.
          </p>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="font-ui mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </button>
        </div>
      )}
    </section>
  );
}
