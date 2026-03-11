import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Runs often; internal logic decides what's due (daily/weekly).
crons.interval("website-indexing-run-due", { hours: 6 }, internal.private.websiteIndexing.runDue);

export default crons;

