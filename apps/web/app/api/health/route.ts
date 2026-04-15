import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** Always fresh status for external uptime checks. */
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness minimal pour monitoring (Better Stack, UptimeRobot, etc.).
 * Ne renvoie aucun secret.
 */
export async function GET() {
  const body = {
    ok: true as const,
    service: "nexus-web",
    time: new Date().toISOString(),
    ...(process.env.VERCEL_GIT_COMMIT_SHA
      ? { commit: process.env.VERCEL_GIT_COMMIT_SHA }
      : {}),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
