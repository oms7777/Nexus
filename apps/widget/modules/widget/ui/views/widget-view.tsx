"use client";

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { screenAtom, widgetSettingsAtom } from "../../atoms/widget-atoms";

import { WidgetAuthScreen } from "../screens/widget-auth-screen";
import { WidgetErrorScreen } from "../screens/widget-error-screen";
import { WidgetLoadingScreen } from "../screens/widget-loading-screen";
import { WidgetSelectionScreen } from "../screens/widget-selection-screen";
import { WidgetChatScreen } from "../screens/widget-chat-screen";
import { WidgetInboxScreen } from "../screens/widget-inbox-screen";
import { WidgetVoiceScreen } from "../screens/widget-voice-screen";
import { WidgetContactScreen } from "../screens/widget-contact-screen";

import { usePresence } from "../../hooks/use-presence";
import QualifyModal from "../components/QualifyModal";
import InlineBooker from "../components/InlineBooker";
import SmartPromo from "../components/SmartPromo";

/* ---------------- utils ---------------- */

function hexToHsl(hex?: string) {
  if (!hex) return null;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hDeg = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        hDeg = ((g - b) / d) % 6;
        break;
      case g:
        hDeg = (b - r) / d + 2;
        break;
      case b:
        hDeg = (r - g) / d + 4;
        break;
    }
    hDeg = Math.round(hDeg * 60);
    if (hDeg < 0) hDeg += 360;
  }

  return `${hDeg} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/* ---------------- component ---------------- */

interface Props {
  organizationId: string | null;
}

export const WidgetView = ({ organizationId }: Props) => {
  const screen = useAtomValue(screenAtom);
  const widgetSettings = useAtomValue(widgetSettingsAtom);

  usePresence();

  /* 🎨 APPLY THEME */
  useEffect(() => {
    const theme = (widgetSettings as any)?.theme;
    if (!theme) return;

    const root = document.getElementById("nexus-widget-root");
    if (!root) return;

    root.style.setProperty(
      "--primary",
      hexToHsl(theme.primaryColor) ?? "217 91% 60%"
    );
    root.style.setProperty(
      "--primary-foreground",
      hexToHsl(theme.primaryTextColor) ?? "0 0% 100%"
    );
    root.style.setProperty(
      "--secondary",
      hexToHsl(theme.secondaryColor) ?? "0 0% 100%"
    );
    root.style.setProperty(
      "--secondary-foreground",
      hexToHsl(theme.secondaryTextColor) ?? "222 84% 5%"
    );
  }, [widgetSettings]);

  const screens = {
    loading: <WidgetLoadingScreen organizationId={organizationId} />,
    error: <WidgetErrorScreen />,
    auth: <WidgetAuthScreen />,
    voice: <WidgetVoiceScreen />,
    inbox: <WidgetInboxScreen />,
    selection: <WidgetSelectionScreen />,
    chat: <WidgetChatScreen />,
    contact: <WidgetContactScreen />,
    booking: <WidgetChatScreen />,
  } as const;

  return (
    <main
      id="nexus-widget-root"
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-muted"
    >
      {screens[screen]}
      <SmartPromo />
      <QualifyModal />
      <InlineBooker />
    </main>
  );
};
