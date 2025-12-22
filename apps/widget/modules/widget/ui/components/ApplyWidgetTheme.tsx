// apps/widget/modules/widget/ui/components/ApplyWidgetTheme.tsx
"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { widgetSettingsAtom } from "../../atoms/widget-atoms";
import { bestForegroundHex, hexToHslVars } from "../../lib/theme";

export function ApplyWidgetTheme() {
  const settings = useAtomValue(widgetSettingsAtom);
  const theme = (settings as any)?.theme;

  useEffect(() => {
    if (!theme) return;

    const root = document.documentElement;

    const primaryHex = theme.primaryColor || "#0ea5e9";
    const primaryTextHex =
      theme.primaryTextColor ||
      bestForegroundHex(primaryHex);

    const secondaryHex = theme.secondaryColor || "#ffffff";
    const secondaryTextHex =
      theme.secondaryTextColor ||
      bestForegroundHex(secondaryHex);

    const primaryHsl = hexToHslVars(primaryHex);
    const primaryFgHsl = hexToHslVars(primaryTextHex);
    const secondaryHsl = hexToHslVars(secondaryHex);
    const secondaryFgHsl = hexToHslVars(secondaryTextHex);

    // ✅ Variables shadcn principales
    if (primaryHsl) root.style.setProperty("--primary", primaryHsl);
    if (primaryFgHsl) root.style.setProperty("--primary-foreground", primaryFgHsl);

    if (secondaryHsl) root.style.setProperty("--secondary", secondaryHsl);
    if (secondaryFgHsl) root.style.setProperty("--secondary-foreground", secondaryFgHsl);

    // ✅ Ring / accent : on peut les aligner sur primary pour cohérence
    if (primaryHsl) root.style.setProperty("--ring", primaryHsl);
    if (secondaryHsl) root.style.setProperty("--accent", secondaryHsl);

    // (Optionnel) Si ton UI utilise aussi --border/--input tu peux les laisser par défaut
  }, [theme]);

  return null;
}
