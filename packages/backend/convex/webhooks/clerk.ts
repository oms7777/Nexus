// packages/backend/convex/webhooks/clerk.ts
import { Webhook } from "svix";
import { createClerkClient } from "@clerk/backend";
import type { WebhookEvent } from "@clerk/backend";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || "",
});

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

  // ✅ DEBUG safe logs
  console.log("[clerk-webhook] received event:", event.type);

  try {
    switch (event.type) {
      case "organization.created": {
        // Clerk payload (example): event.data.id = "org_..."
        const data = event.data as any;
        const organizationId: string | undefined = data?.id;

        console.log("[clerk-webhook] organization.created orgId:", organizationId);

        if (!organizationId) {
          console.error("[clerk-webhook] Missing organization id in event.data");
          return new Response("Missing organization id", { status: 400 });
        }

        const subId = await ctx.runMutation(
          internal.system.subscriptions.ensureForOrg,
          { organizationId },
        );

        console.log("[clerk-webhook] ensureForOrg done. subscription _id:", subId);

        return new Response(
          JSON.stringify({ ok: true, handled: "organization.created", organizationId, subId }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      case "subscription.updated": {
        const subscription = event.data as {
          status?: string;
          payer?: { organization_id?: string };
        };

        const organizationId = subscription?.payer?.organization_id;
        console.log("[clerk-webhook] subscription.updated orgId:", organizationId);

        if (!organizationId) {
          return new Response("Missing Organization ID", { status: 400 });
        }

        const rawStatus = (subscription.status ?? "").toLowerCase();
        const isActive = rawStatus === "active";
        const newMaxAllowedMemberships = isActive ? 5 : 1;

        await clerkClient.organizations.updateOrganization(organizationId, {
          maxAllowedMemberships: newMaxAllowedMemberships,
        });

        const subId = await ctx.runMutation(
          internal.system.subscriptions.setStatusFromClerk,
          {
            organizationId,
            clerkStatus: subscription.status ?? "paused",
          },
        );

        console.log("[clerk-webhook] setStatusFromClerk done. subscription _id:", subId);

        return new Response(
          JSON.stringify({ ok: true, handled: "subscription.updated", organizationId, subId }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      default: {
        console.log("[clerk-webhook] ignored event:", event.type);
        return new Response(
          JSON.stringify({ ok: true, ignored: true, type: event.type }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
    }
  } catch (err) {
    console.error("[clerk-webhook] handler error:", err);
    return new Response("Webhook handler error", { status: 500 });
  }
}
