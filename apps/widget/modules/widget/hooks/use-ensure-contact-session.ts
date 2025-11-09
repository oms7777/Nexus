"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { contactSessionIdAtomFamily } from "../atoms/widget-atoms";

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
  const setContactSessionId = useSetAtom(
    contactSessionIdAtomFamily(organizationId || "")
  );
  const ensure = useMutation(api.public.contactSessions.ensure);
  const validate = useMutation(api.public.contactSessions.validate);

  useEffect(() => {
    if (!organizationId) return;

    (async () => {
      const lsKey = `nx_contact_session_${organizationId}`;
      const visitorId = getOrCreateVisitorId();

      // 1) tenter l’ID local
      let sid = localStorage.getItem(lsKey);

      // 2) si on a un id local, vérifier
      if (sid) {
        try {
          const res = await validate({ contactSessionId: sid as any });
          if (!res?.valid) sid = null;
        } catch {
          sid = null;
        }
      }

      // 3) ensure si pas d’ID valide
      if (!sid) {
        sid = await ensure({
          organizationId,
          metadata: {
            visitorId,
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            currentUrl: window.location.href,
            referrer: document.referrer || undefined,
          },
        }) as unknown as string;
        localStorage.setItem(lsKey, sid);
      }

      // 4) pousser dans l’atom
      setContactSessionId(sid as any);
    })();
  }, [organizationId, ensure, validate, setContactSessionId]);
}
