// apps/embed/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;

let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let stopRecording: (() => void) | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";

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
  started = false;
}

export function destroyVisitorTracking() {
  cleanup();
}

export function initVisitorTracking({ orgId, sessionId }: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined") return;

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
    // ✅ important: force “checkout” réguliers => nouveaux FullSnapshots
    const stop: listenerHandler | undefined = record({
      checkoutEveryNms: 15_000, // <-- force un snapshot périodique
      // tu peux aussi utiliser checkoutEveryNth: 200,

      sampling: {
        mousemove: 120,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },

      emit(event: eventWithTime) {
        if (!channelRef) return;

        const isFullSnapshot = event.type === 2;

        // buffer au début pour faire un snapshot complet
        if (!snapshotSent) snapshotBuffer.push(event);

        // 1) premier fullsnapshot => envoyer un snapshot live (pour init/reinit)
        if (isFullSnapshot && !snapshotSent) {
          snapshotSent = true;

          const snap = [...snapshotBuffer];
          snapshotBuffer = [];

          try {
            channelRef.trigger("client-snapshot", { events: snap });
          } catch {}
          return; // pas de live incremental pour ce full snapshot
        }

        // 2) si un checkout snapshot arrive plus tard => reset live aussi
        if (isFullSnapshot && snapshotSent) {
          // on construit un mini buffer “autour” du full snapshot si besoin
          // ici on envoie juste le full snapshot seul, souvent suffisant avec checkout
          try {
            channelRef.trigger("client-snapshot", { events: [event] });
          } catch {}
          return;
        }

        // 3) live incremental
        if (!snapshotSent) return;

        const payload = { events: [event] };
        const json = JSON.stringify(payload);
        if (safeBytes(json) > MAX_EVENT_BYTES) return;

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
