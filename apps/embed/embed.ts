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

  // --- NUDGE state ---------------------------------------------
  let nudge: HTMLDivElement | null = null;
  let lastPromoPayload: any | null = null;

  function renderNudge(payload: {
    title?: string;
    body?: string;
    primary?: string;
    secondary?: string;
    primaryCta?: any;
    secondaryCta?: any;
  } | null) {
    if (!button) return;
    if (!payload) {
      if (nudge) {
        nudge.remove();
        nudge = null;
      }
      return;
    }
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "echo-widget-nudge";
      nudge.style.cssText = `
        position: fixed;
        ${position === "bottom-right" ? "right: 90px;" : "left: 90px;"}
        bottom: 40px;
        max-width: 280px;
        background: #fff;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.15);
        padding: 12px 12px 10px;
        z-index: 999999;
        display: none; opacity: 0; transform: translateY(6px);
        transition: all .25s ease;
        font: 14px/1.3 -apple-system, system-ui, Segoe UI, Roboto, sans-serif;
      `;
      const titleEl = document.createElement("div");
      titleEl.style.cssText = "font-weight:600;margin-bottom:6px";
      titleEl.className = "nudge-title";
      const bodyEl = document.createElement("div");
      bodyEl.style.cssText = "color:#475569;margin-bottom:10px";
      bodyEl.className = "nudge-body";

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

      const primary = document.createElement("button");
      primary.className = "nudge-primary";
      primary.style.cssText =
        "padding:6px 10px;border-radius:8px;background:#3b82f6;color:#fff;border:none;cursor:pointer";
      primary.onclick = () => {
        show();
        try {
          iframe?.contentWindow?.postMessage(
            { type: "nexus:run-primary-cta" },
            WIDGET_ORIGIN
          );
        } catch {}
      };

      const secondary = document.createElement("button");
      secondary.className = "nudge-secondary";
      secondary.style.cssText =
        "padding:6px 10px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;cursor:pointer";
      secondary.onclick = () => {
        show();
        try {
          iframe?.contentWindow?.postMessage(
            { type: "nexus:run-secondary-cta" },
            WIDGET_ORIGIN
          );
        } catch {}
      };

      actions.appendChild(secondary);
      actions.appendChild(primary);

      nudge.appendChild(titleEl);
      nudge.appendChild(bodyEl);
      nudge.appendChild(actions);
      document.body.appendChild(nudge);
    }

    (nudge!.querySelector(".nudge-title") as HTMLDivElement).textContent =
      payload.title || "How can we help?";
    (nudge!.querySelector(".nudge-body") as HTMLDivElement).textContent =
      payload.body || "Chat with our assistant or book a demo.";
    (nudge!.querySelector(".nudge-primary") as HTMLButtonElement).textContent =
      payload.primary || "Chat";
    (nudge!.querySelector(".nudge-secondary") as HTMLButtonElement).textContent =
      payload.secondary || "Book a demo";

    lastPromoPayload = payload;
  }

  function showNudge() {
    if (!nudge || !lastPromoPayload) return;
    nudge.style.display = "block";
    requestAnimationFrame(() => {
      nudge!.style.opacity = "1";
      nudge!.style.transform = "translateY(0)";
    });
  }
  function hideNudge() {
    if (!nudge) return;
    nudge.style.opacity = "0";
    nudge.style.transform = "translateY(6px)";
    setTimeout(() => nudge && (nudge.style.display = "none"), 200);
  }
  // --------------------------------------------------------------

  // ---- Config depuis <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" =
    EMBED_CONFIG.DEFAULT_POSITION;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    organizationId = currentScript.getAttribute("data-organization-id");
    position =
      (currentScript.getAttribute("data-position") as
        | "bottom-right"
        | "bottom-left") || EMBED_CONFIG.DEFAULT_POSITION;
  } else {
    const scripts = document.querySelectorAll('script[src*="embed"]');
    const embedScript = Array.from(scripts).find((s) =>
      s.hasAttribute("data-organization-id")
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

  const WEB_ORIGIN = EMBED_CONFIG.WEB_ORIGIN;
  const WIDGET_ORIGIN = new URL(EMBED_CONFIG.WIDGET_URL).origin;

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
      metadata ?? {
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
      {
        organizationId,
        sessionId: existing || undefined,
        metadata: meta,
      }
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
    if (engagedMs > 0) {
      log("time_on_site", { ms: engagedMs, url: location.href });
    }
  }

  async function onPageChange() {
    if (!sessionId) return;
    await ensureSession({
      currentUrl: location.href,
      title: document.title,
      referrer: document.referrer || "",
    });
    log("page_view", {
      url: location.href,
      title: document.title,
      referrer: document.referrer,
    });
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

  // Patch SPA nav
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
      sampling: {
        mousemove: 50,
        scroll: 100,
        input: "last",
      },
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
      const canvas = await html2canvas(document.body, {
        scale: 0.3,
        useCORS: true,
      });
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
    await log("page_view", {
      url: location.href,
      title: document.title,
      referrer: document.referrer,
    });

    await pusherConnect();
    startRrwebStreaming();
    setInterval(heartbeat, 15000);
    setInterval(takeSnapshot, 60000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("beforeunload", () => {
      try {
        const ms = Date.now() - lastBeat;
        if (ms > 0)
          navigator.sendBeacon?.("/", JSON.stringify({ type: "time_on_site", ms }));
      } catch {}
    });

    // ----- UI du widget
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
    `;

    iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.style.cssText = `width:100%;height:100%;border:none;`;
    iframe.addEventListener("load", () => sendParentLocation());

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", handleMessage);
    patchHistory();
    sendParentLocation();
  }

  function buildWidgetUrl(): string {
    const params = new URLSearchParams();
    params.append("organizationId", organizationId!);
    return `${EMBED_CONFIG.WIDGET_URL}?${params.toString()}`;
  }

  function handleMessage(event: MessageEvent) {
    if (event.origin !== WIDGET_ORIGIN) return;
    const { type, payload } = event.data || {};
    if (type === "close") hide();
    if (type === "resize" && payload?.height && container) {
      container.style.height = `${payload.height}px`;
    }
    // --- NUDGE: recevoir la promo depuis le widget
    if (type === "nexus:promo") {
      renderNudge(payload);
      if (!isOpen) showNudge();
    }
  }

  function toggleWidget() {
    isOpen ? hide() : show();
  }
  function show() {
    if (!container || !button) return;
    isOpen = true;
    container.style.display = "block";
    setTimeout(() => {
      if (!container) return;
      container.style.opacity = "1";
      container.style.transform = "translateY(0)";
    }, 10);
    button.innerHTML = closeIcon;
    sendParentLocation();
    log("widget_opened", { url: location.href });
    hideNudge(); // cacher le nudge quand on ouvre
  }
  function hide() {
    if (!container || !button) return;
    isOpen = false;
    container.style.opacity = "0";
    container.style.transform = "translateY(10px)";
    setTimeout(() => container && (container.style.display = "none"), 300);
    button.innerHTML = chatBubbleIcon;
    // ré-afficher le nudge après fermeture
    setTimeout(() => showNudge(), 500);
  }

  function destroy() {
    window.removeEventListener("message", handleMessage);
    unpatchHistory();
    if (container) container.remove();
    if (button) button.remove();
    if (nudge) nudge.remove();
    iframe = null;
    container = null;
    button = null;
    nudge = null;
    isOpen = false;
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
