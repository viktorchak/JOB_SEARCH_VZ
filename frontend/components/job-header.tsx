"use client";

import { RefreshCw } from "lucide-react";

import type { ConnectorStatus } from "@/lib/api";

function connectorTone(status: ConnectorStatus) {
  if (status.last_error) return "bg-orange-500";
  if (status.last_success_at) return "bg-emerald-500";
  return "bg-slate-300";
}

interface JobHeaderProps {
  connectors: ConnectorStatus[];
  googleReady: boolean;
  refreshing: boolean;
  onConnectGoogle: () => void;
  onRefresh: () => void;
  formatDateTime: (value: string | null) => string;
}

export function JobHeader({
  connectors,
  googleReady,
  refreshing,
  onConnectGoogle,
  onRefresh,
  formatDateTime,
}: JobHeaderProps) {
  return (
    <header className="flex flex-col gap-6 border-b border-black/10 pb-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="space-y-3">
          <p className="font-ui text-xs uppercase tracking-[0.38em] text-slate-500">
            Leena AI take-home
          </p>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Job Search Assistant
            </h1>
            <p className="font-ui mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              Pull live PM and Strategy &amp; Ops roles, rank them with Gemini, and take action
              from one dashboard.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onConnectGoogle}
            className={`font-ui rounded-full px-4 py-3 text-sm transition ${
              googleReady
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border border-black/10 bg-white text-slate-700 hover:border-black/20 hover:text-slate-900"
            }`}
          >
            {googleReady ? "Google connected" : "Connect Google"}
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
