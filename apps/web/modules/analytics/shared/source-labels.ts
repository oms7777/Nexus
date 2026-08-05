/**
 * Human-readable labels for raw keys produced by Convex `normalizeSource`:
 * referrer hostnames (e.g. linkedin.com), utm_source strings, synthetic buckets (google_ads).
 */

function baseNormalize(s: string): string {
  const v = String(s ?? "").trim();
  if (!v) return "Unattributed";
  const lower = v.toLowerCase();
  if (lower === "unknown") return "Unattributed";
  if (lower === "other") return "Other";
  return v;
}

/** Maps raw aggregation key → short label for Overview / tables. */
export function displaySourceLabel(raw: unknown): string {
  const v = baseNormalize(String(raw ?? ""));
  const lower = v.toLowerCase();

  // No UTM and no external referrer (typed URL, bookmark, or same-site nav).
  if (lower === "direct") return "Direct";

  // Synthetic ad click-id buckets (see packages/backend convex public analytics)
  const synthetic: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    microsoft_ads: "Microsoft Ads",
    linkedin_ads: "LinkedIn Ads",
  };
  if (synthetic[lower]) return synthetic[lower]!;

  // Typical utm_source values from marketing teams (single token)
  const utmTokens: Record<string, string> = {
    google: "Google",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    fb: "Facebook",
    instagram: "Instagram",
    ig: "Instagram",
    twitter: "X (Twitter)",
    x: "X (Twitter)",
    tiktok: "TikTok",
    newsletter: "Newsletter",
    email: "Email",
    mail: "Email",
    referral: "Referral",
    organic: "Organic search",
    cpc: "Paid search",
    paid: "Paid",
    social: "Social",
    youtube: "YouTube",
    podcast: "Podcast",
    webinar: "Webinar",
    chatgpt: "ChatGPT",
    bing: "Bing",
    duckduckgo: "DuckDuckGo",
    yahoo: "Yahoo",
    partner: "Partner",
    affiliate: "Affiliate",
    slack: "Slack",
    discord: "Discord",
    github: "GitHub",
    producthunt: "Product Hunt",
    lnkd: "LinkedIn",
  };
  if (utmTokens[lower]) return utmTokens[lower]!;

  // Referrer hostname (usually no scheme)
  if (/(^|\.)google\./i.test(lower)) return "Google";
  if (lower === "t.co" || lower.includes("twitter.com") || lower.includes("x.com")) return "X (Twitter)";
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (
    lower.includes("facebook.com") ||
    lower.includes("l.facebook.com") ||
    lower.includes("m.facebook.com") ||
    lower.includes("lm.facebook.com")
  )
    return "Facebook";
  if (lower.includes("instagram.com")) return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  if (lower.includes("bing.com")) return "Bing";
  if (lower.includes("reddit.com")) return "Reddit";
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("pinterest.com")) return "Pinterest";
  if (lower.includes("snapchat.com")) return "Snapchat";
  if (lower.includes("medium.com")) return "Medium";
  if (lower.includes("stackoverflow.com")) return "Stack Overflow";
  if (lower.includes("duckduckgo.com")) return "DuckDuckGo";

  return v;
}
