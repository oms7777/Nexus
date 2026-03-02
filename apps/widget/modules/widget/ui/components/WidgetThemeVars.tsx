// apps/widget/modules/widget/ui/components/WidgetThemeVars.tsx
"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { widgetSettingsAtom } from "../../atoms/widget-atoms";

export function WidgetThemeVars() {
  const settings = useAtomValue(widgetSettingsAtom);

  useEffect(() => {
    const root = document.documentElement;

    const primary =
      (settings as any)?.theme?.primaryColor ||
      (settings as any)?.branding?.primaryColor ||
      "#a855f7";

    const primaryText =
      (settings as any)?.theme?.primaryTextColor ||
      (settings as any)?.branding?.primaryTextColor ||
      "#ffffff";

    const chatBubble =
      (settings as any)?.theme?.chatBubbleColor ||
      (settings as any)?.branding?.chatBubbleColor ||
      primary;

    // Variables utilisées par le flow booking (QualifyCard, Calendar, etc.)
    root.style.setProperty("--widget-primary", primary);
    root.style.setProperty("--widget-primary-text", primaryText);
    root.style.setProperty("--widget-chat-bubble", chatBubble);
  }, [settings]);

  return null;
}
