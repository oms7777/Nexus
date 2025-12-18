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

    if (!integration) return;

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
      console.log("Slack chat.postMessage error:", json.error);
    }
  },
});

/* ============================================================
   SALESFORCE: APP CONFIG (per org)
   ============================================================ */

export const getSalesforceAppConfig = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("salesforceAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const upsertSalesforceAppConfig = mutation({
  args: {
    organizationId: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    loginUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("salesforceAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        clientSecret: args.clientSecret,
        loginUrl: args.loginUrl,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("salesforceAppConfigs", {
      organizationId: args.organizationId,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      loginUrl: args.loginUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/* ============================================================
   SALESFORCE: INTEGRATION TOKENS (per org)
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

/* ============================================================
   SALESFORCE: CREATE/UPSERT LEAD + EVENT (when a meeting is booked)
   ============================================================ */

export const createSalesforceLeadAndEvent = action({
  args: {
    organizationId: v.string(),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    meetingUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations.getSalesforceIntegration, {
      organizationId: args.organizationId,
    });

    if (!integration?.accessToken || !integration?.instanceUrl) {
      return { ok: false as const, step: "init" as const, reason: "NO_SALESFORCE_CONNECTION" as const };
    }

    const accessToken = integration.accessToken;
    const instanceUrl = integration.instanceUrl;

    const base = `${instanceUrl}/services/data/v59.0`;

    const fullName = (args.attendeeName || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);

    const firstName =
      parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";

    const lastName =
      parts.length > 1 ? parts[parts.length - 1] : (parts[0] ? parts[0] : "Visitor");

    const company = (args.attendeeCompany ?? "").trim() || "Inboundless";
    const title = (args.attendeeRole ?? "").trim() || undefined;

    // NOTE: picklist API value (pas la traduction UI)
    const leadStatus = "Open - Not Contacted";

    // 1) Chercher un Lead existant par Email (évite Duplicate Rules)
    let leadId: string | null = null;
    try {
      const safeEmail = (args.attendeeEmail || "").replace(/'/g, "\\'");
      const soql = `SELECT Id FROM Lead WHERE Email = '${safeEmail}' ORDER BY CreatedDate DESC LIMIT 1`;
      const qUrl = `${base}/query?q=${encodeURIComponent(soql)}`;

      const qRes = await fetch(qUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const qJson: any = await qRes.json().catch(() => ({}));
      if (qRes.ok && Array.isArray(qJson?.records) && qJson.records.length > 0) {
        leadId = String(qJson.records[0].Id);
      } else if (!qRes.ok) {
        // pas bloquant, mais utile pour debug
        console.log("Salesforce Lead lookup failed:", qJson);
      }
    } catch (e) {
      console.log("Salesforce Lead lookup exception:", e);
    }

    // 2) Créer le Lead si absent
    if (!leadId) {
      const leadPayload: Record<string, any> = {
        FirstName: firstName || undefined,
        LastName: lastName,
        Company: company,
        Email: args.attendeeEmail,
        Title: title,
        LeadSource: args.source ?? "Inboundless",
        Status: leadStatus,
      };
      Object.keys(leadPayload).forEach((k) => leadPayload[k] === undefined && delete leadPayload[k]);

      const leadRes = await fetch(`${base}/sobjects/Lead`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(leadPayload),
      });

      const leadJson: any = await leadRes.json().catch(() => ({}));

      if (!leadRes.ok || !leadJson?.id) {
        console.log("Salesforce Lead create failed:", leadJson);
        return {
          ok: false as const,
          step: "lead_create" as const,
          reason: "LEAD_CREATE_FAILED" as const,
          detail: leadJson,
          payload: leadPayload,
        };
      }

      leadId = String(leadJson.id);
    }

    // 3) Event lié au Lead (WhoId)
    const descriptionLines = [
      "Booked via Inboundless",
      `Name: ${args.attendeeName}`,
      `Email: ${args.attendeeEmail}`,
      args.attendeeCompany ? `Company: ${args.attendeeCompany}` : null,
      args.attendeeRole ? `Role: ${args.attendeeRole}` : null,
      args.meetingUrl ? `Meeting: ${args.meetingUrl}` : null,
    ].filter(Boolean);

    const eventPayload: Record<string, any> = {
      Subject: `Demo booked - ${args.attendeeName}`,
      WhoId: leadId,
      StartDateTime: args.startIso,
      EndDateTime: args.endIso,
      Description: descriptionLines.join("\n"),
    };

    const eventRes = await fetch(`${base}/sobjects/Event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    const eventJson: any = await eventRes.json().catch(() => ({}));

    if (!eventRes.ok || !eventJson?.id) {
      console.log("Salesforce Event create failed:", eventJson);
      return {
        ok: true as const,
        leadId,
        eventOk: false as const,
        eventDetail: eventJson,
        eventPayload,
      };
    }

    return {
      ok: true as const,
      leadId,
      eventOk: true as const,
      eventId: String(eventJson.id),
    };
  },
});
