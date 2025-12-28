// packages/backend/convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { handleClerkWebhook } from "./webhooks/clerk";

const http = httpRouter();

/** Ping de test */
http.route({
  path: "/ping",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("pong", { status: 200 });
  }),
});

/**
 * Clerk webhook
 * - Reçoit les events Clerk (Dev/Prod selon les env vars du deployment Convex)
 * - Vérifie la signature Svix dans handleClerkWebhook
 */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return handleClerkWebhook(ctx, req);
  }),
});

http.route({
  path: "/admin/bootstrap-subscriptions",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const organizationIds = [
      "org_37QTAJtBMvnHKgsoJraEzh7aGy2", // test
      "org_343p5MsU52y2zpcbQojwCLwHtT0", // Red Hat
      "org_33tK7Hsws65yMqMiJE8nmvnSV71", // Inboundless
    ];

    const results = [];
    for (const organizationId of organizationIds) {
      const res = await ctx.runMutation(
        internal.system.subscriptions.ensureForOrg,
        { organizationId },
      );
      results.push({ organizationId, ...res });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/** Live heartbeat (CORS preflight) */
http.route({
  path: "/live/heartbeat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

/** Live heartbeat */
http.route({
  path: "/live/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = (await req.json().catch(() => ({}))) as {
      organizationId?: string;
      contactSessionId?: string;
      currentUrl?: string;
      referrer?: string;
      language?: string;
      timezone?: string;
      viewportSize?: string;
      screenResolution?: string;
      clientIp?: string;
    };

    if (!body.organizationId || !body.contactSessionId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ids" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    await ctx.runAction(internal.live.heartbeatHttp, {
      organizationId: body.organizationId,
      contactSessionId: body.contactSessionId as any,

      currentUrl: body.currentUrl,
      referrer: body.referrer,
      language: body.language,
      timezone: body.timezone,
      viewportSize: body.viewportSize,
      screenResolution: body.screenResolution,

      client_ip: body.clientIp,

      x_forwarded_for: req.headers.get("x-forwarded-for") ?? undefined,
      x_real_ip: req.headers.get("x-real-ip") ?? undefined,
      cf_connecting_ip: req.headers.get("cf-connecting-ip") ?? undefined,
      x_vercel_forwarded_for: req.headers.get("x-vercel-forwarded-for") ?? undefined,
      remote_addr: req.headers.get("remote-addr") ?? undefined,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }),
});

export default http;
