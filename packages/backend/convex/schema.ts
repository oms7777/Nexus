import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /* ---------- Billing / Settings ---------- */
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

    // Optional marketing/branding
    teamAvatars: v.optional(v.array(v.string())), // up to 3 URLs typically
    brandLogoUrl: v.optional(v.string()),

    // 🔁 mode de routing global du widget
    routingMode: v.optional(
      v.union(v.literal("auto_assign"), v.literal("visitor_choice")),
    ),

    // Back-compat root privacyUrl + full consent config
    privacyUrl: v.optional(v.string()),
    consent: v.optional(
      v.object({
        enabled: v.boolean(),
        title: v.optional(v.string()),
        intro: v.optional(v.string()),
        body: v.optional(v.string()),
        acceptLabel: v.optional(v.string()),
        version: v.optional(v.string()),
        linkMode: v.optional(v.union(v.literal("link"), v.literal("modal"))),
        privacyUrl: v.optional(v.string()),
        modalContent: v.optional(v.string()),
      }),
    ),
  }).index("by_organization_id", ["organizationId"]),

  plugins: defineTable({
    organizationId: v.string(),
    service: v.union(v.literal("vapi")),
    secretName: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_id_and_service", ["organizationId", "service"]),

  /* ---------- Conversations / Visitors ---------- */
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
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    organizationId: v.string(),
    expiresAt: v.number(),
    isAnonymous: v.optional(v.boolean()),
    identifiedAt: v.optional(v.number()),
    metadata: v.optional(
      v.object({
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
        // GEO
        ip: v.optional(v.string()),
        city: v.optional(v.string()),
        countryCode: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        // simple analytics
        pages: v.optional(v.array(v.string())),

        // NEW: for anonymous tracking via widget
        visitorId: v.optional(v.string()),
        clientIp: v.optional(v.string()),

        // NEW: rep choisi côté widget (visitor_choice)
        preferredRepUserId: v.optional(v.string()),
      }),
    ),
    consent: v.optional(
      v.object({
        given: v.boolean(),
        ts: v.number(), // ms epoch
        privacyUrl: v.optional(v.string()),
        version: v.optional(v.string()),
      }),
    ),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_expires_at", ["expiresAt"]),

  /* ---------- Cache IP -> geo ---------- */
  ipGeoCache: defineTable({
    ip: v.string(),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    expiresAt: v.number(),
  }).index("by_ip", ["ip"]),

  /* ---------- Territories dynamiques ---------- */
  territories: defineTable({
    organizationId: v.string(),
    key: v.string(), // slug stable, ex: "france", "emea_enterprise"
    label: v.string(), // label humain: "France", "EMEA Enterprise"
    countryCodes: v.optional(v.array(v.string())), // ["FR", "BE", ...]
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_key", ["organizationId", "key"]),

  /* ---------- Reps presence ---------- */
  repsPresence: defineTable({
    organizationId: v.string(),
    userId: v.string(), // Clerk userId
    role: v.union(v.literal("sales"), v.literal("support")),
    regions: v.optional(v.array(v.string())),
    available: v.boolean(),

    // NEW: titre affiché dans le widget (Solutions Engineer EMEA, Customer Success, …)
    title: v.optional(v.string()),

    // Slack DM par rep
    slackUserId: v.optional(v.string()),
    slackDmChannel: v.optional(v.string()),

    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_role", ["organizationId", "role"])
    .index("by_org_user", ["organizationId", "userId"]),


  /* ---------- Routing rules ---------- */
  routingRules: defineTable({
    organizationId: v.string(),
    name: v.string(),
    priority: v.number(), // 1 = highest
    match: v.object({
      countries: v.optional(v.array(v.string())),
      urlIncludes: v.optional(v.array(v.string())),
      utmSource: v.optional(v.array(v.string())),
    }),
    routeTo: v.object({
      role: v.union(v.literal("sales"), v.literal("support")),
      // ici aussi on utilisera des keys de territories
      regions: v.optional(v.array(v.string())),
      repIds: v.optional(v.array(v.string())),
    }),
    enabled: v.optional(v.boolean()),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_prio", ["organizationId", "priority"]),

  /* ---------- Calendar connections ---------- */
  calendarAccounts: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    provider: v.literal("google"),
    email: v.optional(v.string()),
    refreshToken: v.string(),
    scope: v.optional(v.string()),
    connectedAt: v.number(),
  })
    .index("by_org_user", ["organizationId", "userId"])
    .index("by_org", ["organizationId"]),

  /* ---------- Calendar user settings ---------- */
  calendarSettings: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    timezone: v.optional(v.string()),
    durationMin: v.number(),
    bufferMin: v.optional(v.number()),
    meetingLinkType: v.union(
      v.literal("google_meet"),
      v.literal("manual"),
    ),
    manualUrl: v.optional(v.string()),
    weekly: v.array(
      v.object({
        day: v.number(), // 1=Mon … 7=Sun
        start: v.string(), // "09:00"
        end: v.string(), // "17:00"
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_org_user", ["organizationId", "userId"])
    .index("by_org", ["organizationId"]),

  /* ---------- Bookings ---------- */
  calendarBookings: defineTable({
    organizationId: v.string(),
    contactSessionId: v.id("contactSessions"),
    createdByUserId: v.optional(v.string()),
    attendeeName: v.string(),
    attendeeEmail: v.string(),
    start: v.number(),
    end: v.number(),
    meetingUrl: v.optional(v.string()),
    externalEventId: v.optional(v.string()),
    providerData: v.optional(
      v.object({
        calendarId: v.optional(v.string()),
        company: v.optional(v.string()),
        role: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_contact_session", ["contactSessionId"])
    .index("by_org_start", ["organizationId", "start"]),

  /* ---------- User notification prefs ---------- */
  userNotificationPrefs: defineTable({
    userId: v.string(), // Clerk user id (identity.subject)
    showBadges: v.boolean(), // Show badges on new leads
    playSound: v.boolean(), // Play sound on new lead / meeting
    autoOpenConversation: v.boolean(), // Auto-open conversation panel
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /* ---------- Users ---------- */
  users: defineTable({
    organizationId: v.string(),
    externalId: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    title: v.optional(v.string()), // 👈 nouveau : job title (Solutions Engineer EMEA)
  })
    .index("by_org_external", ["organizationId", "externalId"])
    .index("by_org", ["organizationId"]),

  /* ---------- Analytics ---------- */
  analyticsEvents: defineTable({
    organizationId: v.string(),
    type: v.string(),
    ts: v.number(),
    sessionId: v.optional(v.id("contactSessions")),
    conversationId: v.optional(v.id("conversations")),
    accountId: v.optional(v.string()),
    userId: v.optional(v.string()),
    meta: v.optional(v.any()),
  })
    .index("by_org_ts", ["organizationId", "ts"])
    .index("by_session", ["sessionId"])
    .index("by_conversation", ["conversationId"]),

  analyticsDaily: defineTable({
    organizationId: v.string(),
    day: v.string(), // "YYYY-MM-DD"
    metrics: v.object({
      sessions: v.number(),
      experiences: v.number(),
      inbound_requests: v.number(),
      pounce_attempts: v.number(),
      conversations: v.number(),
      rep_conversations: v.number(),
      meetings: v.number(),
    }),
    updatedAt: v.number(),
  }).index("by_org_day", ["organizationId", "day"]),

  sessionSnapshots: defineTable({
    organizationId: v.string(),
    sessionId: v.id("contactSessions"),
    ts: v.number(),
    pageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    snapshot: v.optional(v.any()),
  })
    .index("by_session", ["sessionId"])
    .index("by_org_ts", ["organizationId", "ts"]),

  /* ---------- Promos contextuelles ---------- */
  promos: defineTable({
    organizationId: v.string(),
    name: v.string(),
    active: v.boolean(),
    rules: v.object({
      pathPrefix: v.optional(v.string()),
      urlIncludes: v.optional(v.array(v.string())),
      utmSource: v.optional(v.array(v.string())),
    }),
    card: v.object({
      title: v.string(),
      body: v.string(),
      badgeText: v.optional(v.string()),
    }),
    primaryCta: v.object({
      kind: v.union(
        v.literal("open_chat"),
        v.literal("open_booking"),
        v.literal("open_url"),
      ),
      label: v.string(),
      url: v.optional(v.string()),
    }),
    secondaryCta: v.optional(
      v.object({
        kind: v.union(
          v.literal("open_chat"),
          v.literal("open_booking"),
          v.literal("open_url"),
        ),
        label: v.string(),
        url: v.optional(v.string()),
      }),
    ),
    // 👇 nouveau : cible sales / support pour le routing & widget
    targetRole: v.optional(
      v.union(v.literal("sales"), v.literal("support")),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  /* ---------- Slack Integrations ---------- */
  slackIntegrations: defineTable({
    organizationId: v.string(),
    accessToken: v.string(),
    teamId: v.optional(v.string()),
    teamName: v.optional(v.string()),
    defaultChannel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_id", ["organizationId"]),
});
