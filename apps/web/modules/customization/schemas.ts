import z from "zod";

/** #RGB or #RRGGBB only — blocks pasted HTML/scripts in color fields. */
const THEME_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Empty / undefined allowed; any non-empty string must be valid hex. */
export const themeHexColorSchema = z.union([
  z.undefined(),
  z
    .string()
    .refine((s) => s.trim() === "" || THEME_HEX_RE.test(s.trim()), {
      message:
        "Use a hex color (#RGB or #RRGGBB), e.g. #E31E24. Don’t paste widget code or URLs in color fields.",
    }),
]);

/**
 * `type="color"` requires #RRGGBB; expand 3-digit hex. Invalid input → fallback (never pass garbage to the browser).
 */
export function coerceHexForNativeColorInput(raw: string | undefined, fallback: string): string {
  const fb = THEME_HEX_RE.test((fallback || "").trim()) ? fallback.trim() : "#a855f7";
  if (raw == null || raw.trim() === "") return fb;
  let t = raw.trim();
  if (!t.startsWith("#") && /^[0-9a-fA-F]{3}$/i.test(t)) t = `#${t}`;
  if (!t.startsWith("#") && /^[0-9a-fA-F]{6}$/i.test(t)) t = `#${t}`;
  if (!THEME_HEX_RE.test(t)) return fb;
  if (t.length === 4) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return t.toLowerCase();
}

/** If user typed `E31E24` without `#`, add it before validation. */
export function normalizeHexTextInput(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (THEME_HEX_RE.test(t)) return t.length === 4 ? expandHex3To6(t) : t.toLowerCase();
  const withHash = t.startsWith("#") ? t : `#${t}`;
  if (THEME_HEX_RE.test(withHash))
    return withHash.length === 4 ? expandHex3To6(withHash) : withHash.toLowerCase();
  return raw;
}

function expandHex3To6(h: string): string {
  const x = h.startsWith("#") ? h.slice(1) : h;
  if (x.length !== 3) return h;
  return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
}

function isHttpsOrHttpUrl(s: string | undefined): boolean {
  if (!s || !s.trim()) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Widget Settings (Branding, Chat, Consent)
 * ----------------------------------------
 * - plus de vapiSettings ici → géré séparément dans Voice Assistant page
 * - toutes les URLs acceptent "" pour simplifier le form
 * - consent et theme sont totalement optionnels
 */
export const widgetSettingsSchema = z
  .object({
    // -------------------------
    // Chat Greeting
    // -------------------------
    greetMessage: z.string().min(1, "Greeting message is required"),

    // -------------------------
    // Default suggestions
    // -------------------------
    defaultSuggestions: z.object({
      suggestion1: z.string().optional(),
      suggestion2: z.string().optional(),
      suggestion3: z.string().optional(),
    }),

    /** 0 = never, 2-5 = after X AI replies. Shows "Talk to someone" / "Continue to chat". */
    escalationSuggestionAfterMessages: z.number().min(0).max(10).optional(),

    // -------------------------
    // Branding
    // -------------------------
    brandLogoUrl: z.union([
      z.literal(""),
      z.string().url("Enter a valid https URL for the logo, or leave empty."),
    ]),

    theme: z
      .object({
        primaryColor: themeHexColorSchema,
        primaryTextColor: themeHexColorSchema,
        secondaryColor: themeHexColorSchema,
        secondaryTextColor: themeHexColorSchema,
        nudgeBackgroundColor: themeHexColorSchema,
        chatBubbleColor: themeHexColorSchema,
      })
      .partial()
      .optional(),

    embedLayout: z
      .enum(["compact", "full_width_bottom"])
      .optional()
      .default("compact"),

    // -------------------------
    // Legacy privacy URL
    // -------------------------
    privacyUrl: z.union([
      z.literal(""),
      z.string().url("Enter a valid https URL or leave empty."),
    ]),

    // -------------------------
    // Consent & Privacy block
    // -------------------------
    consent: z
      .object({
        enabled: z.boolean().default(true),

        title: z.string().optional(),
        intro: z.string().optional(),
        body: z.string().optional(),

        acceptLabel: z.string().optional(),
        declineLabel: z.string().optional(), // backend accepts it even if unused in UI
        version: z.string().optional(),

        linkMode: z.enum(["link", "modal"]).default("link"),

        privacyUrl: z.union([
          z.literal(""),
          z.string().url("Enter a valid https URL or leave empty."),
        ]),
        modalContent: z.string().optional(),
      })
      .optional(),
  })

  // -------------------------
  // Validation: External link requires a URL (only when consent card is on)
  // -------------------------
  .refine(
    (v) => {
      if (!v.consent || !v.consent.enabled || v.consent.linkMode !== "link") return true;
      const consentU = v.consent.privacyUrl?.trim() ?? "";
      const legacyU = typeof v.privacyUrl === "string" ? v.privacyUrl.trim() : "";
      return isHttpsOrHttpUrl(consentU) || isHttpsOrHttpUrl(legacyU);
    },
    {
      path: ["consent", "privacyUrl"],
      message:
        "Open Consent & Privacy → Privacy URL: enter https://… or switch “here” opens to Inline text modal.",
    }
  )

  // -------------------------
  // Validation: Modal mode requires modal text (only when consent card is on)
  // -------------------------
  .refine(
    (v) =>
      !v.consent ||
      !v.consent.enabled ||
      v.consent.linkMode !== "modal" ||
      !!v.consent.modalContent?.trim(),
    {
      path: ["consent", "modalContent"],
      message:
        "Open Consent & Privacy → add modal text, or switch “here” opens to External page with a policy URL.",
    }
  );

export type WidgetSettingsForm = z.infer<typeof widgetSettingsSchema>;
