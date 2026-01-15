import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let pusherRef: Pusher | null = null;
let channelRef: Channel | null = null;
let snapshotSent = false;
let snapshotBuffer: eventWithTime[] = [];
let stopRecording: (() => void) | null = null;
let lastMeta: eventWithTime | null = null;

const MAX_EVENT_BYTES = 9_000; // Max event size limit
const BATCH_INTERVAL_MS = 500;  // Delay for flushing batch events
const MAX_BATCH_EVENTS = 50;  // Limit the number of events per batch

let batch: eventWithTime[] = [];
let batchTimer: any = null;

let snapshotDebounceTimer: any = null; // Déclaration correcte de snapshotDebounceTimer
let snapshotAbort: AbortController | null = null;

const PUSHER_KEY = "913d0c824be3b5eb38bc";
const PUSHER_CLUSTER = "eu";
const PUSHER_AUTH_URL = "https://app.inboundless.co/api/realtime/pusher-auth";
const SNAPSHOT_URL = "https://app.inboundless.co/api/tracker/snapshot";

function safeBytes(str: string) {
  return new TextEncoder().encode(str).length;
}

function scheduleFlush() {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    if (batch.length) {
      const payload = { events: batch.splice(0, batch.length) };
      const json = JSON.stringify(payload);
      if (safeBytes(json) <= MAX_EVENT_BYTES) {
        try {
          channelRef?.trigger("client-rrweb", payload);
        } catch (err) {
          console.error("[visitor-tracker] Failed to send batch:", err);
        }
      }
    }
  }, BATCH_INTERVAL_MS);
}



function persistSnapshotToDbDebounced(opts: { orgId: string, sessionId: string, events: eventWithTime[] }) {
  // debounce: keep only the latest snapshot in a short window
  if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);

  snapshotDebounceTimer = setTimeout(async () => {
    snapshotDebounceTimer = null;

    // cancel previous inflight
    try {
      snapshotAbort?.abort();
    } catch {}
    snapshotAbort = new AbortController();

    try {
      await fetch(SNAPSHOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: snapshotAbort.signal,
        body: JSON.stringify({
          organizationId: opts.orgId,
          sessionId: opts.sessionId,
          events: opts.events,
        }),
      });
    } catch {
      // best-effort only
    }
  }, 300);
}


export function initVisitorTracking({ orgId, sessionId }: { orgId: string, sessionId: string }) {
  if (started) return;
  if (typeof window === "undefined" || window.self !== window.top) return; // No tracking in iframe

  started = true;

  const pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
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
    const stop = record({
      checkoutEveryNms: 60_000, // Snapshot every minute to reduce load
      sampling: {
        mousemove: 150,
        mouseInteraction: true,
        scroll: 200,
        input: "last",
      },
      emit(event: eventWithTime) {
        if (document.hidden) return;  // Avoid heavy work when the tab is hidden

        if ((event as any).type === 4) lastMeta = event;  // Meta event
        const isFullSnapshot = (event as any)?.type === 2;
        if (!snapshotSent) snapshotBuffer.push(event);

        // If first snapshot, persist and send to Pusher
        if (isFullSnapshot && !snapshotSent) {
          snapshotSent = true;
          const snapshot = [...snapshotBuffer];
          snapshotBuffer = [];
          const hasMeta = snapshot.some((e: any) => e?.type === 4);
          const payloadEvents = !hasMeta && lastMeta ? [lastMeta, ...snapshot] : snapshot;

          persistSnapshotToDbDebounced({ orgId, sessionId, events: payloadEvents });
          channelRef?.trigger("client-snapshot", { events: payloadEvents });
          return; // Don't send as incremental
        }

        // If incremental event, batch them
        if (!snapshotSent) return;
        batch.push(event);

        if (batch.length >= MAX_BATCH_EVENTS) {
          scheduleFlush();
        }
      },
    });

    stopRecording = stop ? (() => stop()) : null;
  });

  channel.bind("pusher:subscription_error", () => {
    console.error("[visitor-tracker] Pusher subscription error");
    cleanup();
  });
}

function cleanup() {
  stopRecording?.();
  channelRef?.unbind_all();
  pusherRef?.disconnect();
  snapshotSent = false;
  snapshotBuffer = [];
  lastMeta = null;
  started = false;
}
