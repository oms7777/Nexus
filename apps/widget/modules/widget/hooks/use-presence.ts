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

async function postHeartbeat(payload: Record<string, unknown>) {
  const base = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!base) return;

  // ✅ Convex Cloud expose l’HTTP router sous /http/*
  const url = `${base.replace(/\/$/, "")}/http/live/heartbeat`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // ignorer les erreurs réseau sporadiques
  }
}

export function usePresence() {
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(
    contactSessionIdAtomFamily(organizationId || "")
  );

  useEffect(() => {
    if (!organizationId || !contactSessionId) return;

    const send = () => {
      postHeartbeat({
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
      });
    };

    // tick initial
    send();

    // interval
    const id = setInterval(send, HEARTBEAT_MS);

    // écoute navigation SPA
    const onNav = () => send();
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
