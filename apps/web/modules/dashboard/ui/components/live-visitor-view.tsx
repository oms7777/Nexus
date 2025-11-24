"use client";
import { useRef, useEffect, useState } from "react";
import { useVisitorStream } from "@/modules/live/hooks/useVisitorStream";

export function LiveVisitorView({ orgId, sessionId }: { orgId: string; sessionId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);

  // After first render, ref is attached → we store it in state
  useEffect(() => {
    if (containerRef.current) {
      setContainerEl(containerRef.current);
    }
  }, []);

  const { cursor } = useVisitorStream({
    orgId,
    sessionId,
    container: containerEl,
  });

  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ height: 360 }}>
      <div ref={containerRef} className="absolute inset-0 bg-black/5" />
      {cursor && (
        <div
          className="absolute size-4 rounded-full bg-emerald-500/80 ring-2 ring-white/70"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
    </div>
  );
}
