/** Un seul script pour tous les sites (HTML, React, Next.js, etc.) */
export const INTEGRATIONS = [
    {
        id: "widget",
        title: "Widget (HTML / React / Next.js)",
        icon: "/languages/html5.svg",
    },
] as const;

export type IntegrationId = (typeof INTEGRATIONS)[number]["id"];

export const WIDGET_SCRIPT = `<script src="https://widget.inboundless.co/widget.js" data-organization-id="{{ORGANIZATION_ID}}"></script>`;
