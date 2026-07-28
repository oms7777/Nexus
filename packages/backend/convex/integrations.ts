// packages/backend/convex/integrations.ts
import { query, mutation, action, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { requireOrgAdmin, requireOrgId } from "./lib/authz";
import { writeAuditLog } from "./lib/audit";
import {
  hasInboundlessHubSpotEnvDefaults,
  hasInboundlessSalesforceEnvDefaults,
  mergeSalesforceOAuthCredentials,
} from "./lib/inboundlessOauthEnv";
import { hasInboundlessVapiEnvDefaults } from "./lib/inboundlessVapiEnv";

/* ============================================================
   Types / Helpers
   ============================================================ */

type Plan = "starter" | "growth" | "enterprise";

function isActiveStatus(status: any) {
  return status === "active" || status === "trial";
}

/* ============================================================
   DB GETTERS (QUERY) — usable from ACTION via ctx.runQuery
   ============================================================ */

export const _getSubscriptionByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const _getSlackIntegrationByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const _getSalesforceIntegrationByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const _getSalesforceAppConfigByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("salesforceAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const _getHubSpotIntegrationByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("hubspotIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

export const _getHubSpotAppConfigByOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("hubspotAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

/* ============================================================
   Entitlements (works in queries/mutations & actions)
   ============================================================ */

async function getSubscriptionByOrgSafe(ctx: any, organizationId: string) {
  if (ctx.db) {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q: any) => q.eq("organizationId", organizationId))
      .unique();
  }
  return await ctx.runQuery(api.integrations._getSubscriptionByOrg, { organizationId });
}

async function requireSlackEntitled(ctx: any, organizationId: string) {
  const sub = await getSubscriptionByOrgSafe(ctx, organizationId);
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status = sub?.status ?? "paused";

  if (!isActiveStatus(status) || !(plan === "growth" || plan === "enterprise")) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Slack is available on Growth and Enterprise plans only.",
    });
  }
  return sub;
}

async function requireSalesforceEntitled(ctx: any, organizationId: string) {
  const sub = await getSubscriptionByOrgSafe(ctx, organizationId);
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status = sub?.status ?? "paused";
  const addons = sub?.addons ?? {};

  if (!isActiveStatus(status) || plan === "starter" || addons.salesforce !== true) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Salesforce requires the Salesforce add-on (Growth/Enterprise only).",
    });
  }
  return sub;
}

async function requireHubSpotEntitled(ctx: any, organizationId: string) {
  const sub = await getSubscriptionByOrgSafe(ctx, organizationId);
  const plan: Plan = (sub?.plan ?? "starter") as Plan;
  const status = sub?.status ?? "paused";
  const addons = sub?.addons ?? {};

  if (!isActiveStatus(status) || plan === "starter" || addons.hubspot !== true) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "HubSpot requires the HubSpot add-on (Growth/Enterprise only).",
    });
  }
  return sub;
}

/* ============================================================
   SLACK INTEGRATION (dashboard/private)
   ============================================================ */

export const getSlackIntegration = query({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId } = await requireOrgAdmin(ctx);
    await requireSlackEntitled(ctx, organizationId);

    const integration = await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    // Never expose access tokens to the client.
    if (!integration) return null;
    return {
      teamId: integration.teamId,
      teamName: integration.teamName,
      defaultChannel: integration.defaultChannel,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
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
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireSlackEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        teamId: args.teamId,
        teamName: args.teamName,
        defaultChannel: args.defaultChannel ?? existing.defaultChannel,
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "integration.slack.updated",
        entityType: "slackIntegration",
        entityId: String(existing._id),
        meta: { teamName: args.teamName, teamId: args.teamId },
      });
      return;
    }

    const inserted = await ctx.db.insert("slackIntegrations", {
      organizationId,
      accessToken: args.accessToken,
      teamId: args.teamId,
      teamName: args.teamName,
      defaultChannel: args.defaultChannel ?? "#general",
      createdAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.slack.connected",
      entityType: "slackIntegration",
      entityId: String(inserted),
      meta: { teamName: args.teamName, teamId: args.teamId },
    });
  },
});

