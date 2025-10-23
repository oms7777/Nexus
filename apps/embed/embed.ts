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

  // ---- Config depuis <script>
  let organizationId: string | null = null;
  let position: "bottom-right" | "bottom-left" = EMBED_CONFIG.DEFAULT_POSITION;
// --- en haut du fichier (après les let existants)
  let nudge: HTMLDivElement | null = null;
  let nudgeTimer: number | null = null;
  let lastPromoPayload: any | null = null;

  // Crée la carte nudge
  function renderNudge(payload: {
    title: string; body: string;
    primary: string; secondary?: string;
    primaryCta?: any; secondaryCta?: any;
  }) {
    // si déjà présent, on le rafraîchit
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "nexus-nudge";
      nudge.style.cssText = `
        position: fixed;
        ${position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
        bottom: 90px;
        width: 320px;
        border-radius: 12px;
        background: #fff;
        border: 1px solid rgba(0,0,0,.08);
        box-shadow: 0 8px 30px rgba(0,0,0,.12);
        z-index: 999998;
        opacity: 0; transform: translateY(6px);
        transition: all .2s ease;
        display: none;
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
      `;
      document.body.appendChild(nudge);
    }

    nudge.innerHTML = `
      <div style="position:relative;padding:12px">
        <button id="nudge-close" aria-label="Close" style="position:absolute;right:8px;top:8px;border:none;background:transparent;cursor:pointer;opacity:.6">×</button>

        <button id="nudge-logo" aria-label="Open chat"
          style="position:absolute;left:-14px;top:-14px;width:36px;height:36px;border-radius:9999px;border:1px solid rgba(0,0,0,.08);background:#fff;display:grid;place-items:center;box-shadow:0 4px 12px rgba(0,0,0,.12);cursor:pointer">
          <img src="${new URL(EMBED_CONFIG.WIDGET_URL).origin}/logo.svg" alt="logo" style="width:22px;height:22px" />
        </button>

        <div style="font-weight:600;margin-bottom:4px">${payload.title}</div>
        <div style="color:#6b7280;font-size:13px">${payload.body}</div>

        <div style="display:flex;gap:8px;margin-top:10px">
          <button id="nudge-primary" style="flex:1;border:none;border-radius:8px;padding:8px 10px;background:#111827;color:#fff;cursor:pointer">${payload.primary}</button>
          ${payload.secondary ? `<button id="nudge-secondary" style="flex:1;border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:8px 10px;background:#fff;cursor:pointer">${payload.secondary}</button>` : ""}
        </div>
      </div>
    `;

    // handlers
    nudge.querySelector<HTMLButtonElement>("#nudge-close")!.onclick = () => hideNudge();
    nudge.querySelector<HTMLButtonElement>("#nudge-logo")!.onclick = () => { show(); hideNudge(); };
    nudge.querySelector<HTMLButtonElement>("#nudge-primary")!.onclick = () => {
      iframe?.contentWindow?.postMessage({ type: "nexus:run-primary-cta" }, WIDGET_ORIGIN);
      show(); // ouvre le widget
      hideNudge();
    };
    const sec = nudge.querySelector<HTMLButtonElement>("#nudge-secondary");
    if (sec) {
      sec.onclick = () => {
        iframe?.contentWindow?.postMessage({ type: "nexus:run-secondary-cta" }, WIDGET_ORIGIN);
        show();
        hideNudge();
      };
    }
  }

  function showNudgeLater(payload: any, delayMs = 3000) {
    lastPromoPayload = payload;
    if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
    nudgeTimer = window.setTimeout(() => {
      renderNudge(payload);
      if (!nudge) return;
      nudge.style.display = "block";
      requestAnimationFrame(() => {
        if (!nudge) return;
        nudge.style.opacity = "1";
        nudge.style.transform = "translateY(0)";
      });
      // Optionnel: demander au widget de masquer sa carte interne
      iframe?.contentWindow?.postMessage({ type: "nexus:hide-internal-promo" }, WIDGET_ORIGIN);
    }, delayMs);
  }

  function hideNudge() {
    if (!nudge) return;
    nudge.style.opacity = "0";
    nudge.style.transform = "translateY(6px)";
    setTimeout(() => nudge && (nudge.style.display = "none"), 180);
  }

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

    // Prolonge la session (réutilise ensure avec sessionId)
    await ensureSession();

    // temps “engagé”
    if (engagedMs > 0) {
      log("time_on_site", { ms: engagedMs, url: location.href });
    }
  }

  async function onPageChange() {
    if (!sessionId) return;
    // MAJ “currentUrl” côté session (via ensure + metadata ciblée)
    await ensureSession({
      currentUrl: location.href,
      title: document.title,
      referrer: document.referrer || "",
    });

    // event analytics
    log("page_view", {
      url: location.href,
      title: document.title,
      referrer: document.referrer,
    });

    sendParentLocation();
    // snapshot opportuniste sur navigation
    takeSnapshot().catch(() => {});
  }

  /** Envoie l’URL courante de la page hôte à l’iframe (widget) */
  function sendParentLocation() {
    try {
      iframe?.contentWindow?.postMessage(
        { type: "nexus:parent-location", href: window.location.href },
        WIDGET_ORIGIN
      );
    } catch {}
  }

  // Patch SPA nav pour notifier l’iframe ET logger page_view + snapshot
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
      // authorizer custom pour envoyer JSON
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
          // flush ~2.5x/sec
          const payload = { events: buffer.splice(0) };
          try {
            // events client-* requis par Pusher
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

    // Curseur léger
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
    // tracking boot
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

    // realtime + rrweb + snapshots
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
    // NUDGE: recevoir la promo depuis l'iframe
    if (type === "nexus:promo" && payload) {
      showNudgeLater(payload, 3000); // 3 à 5s selon ton besoin
    }
  }


  function toggleWidget() {
    isOpen ? hide() : show();
  }
  function show() {
    if (!container || !button) return;
    isOpen = true;
    hideNudge();
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
  }

  function destroy() {
    window.removeEventListener("message", handleMessage);
    unpatchHistory();
    if (container) container.remove();
    if (button) button.remove();
    iframe = null;
    container = null;
    button = null;
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
