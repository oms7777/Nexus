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

// ✅ try read parent url (if embed already sent it)
function getBestUrl() {
  try {
    // inside iframe => document.referrer is often the host page URL
    const ref = document.referrer;
    if (ref && ref.startsWith("http")) return ref;
  } catch {}
  try {
    return window.location.href;
  } catch {
    return undefined;
  }
}

export function useEnsureContactSession(organizationId: string | null) {
  const setContactSessionId = useSetAtom(contactSessionIdAtomFamily(organizationId || ""));
  const ensure = useMutation(api.public.contactSessions.ensure);
  const validate = useMutation(api.public.contactSessions.validate);

  useEffect(() => {
    if (!organizationId) return;

    (async () => {
      const lsKey = `nx_contact_session_${organizationId}`;
      const visitorId = getOrCreateVisitorId();

      let sid: string | null = null;

      // 1) reuse + validate
      try {
        sid = localStorage.getItem(lsKey);
      } catch {
        sid = null;
      }

      if (sid) {
        try {
          const res = await validate({ contactSessionId: sid as any });
          if (!res?.valid) sid = null;
        } catch {
          sid = null;
        }
      }

      // 2) ensure new
      if (!sid) {
        sid = (await ensure({
          organizationId,
          metadata: {
            visitorId,
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            currentUrl: getBestUrl(),
            referrer: document.referrer || undefined,
          },
        })) as unknown as string;

        try {
          localStorage.setItem(lsKey, sid);
        } catch {}
      }

      setContactSessionId(sid as any);

      // ✅ IMPORTANT: notify parent ONLY when sid is known
      try {
        window.parent?.postMessage(
          { type: "nexus:session-ready", payload: { contactSessionId: sid } },
          "*",
        );
      } catch {}
    })();
  }, [organizationId, ensure, validate, setContactSessionId]);
}
