// apps/widget/src/hooks/useEnsureContactSession.ts
"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { contactSessionIdAtom } from "../atoms/widget-atoms";

import { getOrCreateExternalSessionId, getOrCreateVisitorId } from "../../../lib/external-session";
import { getHostPageUrlSync } from "../../../lib/host-page-url";

export function useEnsureContactSession(organizationId: string | null) {
  const setContactSessionId = useSetAtom(contactSessionIdAtom);

  // Convex
  const ensureByExternalId = useMutation(api.public.contactSessions.ensureByExternalId);
  const validate = useMutation(api.public.contactSessions.validate);

  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    (async () => {
      const visitorId = getOrCreateVisitorId();
      const externalSessionId = getOrCreateExternalSessionId();

      // We still cache the Convex session id for faster boot, but the stable key is externalSessionId.
      const lsKey = "nx_contact_session";
      let sid: string | null = null;
      try {
        sid = localStorage.getItem(lsKey);
      } catch {
        sid = null;
      }

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
        sid = (await ensureByExternalId({
          organizationId,
          externalSessionId,
          metadata: {
            visitorId,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            language: typeof navigator !== "undefined" ? navigator.language : undefined,
            viewportSize:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : undefined,
            currentUrl: getHostPageUrlSync(),
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
          {
            type: "nexus:session-ready",
            payload: { contactSessionId: sid, externalSessionId },
          },
          "*",
        );
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, ensureByExternalId, validate, setContactSessionId]);
}