// apps/embed/src/embed.ts
import { EMBED_CONFIG } from "./config";
import { chatBubbleIcon, closeIcon } from "./icons";
import Pusher, { type Channel } from "pusher-js";
import { record } from "rrweb";
import html2canvas from "html2canvas";

(function () {
  let iframe: HTMLIFrameElement | null = null;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let isOpen = false;

  // --- NEW: promo nudge DOM
  let promoEl: HTMLDivElement | null = null;
  let promoData:
    | {
        title: string;
        body: string;
        primary: string;
        secondary?: string;
      }
    | null = null;

  // ---- Config via <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  function readAttrs(from: HTMLScriptElement | null) {
    if (!from) return;
    organizationId = from.getAttribute("data-organization-id");
    position =
      (from.getAttribute("data-position") as "bottom-right" | "bottom-left") ||
      EMBED_CONFIG.DEFAULT_POSITION;
  }
  if (currentScript) readAttrs(currentScript);
  else {
    const scripts = document.querySelectorAll('script[src*="embed"]');
    const s = Array.from(scripts).find((x) => x.hasAttribute("data-organization-id")) as
      | HTMLScriptElement
      | undefined;
    if (s) readAttrs(s);
  }

  if (!organizationId) {
    console.error("Echo Widget: data-organization-id attribute is required");
    return;
  }

  const WEB_ORIGIN = EMBED_CONFIG.WEB_ORIGIN;
  const WIDGET_URL = EMBED_CONFIG.WIDGET_URL;
  const WIDGET_ORIGIN = new URL(WIDGET_URL).origin;

  // ---- Session / tracking (via routes Next proxies)
  const SESSION_KEY = `nx_session_${organizationId}`;
  let sessionId: string | null = null;
  let lastBeat = Date.now();

  async function postJSON<T = any>(url: string, body: any): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return (await res.json()) as T;
  }

  async function ensureSession(metadata?: any) {
    const existing = localStorage.getItem(SESSION_KEY);
    const meta =
      metadata ??
      {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currentUrl: location.href,
        title: document.title,
        referrer: document.referrer || "",
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      };

    const out = await postJSON<{ sessionId: string }>(
      `${WEB_ORIGIN}/api/tracker/ensure-session`,
      { organizationId, sessionId: existing || undefined, metadata: meta }
    );
    sessionId = out.sessionId;
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  async function log(type: string, meta?: any) {
    if (!sessionId) return;
    try {
      await postJSON(`${WEB_ORIGIN}/api/tracker/log`, {
        organizationId,
        type,
        sessionId,
        ts: Date.now(),
        meta,
      });
    } catch {}
  }

  async function heartbeat() {
    if (!sessionId) return;
    const now = Date.now();
    const visible = document.visibilityState === "visible";
    const engagedMs = visible ? now - lastBeat : 0;
    lastBeat = now;
    await ensureSession();
    if (engagedMs > 0) log("time_on_site", { ms: engagedMs, url: location.href });
  }

  async function onPageChange() {
    if (!sessionId) return;
    await ensureSession({
      currentUrl: location.href,
      title: document.title,
      referrer: document.referrer || "",
    });
    log("page_view", { url: location.href, title: document.title, referrer: document.referrer });
    sendParentLocation();
    takeSnapshot().catch(() => {});
  }

  function sendParentLocation() {
    try {
      iframe?.contentWindow?.postMessage(
        { type: "nexus:parent-location", href: window.location.href },
        WIDGET_ORIGIN
      );
    } catch {}
  }

  const _push = history.pushState;
  const _replace = history.replaceState;
  function patchHistory() {
    history.pushState = function (...args) {
      // @ts-ignore
      _push.apply(this, args);
      onPageChange();
    };
    history.replaceState = function (...args) {
      // @ts-ignore
      _replace.apply(this, args);
      onPageChange();
    };
    window.addEventListener("popstate", onPageChange);
    window.addEventListener("hashchange", onPageChange);
  }
  function unpatchHistory() {
    history.pushState = _push;
    history.replaceState = _replace;
    window.removeEventListener("popstate", onPageChange);
    window.removeEventListener("hashchange", onPageChange);
  }

  // ---- Realtime (Pusher) + rrweb + cursor
  let pusher: Pusher | null = null;
  let channel: Channel | null = null;

  async function pusherConnect() {
    pusher = new Pusher(EMBED_CONFIG.PUSHER_KEY, {
      cluster: EMBED_CONFIG.PUSHER_CLUSTER,
      authorizer: (ch) => ({
        authorize: (socketId, cb) => {
          fetch(`${WEB_ORIGIN}/api/realtime/pusher-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: ch.name,
              orgId: organizationId,
              sessionId,
            }),
          })
            .then((r) => r.json())
            .then((data) => cb(null, data))
            .catch((err) => cb(err as any, null));
        },
      }),
    });
    const chanName = `presence-org_${organizationId}_session_${sessionId}`;
    channel = pusher.subscribe(chanName);
  }

  function startRrwebStreaming() {
    const buffer: any[] = [];
    let lastFlush = Date.now();
    record({
      emit(event) {
        buffer.push(event);
        const now = Date.now();
        if (channel && now - lastFlush > 400) {
          const payload = { events: buffer.splice(0) };
          try {
            channel!.trigger("client-rrweb", payload);
          } catch {}
          lastFlush = now;
        }
      },
      sampling: { mousemove: 50, scroll: 100, input: "last" },
    });
    let raf: number | null = null;
    window.addEventListener("mousemove", (e) => {
      if (!channel) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          channel!.trigger("client-cursor", {
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
          });
        } catch {}
      });
    });
  }

  async function takeSnapshot() {
    if (!sessionId) return;
    try {
      const canvas = await html2canvas(document.body, { scale: 0.3, useCORS: true });
      const dataUrl = canvas.toDataURL("image/webp", 0.6);
      await postJSON(`${WEB_ORIGIN}/api/tracker/snapshot`, {
        organizationId,
        sessionId,
        ts: Date.now(),
        pageUrl: location.href,
        title: document.title,
        width: window.innerWidth,
        height: window.innerHeight,
        dataUrl,
      });
    } catch {}
  }

  // ---- Boot
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  async function render() {
    await ensureSession();
    if (!sessionStorage.getItem("nx_visit_started")) {
      await log("session_started", { url: location.href });
      sessionStorage.setItem("nx_visit_started", "1");
    }
    await log("page_view", { url: location.href, title: document.title, referrer: document.referrer });

    await pusherConnect();
    startRrwebStreaming();
    setInterval(heartbeat, 15000);
    setInterval(takeSnapshot, 60000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("beforeunload", () => {
      try {
        const ms = Date.now() - lastBeat;
        if (ms > 0) navigator.sendBeacon?.("/", JSON.stringify({ type: "time_on_site", ms }));
      } catch {}
    });

    // ----- UI: bubble + container
    button = document.createElement("button");
    button.id = "echo-widget-button";
    button.innerHTML = chatBubbleIcon;
    button.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 999999; display:flex; align-items:center; justify-content:center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: all .2s ease;
    `;
    button.addEventListener("click", toggleWidget);
    button.addEventListener("mouseenter", () => (button!.style.transform = "scale(1.05)"));
    button.addEventListener("mouseleave", () => (button!.style.transform = "scale(1)"));
    document.body.appendChild(button);

    container = document.createElement("div");
    container.id = "echo-widget-container";
    container.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px; width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 999998; border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15); display:none; opacity:0;
      transform: translateY(10px); transition: all .3s ease;
      background: transparent;
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;background:transparent;`;
    iframe.addEventListener("load", () => sendParentLocation());

    container.appendChild(iframe);
    document.body.appendChild(container);

    // --- NEW: promo nudge element (hidden by default)
    promoEl = document.createElement("div");
    promoEl.style.cssText = `
      position: fixed;
      ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 90px; width: 320px;
      z-index: 999997; border-radius: 12px; overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,.18);
      background: #fff; border: 1px solid rgba(0,0,0,0.06);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto;
      display: none; opacity: 0; transform: translateY(6px);
      transition: all .2s ease;
    `;
    document.body.appendChild(promoEl);

    window.addEventListener("message", handleMessage);
    patchHistory();
    sendParentLocation();
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    // laisse le widget décider d’auto-chat; pas de param ici
    return `${WIDGET_URL}?${params.toString()}`;
  }

  // --- NEW: render nudge
  function renderPromo() {
    if (!promoEl) return;
    if (!promoData || isOpen) {
      promoEl.style.display = "none";
      return;
    }
    promoEl.innerHTML = `
      <div style="position:relative;padding:12px 12px 10px 12px;">
        <button aria-label="Close" id="nx-nudge-close"
          style="position:absolute;right:8px;top:8px;border:none;background:transparent;cursor:pointer;font-size:16px;opacity:.6">×</button>
        <div style="font-weight:600;font-size:14px;line-height:1.2;margin-bottom:4px;">
          ${promoData.title}
        </div>
        <div style="font-size:12px;color:#666;line-height:1.4;margin-bottom:10px;">
          ${promoData.body}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="nx-nudge-primary"
            style="flex:1;height:34px;border-radius:8px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer">
            ${promoData.primary}
          </button>
          ${
            promoData.secondary
              ? `<button id="nx-nudge-secondary"
                   style="flex:1;height:34px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;color:#111;font-weight:600;cursor:pointer">
                   ${promoData.secondary}
                 </button>`
              : ""
          }
        </div>
      </div>
    `;
    // wire buttons
    promoEl.querySelector("#nx-nudge-close")?.addEventListener("click", () => {
      promoEl!.style.display = "none";
      promoEl!.style.opacity = "0";
    });
    promoEl.querySelector("#nx-nudge-primary")?.addEventListener("click", () => {
      iframe?.contentWindow?.postMessage({ type: "nexus:run-primary-cta" }, WIDGET_ORIGIN);
    });
    promoEl.querySelector("#nx-nudge-secondary")?.addEventListener("click", () => {
      iframe?.contentWindow?.postMessage({ type: "nexus:run-secondary-cta" }, WIDGET_ORIGIN);
    });

    // show
    promoEl.style.display = "block";
    requestAnimationFrame(() => {
      promoEl!.style.opacity = "1";
      promoEl!.style.transform = "translateY(0)";
    });
  }

  function handleMessage(event: MessageEvent) {
    if (event.origin !== WIDGET_ORIGIN) return;
    const { type, payload } = event.data || {};
    if (type === "close") hide();
    if (type === "resize" && payload?.height && container) {
      container.style.height = `${payload.height}px`;
    }
    // --- NEW: receive promo content from widget
    if (type === "nexus:promo") {
      promoData = {
        title: payload?.title ?? "Need a hand?",
        body: payload?.body ?? "Chat now or book a quick meeting.",
        primary: payload?.primary ?? "Chat",
        secondary: payload?.secondary,
      };
      if (!isOpen) renderPromo();
    }
  }

  function toggleWidget() {
    isOpen ? hide() : show();
  }
  function show() {
    if (!container || !button) return;
    isOpen = true;
    // hide promo when opening
    if (promoEl) {
      promoEl.style.opacity = "0";
      promoEl.style.transform = "translateY(6px)";
      setTimeout(() => promoEl && (promoEl.style.display = "none"), 180);
    }
    container.style.display = "block";
    setTimeout(() => {
      if (!container) return;
      container.style.opacity = "1";
      container.style.transform = "translateY(0)";
    }, 10);
    button.innerHTML = closeIcon;
    sendParentLocation();
    log("widget_opened", { url: location.href });
  }
  function hide() {
    if (!container || !button) return;
    isOpen = false;
    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);
    button.innerHTML = chatBubbleIcon;
    // re-show promo (if we have data)
    renderPromo();
  }

  function destroy() {
    window.removeEventListener("message", handleMessage);
    unpatchHistory();
    if (container) container.remove();
    if (button) button.remove();
    if (promoEl) promoEl.remove();
    iframe = null;
    container = null;
    button = null;
    promoEl = null;
    isOpen = false;
    promoData = null;
  }

  function reinit(cfg: { organizationId?: string; position?: "bottom-right" | "bottom-left" }) {
    destroy();
    if (cfg.organizationId) organizationId = cfg.organizationId;
    if (cfg.position) position = cfg.position;
    init();
  }

  (window as any).EchoWidget = { init: reinit, show, hide, destroy };
  init();
})();
