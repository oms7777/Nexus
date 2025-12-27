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
  handler: httpAction(async () => new Response("pong", { status: 200 })),
});

/** Clerk webhook (Production + Dev selon env vars du deployment Convex) */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await handleClerkWebhook(ctx, req);
  }),
});

/** Live heartbeat (CORS + POST) */
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

    if (!body?.organizationId || !body?.contactSessionId) {
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
      x_vercel_forwarded_for:
        req.headers.get("x-vercel-forwarded-for") ?? undefined,
      remote_addr: req.headers.get("remote-addr") ?? undefined,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }),
});

export default http;
