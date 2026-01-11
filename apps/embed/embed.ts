import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";
import { initVisitorTracking } from "./visitor-tracker";

const NUDGE_ENABLED = true;

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

  // Thème & branding envoyés par le widget
  theme?: ThemePayload;
  brandLogoUrl?: string;

  identityMode?: "auto" | "logo" | "avatars";
  ctaList?: SimpleCta[];
  canUseVoice?: boolean;
};

// ✅ NEW: Suggestions nudge (Starter = chips)
type SuggestionsPayload = {
  greetMessage?: string;
  suggestions: string[];
  privacyUrl?: string;
  theme?: ThemePayload;
  brandLogoUrl?: string;
};

(function () {
  // DOM
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  // State
  let isOpen = false;
  let hasNudgePayload = false; // ✅ was hasPromoPayload
  let nudgeDismissed = false;
  let iframeLoaded = false;
  let TARGET_ORIGIN = "";

  // Tracking
  let trackingStarted = false;
  let trackingSessionId: string | null = null;

  // Config from <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  // THEME
  let theme: ThemePayload | null = null;
  let brandLogoUrl: string | null = null;

  // ✅ NEW: éviter le flash bleu
  let fabRevealed = false;

  // ----- Read attributes from <script> -----
  const currentScript = document.currentScript as HTMLScriptElement | null;

  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as
        | "bottom-right"
        | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="widget"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id"),
    ) as HTMLScriptElement | undefined;

    if (embedScript) {
      organizationId = embedScript.getAttribute("data-organization-id");
      position =
        (embedScript.getAttribute("data-position") as
          | "bottom-right"
          | "bottom-left") ?? EMBED_CONFIG.DEFAULT_POSITION;
    }
  }

  if (!organizationId) {
    console.error("Nexus Widget: data-organization-id attribute is required");
    return;
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function render() {
    // ----- FAB (chat bubble) -----
    button = document.createElement("button");
    button.id = "nexus-widget-button";
    button.innerHTML = chatBubbleIcon;

    // ✅ IMPORTANT:
    // - bouton invisible tant qu'on n'a pas reçu theme/promo/suggestions
    // - supprime le flash “bleu”
    button.style.cssText = `
      all: unset;
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6"};
      color: ${theme?.primaryTextColor || "#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `;

    button.addEventListener("click", () => {
      if (isOpen) {
        hide();
        return;
      }
      openChat();
    });

    button.addEventListener("mouseenter", () => {
      if (!button) return;
      button.style.transform = "scale(1.05)";
      button.style.boxShadow = "0 6px 28px rgba(15,23,42,.35)";
    });

    button.addEventListener("mouseleave", () => {
      if (!button) return;
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 4px 24px rgba(0,0,0,.25)";
    });

    document.body.appendChild(button);

    // ----- Container -----
    container = document.createElement("div");
    container.id = "nexus-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `;

    // ----- Iframe -----
    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;

    iframe.onload = () => {
      iframeLoaded = true;
      TARGET_ORIGIN = new URL(iframe!.src).origin;

      postToWidget({ type: "nexus:embed-ready" });
      sendParentLocation();

      // ✅ si theme déjà reçu (rare), l’appliquer maintenant
      applyThemeToFab();
    };

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Messaging
    //window.addEventListener("message", handleMessage);
    //patchHistoryForSpa();
    //window.addEventListener("popstate", sendParentLocation);

    // Nudge positioning
    //window.addEventListener("resize", placeNudge);
    //window.addEventListener("scroll", placeNudge, { passive: true });
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  /* ---------------- Messaging ---------------- */

  function handleMessage(event: MessageEvent) {
    const { type, payload } = event.data || {};

    // Si iframe chargée, on sécurise l'origin
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

      /**
       * ✅ thème envoyé dès le loading screen
       * payload: { theme, brandLogoUrl }
       */
      case "nexus:theme": {
        const p = payload as { theme?: ThemePayload; brandLogoUrl?: string };
        theme = p?.theme || null;
        brandLogoUrl = p?.brandLogoUrl || null;
        applyThemeToFab();
        break;
      }

      // ✅ NEW: Starter suggestions nudge (chips)
      case "nexus:suggestions": {
        const sp = payload as SuggestionsPayload;

        if (!NUDGE_ENABLED) return;

        hasNudgePayload = true;

        theme = sp.theme || theme || null;
        brandLogoUrl = sp.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderSuggestionsNudge(sp);
        break;
      }

      case "nexus:promo": {
        const promoPayload = payload as PromoPayload;

        iframe?.contentWindow?.postMessage(
          { type: "nexus:host-ack" },
          TARGET_ORIGIN || "*",
        );
        iframe?.contentWindow?.postMessage(
          { type: "nexus:hide-internal-promo" },
          TARGET_ORIGIN || "*",
        );

        if (!NUDGE_ENABLED) return;

        hasNudgePayload = true;

        // Thème + logo venant du widget
        theme = promoPayload.theme || theme || null;
        brandLogoUrl = promoPayload.brandLogoUrl || brandLogoUrl || null;

        applyThemeToFab();
        renderNudge(promoPayload);
        break;
      }

      case "nexus:session-ready": {
        if (!organizationId) return;
        if (!payload || typeof payload.sessionId !== "string") return;
        if (trackingStarted) return;

        trackingStarted = true;
        trackingSessionId = payload.sessionId;

        initVisitorTracking({
          orgId: organizationId,
          sessionId: payload.sessionId,
        });

        break;
      }

      default:
        break;
    }
  }

  function revealFabIfNeeded() {
    if (!button) return;
    if (fabRevealed) return;

    // ✅ On rend visible dès qu'on a un theme OU un logo OU un nudge payload
    if (!theme && !brandLogoUrl && !hasNudgePayload) return;

    fabRevealed = true;
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";
  }

  function applyThemeToFab() {
    if (!button) return;

    const bubbleColor =
      theme?.chatBubbleColor || theme?.primaryColor || "#3b82f6";
    const textColor = theme?.primaryTextColor || "#ffffff";

    button.style.background = bubbleColor;
    button.style.color = textColor;

    // ✅ NEW: plus de flash bleu
    revealFabIfNeeded();

    // Si le widget est ouvert, on garde le X (ne pas remplacer innerHTML)
    if (isOpen) return;

    // Si un logo est défini → on l'affiche dans la bulle
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

  function postToWidget(msg: any) {
    if (!iframeLoaded || !iframe?.contentWindow) return;
    const origin = TARGET_ORIGIN || "*";
    iframe.contentWindow.postMessage(msg, origin);
  }

  function sendParentLocation() {
    postToWidget({ type: "nexus:parent-location", href: location.href });
  }

  function patchHistoryForSpa() {
    (["pushState", "replaceState"] as const).forEach((fn) => {
      const orig = (history as any)[fn];
      (history as any)[fn] = function (...args: any[]) {
        const ret = orig.apply(this, args);
        if (iframeLoaded) sendParentLocation();
        return ret;
      };
    });
  }

  /* ---------------- Nudge ---------------- */

  // ✅ NEW: Starter nudge = chips
  function renderSuggestionsNudge(payload: SuggestionsPayload) {
    if (!NUDGE_ENABLED) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#0ea5e9";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";

    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${nudgeBg};
        border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `;
      document.body.appendChild(nudge);

      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: ${nudgeBg};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    const suggestions = Array.isArray(payload.suggestions)
      ? payload.suggestions.slice(0, 3)
      : [];

    const chips = suggestions
      .map(
        (s, i) => `
          <button data-sugg-index="${i}"
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
      <div style="position:relative">
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

          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>
        </div>
      </div>
    `;

    const closeBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-close");
    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      removeNudge();
    });

    const btns = nudge!.querySelectorAll<HTMLButtonElement>(
      "button[data-sugg-index]",
    );
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        openChat();
      });
    });

    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) {
          nudge.style.opacity = "1";
          nudge.style.transform = "translateY(0)";
        }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function renderNudge(payload: PromoPayload) {
    if (!NUDGE_ENABLED) return;

    const palette: ThemePayload = payload.theme || theme || {};
    const primaryColor = palette.primaryColor || "#0ea5e9";
    const primaryTextColor = palette.primaryTextColor || "#ffffff";
    const secondaryColor = palette.secondaryColor || "#ffffff";
    const nudgeBg = palette.nudgeBackgroundColor || "#ffffff";
    const secondaryTextColor = palette.secondaryTextColor || "#111827";

    // ✅ NEW: couleurs micro = bubble (branding)
    const micBg = palette.chatBubbleColor || palette.primaryColor || "#3b82f6";
    const micFg = palette.primaryTextColor || "#ffffff";
    const canUseVoice = payload.canUseVoice !== false;

    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${nudgeBg};
        border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `;
      document.body.appendChild(nudge);

      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: ${nudgeBg};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    const avatars = Array.isArray(payload.avatars)
      ? payload.avatars.slice(0, 3)
      : [];

    const ctaList: SimpleCta[] =
      Array.isArray(payload.ctaList) && payload.ctaList.length
        ? payload.ctaList
        : [];

    const hasMulti = ctaList.length > 0;
    const identityMode: "auto" | "logo" | "avatars" =
      payload.identityMode || "auto";

    let identityHtml = "";

    if (identityMode === "logo") {
      if (brandLogoUrl) {
        const safeLogo = escapeAttr(brandLogoUrl);
        identityHtml = `
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${safeLogo}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `;
      }
    } else if (identityMode === "avatars") {
      if (avatars.length) {
        identityHtml = avatars
          .map(
            (src, i) => `
          <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${
                i
                  ? `margin-left:-10px; z-index:${10 - i};`
                  : "z-index:10;"
              }
            " />`,
          )
          .join("");
      }
    } else {
      if (brandLogoUrl) {
        const safeLogo = escapeAttr(brandLogoUrl);
        identityHtml = `
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${safeLogo}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `;
      } else if (avatars.length) {
        identityHtml = avatars
          .map(
            (src, i) => `
          <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${
                i
                  ? `margin-left:-10px; z-index:${10 - i};`
                  : "z-index:10;"
              }
            " />`,
          )
          .join("");
      }
    }

    const badgeHtml = payload.badgeText
      ? `<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${escapeHtml(payload.badgeText)}
         </span>`
      : "";

    const title =
      payload.title || "Discover the right solution for your business project.";
    const body = payload.body || "Chat with our assistant or book a 15-min demo.";

    const buttonsHtml = hasMulti
      ? `
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ctaList
            .map((cta, index) => {
              const isPrimary = index === 0;
              const bg = isPrimary ? primaryColor : secondaryColor;
              const color = isPrimary ? primaryTextColor : secondaryTextColor;
              const border = isPrimary ? "" : "border:1px solid #e5e7eb;";
              const label =
                cta.label && cta.label.trim().length
                  ? cta.label
                  : defaultLabelForKind(cta.kind);

              return `
                <button data-cta-index="${index}"
                  style="
                    all: unset;
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
                    white-space:normal;
                  ">
                  ${escapeHtml(label)}
                </button>
              `;
            })
            .join("")}
        </div>
      `
      : `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          <button id="nexus-primary"
            style="
              all: unset;
              width:100%;
              min-height:36px;
              padding:0 12px;
              border-radius:8px;
              background:${primaryColor};
              color:${primaryTextColor};
              cursor:pointer;
              font-weight:600;
              font-size:13px;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              box-sizing:border-box;
              white-space:normal;
            ">
            ${escapeHtml(payload.primary || "Chat with AI Assistant")}
          </button>
          ${
            payload.secondary !== undefined
              ? `<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${secondaryColor};
                    color:${secondaryTextColor};
                    border:1px solid #e5e7eb;
                    cursor:pointer;
                    font-weight:600;
                    font-size:13px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    box-sizing:border-box;
                    white-space:normal;
                  ">
                  ${escapeHtml(payload.secondary || "Book a meeting")}
                </button>`
              : ""
          }
        </div>
      `;

    // ✅ micro au milieu sous le texte
    const micHtml = canUseVoice
      ? `
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${micBg};
              color:${micFg};
              cursor:pointer;
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 6px 18px rgba(0,0,0,.18);
              transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
            ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 18v3" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 21h8" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `
      : "";

    nudge!.innerHTML = `
      <div style="position:relative">
        ${badgeHtml}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${identityHtml}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${escapeHtml(title)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${escapeHtml(body)}
            </div>

            ${micHtml}

            ${buttonsHtml}

            ${
              payload.privacyUrl
                ? `<div style="margin-top:10px">
                    <a href="${escapeAttr(payload.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`
                : ""
            }
          </div>
          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>
        </div>
      </div>
    `;

    const closeBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-close");
    const voiceBtn = nudge!.querySelector<HTMLButtonElement>("#nexus-voice");

    if (canUseVoice) {
      voiceBtn?.addEventListener("mouseenter", () => {
        if (!voiceBtn) return;
        voiceBtn.style.transform = "scale(1.06)";
        voiceBtn.style.boxShadow = "0 10px 22px rgba(0,0,0,.22)";
      });

      voiceBtn?.addEventListener("mouseleave", () => {
        if (!voiceBtn) return;
        voiceBtn.style.transform = "scale(1)";
        voiceBtn.style.boxShadow = "0 6px 18px rgba(0,0,0,.18)";
      });

      voiceBtn?.addEventListener("click", () => {
        show();
        setTimeout(() => {
          postToWidget({ type: "nexus:open-voice" });
        }, 50);
      });
    }

    if (hasMulti) {
      const btns = nudge!.querySelectorAll<HTMLButtonElement>(
        "button[data-cta-index]",
      );
      btns.forEach((btn) => {
        const idx = Number(btn.getAttribute("data-cta-index") || "0");
        btn.addEventListener("click", () => runNudgeCta(idx));
      });
    } else {
      const primaryBtn =
        nudge!.querySelector<HTMLButtonElement>("#nexus-primary");
      const secondaryBtn =
        nudge!.querySelector<HTMLButtonElement>("#nexus-secondary");
      primaryBtn?.addEventListener("click", () => openChat());
      secondaryBtn?.addEventListener("click", () => openBooking());
    }

    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      removeNudge();
    });

    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) {
          nudge.style.opacity = "1";
          nudge.style.transform = "translateY(0)";
        }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function runNudgeCta(index: number) {
    show();
    setTimeout(() => {
      postToWidget({ type: "nexus:run-cta", index });
    }, 50);
  }

  function defaultLabelForKind(kind: SimpleCta["kind"]): string {
    if (kind === "open_chat") return "Chat with AI Assistant";
    if (kind === "open_booking") return "Book a meeting";
    return "Open link";
  }

  function placeNudge() {
    if (!button || !nudge || !caret) return;

    const rect = button.getBoundingClientRect();
    const gap = 12;
    const caretSize = 12;
    const fromBottomToButtonTop = window.innerHeight - rect.top;

    nudge.style.bottom = `${fromBottomToButtonTop + gap}px`;
    if (position === "bottom-right") {
      nudge.style.right = "20px";
      (nudge.style as any).left = "";
    } else {
      nudge.style.left = "20px";
      (nudge.style as any).right = "";
    }

    const centerX = rect.left + rect.width / 2;
    caret.style.left = `${centerX - caretSize / 2}px`;
    caret.style.bottom = `${fromBottomToButtonTop + (gap - caretSize / 2)}px`;
    caret.style.transform = "rotate(45deg)";

    const r = nudge.getBoundingClientRect();
    const overflowRight = r.right - window.innerWidth;
    const overflowLeft = -r.left;

    if (overflowRight > 0 && position === "bottom-right") {
      const currRight = parseFloat(getComputedStyle(nudge).right || "20");
      nudge.style.right = `${Math.max(12, currRight + overflowRight)}px`;
    } else if (overflowLeft > 0 && position === "bottom-left") {
      const currLeft = parseFloat(getComputedStyle(nudge).left || "20");
      nudge.style.left = `${Math.max(12, currLeft + overflowLeft)}px`;
    }
  }

  function removeNudge() {
    if (nudge) {
      nudge.remove();
      nudge = null;
    }
    if (caret) {
      caret.remove();
      caret = null;
    }
  }

  function escapeHtml(s: string) {
    return s.replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m]!),
    );
  }

  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
  }

  /* ---------------- UI actions ---------------- */

  function show() {
    if (!container || !button) return;
    isOpen = true;

    if (nudge) nudge.style.display = "none";
    if (caret) caret.style.display = "none";

    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        container.style.transform = "translateY(0)";
      }
    }, 10);

    button.innerHTML = closeIcon;
    applyThemeToFab();

    sendParentLocation();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;

    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);

    button.innerHTML = chatBubbleIcon;
    applyThemeToFab();

    // ✅ was hasPromoPayload
    if (!nudgeDismissed && hasNudgePayload && nudge && caret) {
      nudge.style.display = "block";
      nudge.style.opacity = "1";
      nudge.style.transform = "translateY(0)";
      caret.style.display = "block";
      caret.style.opacity = "1";
      placeNudge();
      postToWidget({ type: "nexus:parent-location", href: location.href });
    }
  }

  function openChat() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:open-chat" }), 50);
  }

  function openBooking() {
    show();
    setTimeout(() => postToWidget({ type: "nexus:run-secondary-cta" }), 50);
  }

  /* ---------------- Lifecycle ---------------- */

  function destroy() {
    window.removeEventListener("message", handleMessage);
    window.removeEventListener("popstate", sendParentLocation);
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);
    removeNudge();

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
    trackingStarted = false;
    trackingSessionId = null;
    theme = null;
    brandLogoUrl = null;
    fabRevealed = false;
    hasNudgePayload = false; // ✅ reset
    nudgeDismissed = false;
  }

  function reinit(cfg: {
    organizationId?: string;
    position?: "bottom-right" | "bottom-left";
  }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).NexusWidget = { init: reinit, show, hide, destroy };
  init();
})();
