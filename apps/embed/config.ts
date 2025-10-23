export const EMBED_CONFIG = {
    WIDGET_URL: import.meta.env.VITE_WIDGET_URL || "https://widget.inboundless.co",
    CONVEX_URL: import.meta.env.VITE_CONVEX_URL || "https://outgoing-corgi-882.convex.cloud", 
    WEB_ORIGIN: import.meta.env.VITE_WEB_ORIGIN || "https://app.inboundless.co",
    DEFAULT_ORG_ID: "org_3334ADfvKgo3EnNDnQGjxaEJ03J",
    DEFAULT_POSITION: "bottom-right" as const,
    PUSHER_KEY: import.meta.env.VITE_PUSHER_KEY || "",
    PUSHER_CLUSTER: import.meta.env.VITE_PUSHER_CLUSTER || "eu",
}