// packages/backend/convex/private/attribution.ts
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireOrgId } from "../lib/authz";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Revenue attribution: walk from a booking to the CRM record it created, then to the
 * opportunity / deal that record produced. This is what turns "12 meetings booked"
 * into "€84,000 of pipeline", and it is read-only against the CRM.
 */

/** How far back we keep re-checking bookings. Deals rarely move after that. */
const ATTRIBUTION_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;
/** Re-check cadence for a booking we already looked at. */
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
/** Keeps one cron run bounded regardless of volume. */
const MAX_BOOKINGS_PER_RUN = 60;

type AttributionTarget = {
  bookingId: Id<"calendarBookings">;
  organizationId: string;
  salesforceLeadId?: string;
  hubspotContactId?: string;
};

/** Shape returned by `hubspot.fetchHubSpotDealsForContact`. */
type CrmDeal = {
  dealId: string;
  amount?: number;
  stage?: string;
  closeDate?: string;
  isWon: boolean;
};

export const listBookingsNeedingAttribution = internalQuery({
  args: {
    limit: v.optional(v.number()),
    /** When true, re-check bookings even if checked recently without a won deal. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { limit, force }): Promise<AttributionTarget[]> => {
    const now = Date.now();
    const since = now - ATTRIBUTION_WINDOW_MS;
    const max = Math.min(Math.max(limit ?? MAX_BOOKINGS_PER_RUN, 1), 200);

    // Only orgs with a CRM connected can produce attribution.
    const [salesforceOrgs, hubspotOrgs] = await Promise.all([
      ctx.db.query("salesforceIntegrations").collect(),
      ctx.db.query("hubspotIntegrations").collect(),
    ]);

    const connectedOrgIds = new Set<string>([
      ...salesforceOrgs.map((r) => r.organizationId),
      ...hubspotOrgs.map((r) => r.organizationId),
    ]);

    if (connectedOrgIds.size === 0) return [];

    const out: AttributionTarget[] = [];

    for (const organizationId of connectedOrgIds) {
      const bookings = await ctx.db
        .query("calendarBookings")
        .withIndex("by_org_createdAt", (q) =>
          q.eq("organizationId", organizationId).gte("createdAt", since),
        )
        .collect();

      for (const b of bookings) {
        if (out.length >= max) return out;

        const leadId = b.crm?.salesforceLeadId;
        const contactId = b.crm?.hubspotContactId;
        if (!leadId && !contactId) continue;

        // Won deals are final; everything else is re-checked once a day (unless force).
        if (b.attribution?.isWon) continue;
        if (
          !force &&
          b.attribution &&
          now - b.attribution.checkedAt < RECHECK_AFTER_MS
        ) {
          continue;
        }

        out.push({
          bookingId: b._id,
          organizationId,
          salesforceLeadId: leadId,
          hubspotContactId: contactId,
        });
      }
    }

    return out;
  },
});

export const saveAttribution = internalMutation({
  args: {
    bookingId: v.id("calendarBookings"),
    provider: v.union(v.literal("salesforce"), v.literal("hubspot")),
    dealId: v.optional(v.string()),
    stage: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    isWon: v.optional(v.boolean()),
    isClosed: v.optional(v.boolean()),
    closeDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { bookingId, ...rest } = args;
    const booking = await ctx.db.get(bookingId);
    if (!booking) return;

    await ctx.db.patch(bookingId, {
      attribution: { ...rest, checkedAt: Date.now() },
    });
  },
});

/** Marks a booking as checked without a deal, so the cron doesn't spin on it. */
export const markAttributionChecked = internalMutation({
  args: {
    bookingId: v.id("calendarBookings"),
    provider: v.union(v.literal("salesforce"), v.literal("hubspot")),
  },
  handler: async (ctx, { bookingId, provider }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking) return;

    await ctx.db.patch(bookingId, {
      attribution: {
        ...(booking.attribution ?? {}),
        provider,
        checkedAt: Date.now(),
      },
    });
  },
});

export const syncRevenueAttribution = internalAction({
  args: {
    limit: v.optional(v.number()),
    /** Re-check recently checked bookings (e.g. after converting a Lead in SF). */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { limit, force }): Promise<{ checked: number; matched: number }> => {
    const targets: AttributionTarget[] = await ctx.runQuery(
      internal.private.attribution.listBookingsNeedingAttribution,
      { limit, force },
    );

    let matched = 0;

    for (const t of targets) {
      // Salesforce first: a converted Lead points at exactly one Opportunity,
      // which is a stronger signal than picking among a contact's deals.
      if (t.salesforceLeadId) {
        try {
          const sf = await ctx.runAction(api.integrations.fetchSalesforceOpportunityForLead, {
            organizationId: t.organizationId,
            leadId: t.salesforceLeadId,
          });

          // Only count a real Opportunity id — converted Lead without Opp must fall through to HubSpot.
          const sfDealId = sf.ok ? (sf as { dealId?: string }).dealId : undefined;
          if (sf.ok && sf.converted && sfDealId) {
            const matchedSf = sf as {
              dealId: string;
              stage?: string;
              amount?: number;
              currency?: string;
              isWon?: boolean;
              isClosed?: boolean;
              closeDate?: string;
            };
            await ctx.runMutation(internal.private.attribution.saveAttribution, {
              bookingId: t.bookingId,
              provider: "salesforce",
              dealId: matchedSf.dealId,
              stage: matchedSf.stage,
              amount: matchedSf.amount,
              currency: matchedSf.currency,
              isWon: matchedSf.isWon,
              isClosed: matchedSf.isClosed,
              closeDate: matchedSf.closeDate,
            });
            matched += 1;
            continue;
          }

          console.log(
            `[attribution] SF no deal yet booking=${t.bookingId} ok=${sf.ok} converted=${(sf as any).converted} reason=${(sf as any).reason ?? "none"}`,
          );
        } catch (e) {
          console.log(`[attribution] salesforce lookup failed booking=${t.bookingId}:`, e);
        }
      }

      if (t.hubspotContactId) {
        try {
          const hs = await ctx.runAction(api.hubspot.fetchHubSpotDealsForContact, {
            organizationId: t.organizationId,
            contactId: t.hubspotContactId,
          });

          const deals: CrmDeal[] = hs.ok ? (hs.deals as CrmDeal[]) : [];

          if (hs.ok && deals.length > 0) {
            // A contact can hold several deals: prefer a won one, then the largest.
            const best =
              deals.find((d) => d.isWon) ??
              [...deals].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]!;

            await ctx.runMutation(internal.private.attribution.saveAttribution, {
              bookingId: t.bookingId,
              provider: "hubspot",
              dealId: best.dealId,
              stage: best.stage,
              amount: best.amount,
              isWon: best.isWon,
              isClosed: best.isWon,
              closeDate: best.closeDate,
            });
            matched += 1;
            continue;
          }

          if (hs.ok) {
            await ctx.runMutation(internal.private.attribution.markAttributionChecked, {
              bookingId: t.bookingId,
              provider: "hubspot",
            });
          }
        } catch (e) {
          console.log(`[attribution] hubspot lookup failed booking=${t.bookingId}:`, e);
        }
      }
    }

    console.log(`[attribution] checked=${targets.length} matched=${matched}`);
    return { checked: targets.length, matched };
  },
});

/* ============================================================
   Dashboard read model
   ============================================================ */

function orgCanUseCrmRevenue(sub: Doc<"subscriptions"> | null) {
  const plan = (sub?.plan ?? "starter") as string;
  const status = (sub?.status ?? "paused") as string;
  const isActive = status === "active" || status === "trial";
  if (!isActive || plan === "starter") return false;
  const addons = (sub?.addons ?? {}) as Record<string, unknown>;
  return addons.salesforce === true || addons.hubspot === true;
}

function sumPipeline(bookings: Array<Doc<"calendarBookings">>) {
  let pipelineAmount = 0;
  let openPipelineAmount = 0;
  let wonAmount = 0;
  let dealCount = 0;
  let wonCount = 0;
  let meetingsWithCrmLink = 0;
  const currencies = new Set<string>();
  const stageMap = new Map<string, { stage: string; count: number; amount: number }>();
  /** Same CRM Opportunity can be attached to several meetings — count € once. */
  const seenDealIds = new Set<string>();

  for (const b of bookings) {
    if (b.crm?.salesforceLeadId || b.crm?.hubspotContactId) meetingsWithCrmLink += 1;

    const a = b.attribution;
    if (!a?.dealId) continue;

    const dealId = String(a.dealId);
    if (seenDealIds.has(dealId)) continue;
    seenDealIds.add(dealId);

    dealCount += 1;
    // SF DE often omits CurrencyIsoCode — default USD so the UI can show $.
    currencies.add(a.currency?.trim() || "USD");

    const amount = a.amount ?? 0;
    pipelineAmount += amount;

    if (a.isWon) {
      wonCount += 1;
      wonAmount += amount;
    } else {
      openPipelineAmount += amount;
    }

    const stageKey = (a.stage ?? (a.isWon ? "Closed won" : "Unknown")).trim() || "Unknown";
    const prev = stageMap.get(stageKey) ?? { stage: stageKey, count: 0, amount: 0 };
    prev.count += 1;
    prev.amount += amount;
    stageMap.set(stageKey, prev);
  }

  const stages = [...stageMap.values()]
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .slice(0, 8);

  return {
    dealCount,
    wonCount,
    pipelineAmount,
    openPipelineAmount,
    wonAmount,
    meetingsWithCrmLink,
    stages,
    currency: currencies.size === 1 ? [...currencies][0] : undefined,
  };
}

export const getRevenueSummary = query({
  args: {
    /** Inclusive lower bound on booking creation time. Defaults to the last 90 days. */
    fromTs: v.optional(v.number()),
    toTs: v.optional(v.number()),
  },
  handler: async (ctx, { fromTs, toTs }) => {
    const orgId = await requireOrgId(ctx);
    const since = fromTs ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const until = toTs ?? Date.now() + 60_000;

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    const entitled = orgCanUseCrmRevenue(sub);
    const [salesforce, hubspot] = await Promise.all([
      ctx.db
        .query("salesforceIntegrations")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .unique(),
      ctx.db
        .query("hubspotIntegrations")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .unique(),
    ]);

    const crmConnected = Boolean(salesforce || hubspot);
    const providers = [
      ...(salesforce ? (["salesforce"] as const) : []),
      ...(hubspot ? (["hubspot"] as const) : []),
    ];

    if (!entitled) {
      return {
        entitled: false as const,
        crmConnected,
        providers,
        meetings: 0,
        dealCount: 0,
        wonCount: 0,
        pipelineAmount: 0,
        openPipelineAmount: 0,
        wonAmount: 0,
        meetingsWithCrmLink: 0,
        stages: [] as Array<{ stage: string; count: number; amount: number }>,
        currency: undefined as string | undefined,
        since,
        until,
      };
    }

    const bookings = (
      await ctx.db
        .query("calendarBookings")
        .withIndex("by_org_createdAt", (q) =>
          q.eq("organizationId", orgId).gte("createdAt", since),
        )
        .collect()
    ).filter((b) => b.createdAt <= until);

    return {
      entitled: true as const,
      crmConnected,
      providers,
      meetings: bookings.length,
      ...sumPipeline(bookings),
      since,
      until,
    };
  },
});

export const getAttributedMeetings = query({
  args: {
    fromTs: v.optional(v.number()),
    toTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { fromTs, toTs, limit }) => {
    const orgId = await requireOrgId(ctx);
    const since = fromTs ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const until = toTs ?? Date.now() + 60_000;
    const max = Math.min(Math.max(limit ?? 25, 1), 200);

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    if (!orgCanUseCrmRevenue(sub)) return [];

    const bookings = (
      await ctx.db
        .query("calendarBookings")
        .withIndex("by_org_createdAt", (q) =>
          q.eq("organizationId", orgId).gte("createdAt", since),
        )
        .collect()
    ).filter((b) => b.createdAt <= until);

    return bookings
      .filter((b) => b.attribution?.dealId)
      .sort((a, b) => (b.attribution?.amount ?? 0) - (a.attribution?.amount ?? 0))
      .slice(0, max)
      .map((b) => ({
        bookingId: b._id,
        attendeeName: b.attendeeName,
        attendeeEmail: b.attendeeEmail,
        company: b.providerData?.company,
        start: b.start,
        provider: b.attribution!.provider,
        stage: b.attribution!.stage,
        amount: b.attribution!.amount,
        currency: b.attribution!.currency,
        isWon: b.attribution!.isWon ?? false,
        isClosed: b.attribution!.isClosed ?? false,
        closeDate: b.attribution!.closeDate,
      }));
  },
});