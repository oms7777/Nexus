// packages/backend/convex/private/territories.ts
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

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
    organizationId: v.string(),
  },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("territories")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

/**
 * Crée ou met à jour un territoire (upsert par org + key).
 * - si countryCodes est vide/non fourni → on tente de remplir depuis GEO_PRESETS
 */
export const upsert = mutation({
  args: {
    organizationId: v.string(),
    key: v.string(), // slug stable, ex: "france", "emea_midmarket"
    label: v.string(),
    countryCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { organizationId, key, label, countryCodes }) => {
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
    await ctx.db.delete(territoryId);
  },
});
