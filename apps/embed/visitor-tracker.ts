import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let stopRecording: (() => void) | null = null;

// ✅ keep last known Meta event so snapshots have href/width/height
let lastMeta: eventWithTime | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string; // Convex Id<"contactSessions"> cast to string
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

// ✅ DB snapshot endpoint (Next route)
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

// Pusher limit ~10KB
const MAX_EVENT_BYTES = 9_000;

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function cleanup() {
  try {
    stopRecording?.();
  } catch {}
  stopRecording = null;

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  snapshotSent = false;
  snapshotBuffer = [];
  lastMeta = null;
  started = false;

  // Ajout du nettoyage des données de transport Pusher
  try {
    localStorage.removeItem("pusherTransportTLS");
    localStorage.removeItem("pusherTransportNonTLS");
  } catch (err) {
    console.error("Failed to remove Pusher transport data", err);
  }
}

export function destroyVisitorTracking() {
  cleanup();
}

async function persistSnapshotToDb(opts: {
  orgId: string;
  sessionId: string;
  events: eventWithTime[];
}) {
  try {
    await fetch(SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ✅ include org + session + rrweb events
      body: JSON.stringify({
        organizationId: opts.orgId,
        sessionId: opts.sessionId,
        events: opts.events,
      }),
    });
  } catch (err) {
    // best-effort, never break tracking
    console.warn("[tracker] persistSnapshotToDb failed", err);
  }
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

  // never track inside widget iframe
  if (window.self !== window.top) return;

  started = true;

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    const stop: listenerHandler | undefined = record({
      // ✅ periodic checkout => ensures new FullSnapshots even in SPA
      checkoutEveryNms: 15_000,

      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },

      emit(event: eventWithTime) {
        if (!channelRef) return;

        // ✅ track Meta (type 4) to enrich snapshots
        if ((event as any)?.type === 4) {
          lastMeta = event;
        }

        const isFullSnapshot = (event as any)?.type === 2;

        // buffer at beginning to create the first full snapshot packet
        if (!snapshotSent) snapshotBuffer.push(event);

        // 1) first FullSnapshot => send full buffered snapshot to DB + (optional) Pusher
        if (isFullSnapshot && !snapshotSent) {
          snapshotSent = true;

          // include lastMeta if buffer doesn't contain it
          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          const hasMeta = snap.some((e: any) => e?.type === 4);
          const payloadEvents =
            !hasMeta && lastMeta ? [lastMeta, ...snap] : snap;

          // ✅ persist to DB (this is what makes LiveVisitorView change page)
          void persistSnapshotToDb({ orgId, sessionId, events: payloadEvents });

          // optional: also notify dashboard live reset
          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return; // do not send this FullSnapshot as incremental
        }

        // 2) checkout FullSnapshot later => persist to DB + reset dashboard
        if (isFullSnapshot && snapshotSent) {
          // rrweb sometimes sends Meta separately; ensure we include it
          const payloadEvents = lastMeta ? [lastMeta, event] : [event];

          void persistSnapshotToDb({ orgId, sessionId, events: payloadEvents });

          try {
            channelRef.trigger("client-snapshot", { events: payloadEvents });
          } catch {}

          return;
        }

        // 3) incremental live events via Pusher (best effort)
        if (!snapshotSent) return;

        const payload = { events: [event] };
        const json = JSON.stringify(payload);

        if (safeBytes(json) > MAX_EVENT_BYTES) {
          // important for debugging
          // (if you see this often, prefer streaming rrweb via HTTP log instead of Pusher)
          console.warn("[tracker] rrweb event too large skipped", {
            bytes: safeBytes(json),
            type: (event as any)?.type,
          });
          return;
        }

        try {
          channelRef.trigger("client-rrweb", payload);
        } catch {}
      },
    });

    stopRecording = stop ? (() => stop()) : null;

    // cursor live
    const onMove = (e: MouseEvent) => {
      if (!channelRef || !snapshotSent) return;
      try {
        channelRef.trigger("client-cursor", {
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        });
      } catch {}
    };

    document.addEventListener("mousemove", onMove, { passive: true });
  });

  channel.bind("pusher:subscription_error", () => cleanup());
}
