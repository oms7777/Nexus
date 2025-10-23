// apps/embed/config.ts
export const EMBED_CONFIG = {
  // 1) Essaie d’abord l’origine du <script src="..."> qui charge ce fichier
  WIDGET_URL:
    (typeof document !== "undefined" && document.currentScript
      ? new URL((document.currentScript as HTMLScriptElement).src).origin
      : undefined) ||
    // 2) Sinon les env (build)
    import.meta.env.VITE_WIDGET_URL ||
    // 3) Fallback prod (évite localhost en prod)
    "https://widget.inboundless.co",

  WEB_ORIGIN: import.meta.env.VITE_WEB_ORIGIN || "https://app.inboundless.co",

  DEFAULT_ORG_ID: "org_32Zl1bn310gawx8jZPBLYWjhH64",
  DEFAULT_POSITION: "bottom-right" as const,

  PUSHER_KEY: import.meta.env.VITE_PUSHER_KEY || "",
  PUSHER_CLUSTER: import.meta.env.VITE_PUSHER_CLUSTER || "eu",
};
