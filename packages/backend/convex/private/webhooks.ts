// packages/backend/convex/private/webhooks.ts
import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOrgAdmin, requireOrgId } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";
import type { Doc } from "../_generated/dataModel";

/**
 * Outbound webhooks with HMAC-signed payloads.
 *
 * Deliveries are best-effort and never block the flow that produced the event:
 * a customer's broken endpoint must not stop a lead from being escalated.
 */

export const WEBHOOK_EVENTS = [
  "conversation.escalated",
  "conversation.resolved",
  "meeting.booked",
  "lead.identified",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_ENDPOINTS_PER_ORG = 10;
/** After this many consecutive failures we stop trying until the endpoint is edited. */
const FAILURE_CUTOFF = 15;
const DELIVERY_TIMEOUT_MS = 10_000;

function assertHttpsUrl(raw: string): string {
  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError({ code: "BAD_REQUEST", message: "Enter a valid URL." });
  }

  // Plain HTTP would leak lead data in transit; localhost cannot be reached from Convex.
  if (parsed.protocol !== "https:") {
    throw new ConvexError({ code: "BAD_REQUEST", message: "The URL must use HTTPS." });
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Local addresses cannot receive webhooks.",
    });
  }

  return parsed.toString();
}

function assertKnownEvents(events: string[]): string[] {
  const unique = [...new Set(events.map((e) => e.trim()).filter(Boolean))];
  const unknown = unique.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));

  if (unknown.length > 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `Unknown event(s): ${unknown.join(", ")}`,
    });
  }

  return unique;
}

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The secret is write-only: reps must never be able to read it back from the dashboard. */
function toPublicEndpoint(doc: Doc<"webhookEndpoints">) {
  return {
    _id: doc._id,
    url: doc.url,
    events: doc.events,
    active: doc.active,
    description: doc.description,
    lastStatus: doc.lastStatus,
    lastAttemptAt: doc.lastAttemptAt,
    lastError: doc.lastError,
    consecutiveFailures: doc.consecutiveFailures ?? 0,
    isSuspended: (doc.consecutiveFailures ?? 0) >= FAILURE_CUTOFF,
    createdAt: doc.createdAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await requireOrgId(ctx);

    const rows = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    return {
      availableEvents: [...WEBHOOK_EVENTS],
      endpoints: rows.map(toPublicEndpoint),
    };
  },
});

export const create = mutation({
  args: {
    url: v.string(),
    events: v.array(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const existing = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    if (existing.length >= MAX_ENDPOINTS_PER_ORG) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `You can configure at most ${MAX_ENDPOINTS_PER_ORG} webhook endpoints.`,
      });
    }

    const url = assertHttpsUrl(args.url);
    const events = assertKnownEvents(args.events);
    const secret = generateSecret();
    const now = Date.now();

    const id = await ctx.db.insert("webhookEndpoints", {
      organizationId: orgId,
      url,
      secret,
      events,
      active: true,
      description: args.description?.trim() || undefined,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "webhook.create",
      entityType: "webhookEndpoint",
      entityId: String(id),
      meta: { url, events },
    });

    // Shown once: the secret is never returned by `list`.
    return { endpointId: id, secret };
  },
});

export const update = mutation({
  args: {
    endpointId: v.id("webhookEndpoints"),
    url: v.optional(v.string()),
    events: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const endpoint = await ctx.db.get(args.endpointId);
    if (!endpoint || endpoint.organizationId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Webhook not found" });
    }

    const patch: Partial<Doc<"webhookEndpoints">> = { updatedAt: Date.now() };

    if (args.url !== undefined) patch.url = assertHttpsUrl(args.url);
    if (args.events !== undefined) patch.events = assertKnownEvents(args.events);
    if (args.active !== undefined) patch.active = args.active;
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;

    // Any edit is treated as "the owner fixed it", so delivery resumes.
    patch.consecutiveFailures = 0;
    patch.lastError = undefined;

    await ctx.db.patch(args.endpointId, patch);

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "webhook.update",
      entityType: "webhookEndpoint",
      entityId: String(args.endpointId),
      meta: { url: patch.url ?? endpoint.url },
    });

    return { ok: true as const };
  },
});

