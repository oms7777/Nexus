// packages/backend/convex/integrations.ts
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/* ============================================================
   SLACK INTEGRATION
   ============================================================ */

export const getSlackIntegration = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const saveSlackIntegration = mutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    defaultChannel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        teamId: args.teamId,
        teamName: args.teamName,
        defaultChannel: args.defaultChannel ?? existing.defaultChannel,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("slackIntegrations", {
      organizationId: args.organizationId,
      accessToken: args.accessToken,
      teamId: args.teamId,
      teamName: args.teamName,
      defaultChannel: args.defaultChannel ?? "#general",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** ✅ NEW: Disconnect Slack (delete row) */
export const disconnectSlackIntegration = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const existing = await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return;

    await ctx.db.delete(existing._id);
  },
});

export const sendSlackMessage = action({
  args: {
    organizationId: v.string(),
    text: v.string(),
    channelOverride: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, text, channelOverride }) => {
    const integration = await ctx.runQuery(api.integrations.getSlackIntegration, {
      organizationId,
    });

    if (!integration) {
      console.log("sendSlackMessage: no Slack integration for org", organizationId);
      return;
    }

    const rawChannel = channelOverride ?? integration.defaultChannel ?? "general";
    const channel = rawChannel.startsWith("#") ? rawChannel.slice(1) : rawChannel;

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const json: any = await res.json();
    if (!json.ok) {
      console.log("Slack chat.postMessage error:", json.error, {
        channel,
        organizationId,
      });
    }
  },
});

/* ============================================================
   SALESFORCE INTEGRATION
   ============================================================ */

export const getSalesforceIntegration = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const saveSalesforceIntegration = mutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    instanceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
        instanceUrl: args.instanceUrl,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("salesforceIntegrations", {
      organizationId: args.organizationId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      instanceUrl: args.instanceUrl,
      connectedAt: now,
      updatedAt: now,
    });
  },
});

/** ✅ NEW: Disconnect Salesforce (delete row) */
export const disconnectSalesforceIntegration = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return;

    await ctx.db.delete(existing._id);
  },
});
