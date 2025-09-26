"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import {
  contactSessionIdAtomFamily,
  organizationIdAtom,
} from "../atoms/widget-atoms";

const HEARTBEAT_MS = 15000;

function getTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
function getViewport(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.innerWidth}x${window.innerHeight}`;
}
function getScreen(): string | undefined {
  if (typeof window === "undefined" || !window.screen) return undefined;
  return `${window.screen.width}x${window.screen.height}`;
}

// --- Reçoit l’URL de la page parente depuis l’embed ---
let parentUrlFromHost: string | undefined;
if (typeof window !== "undefined") {
  window.addEventListener("message", (e: MessageEvent) => {
    const d = e?.data;
    if (d && d.type === "nexus:parent-location" && typeof d.href === "string") {
      parentUrlFromHost = d.href;
    }
  });
}

// ---- fetch public IP une seule fois (2s timeout) ----
let cachedIp: string | null = null;
async function getPublicIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    cachedIp = data.ip ?? null;
    return cachedIp;
  } catch {
    return null;
  }
}

async function postHeartbeat(payload: Record<string, unknown>) {
  const base = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!base) return;
  const url = `${base.replace(/\/$/, "")}/http/live/heartbeat`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    mode: "cors",
  }).catch(() => {});
}

export function usePresence() {
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );

  useEffect(() => {
    if (!organizationId || !contactSessionId) return;

    const send = async () => {
      const clientIp = await getPublicIp();
      const payload = {
        organizationId,
        contactSessionId,
        // utilise l’URL envoyée par le site hôte (SPA) sinon fallback
        currentUrl:
          parentUrlFromHost ??
          (typeof window !== "undefined" ? window.location.href : undefined),
        referrer:
          typeof document !== "undefined" ? document.referrer : undefined,
        language:
          typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone: getTimezone(),
        viewportSize: getViewport(),
        screenResolution: getScreen(),
        clientIp: clientIp ?? undefined,
        title: typeof document !== "undefined" ? document.title : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        cookieEnabled: typeof navigator !== "undefined" ? navigator.cookieEnabled : undefined,
        timezoneOffset: typeof Date !== "undefined" ? new Date().getTimezoneOffset() : undefined,
      };
      postHeartbeat(payload);
    };

    // tick initial + interval
    send();
    const id = setInterval(send, HEARTBEAT_MS);

    // Notifie aussi sur navigation interne de l’iframe elle-même
    const onNav = () => void send();
    window.addEventListener("popstate", onNav);
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;
    history.pushState = function (...args) {
      // @ts-ignore
      _pushState.apply(this, args);
      onNav();
    };
    history.replaceState = function (...args) {
      // @ts-ignore
      _replaceState.apply(this, args);
      onNav();
    };

    return () => {
      clearInterval(id);
      window.removeEventListener("popstate", onNav);
      history.pushState = _pushState;
      history.replaceState = _replaceState;
    };
  }, [organizationId, contactSessionId]);
}
