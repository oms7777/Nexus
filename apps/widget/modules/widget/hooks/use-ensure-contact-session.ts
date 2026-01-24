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
  const ensure = useMutation(api.public.contactSessions.ensure);
  const validate = useMutation(api.public.contactSessions.validate);

  useEffect(() => {
    if (!organizationId) return;

    (async () => {
      const lsKey = "nx_contact_session";
      const visitorId = getOrCreateVisitorId();

      let sid: string | null = localStorage.getItem(lsKey);

      if (sid) {
        try {
          const res = await validate({ contactSessionId: sid as any });
          if (!res?.valid) sid = null;
        } catch {
          sid = null;
        }
      }

      if (!sid) {
        sid = (await ensure({
          organizationId,
          metadata: {
            visitorId,
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            currentUrl: window.location.href,
            referrer: document.referrer || undefined,
          },
        })) as unknown as string;

        localStorage.setItem(lsKey, sid);
      }

      setContactSessionId(sid as any);

      // ✅ IMPORTANT: postMessage UNIQUEMENT quand sid est dispo
      try {
        window.parent?.postMessage(
          { type: "nexus:session-ready", payload: { contactSessionId: sid } },
          "*"
        );
      } catch {}
    })();
  }, [organizationId, ensure, validate, setContactSessionId]);
}
