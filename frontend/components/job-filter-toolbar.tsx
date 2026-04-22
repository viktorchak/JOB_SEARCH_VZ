"use client";

import { useState, type ReactNode } from "react";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";

import type { ActionStatus, CompanyStage, JobListResponse, ProfileSeniority, RemotePolicy } from "@/lib/api";

interface JobFilterToolbarProps {
  location: string;
  remotePolicy: RemotePolicy | "";
  datePostedDays: number | null;
  minScore: number;
  sort: "top" | "relevance" | "newest" | "recent";
  tab: "all" | Extract<ActionStatus, "saved" | "applied" | "dismissed">;
  verification: JobListResponse["verification"] | null;
  maxYearsRequired: number | null;
  minCompensation: number | null;
  seniorityLevel: ProfileSeniority | "";
  companyStage: Exclude<CompanyStage, "unknown"> | "";
  hideUnknownCompensation: boolean;
  onLocationChange: (value: string) => void;
  onRemotePolicyChange: (value: RemotePolicy | "") => void;
  onDatePostedDaysChange: (value: number | null) => void;
  onMinScoreChange: (value: number) => void;
  onSortChange: (value: "top" | "relevance" | "newest" | "recent") => void;
  onTabChange: (value: "all" | Extract<ActionStatus, "saved" | "applied" | "dismissed">) => void;
  onMaxYearsRequiredChange: (value: number | null) => void;
  onMinCompensationChange: (value: number | null) => void;
  onSeniorityLevelChange: (value: ProfileSeniority | "") => void;
  onCompanyStageChange: (value: Exclude<CompanyStage, "unknown"> | "") => void;
  onHideUnknownCompensationChange: (value: boolean) => void;
  onClearFilter: (key: "date" | "score" | "tab" | "hard") => void;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="font-ui inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-slate-700">
      <span className="mr-2 text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent pr-6 text-sm text-slate-900 outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function JobFilterToolbar({
  location,
  remotePolicy,
  datePostedDays,
  minScore,
  sort,
  tab,
  verification,
  maxYearsRequired,
  minCompensation,
  seniorityLevel,
  companyStage,
  hideUnknownCompensation,
  onLocationChange,
  onRemotePolicyChange,
  onDatePostedDaysChange,
  onMinScoreChange,
  onSortChange,
  onTabChange,
  onMaxYearsRequiredChange,
  onMinCompensationChange,
  onSeniorityLevelChange,
  onCompanyStageChange,
  onHideUnknownCompensationChange,
  onClearFilter,
}: JobFilterToolbarProps) {
  const [hardFiltersOpen, setHardFiltersOpen] = useState(false);

  const hardFilterCount = [
    location,
    remotePolicy,
    maxYearsRequired !== null ? String(maxYearsRequired) : "",
    minCompensation !== null ? String(minCompensation) : "",
    seniorityLevel,
    companyStage,
    hideUnknownCompensation ? "true" : "",
  ].filter(Boolean).length;

  const activeFilters = [
    datePostedDays ? { key: "date" as const, label: `Past ${datePostedDays} days` } : null,
    minScore > 0 ? { key: "score" as const, label: `Score ${minScore}+` } : null,
    hardFilterCount ? { key: "hard" as const, label: `Hard filters ${hardFilterCount}` } : null,
    tab !== "all" ? { key: "tab" as const, label: tab } : null,
  ].filter(Boolean) as Array<{ key: "date" | "score" | "tab" | "hard"; label: string }>;

  return (
    <div className="space-y-4">
      <section className="rounded-[32px] border border-black/10 bg-white/80 p-5 backdrop-blur">
        <div className="rounded-[24px] border border-black/10 bg-[#f7f4ee] px-4 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="rounded-full bg-white p-2 text-teal-800">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-ui text-sm font-semibold text-slate-900">Leena verification</p>
              <p className="font-ui mt-1 text-sm leading-6 text-slate-700">
                {verification?.leena_eir_present
                  ? `A Leena-related role is present in the scored corpus from ${verification.matched_source}.`
                  : "No Leena match is present in the current scored corpus from the public API feeds."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Date posted"
            value={datePostedDays ? String(datePostedDays) : ""}
            onChange={(value) => onDatePostedDaysChange(value ? Number(value) : null)}
          >
            <option value="">Any time</option>
            <option value="1">Past 24 hours</option>
            <option value="3">Past 3 days</option>
            <option value="7">Past 7 days</option>
            <option value="14">Past 14 days</option>
            <option value="30">Past 30 days</option>
          </FilterSelect>

          <FilterSelect label="Sort" value={sort} onChange={(value) => onSortChange(value as typeof sort)}>
            <option value="top">Top matches</option>
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="recent">Recently ingested</option>
          </FilterSelect>

          <div className="font-ui inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-slate-700">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            <span>Score {minScore}+</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(event) => onMinScoreChange(Number(event.target.value))}
              className="w-28 accent-teal-700"
            />
          </div>

          <button
            type="button"
            onClick={() => setHardFiltersOpen((current) => !current)}
            className={`font-ui inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              hardFiltersOpen || hardFilterCount
                ? "border-teal-200 bg-teal-50 text-teal-900"
                : "border-black/10 bg-white text-slate-700 hover:border-black/20 hover:text-slate-900"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Hard filters
            {hardFilterCount ? <span className="rounded-full bg-white px-2 py-0.5 text-xs">{hardFilterCount}</span> : null}
          </button>
        </div>

        {hardFiltersOpen ? (
          <div className="mt-4 rounded-[28px] border border-black/10 bg-[#fffaf4] p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="font-ui rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-slate-700">
                <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Location</span>
                <input
                  value={location}
                  onChange={(event) => onLocationChange(event.target.value)}
                  placeholder="New York, remote, SF"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </label>

              <FilterSelect
                label="Remote"
                value={remotePolicy}
                onChange={(value) => onRemotePolicyChange(value as RemotePolicy | "")}
              >
                <option value="">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </FilterSelect>

              <label className="font-ui rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-slate-700">
                <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Max Years Required</span>
                <input
                  type="number"
                  min={0}
                  value={maxYearsRequired ?? ""}
                  onChange={(event) => onMaxYearsRequiredChange(event.target.value ? Number(event.target.value) : null)}
                  placeholder="Any"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </label>

              <label className="font-ui rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-slate-700">
                <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Min Compensation</span>
                <input
                  type="number"
                  min={0}
                  value={minCompensation ?? ""}
                  onChange={(event) => onMinCompensationChange(event.target.value ? Number(event.target.value) : null)}
                  placeholder="Any"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </label>

              <FilterSelect
                label="Seniority"
                value={seniorityLevel}
                onChange={(value) => onSeniorityLevelChange(value as ProfileSeniority | "")}
              >
                <option value="">Any</option>
                <option value="internship">Internship</option>
                <option value="entry_level">Entry level</option>
                <option value="associate">Associate</option>
                <option value="mid_senior">Mid-Senior</option>
                <option value="director">Director</option>
                <option value="executive">Executive</option>
              </FilterSelect>

              <FilterSelect
                label="Stage"
                value={companyStage}
                onChange={(value) => onCompanyStageChange(value as Exclude<CompanyStage, "unknown"> | "")}
              >
                <option value="">Any</option>
                <option value="startup">Startup</option>
                <option value="growth">Growth</option>
                <option value="late_stage">Late-stage</option>
                <option value="public">Public</option>
              </FilterSelect>
            </div>

            <label className="font-ui mt-4 inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={hideUnknownCompensation}
                onChange={(event) => onHideUnknownCompensationChange(event.target.checked)}
                className="accent-teal-700"
              />
              Hide jobs with unknown salary
            </label>
          </div>
        ) : null}

        {activeFilters.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <button
                key={`${filter.key}-${filter.label}`}
                type="button"
                onClick={() => onClearFilter(filter.key)}
                className="font-ui inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-2 text-sm text-teal-900 transition hover:bg-teal-100"
              >
                {filter.label}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All jobs" },
          { value: "saved", label: "Saved" },
          { value: "applied", label: "Applied" },
          { value: "dismissed", label: "Dismissed" },
        ].map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onTabChange(item.value as typeof tab)}
              className={`font-ui rounded-full px-4 py-2 text-sm transition ${
                active
                  ? "bg-slate-950 text-white"
                  : "border border-black/10 bg-white text-slate-700 hover:border-black/20 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
