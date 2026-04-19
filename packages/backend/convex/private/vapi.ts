import { VapiClient, VapiError } from "@vapi-ai/server-sdk";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getSecretValue, parseSecretString } from "../lib/secrets";
import { ConvexError } from "convex/values";
import { getInboundlessVapiKeyPairFromEnv } from "../lib/inboundlessVapiEnv";

type VapiKeyPair = { privateApiKey: string; publicApiKey: string };

/** Narrow rows so Convex never fails serializing rich SDK objects. */
export type VapiAssistantListItem = {
  id: string;
  name?: string;
  model?: { model?: string };
  firstMessage?: string;
};

export type VapiPhoneNumberListItem = {
  id: string;
  number?: string;
  name?: string;
  status?: string;
};

function toAssistantRow(a: Record<string, unknown>): VapiAssistantListItem {
  const model = a.model;
  const modelObj =
    model && typeof model === "object"
      ? {
          model:
            typeof (model as Record<string, unknown>).model === "string"
              ? ((model as Record<string, unknown>).model as string)
              : undefined,
        }
      : undefined;
  return {
    id: String(a.id ?? ""),
    name: typeof a.name === "string" ? a.name : undefined,
    model: modelObj,
    firstMessage: typeof a.firstMessage === "string" ? a.firstMessage : undefined,
  };
}

function toPhoneRow(p: Record<string, unknown>): VapiPhoneNumberListItem {
  return {
    id: String(p.id ?? ""),
    number: typeof p.number === "string" ? p.number : undefined,
    name: typeof p.name === "string" ? p.name : undefined,
    status: typeof p.status === "string" ? p.status : undefined,
  };
}

function vapiFailureMessage(context: string, err: unknown): string {
  if (err instanceof VapiError) {
    return `${context} ${err.message}`.trim();
  }
  if (err instanceof Error) {
    return `${context}: ${err.message}`;
  }
  return `${context}: ${String(err)}`;
}

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
  handler: async (ctx): Promise<VapiAssistantListItem[]> => {
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

    let raw: unknown;
    try {
      raw = await vapiClient.assistants.list();
    } catch (err) {
      console.error("[vapi.getAssistants] upstream", err);
      throw new ConvexError({
        code: "VAPI_UPSTREAM",
        message: vapiFailureMessage("Could not list assistants from Vapi.", err),
      });
    }

    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((item) => toAssistantRow(item as Record<string, unknown>))
      .filter((row) => row.id.length > 0);
  },
});

export const getPhoneNumbers = action({
  args: {},
  handler: async (ctx): Promise<VapiPhoneNumberListItem[]> => {
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

    let raw: unknown;
    try {
      raw = await vapiClient.phoneNumbers.list();
    } catch (err) {
      console.error("[vapi.getPhoneNumbers] upstream", err);
      throw new ConvexError({
        code: "VAPI_UPSTREAM",
        message: vapiFailureMessage("Could not list phone numbers from Vapi.", err),
      });
    }

    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((item) => toPhoneRow(item as Record<string, unknown>))
      .filter((row) => row.id.length > 0);
  },
});
