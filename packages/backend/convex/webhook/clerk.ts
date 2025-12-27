// packages/backend/convex/webhooks/clerk.ts
import { Webhook } from "svix";
import { createClerkClient } from "@clerk/backend";
import type { WebhookEvent } from "@clerk/backend";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Clerk → Convex webhook handler
 * - Verifies Svix signature
 * - Handles:
 *    1) organization.created  → ensure subscription doc exists
 *    2) subscription.updated  → keep your current logic (status + membership limit)
 *
 * Env required:
 * - CLERK_WEBHOOK_SECRET
 * - CLERK_SECRET_KEY
 */
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || "",
});

function verifyClerkWebhook(req: Request): Promise<WebhookEvent> {
  const secret = process.env.CLERK_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("Missing CLERK_WEBHOOK_SECRET");

  const wh = new Webhook(secret);

  return (async () => {
    const payloadString = await req.text();
    const svixHeaders = {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    };

    return wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
  })();
}

export async function handleClerkWebhook(ctx: ActionCtx, req: Request) {
  let event: WebhookEvent;

  try {
    event = await verifyClerkWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  try {
    switch (event.type) {
      /**
       * ✅ NEW: when an org is created in Clerk (now user-created orgs OFF, so this is YOUR flow),
       * we auto-create a subscriptions doc in Convex.
       */
      case "organization.created": {
        const org = event.data as { id?: string };
        const organizationId = org?.id;

        if (!organizationId) {
          return new Response("Missing organization id", { status: 400 });
        }

        // Ensure subscription exists (idempotent)
        await ctx.runMutation(internal.system.subscriptions.ensureForOrg, {
          organizationId,
        });

        break;
      }

      /**
       * ✅ Your existing webhook behavior (keep as-is)
       * This event name depends on how you're sending "subscription.updated" from Clerk Billing (Beta) / your setup.
       */
      case "subscription.updated": {
        const subscription = event.data as {
          status?: string;
          payer?: { organization_id?: string };
        };

        const organizationId = subscription?.payer?.organization_id;
        if (!organizationId) {
          return new Response("Missing Organization ID", { status: 400 });
        }

        const rawStatus = (subscription.status ?? "").toLowerCase();
        const isActive = rawStatus === "active";
        const newMaxAllowedMemberships = isActive ? 5 : 1;

        // Optional: reflect billing status in Clerk org membership limit
        await clerkClient.organizations.updateOrganization(organizationId, {
          maxAllowedMemberships: newMaxAllowedMemberships,
        });

        // Persist status in Convex subscription doc (and backfill defaults if missing)
        await ctx.runMutation(internal.system.subscriptions.setStatusFromClerk, {
          organizationId,
          clerkStatus: subscription.status ?? "paused",
        });

        break;
      }

      default:
        // Ignore other events
        console.log("Ignored Clerk webhook event:", event.type);
    }
  } catch (err) {
    console.error("Clerk webhook handler error:", err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
