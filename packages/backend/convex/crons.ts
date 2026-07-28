import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Runs often; internal logic decides what's due (daily/weekly).
crons.interval("website-indexing-run-due", { hours: 6 }, internal.private.websiteIndexing.runDue);

// Pulls opportunity / deal values back from the CRM so meetings can be tied to pipeline.
crons.interval(
  "revenue-attribution-sync",
  { hours: 12 },
  internal.private.attribution.syncRevenueAttribution,
  {},
);

// Enforces session replay retention and clears stale rate limit buckets.
crons.interval("retention-sweep", { minutes: 30 }, internal.private.privacy.runRetentionSweep, {});

export default crons;

