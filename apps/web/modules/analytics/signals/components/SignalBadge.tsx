"use client";

export function SignalBadge({
  value,
}: {
  value: "On Fire" | "Neutral" | string;
}) {
  const v = (value ?? "Neutral") as string;

  const isHot = v.toLowerCase().includes("fire");
  const label = isHot ? "On Fire" : "Neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        isHot ? "bg-orange-50" : "bg-muted",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
