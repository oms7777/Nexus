// apps/widget/src/hooks/usePresence.ts
"use client";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { contactSessionIdAtom, organizationIdAtom } from "../atoms/widget-atoms";
import { getHostPageUrlSync } from "../../../lib/host-page-url";
import { rememberFirstTouchReferrer, getPersistedFirstTouchReferrer } from "../../../lib/first-touch-referrer";

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

// ---- fetch public IP une seule fois (plusieurs sources : ipify est souvent bloqué par réseaux / extensions) ----
let cachedIp: string | null = null;

async function getPublicIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;

  const tryJsonIp = async (url: string) => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) return null;
      const data = (await res.json()) as { ip?: string };
      return typeof data.ip === "string" && data.ip.trim() ? data.ip.trim() : null;
    } catch {
      window.clearTimeout(t);
      return null;
    }
  };

  const tryPlain = async (url: string) => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) return null;
      const text = (await res.text()).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text) || text.includes(":")) return text;
      return null;
    } catch {
      window.clearTimeout(t);
      return null;
    }
  };

  const candidates = [
    () => tryJsonIp("https://api.ipify.org?format=json"),
    () => tryJsonIp("https://api64.ipify.org?format=json"),
    () => tryPlain("https://icanhazip.com/"),
    () => tryPlain("https://ifconfig.me/ip"),
  ];

  for (const run of candidates) {
    try {
      const ip = await run();
      if (ip) {
        cachedIp = ip;
        return cachedIp;
      }
    } catch {
      // next
    }
  }

  return null;
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

  // URL la plus récente reçue depuis l’embed (SPA-safe)
  const parentUrlRef = useRef<string | undefined>(undefined);
  const parentReferrerRef = useRef<string | undefined>(undefined);

  // throttle anti-spam (must not start at 0 — that blocked the first parent-location heartbeat)
  const lastUrlPushAtRef = useRef<number>(-URL_THROTTLE_MS);

  useEffect(() => {
    if (!organizationId || !contactSessionId) return;

    let cancelled = false;

    const buildPayload = async () => {
      const clientIp = await getPublicIp();

      return {
        organizationId,
        contactSessionId,

        // ✅ priorité au parentUrl (postMessage embed), puis referrer/parent sync — jamais l’URL du widget seule
        currentUrl:
          parentUrlRef.current ??
          getHostPageUrlSync() ??
          undefined,

        referrer:
          parentReferrerRef.current ||
          getPersistedFirstTouchReferrer() ||
          (typeof document !== "undefined" ? document.referrer : undefined),
        firstTouchReferrer: getPersistedFirstTouchReferrer(),
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

    // ✅ reçoit l’URL + referrer du parent (host)
    const onMessage = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || d.type !== "nexus:parent-location") return;

      // compat: { type, href } ou { type, payload: { href } }
      const href =
        (typeof d?.payload?.href === "string" && d.payload.href) ||
        (typeof d?.href === "string" && d.href) ||
        undefined;

      const hostReferrer =
        (typeof d?.payload?.referrer === "string" && d.payload.referrer) ||
        (typeof d?.referrer === "string" && d.referrer) ||
        undefined;

      if (hostReferrer) {
        parentReferrerRef.current = hostReferrer;
        rememberFirstTouchReferrer(hostReferrer);
      }

      if (!href) {
        if (hostReferrer) send();
        return;
      }

      if (parentUrlRef.current === href && !hostReferrer) return;

      const hadParentBefore = parentUrlRef.current !== undefined;
      parentUrlRef.current = href;

      const now = Date.now();
      if (
        hadParentBefore &&
        now - lastUrlPushAtRef.current < URL_THROTTLE_MS
      ) {
        return;
      }
      lastUrlPushAtRef.current = now;

      // ✅ push immédiat
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