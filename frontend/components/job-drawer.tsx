"use client";

import { ExternalLink, Mail, RefreshCw, Send, Sparkles, X } from "lucide-react";

import type { JobDetail } from "@/lib/api";

type DrawerMode = "view" | "email" | "dismiss";

interface EmailFormState {
  to_email: string;
  subject: string;
  body: string;
}

interface JobDrawerProps {
  job: JobDetail | null;
  mode: DrawerMode;
  open: boolean;
  loading: boolean;
  draftLoading: boolean;
  emailForm: EmailFormState;
  dismissReason: string;
  actionLoading: string | null;
  onClose: () => void;
  onModeChange: (mode: DrawerMode) => void;
  onEmailFormChange: (field: keyof EmailFormState, value: string) => void;
  onDismissReasonChange: (value: string) => void;
  onGenerateDraft: () => void;
  onSendEmail: () => void;
  onApply: () => void;
  onSave: () => void;
  onDismiss: () => void;
}

const breakdownRows = [
  ["Role fit", "dim_role_fit", 25],
  ["Domain leverage", "dim_domain_leverage", 25],
  ["Comp and level", "dim_comp_level", 20],
  ["Company stage", "dim_company_stage", 20],
  ["Logistics", "dim_logistics", 10],
] as const;

const dismissOptions = [
  "Overqualified",
  "Wrong domain",
  "Bad comp",
  "Location",
  "Other",
];

export function JobDrawer({
  job,
  mode,
  open,
  loading,
  draftLoading,
  emailForm,
  dismissReason,
  actionLoading,
  onClose,
  onModeChange,
  onEmailFormChange,
  onDismissReasonChange,
  onGenerateDraft,
  onSendEmail,
  onApply,
  onSave,
  onDismiss,
}: JobDrawerProps) {
  return (
    <aside
      className={`fixed right-0 top-0 z-40 h-full w-full max-w-2xl transform border-l border-black/10 bg-[#fffaf4] shadow-[-24px_0_80px_rgba(15,23,42,0.12)] transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="font-ui flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-black/10 px-6 py-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Job detail</p>
            <h2 className="font-display max-w-xl text-2xl font-semibold text-slate-900">
              {job ? job.title : "Loading role"}
            </h2>
            <p className="text-sm text-slate-600">
              {job ? `${job.company} • ${job.location}` : "Fetching latest job context"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/10 p-2 text-slate-500 transition hover:border-black/20 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
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
              onClick={() => onModeChange(value as DrawerMode)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                mode === value
                  ? "bg-slate-900 text-white"
                  : "border border-black/10 bg-white text-slate-700 hover:border-black/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading || !job ? (
            <div className="space-y-4">
              <div className="h-8 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-32 animate-pulse rounded-3xl bg-slate-200" />
              <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-3xl border border-black/10 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Total score</p>
                  <p className="mt-3 text-4xl font-semibold text-slate-900">{job.score.total}</p>
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

              {mode === "view" && (
                <>
                  <div className="rounded-[28px] border border-black/10 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Gemini breakdown</p>
                        <p className="text-sm text-slate-500">
                          Rubric version {job.score.rubric_version}
                        </p>
                      </div>
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

                  <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
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
                      <p className="mt-5 text-sm leading-7 text-slate-700">{job.score.rationale}</p>
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
                    <p className="text-sm font-semibold text-slate-900">Job description</p>
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
                      {draftLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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

        <div className="border-t border-black/10 bg-white px-6 py-4">
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={actionLoading === "save"}
              className="rounded-full border border-black/10 px-4 py-3 text-sm text-slate-700 transition hover:border-black/20 hover:text-slate-900 disabled:opacity-60"
            >
              {actionLoading === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={actionLoading === "apply"}
              className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-5 py-3 text-sm text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              <ExternalLink className="h-4 w-4" />
              {actionLoading === "apply" ? "Applying..." : "Apply + follow-up"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