export const disconnectSlackIntegration = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireSlackEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("slackIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return;
    await ctx.db.delete(existing._id);
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.slack.disconnected",
      entityType: "slackIntegration",
      entityId: String(existing._id),
    });
  },
});

/* ============================================================
   SLACK WORKER (called from booking/calendar; keeps orgId)
   ✅ MAJ: support DM via dmChannelId
   ============================================================ */

export const sendSlackMessage = action({
  args: {
    organizationId: v.string(),
    text: v.string(),

    // DM path
    dmChannelId: v.optional(v.string()),
    slackUserId: v.optional(v.string()),

    // channel fallback (optionnel)
    channelOverride: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, text, dmChannelId, slackUserId, channelOverride }) => {
    await requireSlackEntitled(ctx, organizationId);

    const integration = await ctx.runQuery(api.integrations._getSlackIntegrationByOrg, { organizationId });
    if (!integration?.accessToken) return;

    const token = integration.accessToken;

    // 1) If no dmChannelId but we have slackUserId, open DM on the fly
    let effectiveDmChannelId = dmChannelId;

    if (!effectiveDmChannelId && slackUserId) {
      const openRes = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: slackUserId }),
      });

      const openJson: any = await openRes.json().catch(() => ({}));
      if (!openJson.ok) {
        console.log("Slack conversations.open error:", openJson.error);
      } else {
        effectiveDmChannelId = openJson.channel?.id;
      }
    }

    // 2) DM if possible
    if (effectiveDmChannelId) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: effectiveDmChannelId, text }),
      });

      const json: any = await res.json().catch(() => ({}));
      if (!json.ok) console.log("Slack DM chat.postMessage error:", json.error);
      return;
    }

    // 3) Fallback channel (optional)
    const rawChannel = channelOverride ?? integration.defaultChannel ?? "general";
    const channel = rawChannel.startsWith("#") ? rawChannel.slice(1) : rawChannel;

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) console.log("Slack channel chat.postMessage error:", json.error);
  },
});



/* ============================================================
   SALESFORCE: APP CONFIG (dashboard/private)
   (UNCHANGED below)
   ============================================================ */

// ---- keep your existing Salesforce code exactly as-is ----
export const getSalesforceAppConfig = query({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId } = await requireOrgAdmin(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const cfg = await ctx.db
      .query("salesforceAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    // Never expose clientSecret to the client.
    if (!cfg) return null;
    return {
      clientId: cfg.clientId,
      loginUrl: cfg.loginUrl,
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
      hasClientSecret: Boolean((cfg.clientSecret ?? "").trim()),
    };
  },
});

/** True when global Inboundless OAuth env vars are set (Convex Dashboard). Does not expose secrets. */
export const getInboundlessOAuthEnvHints = query({
  args: {},
  handler: async (ctx) => {
    await requireOrgAdmin(ctx);
    return {
      salesforceDefaultsAvailable: hasInboundlessSalesforceEnvDefaults(),
      hubspotDefaultsAvailable: hasInboundlessHubSpotEnvDefaults(),
      vapiDefaultsAvailable: hasInboundlessVapiEnvDefaults(),
    };
  },
});

export const upsertSalesforceAppConfig = mutation({
  args: {
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    loginUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("salesforceAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    const newSecret = (args.clientSecret ?? "").trim();
    if (!existing && !newSecret) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Client secret is required" });
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        clientSecret: newSecret ? newSecret : existing.clientSecret,
        loginUrl: args.loginUrl,
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "integration.salesforce_app_config.updated",
        entityType: "salesforceAppConfig",
        entityId: String(existing._id),
        meta: { loginUrl: args.loginUrl, clientId: args.clientId },
      });
      return;
    }

    const inserted = await ctx.db.insert("salesforceAppConfigs", {
      organizationId,
      clientId: args.clientId,
      clientSecret: newSecret,
      loginUrl: args.loginUrl,
      createdAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.salesforce_app_config.created",
      entityType: "salesforceAppConfig",
      entityId: String(inserted),
      meta: { loginUrl: args.loginUrl, clientId: args.clientId },
    });
  },
});

