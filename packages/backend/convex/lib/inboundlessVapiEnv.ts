/**
 * Global Vapi API keys (Inboundless “easy” mode for all orgs that use shared keys).
 * Set in Convex Dashboard (actions) and Vercel if any server route needs them.
 * Do not expose private key to the client — only public is returned via getVapiSecrets.
 */
export function hasInboundlessVapiEnvDefaults(): boolean {
  return !!(
    process.env.INBOUNDLESS_VAPI_PUBLIC_API_KEY?.trim() &&
    process.env.INBOUNDLESS_VAPI_PRIVATE_API_KEY?.trim()
  );
}

export function getInboundlessVapiKeyPairFromEnv():
  | { publicApiKey: string; privateApiKey: string }
  | null {
  const publicApiKey = process.env.INBOUNDLESS_VAPI_PUBLIC_API_KEY?.trim() || "";
  const privateApiKey = process.env.INBOUNDLESS_VAPI_PRIVATE_API_KEY?.trim() || "";
  if (!publicApiKey || !privateApiKey) return null;
  return { publicApiKey, privateApiKey };
}
