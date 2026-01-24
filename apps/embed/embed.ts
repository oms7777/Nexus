// apps/embed/embed.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

const NUDGE_ENABLED = true;

// ---------------- Types ----------------
type ThemePayload = {
  primaryColor?: string;
  primaryTextColor?: string;
  secondaryColor?: string;
  secondaryTextColor?: string;
  nudgeBackgroundColor?: string;
  chatBubbleColor?: string;
};

type SimpleCta = {
  kind: "open_chat" | "open_booking" | "open_url";
  label: string;
  url?: string;
};

type PromoPayload = {
  title?: string;
  body?: string;
  primary?: string;
  secondary?: string;
  primaryCta?: SimpleCta;
  secondaryCta?: SimpleCta;
  avatars?: string[];
  badgeText?: string;
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  identityMode?: "auto" | "logo" | "avatars";
  ctaList?: SimpleCta[];
  canUseVoice?: boolean;
};

type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
  canUseVoice?: boolean;
};

(function () {
  // Block inside iframes
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }

  // Singleton lock
  if ((window as any).__NX_WIDGET_EMBED_LOADED__) return;
  (window as any).__NX_WIDGET_EMBED_LOADED__ = true;

  // ---------------- DOM ----------------
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;

  // ---------------- State ----------------
  let isOpen = false;
  let iframeLoaded = false;
  let TARGET_ORIGIN = "";
  let destroyed = false;

  // Config from <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  // Theme
  let theme: ThemePayload | null = null;
  let brandLogoUrl: string | null = null;

  // nudge state
  let hasNudgePayload = false;
  let nudgeDismissed = false;

  // ---------------- Init config ----------------
  const currentScript = document.currentScript as HTMLScriptElement | null;

  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as "bottom-right" | "bottom-left") ??
      EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;

    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as "bottom-right" | "bottom-left") ??
        EMBED_CONFIG.DEFAULT_POSITION;
    }
  }

  if (!organizationId) {
    console.error("Nexus Widget: data-organization-id attribute is required");
    return;
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  // ---------------- Render ----------------
  function render() {
    // FAB
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = chatBubbleIcon;

    const side = position === "bottom-right" ? "right: 20px;" : "left: 20px;";

    button.style.cssText = `
      all: unset;
      position: fixed;
      ${side}
      bottom: 20px;
      width: 60px; height: 60px;
      border-radius: 9999px;
      background: ${theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6"};
      color: ${theme?.primaryTextColor || "#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
    `;

    button.addEventListener("click", () => {
      if (isOpen) hide();
      else openChat();
    });

    document.body.appendChild(button);

    // Container
    container = document.createElement("div");
    container.id = "nexus-widget-container";
    container.style.cssText = `
      position: fixed;
      ${side}
      bottom: 90px;
      width: 400px;
      height: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none;
      background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;

    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;

      // just a handshake, no URL sync, no extra loops
      postToWidget({ type: "nexus:embed-ready" });

      applyThemeToFab();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", handleMessage);

    // Stability on bfcache / refresh
    window.addEventListener("pagehide", destroy, { once: true });
    window.addEventListener("beforeunload", destroy, { once: true });
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  // ---------------- Messaging ----------------
  function handleMessage(event: MessageEvent) {
    const { type, payload } = event.data || {};

    // Security: accept only widget origin after iframe loaded
    if (iframeLoaded && TARGET_ORIGIN && event.origin !== TARGET_ORIGIN) return;

    switch (type) {
      case "close":
        hide();
        break;

      case "resize":
        if (payload?.height && container) {
          container.style.height = `${payload.height}px`;
        }
        break;

      case "nexus:theme": {
        const p = payload as { theme?: ThemePayload; brandLogoUrl?: string };
        theme = p?.theme || null;
        brandLogoUrl = p?.brandLogoUrl || null;
        applyThemeToFab();
        break;
      }

      case "nexus:suggestions": {
        if (!NUDGE_ENABLED) return;
        const sp = payload as SuggestionsPayload;

        hasNudgePayload = true;
        theme = sp.theme || theme || null;
        brandLogoUrl = sp.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderSuggestionsNudge(sp);
        break;
      }

      case "nexus:promo": {
        if (!NUDGE_ENABLED) return;
        const promo = payload as PromoPayload;

        hasNudgePayload = true;
        theme = promo.theme || theme || null;
        brandLogoUrl = promo.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderPromoNudge(promo);
        break;
      }

      default:
        break;
    }
  }

  function postToWidget(msg: any) {
    if (!iframeLoaded || !iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(msg, TARGET_ORIGIN || "*");
  }

  // ---------------- FAB theme ----------------
  function applyThemeToFab() {
    if (!button) return;

    const bubbleColor = theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6";
    const textColor = theme?.primaryTextColor || "#ffffff";

    button.style.background = bubbleColor;
    button.style.color = textColor;

    if (isOpen) {
      button.innerHTML = closeIcon;
      return;
    }

    if (brandLogoUrl) {
      const safeLogo = escapeAttr(brandLogoUrl);
      button.innerHTML = `
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${safeLogo}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `;
    } else {
      button.innerHTML = chatBubbleIcon;
    }
  }

  // ---------------- Nudge (minimal, no caret, no scroll/resize logic) ----------------
  function renderSuggestionsNudge(payload: SuggestionsPayload) {
    if (!button || !NUDGE_ENABLED) return;
    if (nudgeDismissed) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#0ea5e9";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";

    ensureNudgeShell(nudgeBg);

    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 3) : [];
    const chips = suggestions
      .map(
        (s) => `
          <button data-kind="open_chat"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${primaryColor}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${primaryColor};
              background:${primaryColor}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${escapeHtml(s)}
          </button>
        `,
      )
      .join("");

    nudge!.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:14px;color:#111827;">
            ${escapeHtml("Quick questions")}
          </div>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
            ${chips}
          </div>
          ${
            payload.privacyUrl
              ? `<div style="margin-top:10px">
                  <a href="${escapeAttr(payload.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                    style="color:#6b7280;font-size:11px;text-decoration:underline">
                    View our privacy policy.
                  </a>
                </div>`
              : ""
          }
        </div>
        <button data-kind="close" title="Close"
          style="all:unset;width:20px;height:20px;display:flex;align-items:center;justify-content:center;
                 color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;">×</button>
      </div>
    `;

    bindNudgeClicks();
    showNudgeIfAllowed();
  }

  function renderPromoNudge(payload: PromoPayload) {
    if (!button || !NUDGE_ENABLED) return;
    if (nudgeDismissed) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#0ea5e9";
    const primaryTextColor = palette.primaryTextColor || "#ffffff";
    const secondaryColor = palette.secondaryColor || "#ffffff";
    const secondaryTextColor = palette.secondaryTextColor || "#111827";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";

    ensureNudgeShell(nudgeBg);

    const title = payload.title || "Discover the right solution for your business project.";
    const body = payload.body || "Chat with our assistant or book a 15-min demo.";

    // minimalist: 2 CTAs only (primary + secondary) OR list first 2
    const list = Array.isArray(payload.ctaList) ? payload.ctaList : [];
    const ctas: SimpleCta[] =
      list.length > 0
        ? list.slice(0, 3)
        : [
            payload.primaryCta || { kind: "open_chat", label: payload.primary || "Chat with AI Assistant" },
            payload.secondaryCta || { kind: "open_booking", label: payload.secondary || "Book a meeting" },
          ].filter(Boolean) as any;

    const buttonsHtml = ctas
      .map((cta, idx) => {
        const isPrimary = idx === 0;
        const bg = isPrimary ? primaryColor : secondaryColor;
        const color = isPrimary ? primaryTextColor : secondaryTextColor;
        const border = isPrimary ? "" : "border:1px solid #e5e7eb;";
        const label = cta.label?.trim()?.length ? cta.label : defaultLabelForKind(cta.kind);
        return `
          <button data-kind="${cta.kind}" data-url="${cta.url ? escapeAttr(cta.url) : ""}"
            style="
              all:unset;
              width:100%;
              min-height:36px;
              padding:0 12px;
              border-radius:8px;
              background:${bg};
              color:${color};
              ${border}
              cursor:pointer;
              font-weight:600;
              font-size:13px;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              box-sizing:border-box;
            ">
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join("");

    nudge!.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#111827;">
            ${escapeHtml(title)}
          </div>
          <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;">
            ${escapeHtml(body)}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            ${buttonsHtml}
          </div>

          ${
            payload.privacyUrl
              ? `<div style="margin-top:10px">
                  <a href="${escapeAttr(payload.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                    style="color:#6b7280;font-size:11px;text-decoration:underline">
                    View our privacy policy.
                  </a>
                </div>`
              : ""
          }
        </div>

        <button data-kind="close" title="Close"
          style="all:unset;width:20px;height:20px;display:flex;align-items:center;justify-content:center;
                 color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;">×</button>
      </div>
    `;

    bindNudgeClicks();
    showNudgeIfAllowed();
  }

  function ensureNudgeShell(nudgeBg: string) {
    if (nudge) return;

    const side = position === "bottom-right" ? "right: 20px;" : "left: 20px;";

    nudge = document.createElement("div");
    nudge.id = "nexus-nudge";
    nudge.style.cssText = `
      all: unset;
      position: fixed;
      ${side}
      bottom: 92px;
      width: 340px;
      max-width: min(340px, calc(100vw - 96px));
      z-index: 2147483001;
      background: ${nudgeBg};
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
      font-size: 14px;
      line-height: 1.4;
      display: none;
    `;
    document.body.appendChild(nudge);
  }

  function bindNudgeClicks() {
    if (!nudge) return;

    const buttons = nudge.querySelectorAll<HTMLButtonElement>("button[data-kind]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = (btn.getAttribute("data-kind") || "") as SimpleCta["kind"] | "close";
        if (kind === "close") {
          nudgeDismissed = true;
          hideNudge();
          return;
        }

        // route actions
        if (kind === "open_chat") openChat();
        else if (kind === "open_booking") openBooking();
        else if (kind === "open_url") {
          const url = btn.getAttribute("data-url") || "";
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });
  }

  function showNudgeIfAllowed() {
    if (!nudge) return;
    if (!hasNudgePayload) return;
    if (nudgeDismissed) return;
    if (isOpen) return;

    nudge.style.display = "block";
  }

  function hideNudge() {
    if (!nudge) return;
    nudge.style.display = "none";
  }

  function defaultLabelForKind(kind: SimpleCta["kind"]): string {
    if (kind === "open_chat") return "Chat with AI Assistant";
    if (kind === "open_booking") return "Book a meeting";
    return "Open link";
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
  }
  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
  }

  // ---------------- UI actions ----------------
  function show() {
    if (!container || !button) return;
    isOpen = true;

    hideNudge();

    container.style.display = "block";
    button.innerHTML = closeIcon;
    applyThemeToFab();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;

    container.style.display = "none";
    button.innerHTML = chatBubbleIcon;
    applyThemeToFab();

    // restore nudge if available
    if (!nudgeDismissed && hasNudgePayload) showNudgeIfAllowed();
  }

  function openChat() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:open-chat" }), 0);
  }

  function openBooking() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:run-secondary-cta" }), 0);
  }

  // ---------------- Lifecycle ----------------
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    try {
      window.removeEventListener("message", handleMessage);
    } catch {}

    if (nudge) {
      nudge.remove();
      nudge = null;
    }

    if (container) {
      container.remove();
      container = null;
      iframe = null;
    }

    if (button) {
      button.remove();
      button = null;
    }

    isOpen = false;
    iframeLoaded = false;
    TARGET_ORIGIN = "";
    theme = null;
    brandLogoUrl = null;
    hasNudgePayload = false;
    nudgeDismissed = false;
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left" }) {
    destroy();
    destroyed = false;

    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();