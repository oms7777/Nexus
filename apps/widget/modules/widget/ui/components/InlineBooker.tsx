// apps/web/components/InlineBooker.tsx
"use client";
import { useEffect, useState } from "react";

const CAL_BASE =
  process.env.NEXT_PUBLIC_CAL_LINK || "https://cal.com/<user>/<event-slug>";

export default function InlineBooker() {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ name?: string; email?: string }>({});

  useEffect(() => {
    const on = (e: CustomEvent) => {
      setPrefill(e.detail || {});
      setOpen(true);
    };
    window.addEventListener("nexus:open-inline-booker", on as any);
    return () => window.removeEventListener("nexus:open-inline-booker", on as any);
  }, []);

  if (!open) return null;

  const url =
    `${CAL_BASE}?embed=1` +
    `&name=${encodeURIComponent(prefill.name || "")}` +
    `&email=${encodeURIComponent(prefill.email || "")}` +
    `&hide_event_type_details=1`;

  return (
    <div className="fixed inset-0 bg-black/40 flex">
      <div className="ml-auto w-full max-w-[560px] h-full bg-background">
        <button className="p-3" onClick={() => setOpen(false)}>✕</button>
        <iframe src={url} className="w-full h-[calc(100%-48px)]" />
      </div>
    </div>
  );
}
