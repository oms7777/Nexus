/**
 * Curated chat models for the visitor assistant (labels + API ids).
 * Defaults stay aligned with `supportAgent.getChatModel` in the backend.
 */

export type LlmProviderId = "openai" | "google" | "anthropic";

export type LlmModelOption = {
  id: string;
  label: string;
  hint: string;
  /** Shown as a small badge; one per provider typically */
  recommended?: boolean;
};

/** Fallback when no model is stored — must match backend defaults */
export const DEFAULT_LLM_MODEL: Record<LlmProviderId, string> = {
  openai: "gpt-4o-mini",
  google: "gemini-1.5-pro",
  anthropic: "claude-3-5-haiku-20241022",
};

export const LLM_MODELS_BY_PROVIDER: Record<LlmProviderId, LlmModelOption[]> = {
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      hint: "Recommended — fast responses and lower cost",
      recommended: true,
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      hint: "Stronger reasoning and multimodal understanding",
    },
    {
      id: "gpt-4-turbo",
      label: "GPT-4 Turbo",
      hint: "High capability (older generation naming)",
    },
  ],
  google: [
    {
      id: "gemini-1.5-pro",
      label: "Gemini 1.5 Pro",
      hint: "Recommended — balanced quality for most chats",
      recommended: true,
    },
    {
      id: "gemini-1.5-flash",
      label: "Gemini 1.5 Flash",
      hint: "Faster and cheaper; great for high volume",
    },
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      hint: "Latest fast model (availability depends on your Google account)",
    },
  ],
  anthropic: [
    {
      id: "claude-3-5-haiku-20241022",
      label: "Claude 3.5 Haiku",
      hint: "Recommended — quick replies, efficient cost",
      recommended: true,
    },
    {
      id: "claude-3-5-sonnet-20241022",
      label: "Claude 3.5 Sonnet",
      hint: "Richer answers and nuance when you need more depth",
    },
    {
      id: "claude-3-7-sonnet-20250219",
      label: "Claude 3.7 Sonnet",
      hint: "Newer Sonnet generation (check availability on your Anthropic account)",
    },
  ],
};

/** Options for the UI; if `storedId` is not in the catalog, append a synthetic “custom” row */
export function getLlmModelOptions(
  provider: LlmProviderId,
  storedId?: string | null
): LlmModelOption[] {
  const base = LLM_MODELS_BY_PROVIDER[provider];
  const trimmed = (storedId ?? "").trim();
  if (trimmed && !base.some((m) => m.id === trimmed)) {
    return [
      ...base,
      {
        id: trimmed,
        label: "Custom model",
        hint: trimmed,
      },
    ];
  }
  return base;
}

export function getLlmModelLabel(provider: LlmProviderId, modelId: string): string {
  const opt = getLlmModelOptions(provider, modelId).find((m) => m.id === modelId);
  return opt?.label ?? modelId;
}
