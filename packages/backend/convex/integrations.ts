// packages/backend/convex/integrations.ts
import { query, mutation, action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";

/* ============================================================
   Types / Helpers
   ============================================================ */

type Plan = "starter" | "growth" | "enterprise";

function isActiveStatus(status: any) {
  return status === "active" || status === "trial";
}

async function requireOrgId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  const orgId = identity.orgId as string | undefined;
  if (!orgId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Organization not found" });
  }
  return orgId;
}

async function getSubscriptionByOrg(ctx: any, organizationId: string) {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
    .unique();
}

async function requireSlackEntitled(ctx: any, organizationId: string) {
  const sub = await getSubscriptionByOrg(ctx, organizationId);
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status = sub?.status ?? "paused";

  // Slack = inclus Growth+ uniquement, et seulement si actif/trial
  if (!isActiveStatus(status) || !(plan === "growth" || plan === "enterprise")) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Slack is available on Growth and Enterprise plans only.",
    });
  }
  return sub;
}

async function requireSalesforceEntitled(ctx: any, organizationId: string) {
  const sub = await getSubscriptionByOrg(ctx, organizationId);
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status = sub?.status ?? "paused";
  const addons = sub?.addons ?? {};

  // Salesforce = add-on uniquement, et JAMAIS en starter, et seulement si actif/trial
  if (!isActiveStatus(status) || plan === "starter" || addons.salesforce !== true) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Salesforce requires the Salesforce add-on (Growth/Enterprise only).",
    });
  }
  return sub;
}

/** DB getters by orgId (used by worker actions that receive orgId) */
async function getSlackIntegrationByOrg(ctx: any, organizationId: string) {
  return await ctx.db
    .query("slackIntegrations")
    .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
    .unique();
}

async function getSalesforceIntegrationByOrg(ctx: any, organizationId: string) {
  return await ctx.db
    .query("salesforceIntegrations")
    .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
    .unique();
}

async function getSalesforceAppConfigByOrg(ctx: any, organizationId: string) {
  return await ctx.db
    .query("salesforceAppConfigs")
    .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
    .unique();
}

/* ============================================================
   SLACK INTEGRATION (dashboard/private)
   ============================================================ */

export const getSlackIntegration = query({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);
    await requireSlackEntitled(ctx, organizationId);
    return await getSlackIntegrationByOrg(ctx, organizationId);
  },
});

export const saveSlackIntegration = mutation({
  args: {
    accessToken: v.string(),
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    defaultChannel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireOrgId(ctx);
    await requireSlackEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await getSlackIntegrationByOrg(ctx, organizationId);

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
      organizationId,
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
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);
    await requireSlackEntitled(ctx, organizationId);

    const existing = await getSlackIntegrationByOrg(ctx, organizationId);
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

/* ============================================================
   SLACK WORKER (called from booking/calendar; keeps orgId)
   ============================================================ */

export const sendSlackMessage = action({
  args: {
    organizationId: v.string(),
    text: v.string(),
    channelOverride: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, text, channelOverride }) => {
    // hard-gate worker side too
    await requireSlackEntitled(ctx, organizationId);

    const integration = await getSlackIntegrationByOrg(ctx, organizationId);
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

    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.log("Slack chat.postMessage error:", json.error);
    }
  },
});

/* ============================================================
   SALESFORCE: APP CONFIG (dashboard/private)
   ============================================================ */

export const getSalesforceAppConfig = query({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);
    await requireSalesforceEntitled(ctx, organizationId);
    return await getSalesforceAppConfigByOrg(ctx, organizationId);
  },
});

export const upsertSalesforceAppConfig = mutation({
  args: {
    clientId: v.string(),
    clientSecret: v.string(),
    loginUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireOrgId(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await getSalesforceAppConfigByOrg(ctx, organizationId);

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
      organizationId,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      loginUrl: args.loginUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/* ============================================================
   SALESFORCE: INTEGRATION TOKENS (dashboard/private)
   ============================================================ */

export const getSalesforceIntegration = query({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);
    await requireSalesforceEntitled(ctx, organizationId);
    return await getSalesforceIntegrationByOrg(ctx, organizationId);
  },
});

export const saveSalesforceIntegration = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    instanceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const organizationId = await requireOrgId(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await getSalesforceIntegrationByOrg(ctx, organizationId);

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
      organizationId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      instanceUrl: args.instanceUrl,
      connectedAt: now,
      updatedAt: now,
    });
  },
});

