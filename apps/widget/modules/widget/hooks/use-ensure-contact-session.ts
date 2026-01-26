// apps/widget/src/hooks/useEnsureContactSession.ts
"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { contactSessionIdAtom } from "../atoms/widget-atoms";

function getOrCreateVisitorId() {
  const k = "nx_visitor_id";
  let id = localStorage.getItem(k);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }

  return id;
}

export function useEnsureContactSession(organizationId: string | null) {
  const setContactSessionId = useSetAtom(contactSessionIdAtom);

  // Convex
  const ensure = useMutation(api.public.contactSessions.ensure);
  const validate = useMutation(api.public.contactSessions.validate);

  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    (async () => {
      const lsKey = "nx_contact_session";
      const visitorId = getOrCreateVisitorId();

      let sid: string | null = localStorage.getItem(lsKey);

      // 1) si sid en cache -> validate
      if (sid) {
        try {
          const res = await validate({ contactSessionId: sid as any });
          if (!res?.valid) sid = null;
        } catch {
          sid = null;
        }
      }

      // 2) sinon -> create
      if (!sid) {
        sid = (await ensure({
          organizationId,
          metadata: {
            visitorId,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            language: typeof navigator !== "undefined" ? navigator.language : undefined,
            viewportSize:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : undefined,
            currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
            referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
          },
        })) as unknown as string;

        try {
          localStorage.setItem(lsKey, sid);
        } catch {}
      }

      if (cancelled) return;

      // 3) store in atoms
      setContactSessionId(sid as any);

      // 4) notify parent ONLY when ready
      try {
        window.parent?.postMessage(
          { type: "nexus:session-ready", payload: { contactSessionId: sid } },
          "*",
        );
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, ensure, validate, setContactSessionId]);
}