import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { createClerkClient } from "@clerk/backend";
import type { WebhookEvent } from "@clerk/backend";
import { internal } from "./_generated/api";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || "",
});

const http = httpRouter();

/** Ping de test */
http.route({
  path: "/ping",
  method: "GET",
  handler: httpAction(async () => new Response("pong", { status: 200 })),
});

/** Clerk webhook (existant) */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (!event) return new Response("Error occured", { status: 400 });

    switch (event.type) {
      case "subscription.updated": {
        const subscription = event.data as {
          status: string;
          payer?: { organization_id: string };
        };

        const organizationId = subscription.payer?.organization_id;
        if (!organizationId) {
          return new Response("Missing Organization ID", { status: 400 });
        }

        const newMaxAllowedMemberships =
          subscription.status === "active" ? 5 : 1;

        await clerkClient.organizations.updateOrganization(organizationId, {
          maxAllowedMemberships: newMaxAllowedMemberships,
        });

        await ctx.runMutation(internal.system.subscriptions.upsert, {
          organizationId,
          status: subscription.status,
        });

        break;
      }
      default:
        console.log("Ignored Clerk webhook event", event.type);
    }

    return new Response(null, { status: 200 });
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
      // headers flatten (noms avec _)
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

async function validateRequest(req: Request): Promise<WebhookEvent | null> {
  const payloadString = await req.text();
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") || "",
    "svix-timestamp": req.headers.get("svix-timestamp") || "",
    "svix-signature": req.headers.get("svix-signature") || "",
  };

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || "");

  try {
    return wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
  } catch (error) {
    console.error(`Error verifying webhook event`, error);
    return null;
  }
}

export default http;
