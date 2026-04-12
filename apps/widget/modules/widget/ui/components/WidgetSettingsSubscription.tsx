"use client";

/**
 * Keeps `widgetSettingsAtom` in sync with Convex after the initial load screen.
 * Without this, settings changed in the dashboard (e.g. WhatsApp prefill template)
 * only applied after a full widget refresh — the chat screen read a stale snapshot.
 */
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { widgetSettingsAtom } from "../../atoms/widget-atoms";

export function WidgetSettingsSubscription({
  organizationId,
}: {
  organizationId: string | null;
}) {
  const setWidgetSettings = useSetAtom(widgetSettingsAtom);
  const live = useQuery(
    api.public.widgetSettings.getByOrganizationId,
    organizationId ? { organizationId } : "skip"
  );

  useEffect(() => {
    if (live === undefined) return;
    setWidgetSettings(live);
  }, [live, setWidgetSettings]);

  return null;
}
