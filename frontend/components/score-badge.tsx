"use client";

import clsx from "clsx";

function scoreTone(score: number) {
  if (score >= 85) return "bg-emerald-100 text-emerald-900";
  if (score >= 70) return "bg-teal-100 text-teal-900";
  if (score >= 50) return "bg-amber-100 text-amber-900";
  return "bg-slate-200 text-slate-800";
}

interface ScoreBadgeProps {
  score: number;
  large?: boolean;
}

export function ScoreBadge({ score, large = false }: ScoreBadgeProps) {
  return (
    <span
      className={clsx(
        "font-ui inline-flex items-center justify-center rounded-full font-semibold",
        scoreTone(score),
        large ? "min-w-[52px] px-4 py-1.5 text-[15px]" : "min-w-[44px] px-3 py-2 text-sm",
      )}
    >
      {score}
    </span>
  );
}