export const disconnectSalesforceIntegration = mutation({
  args: {},
  handler: async (ctx) => {
    const organizationId = await requireOrgId(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const existing = await getSalesforceIntegrationByOrg(ctx, organizationId);
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

/* ============================================================
   SALESFORCE: AUTO REFRESH (worker; keeps orgId)
   ============================================================ */

async function parseSfError(res: Response): Promise<any> {
  const txt = await res.text().catch(() => "");
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function isInvalidSession(payload: any): boolean {
  if (Array.isArray(payload)) {
    return payload.some((e) => e?.errorCode === "INVALID_SESSION_ID");
  }
  return payload?.errorCode === "INVALID_SESSION_ID";
}

// internal-ish mutation (called from action) — keep it gated
export const _updateSalesforceAccessToken = mutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, { organizationId, accessToken }) => {
    await requireSalesforceEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return { ok: false as const, reason: "NOT_CONNECTED" as const };

    await ctx.db.patch(existing._id, {
      accessToken,
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const refreshSalesforceAccessToken = action({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    await requireSalesforceEntitled(ctx, organizationId);

    const integration = await getSalesforceIntegrationByOrg(ctx, organizationId);

    if (!integration?.refreshToken || !integration?.instanceUrl) {
      return { ok: false as const, reason: "NO_REFRESH_TOKEN" as const };
    }

    const appConfig = await getSalesforceAppConfigByOrg(ctx, organizationId);

    const loginUrl = appConfig?.loginUrl?.trim() || "https://login.salesforce.com";
    const clientId = appConfig?.clientId || "";
    const clientSecret = appConfig?.clientSecret || "";

    if (!clientId || !clientSecret) {
      return { ok: false as const, reason: "MISSING_SF_APP_CONFIG" as const };
    }

    const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refreshToken,
      }),
    });

    const tokenJson: any = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.log("Salesforce refresh token failed:", tokenJson);
      return { ok: false as const, reason: "REFRESH_FAILED" as const, detail: tokenJson };
    }

    const newAccessToken = String(tokenJson.access_token);

    await ctx.runMutation(api.integrations._updateSalesforceAccessToken, {
      organizationId,
      accessToken: newAccessToken,
    });

    return { ok: true as const };
  },
});

async function sfFetch(
  ctx: any,
  organizationId: string,
  url: string,
  init: RequestInit,
  accessToken: string
) {
  const doFetch = async (token: string) => {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  };

  // 1) First try
  let res = await doFetch(accessToken);
  if (res.ok) return res;

  // 2) Detect INVALID_SESSION_ID
  const payload = await parseSfError(res);
  if (!isInvalidSession(payload)) {
    const err = new Error("SALESFORCE_REQUEST_FAILED");
    (err as any).detail = payload;
    throw err;
  }

  // 3) Refresh
  const refreshed = await ctx.runAction(api.integrations.refreshSalesforceAccessToken, {
    organizationId,
  });

  if (!refreshed?.ok) {
    const err = new Error("SALESFORCE_REFRESH_FAILED");
    (err as any).detail = refreshed;
    throw err;
  }

  // 4) Reload token from DB
  const updated = await getSalesforceIntegrationByOrg(ctx, organizationId);
  const newToken = updated?.accessToken;

  if (!newToken) {
    throw new Error("SALESFORCE_MISSING_TOKEN_AFTER_REFRESH");
  }

  // 5) Retry once
  res = await doFetch(newToken);
  if (res.ok) return res;

  const payload2 = await parseSfError(res);
  const err = new Error("SALESFORCE_REQUEST_FAILED_AFTER_REFRESH");
  (err as any).detail = payload2;
  throw err;
}

/* ============================================================
   SALESFORCE: CREATE/UPSERT LEAD + EVENT (worker; keeps orgId)
   ============================================================ */

export const createSalesforceLeadAndEvent = action({
  args: {
    organizationId: v.string(),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeePhone: v.optional(v.string()),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),

    // ✅ NEW
    attendeeDescription: v.optional(v.string()),

    startIso: v.string(),
    endIso: v.string(),
    meetingUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSalesforceEntitled(ctx, args.organizationId);

    const integration = await getSalesforceIntegrationByOrg(ctx, args.organizationId);

    if (!integration?.accessToken || !integration?.instanceUrl) {
      return {
        ok: false as const,
        step: "init" as const,
        reason: "NO_SALESFORCE_CONNECTION" as const,
      };
    }

    const accessToken = integration.accessToken;
    const instanceUrl = integration.instanceUrl;
    const base = `${instanceUrl}/services/data/v59.0`;

    const fullName = (args.attendeeName || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);

    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
    const lastName =
      parts.length > 1 ? parts[parts.length - 1] : parts[0] ? parts[0] : "Visitor";

    const company = (args.attendeeCompany ?? "").trim() || "Inboundless";
    const title = (args.attendeeRole ?? "").trim() || undefined;

    const leadStatus = "Open - Not Contacted";
    const useCase = (args.attendeeDescription ?? "").trim() || undefined;

    // 1) Lookup Lead by Email
    let leadId: string | null = null;
    try {
      const safeEmail = (args.attendeeEmail || "").replace(/'/g, "\\'");
      const soql = `SELECT Id, Description FROM Lead WHERE Email = '${safeEmail}' ORDER BY CreatedDate DESC LIMIT 1`;
      const qUrl = `${base}/query?q=${encodeURIComponent(soql)}`;

      const qRes = await sfFetch(ctx, args.organizationId, qUrl, { method: "GET" }, accessToken);
      const qJson: any = await qRes.json().catch(() => ({}));

      if (qRes.ok && Array.isArray(qJson?.records) && qJson.records.length > 0) {
        leadId = String(qJson.records[0].Id);

        // ✅ Optional: patch Lead.Description if empty or if you want to always update
        const existingDesc = String(qJson.records[0].Description ?? "").trim();
        if (useCase && !existingDesc) {
          try {
            await sfFetch(
              ctx,
              args.organizationId,
              `${base}/sobjects/Lead/${leadId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Description: useCase }),
              },
              accessToken
            );
          } catch (e) {
            console.log("Salesforce Lead patch (Description) failed:", (e as any)?.detail ?? e);
          }
        }
      }
    } catch (e) {
      console.log("Salesforce Lead lookup failed:", (e as any)?.detail ?? e);
    }

    // 2) Create Lead if absent
    if (!leadId) {
      const leadPayload: Record<string, any> = {
        FirstName: firstName || undefined,
        LastName: lastName,
        Company: company,
        Email: args.attendeeEmail,
        Phone: args.attendeePhone?.trim() || undefined,
        Title: title,
        LeadSource: args.source ?? "Inboundless",
        Status: leadStatus,

        // ✅ NEW: standard Lead.Description
        Description: useCase,
      };

      Object.keys(leadPayload).forEach((k) => leadPayload[k] === undefined && delete leadPayload[k]);

      try {
        const leadRes = await sfFetch(
          ctx,
          args.organizationId,
          `${base}/sobjects/Lead`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(leadPayload),
          },
          accessToken
        );

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
      } catch (e) {
        console.log("Salesforce Lead create exception:", (e as any)?.detail ?? e);
        return {
          ok: false as const,
          step: "lead_create" as const,
          reason: "LEAD_CREATE_FAILED" as const,
          detail: (e as any)?.detail ?? String(e),
          payload: leadPayload,
        };
      }
    }

    // 3) Create Event linked to Lead (WhoId)
    const descriptionLines = [
      // ✅ Put use case first (best for SDRs)
      useCase ? `Use case: ${useCase}` : null,
      "",
      "Booked via Inboundless",
      `Name: ${args.attendeeName}`,
      `Email: ${args.attendeeEmail}`,
      args.attendeePhone ? `Phone: ${args.attendeePhone}` : null,
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

    try {
      const eventRes = await sfFetch(
        ctx,
        args.organizationId,
        `${base}/sobjects/Event`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventPayload),
        },
        accessToken
      );

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
    } catch (e) {
      console.log("Salesforce Event create exception:", (e as any)?.detail ?? e);
      return {
        ok: true as const,
        leadId,
        eventOk: false as const,
        eventDetail: (e as any)?.detail ?? String(e),
        eventPayload,
      };
    }
  },
});
