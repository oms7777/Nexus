"use client";

import { Protect, useOrganization } from "@clerk/nextjs";
import { useConvex, usePaginatedQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
function formatMeta(meta: unknown): string {
  if (meta === undefined || meta === null) return "—";
  try {
    const s = JSON.stringify(meta);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  } catch {
    return String(meta);
  }
}

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

type AuditRow = {
  _id: string;
  action: string;
  createdAt: number;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  actorOrgRole?: string;
  meta?: unknown;
};

function buildAuditCsv(rows: readonly AuditRow[]) {
  const header = [
    "created_at_utc",
    "action",
    "entity_type",
    "entity_id",
    "actor_user_id",
    "actor_org_role",
    "meta_json",
  ].join(",");
  const lines = rows.map((row) => {
    const metaStr =
      row.meta === undefined || row.meta === null
        ? ""
        : (() => {
            try {
              return JSON.stringify(row.meta);
            } catch {
              return "";
            }
          })();
    return [
      csvEscape(new Date(row.createdAt).toISOString()),
      csvEscape(row.action),
      csvEscape(row.entityType ?? ""),
      csvEscape(row.entityId ?? ""),
      csvEscape(row.actorUserId ?? ""),
      csvEscape(row.actorOrgRole ?? ""),
      csvEscape(metaStr),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

function downloadBlob(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const { organization, membership, isLoaded } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const convex = useConvex();
  const [exporting, setExporting] = useState(false);

  const paginated = usePaginatedQuery(
    api.private.audit.list,
    isAdmin && organization ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  const loadMore = useCallback(() => {
    paginated.loadMore(PAGE_SIZE);
  }, [paginated]);

  const exportFullCsv = useCallback(async () => {
    setExporting(true);
    try {
      const rows = await convex.query(api.private.audit.exportRecent, { limit: 2000 });
      const csv = buildAuditCsv(rows);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
      downloadBlob(`audit-log-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    } finally {
      setExporting(false);
    }
  }, [convex]);

  const exportLoadedCsv = useCallback(() => {
    const csv = buildAuditCsv(paginated.results);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
    downloadBlob(`audit-log-loaded-${stamp}.csv`, csv, "text/csv;charset=utf-8");
  }, [paginated.results]);

  if (!organization) {
    return (
      <Protect>
        <div className="p-8">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="mt-4 text-muted-foreground">Join an organization to view activity.</p>
        </div>
      </Protect>
    );
  }

  if (isLoaded && !isAdmin) {
    return (
      <Protect>
        <div className="p-8 max-w-lg space-y-4">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-muted-foreground">
            Only organization admins can view the security audit log. Ask an admin to grant you the{" "}
            <span className="font-medium">Admin</span> role in Clerk, or use an admin account.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back to app</Link>
          </Button>
        </div>
      </Protect>
    );
  }

  const results = paginated.results;
  const status = paginated.status;
  const loadingFirst = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";
  const exhausted = status === "Exhausted";

  return (
    <Protect>
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sensitive actions for your organization (integrations, domains, promos, territories, etc.).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={results.length === 0 || loadingFirst}
                onClick={exportLoadedCsv}
              >
                <Download className="mr-2 size-4" />
                CSV (loaded)
              </Button>
              <Button type="button" size="sm" disabled={exporting || loadingFirst} onClick={exportFullCsv}>
                {exporting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                CSV (up to 2000)
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Events</CardTitle>
              <CardDescription>
                Newest first. Retention follows your Convex data settings. Showing {results.length} loaded
                {exhausted ? " (end of log)" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              {loadingFirst ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit events yet.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Time (UTC)</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead className="min-w-[200px]">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap align-top text-xs font-mono">
                            {new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)}
                          </TableCell>
                          <TableCell className="align-top font-medium">{row.action}</TableCell>
                          <TableCell className="align-top text-sm">
                            {[row.entityType, row.entityId].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            <div>{row.actorUserId ?? "—"}</div>
                            {row.actorOrgRole ? (
                              <div className="text-[11px] opacity-80">{row.actorOrgRole}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top font-mono text-xs break-all">
                            {formatMeta(row.meta)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {canLoadMore || loadingMore ? (
                    <Button type="button" variant="secondary" disabled={loadingMore} onClick={loadMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Protect>
  );
}
