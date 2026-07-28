// HubSpot CRM worker — separate file avoids circular TS refs with `api.integrations`.
import { action, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { mergeHubSpotOAuthCredentials } from "./lib/inboundlessOauthEnv";

type Plan = "starter" | "growth" | "enterprise";

function isActiveStatus(status: string) {
  return status === "active" || status === "trial";
}

async function requireHubSpotEntitled(ctx: any, organizationId: string) {
  const sub = await ctx.runQuery(api.integrations._getSubscriptionByOrg, { organizationId });
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

const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

/** Must match scopes configured on the HubSpot app (see app-hsmeta.json). */
export const HUBSPOT_OAUTH_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  // Read-only, used by revenue attribution to read the deals a booking produced.
  "crm.objects.deals.read",
].join(" ");

export const updateHubSpotAccessTokenInternal = internalMutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, accessToken, refreshToken }) => {
    await requireHubSpotEntitled(ctx, organizationId);

    const existing = await ctx.db
      .query("hubspotIntegrations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!existing) return { ok: false as const, reason: "NOT_CONNECTED" as const };

    await ctx.db.patch(existing._id, {
      accessToken,
      ...(refreshToken !== undefined ? { refreshToken } : {}),
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const refreshHubSpotAccessToken = action({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    await requireHubSpotEntitled(ctx, organizationId);

    const integration = await ctx.runQuery(api.integrations._getHubSpotIntegrationByOrg, {
      organizationId,
    });

    if (!integration?.refreshToken) {
      return { ok: false as const, reason: "NO_REFRESH_TOKEN" as const };
    }

    const appConfig = await ctx.runQuery(api.integrations._getHubSpotAppConfigByOrg, {
      organizationId,
    });

    const merged = mergeHubSpotOAuthCredentials(appConfig);
    if (!merged) {
      return { ok: false as const, reason: "MISSING_HUBSPOT_APP_CONFIG" as const };
    }

    const { clientId, clientSecret } = merged;

    const tokenRes = await fetch(HUBSPOT_TOKEN_URL, {
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
      console.log("HubSpot refresh token failed:", tokenJson);
      return { ok: false as const, reason: "REFRESH_FAILED" as const, detail: tokenJson };
    }

    const newAccessToken = String(tokenJson.access_token);
    const newRefresh =
      tokenJson.refresh_token !== undefined ? String(tokenJson.refresh_token) : integration.refreshToken;

    await ctx.runMutation(internal.hubspot.updateHubSpotAccessTokenInternal, {
      organizationId,
      accessToken: newAccessToken,
      refreshToken: newRefresh,
    });

    return { ok: true as const };
  },
});

async function parseHubSpotErr(res: Response): Promise<unknown> {
  const txt = await res.text().catch(() => "");
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function hubFetch(
  ctx: any,
  organizationId: string,
  url: string,
  init: RequestInit,
  accessToken: string,
): Promise<Response> {
  const doFetch = async (token: string) => {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  };

  let res = await doFetch(accessToken);
  if (res.ok) return res;

  const payload = await parseHubSpotErr(res);
  const status = res.status;
  const isUnauthorized =
    status === 401 ||
    (typeof payload === "object" &&
      payload !== null &&
      (payload as { category?: string }).category === "EXPIRED_AUTHENTICATION");

  if (!isUnauthorized) {
    const err = new Error("HUBSPOT_REQUEST_FAILED");
    (err as any).detail = payload;
    (err as any).status = status;
    throw err;
  }

  const refreshed = await ctx.runAction(api.hubspot.refreshHubSpotAccessToken, {
    organizationId,
  });

  if (!refreshed?.ok) {
    const err = new Error("HUBSPOT_REFRESH_FAILED");
    (err as any).detail = refreshed;
    throw err;
  }

  const updated = await ctx.runQuery(api.integrations._getHubSpotIntegrationByOrg, {
    organizationId,
  });
  const newToken = updated?.accessToken;

  if (!newToken) {
    throw new Error("HUBSPOT_MISSING_TOKEN_AFTER_REFRESH");
  }

  res = await doFetch(newToken);
  if (res.ok) return res;

  const payload2 = await parseHubSpotErr(res);
  const err = new Error("HUBSPOT_REQUEST_FAILED_AFTER_REFRESH");
  (err as any).detail = payload2;
  (err as any).status = res.status;
  throw err;
}

/**
 * Reads the deals associated with a contact, so a booking can be tied to pipeline value.
 * Read-only: revenue attribution never writes to the CRM.
 */
export const fetchHubSpotDealsForContact = action({
  args: {
    organizationId: v.string(),
    contactId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations._getHubSpotIntegrationByOrg, {
      organizationId: args.organizationId,
    });

    if (!integration?.accessToken) {
      return { ok: false as const, reason: "NO_HUBSPOT_CONNECTION" as const };
    }

    const accessToken = integration.accessToken;
    const base = "https://api.hubapi.com";
    const contactId = args.contactId.replace(/[^0-9]/g, "");

    if (!contactId) return { ok: false as const, reason: "INVALID_CONTACT_ID" as const };

    try {
      const assocRes = await hubFetch(
        ctx,
        args.organizationId,
        `${base}/crm/v4/objects/contacts/${contactId}/associations/deals?limit=20`,
        { method: "GET" },
        accessToken,
      );
      const assocJson: any = await assocRes.json().catch(() => ({}));
      const dealIds: string[] = Array.isArray(assocJson?.results)
        ? assocJson.results.map((r: any) => String(r?.toObjectId ?? "")).filter(Boolean)
        : [];

      if (dealIds.length === 0) return { ok: true as const, deals: [] };

      const batchRes = await hubFetch(
        ctx,
        args.organizationId,
        `${base}/crm/v3/objects/deals/batch/read`,
        {
          method: "POST",
          body: JSON.stringify({
            properties: ["amount", "dealstage", "closedate", "dealname", "hs_is_closed_won"],
            inputs: dealIds.map((id) => ({ id })),
          }),
        },
        accessToken,
      );
      const batchJson: any = await batchRes.json().catch(() => ({}));
      const rows: any[] = Array.isArray(batchJson?.results) ? batchJson.results : [];

      const deals = rows.map((d) => {
        const p = d?.properties ?? {};
        const amount = Number(p.amount);
        return {
          dealId: String(d?.id ?? ""),
          amount: Number.isFinite(amount) ? amount : undefined,
          stage: typeof p.dealstage === "string" ? p.dealstage : undefined,
          closeDate: typeof p.closedate === "string" ? p.closedate : undefined,
          // HubSpot returns this calculated property as the string "true" / "false".
          isWon: p.hs_is_closed_won === "true" || p.hs_is_closed_won === true,
        };
      });

      return { ok: true as const, deals };
    } catch (e) {
      console.log("HubSpot deals lookup failed:", (e as any)?.detail ?? e);
      return { ok: false as const, reason: "LOOKUP_FAILED" as const };
    }
  },
});

export const createHubSpotContactFromBooking = action({
  args: {
    organizationId: v.string(),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    attendeePhone: v.optional(v.string()),
    attendeeCompany: v.optional(v.string()),
    attendeeRole: v.optional(v.string()),
    attendeeDescription: v.optional(v.string()),
    conversationUrl: v.optional(v.string()),
    startIso: v.string(),
    endIso: v.string(),
    meetingUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireHubSpotEntitled(ctx, args.organizationId);

    const integration = await ctx.runQuery(api.integrations._getHubSpotIntegrationByOrg, {
      organizationId: args.organizationId,
    });

    if (!integration?.accessToken) {
      return {
        ok: false as const,
        reason: "NO_HUBSPOT_CONNECTION" as const,
      };
    }

    const accessToken: string = integration.accessToken;
    const base = "https://api.hubapi.com";

    const fullName = (args.attendeeName || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName: string =
      parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
    const lastName: string =
      parts.length > 1 ? (parts[parts.length - 1] ?? "Visitor") : (parts[0] ?? "Visitor");

    const company = (args.attendeeCompany ?? "").trim() || "Inboundless";
    const title = (args.attendeeRole ?? "").trim();
    const useCase = (args.attendeeDescription ?? "").trim();
    const phone = (args.attendeePhone ?? "").trim();
    const email = (args.attendeeEmail || "").trim();

    const jobPieces = [title || null, useCase ? `— ${useCase.slice(0, 120)}` : null].filter(Boolean);
    let jobtitle = jobPieces.join(" ").slice(0, 250);
    if (!jobtitle) jobtitle = "Inboundless meeting";

    const properties: Record<string, string> = {
      firstname: firstName,
      lastname: lastName,
      email,
      phone,
      company,
      jobtitle,
    };

    const website = (args.conversationUrl ?? "").trim();
    if (website) properties.website = website;

    const bookingNote = [
      useCase ? `Use case: ${useCase}` : null,
      args.conversationUrl?.trim() ? `Conversation: ${args.conversationUrl.trim()}` : null,
      "Booked via Inboundless",
      `When: ${args.startIso} → ${args.endIso}`,
      args.meetingUrl?.trim() ? `Meeting: ${args.meetingUrl.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (bookingNote.length > 0 && bookingNote.length < 65000) {
      properties.message = bookingNote;
    }

    let contactId: string | null = null;
    try {
      const searchRes = await hubFetch(
        ctx,
        args.organizationId,
        `${base}/crm/v3/objects/contacts/search`,
        {
          method: "POST",
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [{ propertyName: "email", operator: "EQ", value: email }],
              },
            ],
            properties: ["email", "firstname", "lastname"],
            limit: 1,
          }),
        },
        accessToken,
      );
      const searchJson: any = await searchRes.json().catch(() => ({}));
      if (searchRes.ok && Array.isArray(searchJson?.results) && searchJson.results.length > 0) {
        contactId = String(searchJson.results[0].id);
      }
    } catch (e) {
      console.log("HubSpot contact search failed:", (e as any)?.detail ?? e);
    }

    const payload = { properties };

    const tryWrite = async (body: Record<string, unknown>): Promise<Response> => {
      if (contactId) {
        return hubFetch(ctx, args.organizationId, `${base}/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }, accessToken);
      }
      return hubFetch(ctx, args.organizationId, `${base}/crm/v3/objects/contacts`, {
        method: "POST",
        body: JSON.stringify(body),
      }, accessToken);
    };

    try {
      let res: Response = await tryWrite(payload);
      if (!res.ok) {
        const errJson: any = await res.json().catch(() => ({}));
        if (errJson?.message?.includes?.("Property") && properties.message) {
          const { message: _m, ...rest } = properties;
          res = await tryWrite({ properties: rest });
        }
        if (!res.ok) {
          const detail: unknown = await res.json().catch(() => ({}));
          console.log("HubSpot contact upsert failed:", detail);
          return { ok: false as const, reason: "CONTACT_UPSERT_FAILED" as const, detail };
        }
      }

      // On create, the real id only exists in the response body — and revenue
      // attribution later needs it to walk from contact to associated deals.
      if (!contactId) {
        const created: any = await res.json().catch(() => ({}));
        if (created?.id) contactId = String(created.id);
      }

      return { ok: true as const, contactId: contactId ?? undefined };
    } catch (e) {
      console.log("HubSpot contact upsert exception:", (e as any)?.detail ?? e);
      return {
        ok: false as const,
        reason: "CONTACT_UPSERT_FAILED" as const,
        detail: (e as any)?.detail ?? String(e),
      };
    }
  },
});
