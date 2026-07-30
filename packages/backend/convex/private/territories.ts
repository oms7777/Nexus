// packages/backend/convex/private/territories.ts
import { query, mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireOrgId, requireOrgManager } from "../lib/authz";
import { writeAuditLog } from "../lib/audit";

/**
 * Presets géographiques globaux.
 * L’admin n’a plus qu’à créer un territoire avec une key comme "mena", "europe", etc.
 * et les countryCodes sont remplis automatiquement si non fournis.
 */
const GEO_PRESETS: Record<
  string,
  { label: string; countryCodes: string[] }
> = {
  france: {
    label: "France",
    countryCodes: ["FR"],
  },
  morocco: {
    label: "Morocco",
    countryCodes: ["MA"],
  },
  mena: {
    label: "MENA",
    countryCodes: [
      "DZ", // Algeria
      "BH", // Bahrain
      "EG", // Egypt
      "IQ", // Iraq
      "IL", // Israel
      "JO", // Jordan
      "KW", // Kuwait
      "LB", // Lebanon
      "LY", // Libya
      "MA", // Morocco
      "OM", // Oman
      "PS", // Palestine
      "QA", // Qatar
      "SA", // Saudi Arabia
      "SY", // Syria
      "TN", // Tunisia
      "AE", // United Arab Emirates
      "YE", // Yemen
    ],
  },
  europe: {
    label: "Europe",
    countryCodes: [
      "AL",
      "AD",
      "AT",
      "BY",
      "BE",
      "BA",
      "BG",
      "HR",
      "CY",
      "CZ",
      "DK",
      "EE",
      "FI",
      "FR",
      "DE",
      "GR",
      "HU",
      "IS",
      "IE",
      "IT",
      "LV",
      "LI",
      "LT",
      "LU",
      "MT",
      "MD",
      "MC",
      "ME",
      "NL",
      "MK",
      "NO",
      "PL",
      "PT",
      "RO",
      "RU",
      "SM",
      "RS",
      "SK",
      "SI",
      "ES",
      "SE",
      "CH",
      "UA",
      "GB",
      "VA",
    ],
  },
  north_america: {
    label: "North America",
    countryCodes: [
      "US",
      "CA",
      "MX",
    ],
  },
  apac: {
    label: "APAC",
    countryCodes: [
      "AU",
      "NZ",
      "CN",
      "HK",
      "JP",
      "KR",
      "IN",
      "ID",
      "MY",
      "SG",
      "TH",
      "VN",
      "PH",
      "TW",
      "PK",
      "BD",
      "LK",
    ],
  },
};

/**
 * Liste les territoires d'une org.
 */
export const listForOrg = query({
  args: {
    /** @deprecated Ignored for authorization; org is taken from the signed-in user. */
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId }) => {
    const orgId = await requireOrgId(ctx);
    if (organizationId && organizationId !== orgId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Organization mismatch" });
    }
    return await ctx.db
      .query("territories")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

/**
 * Crée ou met à jour un territoire (upsert par org + key).
 * - si countryCodes est vide/non fourni → on tente de remplir depuis GEO_PRESETS
 */
export const upsert = mutation({
  args: {
    /** @deprecated Ignored for writes; org is taken from the signed-in admin. */
    organizationId: v.optional(v.string()),
    key: v.string(), // slug stable, ex: "france", "emea_midmarket"
    label: v.string(),
    countryCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { organizationId: _clientOrgId, key, label, countryCodes }) => {
    const { orgId: organizationId, userId, orgRole } = await requireOrgManager(ctx);
    const now = Date.now();

    const normalizedKey = key.trim().toLowerCase();
    const preset = GEO_PRESETS[normalizedKey];

    // 1) Normalisation des countryCodes
    let normalizedCountries: string[];

    if (countryCodes && countryCodes.length > 0) {
      normalizedCountries = countryCodes
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
    } else if (preset) {
      normalizedCountries = preset.countryCodes;
    } else {
      normalizedCountries = [];
    }

    const existing = await ctx.db
      .query("territories")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", organizationId).eq("key", normalizedKey),
      )
      .unique();

    const docBase = {
      label,
      countryCodes: normalizedCountries,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, docBase);
      await writeAuditLog(ctx, {
        organizationId,
        actorUserId: userId,
        actorOrgRole: orgRole,
        action: "territory.updated",
        entityType: "territory",
        entityId: String(existing._id),
        meta: { key: normalizedKey, label },
      });
      return existing._id;
    }

    const sortOrder = now;

    const id = await ctx.db.insert("territories", {
      organizationId,
      key: normalizedKey,
      label,
      countryCodes: normalizedCountries,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(ctx, {
      organizationId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "territory.created",
      entityType: "territory",
      entityId: String(id),
      meta: { key: normalizedKey, label },
    });

    return id;
  },
});

/**
 * Supprime un territoire.
 */
export const remove = mutation({
  args: {
    territoryId: v.id("territories"),
  },
  handler: async (ctx, { territoryId }) => {
    const { orgId, userId, orgRole } = await requireOrgManager(ctx);
    const doc = await ctx.db.get(territoryId);
    if (!doc || doc.organizationId !== orgId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Territory not found" });
    }
    await ctx.db.delete(territoryId);
    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorUserId: userId,
      actorOrgRole: orgRole,
      action: "territory.deleted",
      entityType: "territory",
      entityId: String(territoryId),
      meta: { key: doc.key },
    });
  },
});
