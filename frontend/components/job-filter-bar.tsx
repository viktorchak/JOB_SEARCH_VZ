"use client";

import type { JobListResponse } from "@/lib/api";

interface JobFilterBarProps {
  minScore: number;
  selectedCompany: string;
  remoteOnly: boolean;
  companies: string[];
  verification: JobListResponse["verification"] | null;
  onMinScoreChange: (value: number) => void;
  onCompanyChange: (value: string) => void;
  onRemoteOnlyChange: (value: boolean) => void;
}

export function JobFilterBar({
  minScore,
  selectedCompany,
  remoteOnly,
  companies,
  verification,
  onMinScoreChange,
  onCompanyChange,
  onRemoteOnlyChange,
}: JobFilterBarProps) {
  return (
    <section className="mt-6 grid gap-4 rounded-[32px] border border-black/10 bg-white/80 p-5 md:grid-cols-[1fr_220px_160px] md:items-end">
      <div className="md:col-span-3 rounded-[28px] border border-black/10 bg-[#f7f4ee] px-4 py-4">
        <p className="font-ui text-sm font-semibold text-slate-900">Leena verification</p>
        <p className="font-ui mt-2 text-sm leading-6 text-slate-700">
          {verification?.leena_eir_present
            ? `A Leena EIR match is present in the scored corpus from ${verification.matched_source}.`
            : "No Leena EIR match is present in the current scored corpus from the public API feeds."}
        </p>
      </div>

      <label className="block">
        <span className="font-ui text-xs uppercase tracking-[0.28em] text-slate-500">
          Min score
        </span>
        <div className="mt-4 flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(event) => onMinScoreChange(Number(event.target.value))}
            className="w-full accent-teal-700"
          />
          <span className="font-ui rounded-full bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900">
            {minScore}
          </span>
        </div>
      </label>

      <label className="block">
        <span className="font-ui text-xs uppercase tracking-[0.28em] text-slate-500">
          Company
        </span>
        <select
          value={selectedCompany}
          onChange={(event) => onCompanyChange(event.target.value)}
          className="font-ui mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-700"
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>
      </label>

      <label className="font-ui flex h-fit items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={remoteOnly}
          onChange={(event) => onRemoteOnlyChange(event.target.checked)}
          className="h-4 w-4 accent-teal-700"
        />
        Remote only
      </label>
    </section>
  );
}
