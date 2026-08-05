"use client";

import Link from "next/link";

type SignalRow = {
  groupKey?: string;
  account?: string;
  companyName?: string;
  workDomain?: string;
  identityKind?: string;
  companySource?: "declared" | "ip" | "mixed";
  tier?: string;
  score?: number;
  sessions?: number;
  meetings?: number;
  lastSeenTs?: number;
  conversationIds?: string[];
};

function label(r: SignalRow) {
  return (r.companyName || r.account || r.workDomain || "Unknown").trim();
}

function fmtAgo(ts?: number) {
  if (!ts) return "";
  const min = Math.floor(Math.max(0, Date.now() - ts) / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function MorningCallQueue({
  rows,
  onShowHot,
  onShowGhostIp,
}: {
  rows: SignalRow[];
  onShowHot: () => void;
  onShowGhostIp: () => void;
}) {
  const hot = rows
    .filter((r) => String(r.tier ?? "").toLowerCase() === "hot")
    .filter((r) => r.identityKind === "company" || r.identityKind === "account")
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, 5);

  const ghosts = rows
    .filter((r) => r.companySource === "ip")
    .filter((r) => Number(r.meetings ?? 0) === 0)
    .filter((r) => r.identityKind === "company" || r.identityKind === "account")
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || Number(b.sessions ?? 0) - Number(a.sessions ?? 0))
    .slice(0, 5);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <QueueCard
        title="Call first — Hot"
        subtitle="Highest intent this morning"
        empty="No Hot accounts in this period."
        actionLabel="View Hot queue"
        onAction={onShowHot}
        items={hot.map((r) => ({
          key: r.groupKey ?? label(r),
          title: label(r),
          meta: `Score ${Number(r.score ?? 0)} · ${fmtAgo(r.lastSeenTs)}`.trim(),
          href: r.conversationIds?.[0] ? `/conversations/${r.conversationIds[0]}` : undefined,
          badge: r.companySource === "ip" ? "From IP" : r.companySource === "declared" ? "Declared" : undefined,
        }))}
      />
      <QueueCard
        title="Ghost IP"
        subtitle="Company from IP only — never typed by visitor · 0 meetings"
        empty="No ghost-IP accounts without meetings."
        actionLabel="View Ghost IP"
        onAction={onShowGhostIp}
        tone="ip"
        items={ghosts.map((r) => ({
          key: r.groupKey ?? label(r),
          title: label(r),
          meta: `${Number(r.sessions ?? 0)} sess · score ${Number(r.score ?? 0)}`,
          href: r.conversationIds?.[0] ? `/conversations/${r.conversationIds[0]}` : undefined,
          badge: "From IP",
        }))}
      />
    </div>
  );
}

function QueueCard({
  title,
  subtitle,
  empty,
  actionLabel,
  onAction,
  items,
  tone = "hot",
}: {
  title: string;
  subtitle: string;
  empty: string;
  actionLabel: string;
  onAction: () => void;
  items: Array<{ key: string; title: string; meta: string; href?: string; badge?: string }>;
  tone?: "hot" | "ip";
}) {
  const shell =
    tone === "ip"
      ? "border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-white dark:border-sky-900/40 dark:from-sky-950/30 dark:to-background"
      : "border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-orange-50/40 to-white dark:border-rose-900/40 dark:from-rose-950/30 dark:to-background";

  return (
    <div className={["rounded-2xl border p-5 shadow-sm", shell].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold tracking-tight">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 text-xs font-medium text-fuchsia-700 hover:underline dark:text-fuchsia-300"
        >
          {actionLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-white/70 px-3 py-2 dark:bg-card/60"
            >
              <div className="min-w-0">
                {it.href ? (
                  <Link href={it.href} className="truncate text-sm font-medium hover:underline">
                    {it.title}
                  </Link>
                ) : (
                  <div className="truncate text-sm font-medium">{it.title}</div>
                )}
                <div className="truncate text-[11px] text-muted-foreground">{it.meta}</div>
              </div>
              {it.badge ? (
                <span className="shrink-0 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {it.badge}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
