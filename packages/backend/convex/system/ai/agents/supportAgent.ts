// system/ai/agents/supportAgent.ts
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { SUPPORT_AGENT_PROMPT } from "../constants";

export type LlmProvider = "openai" | "google";

function getChatModel(provider?: LlmProvider | null, model?: string | null) {
  const p: LlmProvider = provider ?? "openai";
  const m = (model ?? "").trim() || (p === "google" ? "gemini-1.5-pro" : "gpt-4o-mini");
  return p === "google" ? google.chat(m) : openai.chat(m);
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
    chat: getChatModel(opts?.llmProvider ?? "openai", opts?.llmModel ?? "gpt-4o-mini"),
    instructions: (opts?.instructions ?? SUPPORT_AGENT_PROMPT) || SUPPORT_AGENT_PROMPT,
  });
}

// Backward compat
export const supportAgent = makeSupportAgent({ llmProvider: "openai", llmModel: "gpt-4o-mini" });
