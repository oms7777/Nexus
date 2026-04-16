"use client";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { record } from "rrweb";
import type { eventWithTime } from "rrweb/typings/types";

import { organizationIdAtom, contactSessionIdAtom } from "../../atoms/widget-atoms";
import { getOrCreateExternalSessionId } from "../../../../lib/external-session";
import { getHostPageUrlSync } from "../../../../lib/host-page-url";

const MAX_SNAPSHOT_CHARS = 2_000_000;
const FLUSH_MS = 15_000;

function pickAppOrigin(): string {
  // Keep aligned with dashboard live hooks.
  return "https://app.inboundless.co";
}

export function WidgetSnapshotTracker() {
  const organizationId = useAtomValue(organizationIdAtom);
  const contactSessionId = useAtomValue(contactSessionIdAtom);

  const bufferRef = useRef<eventWithTime[]>([]);
  const lastMetaRef = useRef<eventWithTime | null>(null);
  const lastFullRef = useRef<eventWithTime | null>(null);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  /** rrweb runs inside the iframe; meta.href is often widget.inboundless.co — send real host URL for domain allowlist. */
  const visitorPageUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!organizationId) return;
    if (typeof window === "undefined") return;

    // Only start when embedded (visitor site) to avoid recording the widget host itself.
    const isEmbedded = window.parent && window.parent !== window;
    if (!isEmbedded) return;

    const externalSessionId = getOrCreateExternalSessionId();

    visitorPageUrlRef.current = getHostPageUrlSync() ?? undefined;
    const onParentLocation = (e: MessageEvent) => {
      const d = e?.data as { type?: string; href?: string; payload?: { href?: string } };
      if (!d || d.type !== "nexus:parent-location") return;
      const href =
        (typeof d.payload?.href === "string" && d.payload.href) ||
        (typeof d.href === "string" && d.href) ||
        undefined;
      if (href) visitorPageUrlRef.current = href;
    };
    window.addEventListener("message", onParentLocation);

    const flush = async () => {
      if (inFlightRef.current) return;
      const events = bufferRef.current;
      if (!events.length) return;

      let snapshotStr: string;
      try {
        snapshotStr = JSON.stringify(events);
      } catch {
        return;
      }

      if (snapshotStr.length > MAX_SNAPSHOT_CHARS) {
        // Keep only essentials to recover.
        const keep: eventWithTime[] = [];
        if (lastMetaRef.current) keep.push(lastMetaRef.current);
        if (lastFullRef.current) keep.push(lastFullRef.current);
        bufferRef.current = keep;
        return;
      }

      inFlightRef.current = true;
      try {
        const visitorPageUrl =
          visitorPageUrlRef.current ?? getHostPageUrlSync() ?? undefined;
        await fetch(`${pickAppOrigin()}/api/tracker/snapshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId,
            // Use stable external id so sessions don't fragment across refreshes.
            sessionId: externalSessionId,
            // Back-compat: some consumers still treat this as a signal that widget is ready.
            contactSessionId: contactSessionId ?? undefined,
            visitorPageUrl,
            events,
          }),
          keepalive: true,
        }).catch(() => null);

        // After a successful attempt, keep only meta+full snapshot and start a new window.
        const keep: eventWithTime[] = [];
        if (lastMetaRef.current) keep.push(lastMetaRef.current);
        if (lastFullRef.current) keep.push(lastFullRef.current);
        bufferRef.current = keep;
      } finally {
        inFlightRef.current = false;
      }
    };

    const stop = record({
      emit: (e: eventWithTime) => {
        const evt = e as eventWithTime;
        const t = (evt as any)?.type;
        if (t === 4) lastMetaRef.current = evt;
        if (t === 2) {
          lastFullRef.current = evt;
          // Reset window on new full snapshot (keep last meta too).
          const keep: eventWithTime[] = [];
          if (lastMetaRef.current) keep.push(lastMetaRef.current);
          keep.push(evt);
          bufferRef.current = keep;
          return;
        }

        bufferRef.current.push(evt);
      },
      sampling: {
        mousemove: 40,
        scroll: 150,
        input: "last",
      },
      recordCanvas: false,
      recordCrossOriginIframes: false,
    } as any);

    // Kick a periodic flush.
    timerRef.current = window.setInterval(() => void flush(), FLUSH_MS);

    // Flush once shortly after mount to store the initial full snapshot quickly.
    window.setTimeout(() => void flush(), 2_000);

    return () => {
      window.removeEventListener("message", onParentLocation);
      try {
        stop?.();
      } catch {}
      try {
        if (timerRef.current) window.clearInterval(timerRef.current);
      } catch {}
      timerRef.current = null;
      bufferRef.current = [];
      lastMetaRef.current = null;
      lastFullRef.current = null;
      inFlightRef.current = false;
    };
  }, [organizationId, contactSessionId]);

  return null;
}

