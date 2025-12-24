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
 * Factory: permet de construire un agent avec le modèle choisi en settings.
 */
export function makeSupportAgent(opts?: { llmProvider?: LlmProvider | null; llmModel?: string | null }) {
  return new Agent(components.agent, {
    chat: getChatModel(opts?.llmProvider ?? "openai", opts?.llmModel ?? "gpt-4o-mini"),
    instructions: SUPPORT_AGENT_PROMPT,
  });
}

/**
 * Fallback: si tu importes encore supportAgent directement quelque part.
 * (Tu peux le garder, mais l'idéal est d'utiliser makeSupportAgent côté messages.create)
 */
export const supportAgent = makeSupportAgent({ llmProvider: "openai", llmModel: "gpt-4o-mini" });
