/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_WIDGET_URL: string;
    readonly VITE_CONVEX_URL: string;
    readonly VITE_WEB_ORIGIN: string;
    readonly VITE_PUSHER_KEY: string;
    readonly VITE_PUSHER_CLUSTER: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}