export const getSalesforceIntegration = query({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId } = await requireOrgAdmin(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const integration = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    // Never expose access/refresh tokens to the client.
    if (!integration) return null;
    return {
      instanceUrl: integration.instanceUrl,
      connectedAt: integration.connectedAt,
      updatedAt: integration.updatedAt,
      hasRefreshToken: Boolean((integration.refreshToken ?? "").trim()),
    };
  },
});

export const saveSalesforceIntegration = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    instanceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
        instanceUrl: args.instanceUrl,
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "integration.salesforce.updated",
        entityType: "salesforceIntegration",
        entityId: String(existing._id),
        meta: { instanceUrl: args.instanceUrl },
      });
      return;
    }

    const inserted = await ctx.db.insert("salesforceIntegrations", {
      organizationId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      instanceUrl: args.instanceUrl,
      connectedAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.salesforce.connected",
      entityType: "salesforceIntegration",
      entityId: String(inserted),
      meta: { instanceUrl: args.instanceUrl },
    });
  },
});

export const disconnectSalesforceIntegration = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireSalesforceEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return;
    await ctx.db.delete(existing._id);
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.salesforce.disconnected",
      entityType: "salesforceIntegration",
      entityId: String(existing._id),
    });
  },
});

/* ============================================================
   HUBSPOT: APP CONFIG + CONNECTION (dashboard/private)
   ============================================================ */

export const getHubSpotAppConfig = query({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId } = await requireOrgAdmin(ctx);
    await requireHubSpotEntitled(ctx, organizationId);

    const cfg = await ctx.db
      .query("hubspotAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    // Never expose clientSecret to the client.
    if (!cfg) return null;
    return {
      clientId: cfg.clientId,
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
      hasClientSecret: Boolean((cfg.clientSecret ?? "").trim()),
    };
  },
});

export const upsertHubSpotAppConfig = mutation({
  args: {
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireHubSpotEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("hubspotAppConfigs")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    const newSecret = (args.clientSecret ?? "").trim();
    if (!existing && !newSecret) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Client secret is required" });
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        clientSecret: newSecret ? newSecret : existing.clientSecret,
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "integration.hubspot_app_config.updated",
        entityType: "hubspotAppConfig",
        entityId: String(existing._id),
        meta: { clientId: args.clientId },
      });
      return;
    }

    const inserted = await ctx.db.insert("hubspotAppConfigs", {
      organizationId,
      clientId: args.clientId,
      clientSecret: newSecret,
      createdAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.hubspot_app_config.created",
      entityType: "hubspotAppConfig",
      entityId: String(inserted),
      meta: { clientId: args.clientId },
    });
  },
});

export const getHubSpotIntegration = query({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId } = await requireOrgAdmin(ctx);
    await requireHubSpotEntitled(ctx, organizationId);

    const integration = await ctx.db
      .query("hubspotIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    // Never expose access/refresh tokens to the client.
    if (!integration) return null;
    return {
      portalId: integration.portalId,
      hubDomain: integration.hubDomain,
      connectedAt: integration.connectedAt,
      updatedAt: integration.updatedAt,
      hasRefreshToken: Boolean((integration.refreshToken ?? "").trim()),
    };
  },
});

export const saveHubSpotIntegration = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    portalId: v.optional(v.string()),
    hubDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireHubSpotEntitled(ctx, organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("hubspotIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
        ...(args.portalId !== undefined ? { portalId: args.portalId } : {}),
        ...(args.hubDomain !== undefined ? { hubDomain: args.hubDomain } : {}),
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "integration.hubspot.updated",
        entityType: "hubspotIntegration",
        entityId: String(existing._id),
        meta: { portalId: args.portalId, hubDomain: args.hubDomain },
      });
      return;
    }

    const inserted = await ctx.db.insert("hubspotIntegrations", {
      organizationId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      portalId: args.portalId,
      hubDomain: args.hubDomain,
      connectedAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.hubspot.connected",
      entityType: "hubspotIntegration",
      entityId: String(inserted),
      meta: { portalId: args.portalId, hubDomain: args.hubDomain },
    });
  },
});

