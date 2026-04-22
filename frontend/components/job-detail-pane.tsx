"use client";

import { ExternalLink, Mail, RefreshCw, Send, Sparkles } from "lucide-react";

import { ScoreBadge } from "@/components/score-badge";
import type { CompanyStage, JobDetail, JobFamily, SeniorityLevel } from "@/lib/api";

type DetailMode = "view" | "email" | "dismiss";

interface EmailFormState {
  to_email: string;
  subject: string;
  body: string;
}

interface JobDetailPaneProps {
  job: JobDetail | null;
  mode: DetailMode;
  loading: boolean;
  draftLoading: boolean;
  emailForm: EmailFormState;
  dismissReason: string;
  actionLoading: string | null;
  onModeChange: (mode: DetailMode) => void;
  onEmailFormChange: (field: keyof EmailFormState, value: string) => void;
  onDismissReasonChange: (value: string) => void;
  onGenerateDraft: () => void;
  onSendEmail: () => void;
  onApply: () => void;
  onSave: () => void;
  onDismiss: () => void;
}

const breakdownRows = [
  ["Job family fit", "dim_job_family_fit", 40],
  ["Level fit", "dim_level_fit", 25],
  ["Career value fit", "dim_career_value_fit", 15],
  ["Compensation fit", "dim_compensation_fit", 10],
  ["Company stage fit", "dim_company_stage_fit", 10],
] as const;

const dismissOptions = ["Overqualified", "Wrong domain", "Bad comp", "Location", "Other"];

function familyLabel(value: JobFamily) {
  const labels: Record<JobFamily, string> = {
    product_management: "Product Management",
    strategy_operations: "Strategy & Operations",
    engineering: "Engineering",
    program_management: "Program Management",
    business_operations: "Business Operations",
    partnerships_bd: "Partnerships / BD",
    data_analytics: "Data / Analytics",
    design: "Design",
    sales_gtm: "Sales / GTM",
    non_technical_other: "Non-technical / Other",
    unknown: "Unknown",
  };
  return labels[value];
}

function seniorityLabel(value: SeniorityLevel) {
  const labels: Record<SeniorityLevel, string> = {
    internship: "Internship",
    entry_level: "Entry level",
    associate: "Associate",
    mid_senior: "Mid-Senior",
    director: "Director",
    executive: "Executive",
    unknown: "Unknown",
  };
  return labels[value];
}

function stageLabel(value: CompanyStage) {
  const labels: Record<CompanyStage, string> = {
    startup: "Startup",
    growth: "Growth",
    late_stage: "Late-stage",
    public: "Public",
    unknown: "Unknown",
  };
  return labels[value];
}

