import z from "zod";

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

    // -------------------------
    // Branding
    // -------------------------
    brandLogoUrl: z.string().url().optional().or(z.literal("")),

    theme: z
      .object({
        primaryColor: z.string().optional(),
        primaryTextColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        secondaryTextColor: z.string().optional(),
        nudgeBackgroundColor: z.string().optional(),
        chatBubbleColor: z.string().optional(),
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
    privacyUrl: z.string().url().optional().or(z.literal("")),

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

        privacyUrl: z.string().url().optional().or(z.literal("")),
        modalContent: z.string().optional(),
      })
      .optional(),
  })

  // -------------------------
  // Validation: External link requires a URL
  // -------------------------
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

  // -------------------------
  // Validation: Modal mode requires modal text
  // -------------------------
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

export type WidgetSettingsForm = z.infer<typeof widgetSettingsSchema>;
