// packages/backend/convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ---------- Billing / Settings ----------
  subscriptions: defineTable({
    organizationId: v.string(),
    status: v.string(),
  }).index("by_organization_id", ["organizationId"]),

  widgetSettings: defineTable({
    organizationId: v.string(),
    greetMessage: v.string(),
    defaultSuggestions: v.object({
      suggestion1: v.optional(v.string()),
      suggestion2: v.optional(v.string()),
      suggestion3: v.optional(v.string()),
    }),
    vapiSettings: v.object({
      assistantId: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
    }),
  }).index("by_organization_id", ["organizationId"]),

  plugins: defineTable({
    organizationId: v.string(),
    service: v.union(v.literal("vapi")),
    secretName: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_id_and_service", ["organizationId", "service"]),

  // ---------- Conversations / Visitors ----------
  conversations: defineTable({
    threadId: v.string(),
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    status: v.union(
      v.literal("unresolved"),
      v.literal("escalated"),
      v.literal("resolved"),
    ),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_contact_session_id", ["contactSessionId"])
    .index("by_thread_id", ["threadId"])
    .index("by_status_and_organization_id", ["status", "organizationId"]),

  contactSessions: defineTable({
    name: v.string(),
    email: v.string(),
    organizationId: v.string(),
    expiresAt: v.number(),
    metadata: v.optional(v.object({
      userAgent: v.optional(v.string()),
      language: v.optional(v.string()),
      languages: v.optional(v.string()),
      platform: v.optional(v.string()),
      vendor: v.optional(v.string()),
      screenResolution: v.optional(v.string()),
      viewportSize: v.optional(v.string()),
      timezone: v.optional(v.string()),
      timezoneOffset: v.optional(v.number()),
      cookieEnabled: v.optional(v.boolean()),
      referrer: v.optional(v.string()),
      currentUrl: v.optional(v.string()),
      title: v.optional(v.string()),
      // GEO (via ipdata)
      ip: v.optional(v.string()),
      city: v.optional(v.string()),
      countryCode: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      // simple analytics
      pages: v.optional(v.array(v.string())),
    })),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_expires_at", ["expiresAt"]),

  // Cache IP -> geo
  ipGeoCache: defineTable({
    ip: v.string(),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    expiresAt: v.number(),
  }).index("by_ip", ["ip"]),

  // ---------- Reps presence ----------
  repsPresence: defineTable({
    organizationId: v.string(),
    userId: v.string(), // Clerk userId
    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())), // ["FR", "EMEA", ...]
    available: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_role", ["organizationId", "role"])
    .index("by_org_user", ["organizationId", "userId"]),

  // ---------- Routing rules ----------
  routingRules: defineTable({
    organizationId: v.string(),
    name: v.string(),
    priority: v.number(), // 1 = highest
    match: v.object({
      countries: v.optional(v.array(v.string())),   // ["FR","US"]
      urlIncludes: v.optional(v.array(v.string())), // ["pricing","/enterprise"]
      utmSource: v.optional(v.array(v.string())),   // ["google","linkedin"]
    }),
    routeTo: v.object({
      role: v.union(v.literal("sales"), v.literal("support")),
      regions: v.optional(v.array(v.string())),
      repIds: v.optional(v.array(v.string())), // fixed allowlist (Clerk userIds)
    }),
    enabled: v.optional(v.boolean()),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_prio", ["organizationId", "priority"]),

  // optional simple directory
  users: defineTable({
    name: v.string(),
  }),
});
