// apps/widget/modules/widget/hooks/use-presence.ts
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

// ---- NEW: fetch public IP once (2s timeout) ----
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
      const clientIp = await getPublicIp(); // <-- NEW
      const payload = {
        organizationId,
        contactSessionId,
        currentUrl:
          typeof window !== "undefined" ? window.location.href : undefined,
        referrer:
          typeof document !== "undefined" ? document.referrer : undefined,
        language:
          typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone: getTimezone(),
        viewportSize: getViewport(),
        screenResolution: getScreen(),
        clientIp: clientIp ?? undefined, // <-- NEW
      };
      postHeartbeat(payload);
    };

    send(); // initial
    const id = setInterval(send, HEARTBEAT_MS);

    const onNav = () => void send();
    window.addEventListener("popstate", onNav);
    const _pushState = history.pushState;
    history.pushState = function (...args) {
      // @ts-ignore
      _pushState.apply(this, args);
      onNav();
    };

    return () => {
      clearInterval(id);
      window.removeEventListener("popstate", onNav);
      history.pushState = _pushState;
    };
  }, [organizationId, contactSessionId]);
}
