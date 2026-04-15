// packages/backend/convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { handleClerkWebhook } from "./webhooks/clerk";
import { normalizeHostname } from "./lib/domains";

const http = httpRouter();

/** Ping de test */
http.route({
  path: "/ping",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("pong", { status: 200 });
  }),
});

/** Health JSON pour sondes uptime (même déploiement que les routes HTTP Convex). */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    const body = JSON.stringify({
      ok: true,
      service: "nexus-convex",
      time: new Date().toISOString(),
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }),
});

/** Clerk webhook */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return handleClerkWebhook(ctx, req);
  }),
});

/** Helpers */
function looksLikeExternalId(s: string) {
  // external UUID / long token
  return s.includes("-") || s.length > 40;
}

function isWidgetOrAppUrl(url?: string) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const h = u.hostname;
    return h === "widget.inboundless.co" || h === "app.inboundless.co";
  } catch {
    // if it's not a valid URL, don't trust it
    return false;
  }
}

async function resolveSessionId(ctx: any, input: { organizationId: string; sessionIdRaw: string }) {
  const { organizationId, sessionIdRaw } = input;

  if (looksLikeExternalId(sessionIdRaw)) {
    // map external → real Convex Id
    const id = await ctx.runMutation(api.public.contactSessions.ensureByExternalId, {
      organizationId,
      externalSessionId: sessionIdRaw,
    });
    return id;
  }

  // already a Convex Id string
  return sessionIdRaw as any;
}

function hostnameFromUrlMaybe(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

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

      // ✅ nouveaux champs
      title?: string;
      userAgent?: string;
      cookieEnabled?: boolean;
      timezoneOffset?: number;
    };

    if (!body.organizationId || !body.contactSessionId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ids" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const resolvedSessionId = await resolveSessionId(ctx, {
      organizationId: body.organizationId,
      sessionIdRaw: body.contactSessionId,
    });

    // ✅ IMPORTANT: on ignore les URLs de l'iframe widget (sinon ça écrase ton vrai site)
    const safeCurrentUrl =
      isWidgetOrAppUrl(body.currentUrl) ? undefined : body.currentUrl;

    // (optionnel) si tu veux au moins garder un truc:
    // si currentUrl est widget mais referrer est un vrai site → on prend referrer
    const finalCurrentUrl =
      safeCurrentUrl ?? (isWidgetOrAppUrl(body.referrer) ? undefined : body.referrer);

    // ✅ Enterprise safety: accept heartbeat only from allowed domains.
    const origin = req.headers.get("origin") ?? undefined;
    const hostFromOrigin = hostnameFromUrlMaybe(origin);
    const hostFromUrl = hostnameFromUrlMaybe(finalCurrentUrl);
    const incomingHost = normalizeHostname(hostFromUrl ?? hostFromOrigin ?? "");

    if (incomingHost) {
      const allow = await ctx.runQuery((internal as any).system.websites.isAllowedHostnameForOrg, {
        organizationId: body.organizationId,
        hostname: incomingHost,
      });
      if (!allow.allowed) {
        return new Response(JSON.stringify({ ok: false, error: "Domain not allowed" }), {
          status: 403,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    } else {
      return new Response(JSON.stringify({ ok: false, error: "Missing host" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    await ctx.runAction(internal.live.heartbeatHttp, {
      organizationId: body.organizationId,
      contactSessionId: resolvedSessionId as any,

      currentUrl: finalCurrentUrl,
      referrer: body.referrer,
      language: body.language,
      timezone: body.timezone,
      viewportSize: body.viewportSize,
      screenResolution: body.screenResolution,

      client_ip: body.clientIp,

      // ✅ pass-through des nouveaux champs
      title: body.title,
      userAgent: body.userAgent,
      cookieEnabled: body.cookieEnabled,
      timezoneOffset: body.timezoneOffset,

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