export const disconnectHubSpotIntegration = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgAdmin(ctx);
    await requireHubSpotEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("hubspotIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return;
    await ctx.db.delete(existing._id);
    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "integration.hubspot.disconnected",
      entityType: "hubspotIntegration",
      entityId: String(existing._id),
    });
  },
});


/* ============================================================
   SALESFORCE: AUTO REFRESH (worker; keeps orgId)
   ✅ FIX: no ctx.db in action
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

/** Called from `refreshSalesforceAccessToken` action only — not exposed to clients. */
export const updateSalesforceAccessTokenInternal = internalMutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, { organizationId, accessToken }) => {
    await requireSalesforceEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("salesforceIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
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

    const integration = await ctx.runQuery(api.integrations._getSalesforceIntegrationByOrg, {
      organizationId,
    });

    if (!integration?.refreshToken || !integration?.instanceUrl) {
      return { ok: false as const, reason: "NO_REFRESH_TOKEN" as const };
    }

    const appConfig = await ctx.runQuery(api.integrations._getSalesforceAppConfigByOrg, {
      organizationId,
    });

    const merged = mergeSalesforceOAuthCredentials(appConfig);
    if (!merged) {
      return { ok: false as const, reason: "MISSING_SF_APP_CONFIG" as const };
    }

    const { clientId, clientSecret, loginUrl } = merged;

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

    await ctx.runMutation(
      (internal as any).integrations.updateSalesforceAccessTokenInternal,
      {
        organizationId,
        accessToken: newAccessToken,
      },
    );

    return { ok: true as const };
  },
});

async function sfFetch(
  ctx: any,
  organizationId: string,
  url: string,
  init: RequestInit,
  accessToken: string,
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

  // 4) Reload token from DB (via query)
  const updated = await ctx.runQuery(api.integrations._getSalesforceIntegrationByOrg, {
    organizationId,
  });
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
   ✅ FIX: no ctx.db in action
   ============================================================ */

/** Visitor booking text + optional link to Inboundless conversation (Lead.Description / Event context). */
function buildSalesforceLeadDescription(
  useCase: string | undefined,
  conversationUrl: string | undefined,
): string | undefined {
  const u = (useCase ?? "").trim();
  const url = (conversationUrl ?? "").trim();
  if (!u && !url) return undefined;
  const lines: string[] = [];
  if (u) lines.push(u);
  if (url) lines.push(`Conversation: ${url}`);
  return lines.join("\n\n");
}

const SF_NOTE_BODY_MAX = 31_000;

/**
 * Reads the Opportunity a Lead converted into, so a booking can be tied to pipeline value.
 * Read-only: revenue attribution never writes to the CRM.
 */
export const fetchSalesforceOpportunityForLead = action({
  args: {
    organizationId: v.string(),
    leadId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations._getSalesforceIntegrationByOrg, {
      organizationId: args.organizationId,
    });

    if (!integration?.accessToken || !integration?.instanceUrl) {
      return { ok: false as const, reason: "NO_SALESFORCE_CONNECTION" as const };
    }

    const accessToken = integration.accessToken;
    const base = `${integration.instanceUrl}/services/data/v59.0`;
    const safeLeadId = args.leadId.replace(/[^a-zA-Z0-9]/g, "");

    if (!safeLeadId) return { ok: false as const, reason: "INVALID_LEAD_ID" as const };

    try {
      const leadSoql = `SELECT Id, IsConverted, ConvertedOpportunityId FROM Lead WHERE Id = '${safeLeadId}' LIMIT 1`;
      const leadRes = await sfFetch(
        ctx,
        args.organizationId,
        `${base}/query?q=${encodeURIComponent(leadSoql)}`,
        { method: "GET" },
        accessToken,
      );
      const leadJson: any = await leadRes.json().catch(() => ({}));
      const lead = leadJson?.records?.[0];

      if (!lead) return { ok: false as const, reason: "LEAD_NOT_FOUND" as const };
      if (!lead.ConvertedOpportunityId) {
        return { ok: true as const, converted: false as const };
      }

      const oppId = String(lead.ConvertedOpportunityId).replace(/[^a-zA-Z0-9]/g, "");
      const oppSoql = `SELECT Id, Amount, StageName, IsClosed, IsWon, CloseDate, CurrencyIsoCode FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`;

      const oppRes = await sfFetch(
        ctx,
        args.organizationId,
        `${base}/query?q=${encodeURIComponent(oppSoql)}`,
        { method: "GET" },
        accessToken,
      );
      const oppJson: any = await oppRes.json().catch(() => ({}));
      const opp = oppJson?.records?.[0];

      if (!opp) return { ok: true as const, converted: false as const };

      return {
        ok: true as const,
        converted: true as const,
        dealId: String(opp.Id),
        amount: typeof opp.Amount === "number" ? opp.Amount : undefined,
        // Orgs without multi-currency enabled don't return CurrencyIsoCode at all.
        currency: typeof opp.CurrencyIsoCode === "string" ? opp.CurrencyIsoCode : undefined,
        stage: typeof opp.StageName === "string" ? opp.StageName : undefined,
        isClosed: opp.IsClosed === true,
        isWon: opp.IsWon === true,
        closeDate: typeof opp.CloseDate === "string" ? opp.CloseDate : undefined,
      };
    } catch (e) {
      console.log("Salesforce opportunity lookup failed:", (e as any)?.detail ?? e);
      return { ok: false as const, reason: "LOOKUP_FAILED" as const };
    }
  },
});

