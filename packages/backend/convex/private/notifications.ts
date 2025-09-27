import { action } from "../_generated/server";

export const slack = action({
  args: { text: "string" as any }, // (v.string() si tu préfères mutation -> action pour fetch)
  handler: async (ctx, { text }) => {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ text }),
    });
  },
});
