// apps/widget/modules/widget/lib/theme.ts

export function hexToHslVars(hex: string): string | null {
  const clean = hex.replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;

  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);

  // ✅ shadcn attend: "H S% L%" sans "hsl()"
  return `${h} ${sPct}% ${lPct}%`;
}

// optionnel : calcule un foreground lisible (blanc/noir) sur un hex
export function bestForegroundHex(bgHex: string): "#000000" | "#ffffff" {
  const clean = bgHex.replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;

  if (full.length !== 6) return "#ffffff";

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  // luminance approx
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#000000" : "#ffffff";
}
