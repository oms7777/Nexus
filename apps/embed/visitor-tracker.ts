// apps/embed/visitor-tracker.ts

import Pusher from "pusher-js";

export function initVisitorTracking({ orgId, sessionId }: any) {
  if (window.self !== window.top) return;

  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: "/api/realtime/pusher-auth",
  });

  const channel = pusher.subscribe(`presence-org_${orgId}_session_${sessionId}`);

  // LIVE URL
  setInterval(() => {
    channel.trigger("client-visitor", {
      type: "page",
      url: window.location.href,
      title: document.title,
    });
  }, 1500);

  // LIVE CURSOR
  document.addEventListener("mousemove", (e) => {
    channel.trigger("client-visitor", {
      type: "cursor",
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
  });
}
