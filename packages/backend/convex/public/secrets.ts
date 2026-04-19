import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getSecretValue, parseSecretString } from "../lib/secrets";
import { getInboundlessVapiKeyPairFromEnv } from "../lib/inboundlessVapiEnv";


export const getVapiSecrets = action({
    args: {
        organizationId: v.string()
    },
    handler: async (ctx, args) => {
        const plugin = await ctx.runQuery(
            internal.system.plugins.getByOrganizationIdandService,
            {
                organizationId: args.organizationId,
                service: "vapi",
            }
        )

        if (plugin) {
            const secret = await getSecretValue(plugin.secretName);
            const secretData = parseSecretString<{
                privateApiKey: string;
                publicApiKey: string;
            }>(secret);

            if (secretData?.publicApiKey && secretData?.privateApiKey) {
                return { publicApiKey: secretData.publicApiKey };
            }
        }

        const fromEnv = getInboundlessVapiKeyPairFromEnv();
        if (fromEnv) {
            return { publicApiKey: fromEnv.publicApiKey };
        }

        return null;
    }
})