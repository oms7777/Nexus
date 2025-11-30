// packages/backend/convex/integrations.ts
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/* ============================================================
   QUERY: lire l'intégration Slack pour une organisation
   ============================================================ */
export const getSlackIntegration = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .unique();
  },
});

/* ============================================================
   MUTATION: save Slack integration (appelée depuis le callback OAuth)
   ============================================================ */
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
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
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
      defaultChannel: args.defaultChannel ?? "#general", // 👈 default
      createdAt: now,
      updatedAt: now,
    });
  },
});

/* ============================================================
   ACTION: envoyer un message Slack
   ============================================================ */
export const sendSlackMessage = action({
  args: {
    organizationId: v.string(),
    text: v.string(),
    channelOverride: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, text, channelOverride }) => {
    const integration = await ctx.runQuery(
      api.integrations.getSlackIntegration,
      { organizationId }
    );

    if (!integration) {
      console.log("sendSlackMessage: no Slack integration for org", organizationId);
      return;
    }

    // Normalise le channel : "general" ou "#general" -> "general"
    const rawChannel =
      channelOverride ?? integration.defaultChannel ?? "general";

    const channel = rawChannel.startsWith("#")
      ? rawChannel.slice(1)
      : rawChannel;

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
