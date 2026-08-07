// packages/backend/convex/private/onboarding.ts
import { query } from "../_generated/server";
import { requireOrgId } from "../lib/authz";
import rag from "../system/ai/rag";

export type OnboardingStepId =
  | "domain"
  | "widget"
  | "knowledge"
  | "team"
  | "calendar"
  | "firstConversation"
  | "firstMeeting"
  | "crm";

export type OnboardingStep = {
  id: OnboardingStepId;
  done: boolean;
  /** Steps that don't apply to the current plan are reported but not counted. */
  applicable: boolean;
};

function dayKeyUTC(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function lastNDayKeys(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKeyUTC(today.getTime() - i * 86400000));
  }
  return out;
}

/**
 * Drives the home checklist: every step is derived from real data, never from a
 * "dismissed" flag, so the list also works as a health check after go-live.
 */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await requireOrgId(ctx);

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique();

    const [websites, reps, calendarAccounts, salesforce, hubspot] = await Promise.all([
      ctx.db
        .query("websites")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db
        .query("repsPresence")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db
        .query("calendarAccounts")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db
        .query("salesforceIntegrations")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .unique(),
      ctx.db
        .query("hubspotIntegrations")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .unique(),
    ]);

    // A real visitor loading the widget is the only proof the snippet is live.
    const firstSession = await ctx.db
      .query("contactSessions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .first();

    const firstConversation = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .first();

    const firstMeeting = await ctx.db
      .query("calendarBookings")
      .withIndex("by_org_createdAt", (q) => q.eq("organizationId", orgId))
      .first();

    let knowledgeIndexed = false;
    try {
      const namespace = await rag.getNamespace(ctx, { namespace: orgId });
      if (namespace) {
        const probe = await rag.list(ctx, {
          namespaceId: namespace.namespaceId,
          paginationOpts: { numItems: 1, cursor: null },
        });
        knowledgeIndexed = probe.page.length > 0;
      }
    } catch (e) {
      console.log(`[onboarding] knowledge probe failed for org=${orgId}:`, e);
    }

    const canUseBooking = (subscription?.limits.reps ?? 0) > 0;
    const addons = (subscription?.addons ?? {}) as Record<string, unknown>;
    const plan = (subscription?.plan ?? "starter") as string;
    const status = (subscription?.status ?? "paused") as string;
    const isActive = status === "active" || status === "trial";
    const crmAddon =
      isActive && plan !== "starter" && (addons.salesforce === true || addons.hubspot === true);

    const steps: OnboardingStep[] = [
      {
        id: "domain",
        done: websites.some((w) => w.active),
        applicable: true,
      },
      {
        id: "widget",
        done: firstSession !== null,
        applicable: true,
      },
      {
        id: "knowledge",
        done: knowledgeIndexed,
        applicable: true,
      },
      {
        id: "team",
        done: reps.some((r) => r.available === true),
        applicable: true,
      },
      {
        id: "calendar",
        done: calendarAccounts.length > 0,
        applicable: canUseBooking,
      },
      {
        id: "firstConversation",
        done: firstConversation !== null,
        applicable: true,
      },
      {
        id: "firstMeeting",
        done: firstMeeting !== null,
        applicable: canUseBooking,
      },
      {
        id: "crm",
        done: Boolean(salesforce || hubspot),
        applicable: crmAddon,
      },
    ];

    const applicable = steps.filter((s) => s.applicable);
    const completed = applicable.filter((s) => s.done).length;

    // Rolling 7-day snapshot from the pre-aggregated daily table (cheap).
    const days = lastNDayKeys(7);
    const daily = await ctx.db
      .query("analyticsDaily")
      .withIndex("by_org_day", (q) =>
        q.eq("organizationId", orgId).gte("day", days[0]!).lte("day", days[days.length - 1]!),
      )
      .collect();

    const last7Days = daily.reduce(
      (acc, row) => ({
        sessions: acc.sessions + (row.metrics.sessions ?? 0),
        conversations: acc.conversations + (row.metrics.conversations ?? 0),
        meetings: acc.meetings + (row.metrics.meetings ?? 0),
        inboundRequests: acc.inboundRequests + (row.metrics.inbound_requests ?? 0),
      }),
      { sessions: 0, conversations: 0, meetings: 0, inboundRequests: 0 },
    );

    return {
      steps,
      completed,
      total: applicable.length,
      isComplete: completed === applicable.length,
      plan: subscription?.plan ?? null,
      status: subscription?.status ?? null,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      last7Days,
    };
  },
});