function compensationLabel(job: JobDetail) {
  const { compensation_known, compensation_min, compensation_max, compensation_period } = job.attributes;
  if (!compensation_known) return "Unknown";
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const min = compensation_min ? formatter.format(compensation_min) : null;
  const max = compensation_max ? formatter.format(compensation_max) : null;
  const suffix = compensation_period === "hour" ? "/hr" : "/yr";
  if (min && max) return `${min} - ${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

export function JobDetailPane({
  job,
  mode,
  loading,
  draftLoading,
  emailForm,
  dismissReason,
  actionLoading,
  onModeChange,
  onEmailFormChange,
  onDismissReasonChange,
  onGenerateDraft,
  onSendEmail,
  onApply,
  onSave,
  onDismiss,
}: JobDetailPaneProps) {
  return (
    <section className="rounded-[32px] border border-black/10 bg-[#fffaf4] p-4 shadow-[0_18px_70px_rgba(15,23,42,0.08)] lg:sticky lg:top-6">
      <div className="font-ui rounded-[28px] border border-black/10 bg-white/80">
        <div className="border-b border-black/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Selected job</p>
          <h2 className="font-display mt-3 text-2xl font-semibold text-slate-950">
            {job ? job.title : "Choose a job to inspect"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {job ? `${job.company} • ${job.location}` : "Search results stay on the left while details stay here."}
          </p>
        </div>

        <div className="flex gap-2 border-b border-black/10 px-6 py-4">
          {[
            ["view", "Overview"],
            ["email", "Email referral"],
            ["dismiss", "Dismiss"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value as DetailMode)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                mode === value
                  ? "bg-slate-950 text-white"
                  : "border border-black/10 bg-white text-slate-700 hover:border-black/20 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-6 py-6">
          {loading || !job ? (
            <div className="space-y-4">
              <div className="h-8 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-32 animate-pulse rounded-3xl bg-slate-200" />
              <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
            </div>
          ) : (
            <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Match</p>
                  <div className="mt-3">
                    <ScoreBadge score={job.score.total} large />
                  </div>
                </div>
                <div className="rounded-3xl border border-black/10 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Remote policy</p>
                  <p className="mt-3 text-xl font-semibold capitalize text-slate-900">
                    {job.remote_policy}
                  </p>
                </div>
                <div className="rounded-3xl border border-black/10 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Source</p>
                  <p className="mt-3 text-xl font-semibold capitalize text-slate-900">{job.source}</p>
                </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Job family</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {familyLabel(job.attributes.job_family)}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Seniority</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {seniorityLabel(job.attributes.seniority_level)}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Years required</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {job.attributes.years_required_min !== null
                        ? `${job.attributes.years_required_min}-${job.attributes.years_required_max ?? job.attributes.years_required_min}`
                        : "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Compensation</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{compensationLabel(job)}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Company stage</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {stageLabel(job.attributes.company_stage)}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Career signals</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      Learning {Math.round(job.attributes.learning_signal)}/10 • Ownership {Math.round(job.attributes.ownership_signal)}/10
                    </p>
                  </div>
                </div>

              {mode === "view" && (
                <>
                  <div className="rounded-[28px] border border-black/10 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Why this matches you</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Rubric version {job.score.rubric_version}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={onSave}
                          disabled={actionLoading === "save"}
                          className="rounded-full border border-black/10 px-4 py-2 text-sm text-slate-700 transition hover:border-black/20 hover:text-slate-900 disabled:opacity-60"
                        >
                          {actionLoading === "save" ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={onApply}
                          disabled={actionLoading === "apply"}
                          className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-5 py-2 text-sm text-white transition hover:bg-teal-800 disabled:opacity-60"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {actionLoading === "apply" ? "Applying..." : "Apply + follow-up"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      {breakdownRows.map(([label, key, max]) => {
                        const value = job.score[key];
                        return (
                          <div key={key}>
                            <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
                              <span>{label}</span>
                              <span>
                                {value} / {max}
                              </span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100">
                              <div
                                className="h-3 rounded-full bg-[linear-gradient(90deg,#0f766e,#14532d)]"
                                style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[28px] border border-black/10 bg-white p-5">
                      <div className="flex items-center gap-2 text-slate-900">
                        <Sparkles className="h-4 w-4 text-teal-700" />
                        <p className="text-sm font-semibold">Top reasons</p>
                      </div>
                      <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                        {job.score.top_reasons.map((reason) => (
                          <li key={reason} className="rounded-2xl bg-teal-50 px-4 py-3">
                            {reason}
                          </li>
                        ))}
                      </ul>
                      <p className="font-display mt-5 text-[15px] leading-7 text-slate-700">
                        {job.score.rationale}
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-black/10 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Action history</p>
                      <div className="mt-4 space-y-3">
                        {job.actions.length ? (
                          job.actions.map((action) => (
                            <div key={action.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                              <p className="text-sm font-medium capitalize text-slate-900">{action.type}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {new Date(action.created_at).toLocaleString()}
                              </p>
                              {Object.keys(action.metadata).length > 0 && (
                                <p className="mt-2 text-sm text-slate-600">
                                  {Object.entries(action.metadata)
                                    .map(([key, value]) => `${key}: ${String(value)}`)
                                    .join(" • ")}
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            No actions logged yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-black/10 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Job description</p>
                      <a
                        href={job.jd_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-slate-700 transition hover:border-black/20 hover:text-slate-900"
                      >
                        Open JD
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <div className="font-display mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {job.jd_text}
                    </div>
                  </div>
                </>
              )}

              {mode === "email" && (
                <div className="space-y-5 rounded-[28px] border border-black/10 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-900">
                      <Mail className="h-4 w-4 text-teal-700" />
                      <p className="text-sm font-semibold">Referral email draft</p>
                    </div>
                    <button
                      type="button"
                      onClick={onGenerateDraft}
                      disabled={draftLoading}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-slate-700 transition hover:border-black/20 hover:text-slate-900 disabled:opacity-60"
                    >
                      {draftLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {draftLoading ? "Generating..." : "Generate draft"}
                    </button>
                  </div>

                  <label className="block text-sm text-slate-700">
                    Recipient email
                    <input
                      value={emailForm.to_email}
                      onChange={(event) => onEmailFormChange("to_email", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                      placeholder="referrer@company.com"
                    />
                  </label>

                  <label className="block text-sm text-slate-700">
                    Subject
                    <input
                      value={emailForm.subject}
                      onChange={(event) => onEmailFormChange("subject", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                    />
                  </label>

                  <label className="block text-sm text-slate-700">
                    Body
                    <textarea
                      value={emailForm.body}
                      onChange={(event) => onEmailFormChange("body", event.target.value)}
                      rows={14}
                      className="mt-2 w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onSendEmail}
                      disabled={actionLoading === "email"}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {actionLoading === "email" ? "Sending..." : "Send via Gmail"}
                    </button>
                  </div>
                </div>
              )}

              {mode === "dismiss" && (
                <div className="space-y-5 rounded-[28px] border border-black/10 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">Dismiss this role</p>
                  <p className="text-sm leading-6 text-slate-600">
                    Capture the reason so the dashboard keeps a clean trail of why this opportunity
                    is out of scope.
                  </p>
                  <label className="block text-sm text-slate-700">
                    Reason
                    <select
                      value={dismissReason}
                      onChange={(event) => onDismissReasonChange(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-teal-700"
                    >
                      {dismissOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onDismiss}
                      disabled={actionLoading === "dismiss"}
                      className="rounded-full bg-[#c2410c] px-5 py-3 text-sm text-white transition hover:bg-[#9a3412] disabled:opacity-60"
                    >
                      {actionLoading === "dismiss" ? "Saving..." : "Confirm dismiss"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
