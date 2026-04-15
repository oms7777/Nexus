import { internal } from "../_generated/api";

/** Small wrapper so call sites don't repeat `(internal as any)`. */
export async function writeAuditLog(
  ctx: { runMutation: (fn: any, args: any) => Promise<any> },
  args: {
    organizationId: string;
    actorUserId?: string;
    actorOrgRole?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    meta?: unknown;
  },
) {
  await ctx.runMutation((internal as any).system.audit.log, args);
}
