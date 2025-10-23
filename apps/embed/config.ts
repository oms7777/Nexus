// apps/embed/config.ts
const scriptOrigin =
  typeof document !== "undefined" && document.currentScript
    ? new URL((document.currentScript as HTMLScriptElement).src).origin
    : undefined;

export const EMBED_CONFIG = {
  // Prefer the script’s own origin, then env, then production default
  WIDGET_URL:
    scriptOrigin ||
    import.meta.env.VITE_WIDGET_URL ||
    "https://widget.inboundless.co",

  CONVEX_URL: import.meta.env.VITE_CONVEX_URL || "",
  WEB_ORIGIN: import.meta.env.VITE_WEB_ORIGIN || "",
  DEFAULT_ORG_ID: "org_32Zl1bn310gawx8jZPBLYWjhH64",
  DEFAULT_POSITION: "bottom-right" as const,
  PUSHER_KEY: import.meta.env.VITE_PUSHER_KEY || "",
  PUSHER_CLUSTER: import.meta.env.VITE_PUSHER_CLUSTER || "eu",
};
