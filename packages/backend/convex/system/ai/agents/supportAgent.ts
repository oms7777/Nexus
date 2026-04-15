// system/ai/agents/supportAgent.ts
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { SUPPORT_AGENT_PROMPT } from "../constants";

export type LlmProvider = "openai" | "google" | "anthropic";

function hasProviderKey(p: LlmProvider): boolean {
  // These env var names match ai-sdk defaults.
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "google") return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return false;
}

function getChatModel(provider?: LlmProvider | null, model?: string | null) {
  // Fail-safe: if a provider is selected but not configured, fall back to OpenAI.
  const requested: LlmProvider = provider ?? "openai";
  const p: LlmProvider = hasProviderKey(requested) ? requested : "openai";
  const explicit = (model ?? "").trim();
  const m =
    explicit ||
    (p === "google"
      ? "gemini-1.5-pro"
      : p === "anthropic"
        ? "claude-3-5-haiku-20241022"
        : "gpt-4o-mini");
  if (p === "google") return google.chat(m);
  if (p === "anthropic") return anthropic.chat(m);
  return openai.chat(m);
}

/**
 * Factory: build an agent with chosen model + optional custom instructions.
 */
export function makeSupportAgent(opts?: {
  llmProvider?: LlmProvider | null;
  llmModel?: string | null;
  instructions?: string | null;
}) {
  return new Agent(components.agent, {
    chat: getChatModel(opts?.llmProvider ?? "openai", opts?.llmModel ?? null),
    instructions: (opts?.instructions ?? SUPPORT_AGENT_PROMPT) || SUPPORT_AGENT_PROMPT,
  });
}

// Backward compat
export const supportAgent = makeSupportAgent({ llmProvider: "openai", llmModel: "gpt-4o-mini" });
