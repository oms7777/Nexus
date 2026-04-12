// system/ai/agents/supportAgent.ts
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { SUPPORT_AGENT_PROMPT } from "../constants";

export type LlmProvider = "openai" | "google" | "anthropic";

function getChatModel(provider?: LlmProvider | null, model?: string | null) {
  const p: LlmProvider = provider ?? "openai";
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
