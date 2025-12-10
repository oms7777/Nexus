import z from "zod";

export const widgetSettingsSchema = z
  .object({
    greetMessage: z.string().min(1, "Greeting message is required"),
    defaultSuggestions: z.object({
      suggestion1: z.string().optional(),
      suggestion2: z.string().optional(),
      suggestion3: z.string().optional(),
    }),
    vapiSettings: z.object({
      assistantId: z.string().optional(),
      phoneNumber: z.string().optional(),
    }),

    // UI THEME
    theme: z
      .object({
        primaryColor: z.string().optional(),
        primaryTextColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        nudgeBackgroundColor: z.string().optional(),
        chatBubbleColor: z.string().optional(),
      })
      .optional(),

    // Logo
    brandLogoUrl: z.string().url().optional().or(z.literal("")),

    // kept for backward compat
    privacyUrl: z.string().url().optional().or(z.literal("")),

    consent: z
      .object({
        enabled: z.boolean().default(true),
        title: z.string().optional(),
        intro: z.string().optional(),
        body: z.string().optional(),
        acceptLabel: z.string().optional(),
        version: z.string().optional(),
        linkMode: z.enum(["link", "modal"]).default("link"),
        privacyUrl: z.string().url().optional().or(z.literal("")),
        modalContent: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (v) =>
      !v.consent ||
      v.consent.linkMode !== "link" ||
      (v.consent.privacyUrl && v.consent.privacyUrl.length > 0),
    {
      path: ["consent", "privacyUrl"],
      message: "Please provide a valid URL when 'External page' is selected.",
    }
  )
  .refine(
    (v) =>
      !v.consent ||
      v.consent.linkMode !== "modal" ||
      !!v.consent.modalContent?.trim(),
    {
      path: ["consent", "modalContent"],
      message: "Please provide the text to show in the modal.",
    }
  );

// ---- Promos ----
export const promoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean().default(true),
  rules: z.object({
    pathPrefix: z.string().optional(),
    urlIncludes: z.array(z.string()).optional(),
    utmSource: z.array(z.string()).optional(),
  }),
  card: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    badgeText: z.string().optional(),
  }),
  primaryCta: z
    .object({
      kind: z.enum(["open_chat", "open_booking", "open_url"]),
      label: z.string().min(1),
      url: z.string().url().optional(),
    })
    .optional(),
  secondaryCta: z
    .object({
      kind: z.enum(["open_chat", "open_booking", "open_url"]),
      label: z.string().min(1),
      url: z.string().url().optional(),
    })
    .optional(),
  ctaList: z
    .array(
      z.object({
        kind: z.enum(["open_chat", "open_booking", "open_url"]),
        label: z.string().min(1),
        url: z.string().url().optional(),
      }),
    )
    .optional(),
});

export type PromoForm = z.infer<typeof promoSchema>;

