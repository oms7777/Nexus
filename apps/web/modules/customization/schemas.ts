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

/**
 * Fix common typos before Zod: missing `#`, 7-digit hex (#fa964ab), 8-digit with alpha (#rrggbbaa).
 */
export function sanitizeHexColorString(raw: string): string {
  let t = raw.trim();
  if (!t) return t;
  if (/^#[0-9a-fA-F]{8}$/i.test(t)) {
    t = t.slice(0, 7);
  } else if (/^#[0-9a-fA-F]{7}$/i.test(t)) {
    t = t.slice(0, 7);
  }
  const n = normalizeHexTextInput(t);
  if (THEME_HEX_RE.test(n.trim())) {
    const x = n.trim();
    return x.length === 4 ? expandHex3To6(x) : x.toLowerCase();
  }
  return t;
}

function preprocessThemeColors(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const keys = [
    "primaryColor",
    "primaryTextColor",
    "secondaryColor",
    "secondaryTextColor",
    "nudgeBackgroundColor",
    "chatBubbleColor",
  ] as const;
  for (const k of keys) {
    if (typeof o[k] !== "string") continue;
    o[k] = sanitizeHexColorString(o[k] as string);
  }
  return o;
}

/** Maps `undefined` / whitespace-only to `""`. */
function coerceUrlOrEmpty(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string") return "";
  return v.trim();
}

/**
 * Empty string or http(s) URL only.
 * Avoids `z.union([z.literal(""), z.string().url()])`, which surfaces a confusing
 * "Invalid literal value, expected """" when the value is a non-empty invalid URL.
 */
const optionalUrlOrEmpty = z.preprocess(
  coerceUrlOrEmpty,
  z.string().refine(
    (s) => {
      if (s === "") return true;
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid https or http URL, or leave empty." },
  ),
);

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
    brandLogoUrl: optionalUrlOrEmpty,

    theme: z.preprocess(
      preprocessThemeColors,
      z
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
    ),

    embedLayout: z
      .enum(["compact", "full_width_bottom"])
      .optional()
      .default("compact"),

    /** Widget UI language (buttons, booking flow). AI still follows the visitor’s message language. */
    widgetUiLanguage: z.enum(["en", "fr"]).optional().default("en"),

    // -------------------------
    // WhatsApp handoff (wa.me — no Meta API)
    // -------------------------
    whatsappHandoffEnabled: z.boolean().optional().default(false),
    /** Digits only, with country code (e.g. 33612345678). Spaces/+ ok in UI; we normalize on save. */
    whatsappPhoneDigits: z.string().optional().default(""),
    /** Placeholders: {pageLabel}, {pageUrl}, {chatExcerpt}, {locale} */
    whatsappPrefillTemplate: z.string().optional().default(""),

    // -------------------------
    // Legacy privacy URL
    // -------------------------
    privacyUrl: optionalUrlOrEmpty,

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

        privacyUrl: optionalUrlOrEmpty,
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
  )
  .refine(
    (v) => {
      if (!v.whatsappHandoffEnabled) return true;
      const digits = String(v.whatsappPhoneDigits ?? "").replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    },
    {
      path: ["whatsappPhoneDigits"],
      message:
        "Enter a valid WhatsApp number with country code (8–15 digits), e.g. +33 6 12 34 56 78.",
    }
  );

export type WidgetSettingsForm = z.infer<typeof widgetSettingsSchema>;
