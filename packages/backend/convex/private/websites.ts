import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireOrgAdmin, requireOrgId } from "../lib/authz";
import { normalizeHostname } from "../lib/domains";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await requireOrgId(ctx);
    return await ctx.db
      .query("websites")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .take(100);
  },
});

export const add = mutation({
  args: {
    domain: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { domain, name }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);

    const normalized = normalizeHostname(domain);
    if (!normalized) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Invalid domain" });
    }

    const existing = await ctx.db
      .query("websites")
      .withIndex("by_org_normalized_domain", (q) =>
        q.eq("organizationId", orgId).eq("normalizedDomain", normalized),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        domain,
        normalizedDomain: normalized,
        name: name ?? existing.name,
        active: true,
        updatedAt: now,
      });

      await ctx.runMutation(internal.system.audit.log, {
        organizationId: orgId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "website.updated",
        entityType: "website",
        entityId: String(existing._id),
        meta: { domain, normalizedDomain: normalized },
      });

      return existing._id;
    }

    const id = await ctx.db.insert("websites", {
      organizationId: orgId,
      domain,
      normalizedDomain: normalized,
      name,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.system.audit.log, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "website.created",
      entityType: "website",
      entityId: String(id),
      meta: { domain, normalizedDomain: normalized },
    });

    return id;
  },
});

export const remove = mutation({
  args: {
    websiteId: v.id("websites"),
  },
  handler: async (ctx, { websiteId }) => {
    const { orgId, userId, orgRole } = await requireOrgAdmin(ctx);
    const row = await ctx.db.get(websiteId);
    if (!row || row.organizationId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Website not found" });
    }

    await ctx.db.patch(websiteId, { active: false, updatedAt: Date.now() });

    await ctx.runMutation(internal.system.audit.log, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "website.deactivated",
      entityType: "website",
      entityId: String(websiteId),
      meta: { domain: row.domain, normalizedDomain: row.normalizedDomain },
    });

    return { ok: true };
  },
});

