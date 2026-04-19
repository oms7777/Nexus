// packages/backend/convex/webhooks/clerk.ts
import { Webhook } from "svix";
import { createClerkClient } from "@clerk/backend";
import type { WebhookEvent } from "@clerk/backend";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || "",
});

const INTERNAL_ADMIN_USER_IDS = (process.env.INTERNAL_ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function verifyClerkWebhook(req: Request): Promise<WebhookEvent> {
  const secret = process.env.CLERK_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("Missing CLERK_WEBHOOK_SECRET");

  const payloadString = await req.text();

  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") || "",
    "svix-timestamp": req.headers.get("svix-timestamp") || "",
    "svix-signature": req.headers.get("svix-signature") || "",
  };

  const wh = new Webhook(secret);
  return wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
}

export async function handleClerkWebhook(ctx: ActionCtx, req: Request) {
  let event: WebhookEvent;

  try {
    event = await verifyClerkWebhook(req);
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  console.log("[clerk-webhook] received event:", event.type);

  try {
    switch (event.type) {
      case "organization.created": {
        const data = event.data as any;
        const organizationId: string | undefined = data?.id;
        const createdBy: string | undefined = data?.created_by || data?.createdBy;

        if (!organizationId) return new Response("Missing organization id", { status: 400 });

        // invite-only (optionnel)
        if (
          createdBy &&
          INTERNAL_ADMIN_USER_IDS.length > 0 &&
          !INTERNAL_ADMIN_USER_IDS.includes(createdBy)
        ) {
          console.warn("[clerk-webhook] blocking org creation (invite-only). Deleting org:", organizationId);
          await clerkClient.organizations.deleteOrganization(organizationId);
          return new Response(JSON.stringify({ ok: true, blocked: true, deleted: true, organizationId }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        // ensure sub
        const subRes = await ctx.runMutation(internal.system.subscriptions.ensureForOrg, { organizationId });

        const orgName = typeof data?.name === "string" ? data.name : undefined;
        const orgSlug = typeof data?.slug === "string" ? data.slug : undefined;
        if (orgName !== undefined || orgSlug !== undefined) {
          await ctx.runMutation(internal.system.subscriptions.setOrganizationProfile, {
            organizationId,
            organizationName: orgName,
            organizationSlug: orgSlug,
          });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            handled: "organization.created",
            organizationId,
            subId: subRes,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      case "organization.updated": {
        const data = event.data as any;
        const organizationId: string | undefined = data?.id;
        if (!organizationId) return new Response("Missing organization id", { status: 400 });

        const orgName = typeof data?.name === "string" ? data.name : undefined;
        const orgSlug = typeof data?.slug === "string" ? data.slug : undefined;
        if (orgName === undefined && orgSlug === undefined) {
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_name_change" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        await ctx.runMutation(internal.system.subscriptions.ensureForOrg, { organizationId });
        await ctx.runMutation(internal.system.subscriptions.setOrganizationProfile, {
          organizationId,
          organizationName: orgName,
          organizationSlug: orgSlug,
        });

        return new Response(JSON.stringify({ ok: true, handled: "organization.updated", organizationId }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ ok: true, ignored: true, type: event.type }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
    }
  } catch (err) {
    console.error("[clerk-webhook] handler error:", err);
    return new Response("Webhook handler error", { status: 500 });
  }
}
