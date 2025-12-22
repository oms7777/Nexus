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
      "#0b63f3";

    const primaryText =
      (settings as any)?.theme?.primaryTextColor ||
      (settings as any)?.branding?.primaryTextColor ||
      "#ffffff";

    // ✅ variables globales widget
    root.style.setProperty("--widget-primary", primary);
    root.style.setProperty("--widget-primary-text", primaryText);
  }, [settings]);

  return null;
}
