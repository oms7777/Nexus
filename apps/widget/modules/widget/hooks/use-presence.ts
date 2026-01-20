"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAtomValue } from "jotai";
import { contactSessionIdAtomFamily, organizationIdAtom } from "../atoms/widget-atoms";

const HEARTBEAT_MS = 60_000;
const URL_PUSH_THROTTLE_MS = 800;

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
  const contactSessionId = useAtomValue(contactSessionIdAtomFamily(organizationId || ""));

  const parentUrlRef = useRef<string | undefined>(undefined);
  const lastPushAtRef = useRef<number>(0);

  const send = useCallback(async () => {
    if (!organizationId || !contactSessionId) return;

    const clientIp = await getPublicIp();

    const currentUrl =
      parentUrlRef.current ??
      (typeof window !== "undefined" ? window.location.href : undefined);

    const payload = {
      organizationId,
      contactSessionId,

      currentUrl,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
      language: typeof navigator !== "undefined" ? navigator.language : undefined,
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
  }, [organizationId, contactSessionId]);

  useEffect(() => {
    if (!organizationId || !contactSessionId) return;

    // 1) LISTEN PARENT LOCATION (SPA)
    const onMessage = (e: MessageEvent) => {
      const d = e?.data;
      if (!d || d.type !== "nexus:parent-location" || typeof d.href !== "string") return;

      parentUrlRef.current = d.href;

      // push instantly (throttled)
      const now = Date.now();
      if (now - lastPushAtRef.current < URL_PUSH_THROTTLE_MS) return;
      lastPushAtRef.current = now;

      send();
    };

    window.addEventListener("message", onMessage);

    // 2) initial tick + interval
    send();
    const id = setInterval(send, HEARTBEAT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(id);
    };
  }, [organizationId, contactSessionId, send]);
}
