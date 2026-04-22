"use client";

import type { ReactNode } from "react";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";

import type { ActionStatus, ConnectorName, JobListResponse, RemotePolicy } from "@/lib/api";

interface JobFilterToolbarProps {
  remotePolicy: RemotePolicy | "";
  datePostedDays: number | null;
  source: ConnectorName | "";
  company: string;
  minScore: number;
  sort: "top" | "relevance" | "newest" | "recent" | "company";
  tab: "all" | Extract<ActionStatus, "saved" | "applied" | "dismissed">;
  companies: string[];
  verification: JobListResponse["verification"] | null;
  onRemotePolicyChange: (value: RemotePolicy | "") => void;
  onDatePostedDaysChange: (value: number | null) => void;
  onSourceChange: (value: ConnectorName | "") => void;
  onCompanyChange: (value: string) => void;
  onMinScoreChange: (value: number) => void;
  onSortChange: (value: "top" | "relevance" | "newest" | "recent" | "company") => void;
  onTabChange: (value: "all" | Extract<ActionStatus, "saved" | "applied" | "dismissed">) => void;
  onClearFilter: (key: "remote" | "date" | "source" | "company" | "score" | "tab") => void;
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
  remotePolicy,
  datePostedDays,
  source,
  company,
  minScore,
  sort,
  tab,
  companies,
  verification,
  onRemotePolicyChange,
  onDatePostedDaysChange,
  onSourceChange,
  onCompanyChange,
  onMinScoreChange,
  onSortChange,
  onTabChange,
  onClearFilter,
}: JobFilterToolbarProps) {
  const activeFilters = [
    remotePolicy
      ? { key: "remote" as const, label: remotePolicy === "remote" ? "Remote" : remotePolicy }
      : null,
    datePostedDays ? { key: "date" as const, label: `Past ${datePostedDays} days` } : null,
    source ? { key: "source" as const, label: source } : null,
    company ? { key: "company" as const, label: company } : null,
    minScore > 0 ? { key: "score" as const, label: `Score ${minScore}+` } : null,
    tab !== "all" ? { key: "tab" as const, label: tab } : null,
  ].filter(Boolean) as Array<{ key: "remote" | "date" | "source" | "company" | "score" | "tab"; label: string }>;

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
              ? `A Leena EIR match is present in the scored corpus from ${verification.matched_source}.`
              : "No Leena EIR match is present in the current scored corpus from the public API feeds."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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

          <FilterSelect
            label="Source"
            value={source}
            onChange={(value) => onSourceChange(value as ConnectorName | "")}
          >
            <option value="">All sources</option>
            <option value="jsearch">JSearch</option>
            <option value="remotive">Remotive</option>
            <option value="remoteok">Remote OK</option>
            <option value="jobicy">Jobicy</option>
          </FilterSelect>

          <FilterSelect label="Company" value={company} onChange={onCompanyChange}>
            <option value="">All companies</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Sort" value={sort} onChange={(value) => onSortChange(value as typeof sort)}>
            <option value="top">Top matches</option>
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="recent">Recently ingested</option>
            <option value="company">Company A–Z</option>
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
        </div>

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
