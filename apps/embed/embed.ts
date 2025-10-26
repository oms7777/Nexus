// apps/embed/widget.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";

(function () {
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let nudge: HTMLDivElement | null = null;
  let caret: HTMLDivElement | null = null;

  let isOpen = false;
  let nudgeDismissed = false; // l’utilisateur a cliqué ✕
  let hasPromoPayload = false;

  // --- config depuis le <script ...>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as
        | "bottom-right"
        | "bottom-left") || EMBED_CONFIG.DEFAULT_POSITION;
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
          | "bottom-left") || EMBED_CONFIG.DEFAULT_POSITION;
    }
  }

  if (!organizationId) {
    console.error("Echo Widget: data-organization-id attribute is required");
    return;
  }

  const WIDGET_ORIGIN = new URL(EMBED_CONFIG.WIDGET_URL).origin;

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function render() {
    // Bouton flottant (logo)
    button = document.createElement("button");
    button.id = "echo-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 1000000; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `;
    button.addEventListener("click", toggleWidget);
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
    document.body.appendChild(button);

    // Container + iframe (cachés au départ)
    container = document.createElement("div");
    container.id = "echo-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 999999; border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease;
      background: #fff;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.onload = () => sendParentLocation();

    container.appendChild(iframe);
    document.body.appendChild(container);

    // messages -> host
    window.addEventListener("message", handleMessage);

    // publier les changements d’URL (SPA)
    patchHistoryForSpa();
    window.addEventListener("popstate", sendParentLocation);

    // re-position on resize/scroll
    window.addEventListener("resize", placeNudge);
    window.addEventListener("scroll", placeNudge, { passive: true });
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  // -------- messaging --------
  function handleMessage(event: MessageEvent) {
    if (event.origin !== WIDGET_ORIGIN) return;
    const { type, payload } = event.data || {};

    switch (type) {
      case "close":
        hide();
        break;
      case "resize":
        if (payload?.height && container) container.style.height = `${payload.height}px`;
        break;
      case "nexus:promo":
        hasPromoPayload = true;
        renderNudge(payload);
        // cacher la promo interne du widget (éviter le doublon)
        iframe?.contentWindow?.postMessage({ type: "nexus:hide-internal-promo" }, WIDGET_ORIGIN);
        break;
      default:
        break;
    }
  }

  function postToWidget(msg: any) {
    iframe?.contentWindow?.postMessage(msg, WIDGET_ORIGIN);
  }

  function sendParentLocation() {
    postToWidget({ type: "nexus:parent-location", href: location.href });
  }

  function patchHistoryForSpa() {
    (["pushState", "replaceState"] as const).forEach((fn) => {
      const orig = (history as any)[fn];
      (history as any)[fn] = function (...args: any[]) {
        const ret = orig.apply(this, args);
        sendParentLocation();
        return ret;
      };
    });
  }

  // -------- nudge UI (SUSE-like) --------
  function renderNudge(payload: {
    title?: string;
    body?: string;
    primary?: string;
    secondary?: string;
    primaryCta?: unknown;
    secondaryCta?: unknown;
    avatars?: string[];
    privacyUrl?: string;
    brandName?: string;
    badgeText?: string;
  }) {
    // create container once
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "echo-nudge";
      nudge.style.cssText = `
        position: fixed;
        width: 340px; max-width: calc(100vw - 92px);
        z-index: 1000001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
      `;
      document.body.appendChild(nudge);

      // caret (petit triangle pointant le logo)
      caret = document.createElement("div");
      caret.style.cssText = `
        position: fixed;
        width: 12px; height: 12px;
        background: #ffffff;
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 1000002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `;
      document.body.appendChild(caret);
    }

    const avatars = Array.isArray(payload.avatars) && payload.avatars.length
      ? payload.avatars.slice(0, 3)
      : [];

    const avatarHtml = avatars.map((src, i) => `
      <img src="${escapeAttr(src)}" alt="avatar ${i + 1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${i ? `margin-left:-10px; z-index:${10 - i};` : "z-index:10;"}
        " />
    `).join("");

    const badgeHtml = payload.badgeText
      ? `<span style="
            position:absolute; left:12px; top:10px;
            background:#10b981; color:#fff; font-size:11px; line-height:1;
            padding:4px 6px; border-radius:6px; font-weight:600;">
          ${escapeHtml(payload.badgeText)}
        </span>`
      : "";

    nudge.innerHTML = `
      <div style="position:relative">
        ${badgeHtml}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:2px">
            ${avatarHtml}
          </div>
          <div style="flex:1">
            <div style="font-weight:700">${escapeHtml(
              payload.title || "Discover the right solution for your business project.",
            )}</div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4">${escapeHtml(
              payload.body || "Chat with our assistant or book a 15-min demo.",
            )}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button id="nexus-primary"
                style="flex:1;height:36px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer;font-weight:600">
                ${escapeHtml(payload.primary || "Chat with AI Assistant")}
              </button>
              ${
                payload.secondary !== undefined
                  ? `<button id="nexus-secondary"
                      style="flex:1;height:36px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;cursor:pointer;font-weight:600">
                      ${escapeHtml(payload.secondary || "Book a meeting")}
                    </button>`
                  : ""
              }
            </div>
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
            style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;

    // handlers
    const primaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-primary");
    const secondaryBtn = nudge.querySelector<HTMLButtonElement>("#nexus-secondary");
    const closeBtn = nudge.querySelector<HTMLButtonElement>("#nexus-close");

    primaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-primary-cta" });
      show(); // ouvre le chat
    });
    secondaryBtn?.addEventListener("click", () => {
      postToWidget({ type: "nexus:run-secondary-cta" });
      show();
    });
    closeBtn?.addEventListener("click", () => {
      nudgeDismissed = true;
      removeNudge();
    });

    // place + reveal
    placeNudge();
    if (!isOpen && !nudgeDismissed) {
      requestAnimationFrame(() => {
        if (nudge) { nudge.style.opacity = "1"; nudge.style.transform = "translateY(0)"; }
        if (caret) caret.style.opacity = "1";
      });
    }
  }

  function placeNudge() {
    if (!button || !nudge || !caret) return;

    const btnRect = button.getBoundingClientRect();
    const gap = 12; // gap entre nudge et bouton
    const caretOffset = 10; // décalage vertical du caret par rapport au bord du nudge

    // aligner horizontalement au bouton (bord droit/gauche)
    const sideRight = position === "bottom-right";

    // Nudge X
    const nudgeX = sideRight
      ? Math.max(12, window.innerWidth - (btnRect.right - 0) - (window.innerWidth - (btnRect.right + 20)) - 340) // garde-fou
      : 20;

    // Nudge Y juste au-dessus du bouton
    const nudgeBottomPx = (window.innerHeight - btnRect.top) + gap;

    nudge.style.right = sideRight ? "20px" : "";
    nudge.style.left  = sideRight ? "" : "20px";
    nudge.style.bottom = `${nudgeBottomPx}px`;

    // Caret : centré au-dessus du bouton
    const caretSize = 12;
    const caretLeft = sideRight
      ? btnRect.right - caretSize - 20 - 6
      : btnRect.left + 20 + 6;
    const caretBottom = (window.innerHeight - btnRect.top) + (gap - caretSize/2);

    caret.style.left = sideRight ? `${caretLeft}px` : `${caretLeft}px`;
    caret.style.bottom = `${caretBottom}px`;

    // orientation du caret (45° déjà appliqué)
    caret.style.transform = sideRight ? "rotate(45deg)" : "rotate(45deg)";
  }

  function removeNudge() {
    if (nudge) { nudge.remove(); nudge = null; }
    if (caret) { caret.remove(); caret = null; }
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
  }
  function escapeAttr(s: string) {
    return s.replace(/"/g, "&quot;");
  }

  // -------- open / close --------
  function toggleWidget() { isOpen ? hide() : show(); }

  function show() {
    if (!container || !button) return;
    isOpen = true;
    // cache le nudge quand on ouvre
    if (nudge) { nudge.style.opacity = "0"; nudge.style.transform = "translateY(6px)"; }
    if (caret) caret.style.opacity = "0";

    container.style.display = "block";
    setTimeout(() => {
      if (container) {
        container.style.opacity = "1";
        container.style.transform = "translateY(0)";
      }
    }, 10);
    button.innerHTML = closeIcon;
    sendParentLocation();
  }

  function hide() {
    if (!container || !button) return;
    isOpen = false;
    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);
    button.innerHTML = chatBubbleIcon;
    button.style.background = "#3b82f6";

    // si l’utilisateur ne l’a pas fermé, on ré-affiche le nudge si on a un payload
    if (hasPromoPayload && !nudgeDismissed) {
      // remonte la promo actuelle en demandant au widget de reposter (au cas où)
      postToWidget({ type: "nexus:parent-location", href: location.href });
    }
  }

  // -------- lifecycle --------
  function destroy() {
    window.removeEventListener("message", handleMessage);
    window.removeEventListener("popstate", sendParentLocation);
    window.removeEventListener("resize", placeNudge);
    window.removeEventListener("scroll", placeNudge);
    removeNudge();
    if (container) { container.remove(); container = null; iframe = null; }
    if (button) { button.remove(); button = null; }
    isOpen = false;
  }

  function reinit(newConfig: { organizationId?: string; position?: "bottom-right" | "bottom-left"; }) {
    destroy();
    if (newConfig.organizationId) organizationId = newConfig.organizationId;
    if (newConfig.position) position = newConfig.position;
    init();
  }

  (window as any).EchoWidget = { init: reinit, show, hide, destroy };

  init();
})();
