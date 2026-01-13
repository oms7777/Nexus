// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher from "pusher-js";
import type { Channel } from "pusher-js";

/* ============================================================
   GLOBAL STATE
============================================================ */

let started = false;

let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;
let stopRecording: listenerHandler | undefined;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];

/* ============================================================
   CONFIG
============================================================ */

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

/* ============================================================
   UTILS
============================================================ */

function cleanup() {
  try {
    stopRecording?.();
  } catch {}

  try {
    channelRef?.unbind_all();
  } catch {}
  channelRef = null;

  try {
    pusherRef?.disconnect();
  } catch {}
  pusherRef = null;

  snapshotBuffer = [];
  snapshotSent = false;
  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

/* ============================================================
   INIT
============================================================ */

export function initVisitorTracking({
  orgId,
  sessionId,
}: {
  orgId: string;
  sessionId: string; // CONVEX Id<"contactSessions">
}) {
  if (started) return;
  if (typeof window === "undefined") return;
  if (window.self !== window.top) return;
  if (!orgId || !sessionId) return;

  started = true;

  /* ---------- PUSHER ---------- */

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
    disabledTransports: ["xhr_streaming", "xhr_polling", "sockjs"],
    channelAuthorization: {
      endpoint: PUSHER_AUTH_URL,
      transport: "ajax",
    },
  });

  pusherRef = pusher;

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName) as Channel;
  channelRef = channel;

  /* ---------- CURSOR (SIMPLE ET FIABLE) ---------- */

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!channelRef) return;
      channelRef.trigger("client-cursor", {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    },
    { passive: true },
  );

  /* ---------- RRWEB ---------- */

  channel.bind("pusher:subscription_succeeded", () => {
    stopRecording = record({
      sampling: {
        mousemove: 150,
        scroll: 200,
        input: "last",
        mouseInteraction: true,
      },

      emit(event: eventWithTime) {
        const isFullSnapshot = event.type === 2;

        // BUFFER EVENTS UNTIL FIRST FULL SNAPSHOT
        if (!snapshotSent) {
          snapshotBuffer.push(event);
        }

        // FIRST FULL SNAPSHOT → SEND TO BACKEND
        if (isFullSnapshot && !snapshotSent) {
          snapshotSent = true;

          fetch(SNAPSHOT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: orgId,
              sessionId,
              events: snapshotBuffer,
            }),
          }).catch(() => {});

          snapshotBuffer = [];
        }
      },
    });
  });

  channel.bind("pusher:subscription_error", cleanup);
  pusher.connection.bind("disconnected", cleanup);
}