export const rotateSecret = mutation({
  args: { endpointId: v.id("webhookEndpoints") },
  handler: async (ctx, { endpointId }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const endpoint = await ctx.db.get(endpointId);
    if (!endpoint || endpoint.organizationId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Webhook not found" });
    }

    const secret = generateSecret();
    await ctx.db.patch(endpointId, { secret, updatedAt: Date.now() });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "webhook.rotate_secret",
      entityType: "webhookEndpoint",
      entityId: String(endpointId),
    });

    return { secret };
  },
});

export const remove = mutation({
  args: { endpointId: v.id("webhookEndpoints") },
  handler: async (ctx, { endpointId }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const endpoint = await ctx.db.get(endpointId);
    if (!endpoint || endpoint.organizationId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Webhook not found" });
    }

    await ctx.db.delete(endpointId);

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "webhook.delete",
      entityType: "webhookEndpoint",
      entityId: String(endpointId),
      meta: { url: endpoint.url },
    });

    return { ok: true as const };
  },
});

/* ============================================================
   Delivery
   ============================================================ */

type DeliveryTarget = {
  endpointId: Doc<"webhookEndpoints">["_id"];
  url: string;
  secret: string;
};

export const listTargetsForEvent = internalQuery({
  args: {
    organizationId: v.string(),
    event: v.string(),
  },
  handler: async (ctx, { organizationId, event }): Promise<DeliveryTarget[]> => {
    const rows = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();

    return rows
      .filter((r) => r.active)
      .filter((r) => (r.consecutiveFailures ?? 0) < FAILURE_CUTOFF)
      .filter((r) => r.events.length === 0 || r.events.includes(event))
      .map((r) => ({ endpointId: r._id, url: r.url, secret: r.secret }));
  },
});

export const recordDeliveryResult = internalMutation({
  args: {
    endpointId: v.id("webhookEndpoints"),
    status: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { endpointId, status, error }) => {
    const endpoint = await ctx.db.get(endpointId);
    if (!endpoint) return;

    const ok = typeof status === "number" && status >= 200 && status < 300;

    await ctx.db.patch(endpointId, {
      lastStatus: status,
      lastAttemptAt: Date.now(),
      lastError: ok ? undefined : (error ?? `HTTP ${status ?? "error"}`)?.slice(0, 500),
      consecutiveFailures: ok ? 0 : (endpoint.consecutiveFailures ?? 0) + 1,
    });
  },
});

async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Timestamp is part of the signed string so a captured payload cannot be replayed later.
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const dispatch = internalAction({
  args: {
    organizationId: v.string(),
    event: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, { organizationId, event, payload }) => {
    const targets: DeliveryTarget[] = await ctx.runQuery(
      internal.private.webhooks.listTargetsForEvent,
      { organizationId, event },
    );

    if (targets.length === 0) return { delivered: 0 };

    const timestamp = Date.now();
    const body = JSON.stringify({
      event,
      organizationId,
      createdAt: timestamp,
      data: payload,
    });

    let delivered = 0;

    for (const target of targets) {
      try {
        const signature = await signPayload(target.secret, timestamp, body);

        const res = await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Inboundless-Webhooks/1",
            "X-Inboundless-Event": event,
            "X-Inboundless-Timestamp": String(timestamp),
            "X-Inboundless-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        await ctx.runMutation(internal.private.webhooks.recordDeliveryResult, {
          endpointId: target.endpointId,
          status: res.status,
        });

        if (res.ok) delivered += 1;
      } catch (e) {
        await ctx.runMutation(internal.private.webhooks.recordDeliveryResult, {
          endpointId: target.endpointId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { delivered };
  },
});
