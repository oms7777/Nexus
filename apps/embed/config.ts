export const EMBED_CONFIG = {
    WIDGET_URL: import.meta.env.VITE_WIDGET_URL || "http://localhost:3001",
    CONVEX_URL: import.meta.env.VITE_CONVEX_URL || "http://localhost:3000", 
    WEB_ORIGIN: import.meta.env.VITE_WEB_ORIGIN || "http://localhost:3000",
    DEFAULT_ORG_ID: "org_32Zl1bn310gawx8jZPBLYWjhH64",
    DEFAULT_POSITION: "bottom-right" as const,
    PUSHER_KEY: import.meta.env.VITE_PUSHER_KEY || "",
    PUSHER_CLUSTER: import.meta.env.VITE_PUSHER_CLUSTER || "eu",
}