export const createSalesforceLeadAndEvent = action({
  args: {
    organizationId: v.string(),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeePhone: v.optional(v.string()),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
    attendeeDescription: v.optional(v.string()),
    /** App link to the conversation (shown on Lead + Event, not in Note). */
    conversationUrl: v.optional(v.string()),
    /** AI lead summary (markdown) — stored in a Salesforce Note on the Lead. */
    aiLeadSummaryMarkdown: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    meetingUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSalesforceEntitled(ctx, args.organizationId);

    const integration = await ctx.runQuery(api.integrations._getSalesforceIntegrationByOrg, {
      organizationId: args.organizationId,
    });

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
    const leadDescription = buildSalesforceLeadDescription(useCase, args.conversationUrl);

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

        // Refresh Lead.Description with latest booking: visitor text + conversation link
        if (leadDescription) {
          try {
            await sfFetch(
              ctx,
              args.organizationId,
              `${base}/sobjects/Lead/${leadId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ Description: leadDescription }),
              },
              accessToken,
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
        Description: leadDescription,
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
          accessToken,
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

    // 2b) AI summary → classic Note on Lead (not in Description)
    const summaryRaw = (args.aiLeadSummaryMarkdown ?? "").trim();
    if (leadId && summaryRaw) {
      let body = summaryRaw;
      if (body.length > SF_NOTE_BODY_MAX) {
        body = `${body.slice(0, SF_NOTE_BODY_MAX - 20)}\n\n…(truncated)`;
      }
      try {
        const noteRes = await sfFetch(
          ctx,
          args.organizationId,
          `${base}/sobjects/Note`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              Title: "Inboundless — AI lead summary",
              Body: body,
              ParentId: leadId,
              IsPrivate: false,
            }),
          },
          accessToken,
        );
        const noteJson: any = await noteRes.json().catch(() => ({}));
        if (!noteRes.ok) {
          console.log("Salesforce Note create failed:", noteJson);
        }
      } catch (e) {
        console.log("Salesforce Note create exception:", (e as any)?.detail ?? e);
      }
    }

    // 3) Create Event linked to Lead (WhoId)
    const descriptionLines = [
      useCase ? `Use case: ${useCase}` : null,
      args.conversationUrl?.trim() ? `Conversation: ${args.conversationUrl.trim()}` : null,
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
        accessToken,
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
