// usePresence.ts
"use client";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
  contactSessionIdAtom,
  organizationIdAtom,
} from "../atoms/widget-atoms";

const HEARTBEAT_MS = 60_000;
const URL_THROTTLE_MS = 800;

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
  const contactSessionId = useAtomValue(contactSessionIdAtom);

  // stocke l’URL la plus récente reçue depuis l’embed (SPA-safe)
  const parentUrlRef = useRef<string | undefined>(undefined);

  // throttle anti-spam en cas de routeur qui spam
  const lastUrlPushAtRef = useRef<number>(0);

  useEffect(() => {
    if (!organizationId || !contactSessionId) return;

    let cancelled = false;

    const buildPayload = async () => {
      const clientIp = await getPublicIp();

      return {
        organizationId,
        contactSessionId,

        // ✅ priorité au parentUrl
        currentUrl:
          parentUrlRef.current ??
          (typeof window !== "undefined" ? window.location.href : undefined),

        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        language: typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone: getTimezone(),
        viewportSize: getViewport(),
        screenResolution: getScreen(),
        clientIp: clientIp ?? undefined,
        title: typeof document !== "undefined" ? document.title : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        cookieEnabled:
          typeof navigator !== "undefined" ? navigator.cookieEnabled : undefined,
        timezoneOffset:
          typeof Date !== "undefined" ? new Date().getTimezoneOffset() : undefined,
      };
    };

    const send = async () => {
      try {
        const payload = await buildPayload();
        if (cancelled) return;
        postHeartbeat(payload);
      } catch {
        // noop
      }
    };

    // ✅ Listener message: met à jour l’URL immédiatement quand l’host change de page
    const onMessage = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || d.type !== "nexus:parent-location") return;

      // ✅ compat: ancien format { type, href } + nouveau { type, payload: { href } }
      const href =
        (typeof d?.payload?.href === "string" && d.payload.href) ||
        (typeof d?.href === "string" && d.href) ||
        undefined;

      if (!href) return;

      // évite d’écrire si ça n’a pas changé
      if (parentUrlRef.current === href) return;
      parentUrlRef.current = href;

      // throttle
      const now = Date.now();
      if (now - lastUrlPushAtRef.current < URL_THROTTLE_MS) return;
      lastUrlPushAtRef.current = now;

      // ✅ push immediate (sinon tu attends 60s)
      send();
    };

    window.addEventListener("message", onMessage);

    // tick initial + interval
    send();
    const id = setInterval(send, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("message", onMessage);
    };
  }, [organizationId, contactSessionId]);
}
