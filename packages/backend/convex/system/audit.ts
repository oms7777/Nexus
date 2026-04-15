import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const log = internalMutation({
  args: {
    organizationId: v.string(),
    actorUserId: v.optional(v.string()),
    actorOrgRole: v.optional(v.string()),
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      actorUserId: args.actorUserId,
      actorOrgRole: args.actorOrgRole,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      meta: args.meta,
      createdAt: now,
    });
    return { ok: true };
  },
});

