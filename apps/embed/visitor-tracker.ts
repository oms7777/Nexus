// apps/widget/modules/widget/live/visitor-tracker.ts
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import Pusher, { type Channel } from "pusher-js";

let started = false;
let channelRef: Channel | null = null;

type VisitorTrackingOptions = {
  orgId: string;
  sessionId: string;
};

/**
 * Démarre le tracking rrweb + curseur dans la PAGE HOST (pas dans l’iframe).
 * - Utilise Pusher client events (client-rrweb, client-cursor, client-ping)
 * - Ignore si on est dans une iframe (widget)
 */
export function initVisitorTracking(opts: VisitorTrackingOptions) {
  if (started) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // ❌ Ne pas tracker depuis l’iframe du widget
  if (window.self !== window.top) {
    console.log("[tracker] running in iframe → skip (host page will handle tracking)");
    return;
  }

  started = true;

  const { orgId, sessionId } = opts;

  if ((Pusher as any).logToConsole && typeof window !== "undefined") {
    // laisser tel quel si tu veux voir les logs Pusher dans la console
  }

  console.log("[tracker] initVisitorTracking (host page)", { orgId, sessionId });

  const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY!;
  const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER!;
  const authEndpoint =
    process.env.NEXT_PUBLIC_PUSHER_AUTH_URL ||
    "https://app.inboundless.co/api/realtime/pusher-auth";

  const pusher = new Pusher(pusherKey, {
    cluster: pusherCluster,
    authEndpoint,
    channelAuthorization: {
      endpoint: authEndpoint,
      transport: "ajax",
    },
    forceTLS: true,
  });

  const channelName = `presence-org_${orgId}_session_${sessionId}`;
  const channel = pusher.subscribe(channelName);
  channelRef = channel;

  // pour debug depuis la console de la page
  (window as any).__inboundlessVisitorChannel = channel;

  channel.bind("pusher:subscription_succeeded", () => {
    console.log("[tracker] subscribed to", channelName);

    // petit ping de test
    channel.trigger("client-ping", {
      from: "visitor",
      at: Date.now(),
    });

    // rrweb: live record
    record({
      emit(event: eventWithTime) {
        try {
          const payload = { events: [event] };

          // 🛑 Sécurité Pusher: limite 10KB → on évite d'envoyer les énormes snapshots
          const size = JSON.stringify(payload).length;
          if (size > 9000) {
            // On skip surtout les gros snapshots initiaux
            console.warn("[tracker] skipping big rrweb event", {
              size,
              type: event.type,
            });
            return;
          }

          channel.trigger("client-rrweb", payload);
        } catch (err) {
          console.error("[tracker] failed to send rrweb event", err);
        }
      },
    });

    // Curseur relatif à la fenêtre
    document.addEventListener("mousemove", (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      channel.trigger("client-cursor", { x, y });
    });
  });
}
