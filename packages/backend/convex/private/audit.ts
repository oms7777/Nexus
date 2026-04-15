import { query } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireOrgAdmin } from "../lib/authz";

const EXPORT_MAX = 2000;

/**
 * Historique paginé (admins uniquement). Utiliser avec `usePaginatedQuery` côté client.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgAdmin(ctx);

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_org_createdAt", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Export CSV : jusqu’aux N entrées les plus récentes (plafonné).
 * Séparé de `list` pour éviter de charger des milliers de lignes via la pagination UI.
 */
export const exportRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const { orgId } = await requireOrgAdmin(ctx);
    const take = Math.min(Math.max(limit ?? EXPORT_MAX, 1), EXPORT_MAX);

    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_createdAt", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .take(take);

    return rows.map((r) => ({
      _id: r._id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      actorOrgRole: r.actorOrgRole,
      meta: r.meta,
      createdAt: r.createdAt,
    }));
  },
});
