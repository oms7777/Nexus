import { Vapi, VapiClient } from "@vapi-ai/server-sdk";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getSecretValue, parseSecretString } from "../lib/secrets";
import { ConvexError } from "convex/values";
import { getInboundlessVapiKeyPairFromEnv } from "../lib/inboundlessVapiEnv";

type VapiKeyPair = { privateApiKey: string; publicApiKey: string };

async function loadVapiKeysForOrg(ctx: ActionCtx, orgId: string): Promise<VapiKeyPair | null> {
  const plugin = await ctx.runQuery(internal.system.plugins.getByOrganizationIdandService, {
    organizationId: orgId,
    service: "vapi",
  });

  if (plugin) {
    const secretValue = await getSecretValue(plugin.secretName);
    const secretData = parseSecretString<VapiKeyPair>(secretValue);
    if (secretData?.privateApiKey && secretData?.publicApiKey) {
      return secretData;
    }
  }

  return getInboundlessVapiKeyPairFromEnv();
}

export const getAssistants = action({
  args: {},
  handler: async (ctx): Promise<Vapi.Assistant[]> => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Identity not found",
      });
    }

    const orgId = identity.orgId as string;

    if (!orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }

    const keys = await loadVapiKeysForOrg(ctx, orgId);

    if (!keys) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Vapi not configured — connect in Integrations or set INBOUNDLESS_VAPI_* on the server.",
      });
    }

    const vapiClient = new VapiClient({
      token: keys.privateApiKey,
    });

    const assistants = await vapiClient.assistants.list();

    return assistants;
  },
});

export const getPhoneNumbers = action({
  args: {},
  handler: async (ctx): Promise<Vapi.PhoneNumbersListResponseItem[]> => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Identity not found",
      });
    }

    const orgId = identity.orgId as string;

    if (!orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }

    const keys = await loadVapiKeysForOrg(ctx, orgId);

    if (!keys) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Vapi not configured — connect in Integrations or set INBOUNDLESS_VAPI_* on the server.",
      });
    }

    const vapiClient = new VapiClient({
      token: keys.privateApiKey,
    });

    const phoneNumbers = await vapiClient.phoneNumbers.list();

    return phoneNumbers;
  },
});
