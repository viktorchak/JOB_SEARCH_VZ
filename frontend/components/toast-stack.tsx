"use client";

import { useEffect } from "react";

export interface ToastMessage {
  id: number;
  tone: "success" | "error";
  message: string;
}

interface ToastStackProps {
  items: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ items, onDismiss }: ToastStackProps) {
  useEffect(() => {
    if (!items.length) return;

    const timers = items.map((item) =>
      window.setTimeout(() => {
        onDismiss(item.id);
      }, 3600),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [items, onDismiss]);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur ${
            item.tone === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-950"
              : "border-orange-200 bg-orange-50/95 text-orange-950"
          }`}
        >
          <p className="font-ui text-sm leading-6">{item.message}</p>
        </div>
      ))}
    </div>
  );
}
