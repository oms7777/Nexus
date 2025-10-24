export const EMBED_CONFIG = {
  WIDGET_URL:
    (typeof document !== "undefined" && document.currentScript
      ? new URL((document.currentScript as HTMLScriptElement).src).origin
      : (import.meta.env.VITE_WIDGET_URL || "https://widget.inboundless.co")),
  DEFAULT_ORG_ID: "org_3334ADfvKgo3EnNDnQGjxaEJ03J",
  DEFAULT_POSITION: "bottom-right" as const,
};
