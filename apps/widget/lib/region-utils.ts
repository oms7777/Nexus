// apps/widget/lib/region-utils.ts
export type Region = "EMEA" | "NA" | "LATAM" | "APAC";

// Very light guess from the browser locale: "fr-FR" -> "FR"
export function countryFromNavigator(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const tag = navigator.language || "";
  const parts = tag.split("-"); // e.g. ["fr","FR"]
  return parts[1]?.toUpperCase();
}

export function regionFromCountry(cc?: string): Region {
  if (!cc) return "EMEA";
  const NA = new Set(["US", "CA", "MX"]);
  const LATAM = new Set([
    "BR","AR","CL","CO","PE","UY","PY","EC","BO","VE","CR","PA","DO","GT","HN","NI","SV","PR"
  ]);
  const APAC = new Set([
    "AU","NZ","JP","KR","CN","TW","HK","SG","MY","TH","VN","PH","ID","IN","PK","BD"
  ]);
  if (NA.has(cc)) return "NA";
  if (LATAM.has(cc)) return "LATAM";
  if (APAC.has(cc)) return "APAC";
  return "EMEA";
}

// Put your real Cal.com links here:
export const REGION_CAL: Record<Region, string> = {
  EMEA:  "https://cal.com/your-team-emea/intro",
  NA:    "https://cal.com/your-team-na/intro",
  LATAM: "https://cal.com/your-team-latam/intro",
  APAC:  "https://cal.com/your-team-apac/intro",
};
