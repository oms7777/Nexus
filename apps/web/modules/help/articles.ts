export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  category: "Setup" | "CRM" | "Analytics" | "Troubleshooting";
  hrefs?: Array<{ label: string; href: string }>;
  steps: string[];
  tips?: string[];
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "install-widget",
    title: "Install the widget on your site",
    summary: "Allow your domain, paste the snippet, confirm a session appears.",
    category: "Setup",
    hrefs: [{ label: "Integrations", href: "/integrations" }],
    steps: [
      "Open Integrations and add every domain where the widget should load (including staging).",
      "Copy the install snippet and paste it before the closing </body> tag (or via your tag manager).",
      "Hard-refresh your site and open a page that should show the chat.",
      "Back in Inboundless, open Live Map or Conversations — a session / conversation should appear within a minute.",
      "If nothing loads: check domain allowlist, ad blockers, and that the snippet organization id matches this workspace.",
    ],
    tips: [
      "The Setup checklist marks “Install the widget” done only after a real contact session is created.",
    ],
  },
  {
    slug: "connect-calendar",
    title: "Connect a calendar for booking",
    summary: "Reps need Google or Microsoft connected before visitors can book.",
    category: "Setup",
    hrefs: [{ label: "My calendar", href: "/me/calendar" }],
    steps: [
      "Each sales rep opens Profile → Calendar (or /me/calendar).",
      "Connect Google Calendar or Microsoft 365 and approve the requested scopes.",
      "Confirm the correct calendar is selected for availability.",
      "Put the rep online under Team & Territories so routing can assign them.",
      "Run a test booking from the widget on an allowed domain.",
    ],
    tips: [
      "If slots never appear, the assigned rep usually has no connected calendar or is offline.",
    ],
  },
  {
    slug: "team-and-routing",
    title: "Team, territories, and who gets the lead",
    summary: "At least one available rep is required for handoff and booking.",
    category: "Setup",
    hrefs: [{ label: "Team & Territories", href: "/team" }],
    steps: [
      "Invite teammates in Clerk / your org, then open Team & Territories.",
      "Mark at least one rep available (online) for live routing.",
      "Configure territories if you route by country / region.",
      "Optional: connect Slack under Integrations for lead and meeting alerts.",
    ],
  },
  {
    slug: "test-end-to-end",
    title: "Run a full test: chat → meeting",
    summary: "Prove install, routing, calendar, and (if entitled) CRM in one pass.",
    category: "Setup",
    hrefs: [
      { label: "Conversations", href: "/conversations" },
      { label: "Setup checklist", href: "/live" },
    ],
    steps: [
      "Complete domain + widget + calendar + an online rep (see Setup checklist on Live Map).",
      "Open your site as a visitor (incognito helps), start a chat, and request a meeting.",
      "Book a slot with a real email you control.",
      "Confirm: event on the rep calendar, conversation in Inbox, meeting counted in Overview.",
      "If CRM is on your plan: confirm a Lead (Salesforce) or Contact (HubSpot) was created for that booking.",
    ],
  },
  {
    slug: "connect-crm",
    title: "Connect HubSpot or Salesforce",
    summary: "Growth+ with the CRM add-on. Bookings create CRM records; Overview shows pipeline €.",
    category: "CRM",
    hrefs: [{ label: "Integrations", href: "/integrations" }],
    steps: [
      "Confirm your workspace has the HubSpot or Salesforce add-on (not Starter alone).",
      "Open Integrations → CRM and click Connect (use the Inboundless easy-connect app unless you have BYO / Plus).",
      "Approve OAuth in HubSpot or Salesforce and return to Inboundless — status should show Connected.",
      "Book a new test meeting after connecting (older bookings may not backfill CRM ids).",
      "Use CRM health → Sync now if the deal stage / amount is not on Overview yet (cron also runs periodically).",
    ],
    tips: [
      "Pricing and plan details live on the public site; entitlements in-app must match what was sold.",
      "Salesforce sandbox tokens expire — reconnect if you see invalid_grant / reconnect prompts.",
    ],
  },
  {
    slug: "meeting-not-in-crm",
    title: "Meeting booked but nothing in the CRM",
    summary: "Fix missing Lead/Contact or empty pipeline attribution.",
    category: "Troubleshooting",
    hrefs: [
      { label: "Integrations · CRM health", href: "/integrations" },
      { label: "Overview", href: "/analytics/overview" },
    ],
    steps: [
      "Check Integrations → CRM health: is a provider Connected?",
      "Look at “Meetings with CRM link”. If 0 after a new booking, reconnect CRM and book again after connect.",
      "Salesforce: Lead may disappear after Convert — that is normal; attribution looks up the Opportunity.",
      "HubSpot: confirm the contact email matches the booking attendee email.",
      "Click Sync now, wait a few seconds, then refresh Overview CRM pipeline.",
      "Still empty: confirm the CRM add-on is enabled on the subscription and that OAuth scopes include deals/opportunities read.",
    ],
  },
  {
    slug: "analytics-views",
    title: "Overview, Funnel, and Signals",
    summary: "Scoreboard vs coach vs call list — what each page is for.",
    category: "Analytics",
    hrefs: [
      { label: "Overview", href: "/analytics/overview" },
      { label: "Funnel", href: "/analytics/funnel" },
      { label: "Signals", href: "/analytics/signals" },
    ],
    steps: [
      "Overview = scoreboard: volume, coverage, trend, CRM € when connected.",
      "Funnel = coach: Sessions → Conversations → Meetings, missed handoffs, SLA, pages that don’t book (Advanced Analytics).",
      "Signals = call list: hot accounts and ghost IPs worth outreach.",
      "Meetings are always ≤ conversations — booking requires chat; they are equal only if every chat books.",
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function helpArticlesByCategory() {
  const order: HelpArticle["category"][] = ["Setup", "CRM", "Analytics", "Troubleshooting"];
  return order
    .map((category) => ({
      category,
      articles: HELP_ARTICLES.filter((a) => a.category === category),
    }))
    .filter((g) => g.articles.length > 0);
}
