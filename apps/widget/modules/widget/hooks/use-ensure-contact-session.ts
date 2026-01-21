"use client";

import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { contactSessionIdAtomFamily } from "../atoms/widget-atoms";

/** ---------------- Helpers ---------------- */

function safeGetLocalStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function getOrCreateVisitorId() {
  const k = "nx_visitor_id";
  let id = safeGetLocalStorage(k);
  if (!id) {
    id = crypto.randomUUID();
    safeSetLocalStorage(k, id);
  }
  return id;
}

type ParentLocationPayload = {
  href?: string;
  title?: string;
  referrer?: string;
  ts?: number;
};

function looksLikeUrl(s?: string | null) {
  return !!s && (s.startsWith("http://") || s.startsWith("https://"));
}

/** ---------------- Hook ---------------- */

export function useEnsureContactSession(organizationId: string | null) {
  const setContactSessionId = useSetAtom(
    contactSessionIdAtomFamily(organizationId || ""),
  );

  const ensure = useMutation(api.public.contactSessions.ensure);
  const ensureByExternalId = useMutation(api.public.contactSessions.ensureByExternalId);
  const validate = useMutation(api.public.contactSessions.validate);

  // ✅ Source of truth pour l’URL: envoyée par l’embed
  const parentLocationRef = useRef<ParentLocationPayload | null>(null);

  // ✅ External session id: envoyée par l’embed
  const externalSessionIdRef = useRef<string | null>(null);

  // 1) écoute messages parent (URL + external session id)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data || {};
      const type = (data as any)?.type;
      const payload = (data as any)?.payload;

      if (type === "nexus:parent-location") {
        if (payload && typeof payload === "object") {
          const p = payload as ParentLocationPayload;
          if (looksLikeUrl(p.href)) parentLocationRef.current = p;
        }
      }

      if (type === "nexus:request-session") {
        const ext = payload?.externalSessionId;
        if (typeof ext === "string" && ext.trim().length > 0) {
          externalSessionIdRef.current = ext.trim();
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 2) ensure session
  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    const getBestUrl = () => {
      const p = parentLocationRef.current;
      if (looksLikeUrl(p?.href)) return p!.href!;
      // fallback (souvent ok) : referrer = page du site
      try {
        const ref = document.referrer;
        if (looksLikeUrl(ref)) return ref;
      } catch {}
      return undefined;
    };

    const getBestTitle = () => {
      const p = parentLocationRef.current;
      if (p?.title && p.title.trim().length) return p.title;
      return undefined;
    };

    const getBestReferrer = () => {
      const p = parentLocationRef.current;
      if (looksLikeUrl(p?.referrer)) return p!.referrer!;
      try {
        const ref = document.referrer;
        if (looksLikeUrl(ref)) return ref;
      } catch {}
      return undefined;
    };

    (async () => {
      const lsKey = `nx_contact_session_${organizationId}`;
      const visitorId = getOrCreateVisitorId();

      let sid: string | null = null;

      // A) reuse + validate
      sid = safeGetLocalStorage(lsKey);

      if (sid) {
        try {
          const res = await validate({ contactSessionId: sid as any });
          if (!res?.valid) sid = null;
        } catch {
          sid = null;
        }
      }

      // B) create
      if (!sid) {
        const ext = externalSessionIdRef.current;

        const metadata = {
          visitorId,
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewportSize: `${window.innerWidth}x${window.innerHeight}`,
          currentUrl: getBestUrl(),
          title: getBestTitle(),
          referrer: getBestReferrer(),
        };

        // ✅ priorité: externalSessionId (stable)
        if (ext) {
          sid = (await ensureByExternalId({
            organizationId,
            externalSessionId: ext,
            metadata,
          })) as unknown as string;
        } else {
          sid = (await ensure({ organizationId, metadata })) as unknown as string;
        }

        safeSetLocalStorage(lsKey, sid);
      }

      if (cancelled) return;

      setContactSessionId(sid as any);

      // ✅ notif parent quand sid est connu
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
  }, [organizationId, ensure, ensureByExternalId, validate, setContactSessionId]);
}
