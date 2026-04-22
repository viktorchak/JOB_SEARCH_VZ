"use client";

import { RefreshCw, Search, X } from "lucide-react";

import type { ConnectorStatus } from "@/lib/api";

function connectorTone(status: ConnectorStatus) {
  if (status.last_error) return "bg-orange-500";
  if (status.last_success_at) return "bg-emerald-500";
  return "bg-slate-300";
}

interface JobSearchHeaderProps {
  q: string;
  googleConfigured: boolean;
  googleAuthenticated: boolean;
  refreshing: boolean;
  connectors: ConnectorStatus[];
  onQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onConnectGoogle: () => void;
  onRefresh: () => void;
  formatDateTime: (value: string | null) => string;
}

export function JobSearchHeader({
  q,
  googleConfigured,
  googleAuthenticated,
  refreshing,
  connectors,
  onQueryChange,
  onClearSearch,
  onConnectGoogle,
  onRefresh,
  formatDateTime,
}: JobSearchHeaderProps) {
  const googleLabel = googleAuthenticated
    ? "Google connected"
    : googleConfigured
      ? "Authenticate Google"
      : "Google setup needed";

  const googleTone = googleAuthenticated
    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
    : googleConfigured
      ? "border border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300"
      : "border border-orange-200 bg-orange-50 text-orange-900";

  return (
    <header className="space-y-5 border-b border-black/10 pb-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="space-y-3">
          <p className="font-ui text-xs uppercase tracking-[0.38em] text-slate-500">
            Leena AI take-home
          </p>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Job Search Assistant
            </h1>
            <p className="font-ui mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              Search live jobs across broad families, rank them to your saved profile, and take action
              from one workspace.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onConnectGoogle}
            disabled={!googleConfigured}
            className={`font-ui rounded-full px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-80 ${googleTone}`}
          >
            {googleLabel}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="font-ui inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="rounded-[32px] border border-black/10 bg-white/80 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="font-ui flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search jobs, companies, or skills"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            {q && (
              <button
                type="button"
                onClick={onClearSearch}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="font-ui flex items-center rounded-full border border-black/10 bg-[#f7f4ee] px-4 py-3 text-sm text-slate-600">
            Search updates automatically
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {connectors.map((status) => (
          <div
            key={status.connector}
            title={
              status.last_error
                ? `${status.connector}: ${status.last_error}`
                : `${status.connector}: ${formatDateTime(status.last_success_at)}`
            }
            className="font-ui inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-slate-700"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${connectorTone(status)}`} />
            <span className="capitalize">{status.connector}</span>
            <span className="text-slate-400">•</span>
            <span>
              {status.last_success_at ? formatDateTime(status.last_success_at) : "Not synced"}
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}
