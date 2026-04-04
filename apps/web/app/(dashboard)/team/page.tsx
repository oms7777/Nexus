"use client";

import { useEffect, useMemo, useState } from "react";
import { Protect, OrganizationProfile, useOrganization } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";
import { Input } from "@workspace/ui/components/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card";
import { toast } from "sonner";
import { MultiSelect } from "@/modules/team/ui/multi-select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";

import { useEntitlements } from "@/modules/entitlements/hooks/use-entitlements";

type Membership = {
  id: string;
  userId: string;
  email: string;
  name: string;
};

type RoutingMode = "auto_assign" | "visitor_choice";

type TerritoryOption = {
  label: string;
  value: string; // territories.key
};

type PresetId =
  | "custom"
  | "whole_world"
  | "france"
  | "morocco"
  | "mena"
  | "europe"
  | "north_america"
  | "apac";

/** ISO 3166-1 alpha-2 codes pour "Whole world" (tous les pays) */
const WHOLE_WORLD_COUNTRY_CODES =
  "AF,AX,AL,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BH,BD,BB,BY,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,CV,KH,CM,CA,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CU,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,SZ,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IM,IL,IT,JM,JP,JE,JO,KZ,KE,KI,KP,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MD,MC,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,NC,NZ,NI,NE,NG,NU,NF,MK,MP,NO,OM,PK,PW,PS,PA,PG,PY,PE,PH,PN,PL,PT,PR,QA,RE,RO,RU,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,UM,US,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW";

const PRESET_TERRITORIES: {
  id: PresetId;
  label: string;
  key: string;
  hint?: string;
}[] = [
  { id: "custom", label: "Custom territory", key: "" },
  { id: "whole_world", label: "Whole world", key: "whole_world", hint: "All countries" },
  { id: "france", label: "France", key: "france", hint: "FR" },
  { id: "morocco", label: "Morocco", key: "morocco", hint: "MA" },
  {
    id: "mena",
    label: "MENA",
    key: "mena",
    hint: "DZ, BH, EG, JO, KW, LB, MA, OM, QA, SA, AE, TN…",
  },
  { id: "europe", label: "Europe", key: "europe", hint: "Most EU / EEA countries" },
  { id: "north_america", label: "North America", key: "north_america", hint: "US, CA, MX…" },
  { id: "apac", label: "APAC", key: "apac", hint: "Asia-Pacific countries" },
];

type CountryPreset = { code: string; label: string };

/** Liste étendue de pays pour le dropdown (tous les pays courants) */
const COUNTRY_PRESETS: CountryPreset[] = [
  { code: "AF", label: "Afghanistan" },
  { code: "ZA", label: "South Africa" },
  { code: "AL", label: "Albania" },
  { code: "DZ", label: "Algeria" },
  { code: "DE", label: "Germany" },
  { code: "AD", label: "Andorra" },
  { code: "AO", label: "Angola" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "AR", label: "Argentina" },
  { code: "AM", label: "Armenia" },
  { code: "AU", label: "Australia" },
  { code: "AT", label: "Austria" },
  { code: "AZ", label: "Azerbaijan" },
  { code: "BH", label: "Bahrain" },
  { code: "BD", label: "Bangladesh" },
  { code: "BE", label: "Belgium" },
  { code: "BZ", label: "Belize" },
  { code: "BJ", label: "Benin" },
  { code: "BT", label: "Bhutan" },
  { code: "BY", label: "Belarus" },
  { code: "MM", label: "Myanmar" },
  { code: "BO", label: "Bolivia" },
  { code: "BA", label: "Bosnia and Herzegovina" },
  { code: "BW", label: "Botswana" },
  { code: "BR", label: "Brazil" },
  { code: "BN", label: "Brunei" },
  { code: "BG", label: "Bulgaria" },
  { code: "BF", label: "Burkina Faso" },
  { code: "BI", label: "Burundi" },
  { code: "KH", label: "Cambodia" },
  { code: "CM", label: "Cameroon" },
  { code: "CA", label: "Canada" },
  { code: "CV", label: "Cape Verde" },
  { code: "CL", label: "Chile" },
  { code: "CN", label: "China" },
  { code: "CY", label: "Cyprus" },
  { code: "CO", label: "Colombia" },
  { code: "KM", label: "Comoros" },
  { code: "CG", label: "Congo" },
  { code: "KR", label: "South Korea" },
  { code: "KP", label: "North Korea" },
  { code: "CI", label: "Ivory Coast" },
  { code: "CR", label: "Costa Rica" },
  { code: "HR", label: "Croatia" },
  { code: "CU", label: "Cuba" },
  { code: "DK", label: "Denmark" },
  { code: "DJ", label: "Djibouti" },
  { code: "DM", label: "Dominica" },
  { code: "EG", label: "Egypt" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "EC", label: "Ecuador" },
  { code: "ER", label: "Eritrea" },
  { code: "ES", label: "Spain" },
  { code: "EE", label: "Estonia" },
  { code: "US", label: "United States" },
  { code: "ET", label: "Ethiopia" },
  { code: "FJ", label: "Fiji" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "GA", label: "Gabon" },
  { code: "GM", label: "Gambia" },
  { code: "GE", label: "Georgia" },
  { code: "GH", label: "Ghana" },
  { code: "GR", label: "Greece" },
  { code: "GD", label: "Grenada" },
  { code: "GT", label: "Guatemala" },
  { code: "GN", label: "Guinea" },
  { code: "GQ", label: "Equatorial Guinea" },
  { code: "GW", label: "Guinea-Bissau" },
  { code: "GY", label: "Guyana" },
  { code: "HT", label: "Haiti" },
  { code: "HN", label: "Honduras" },
  { code: "HK", label: "Hong Kong" },
  { code: "HU", label: "Hungary" },
  { code: "IN", label: "India" },
  { code: "ID", label: "Indonesia" },
  { code: "IQ", label: "Iraq" },
  { code: "IR", label: "Iran" },
  { code: "IE", label: "Ireland" },
  { code: "IS", label: "Iceland" },
  { code: "IL", label: "Israel" },
  { code: "IT", label: "Italy" },
  { code: "JM", label: "Jamaica" },
  { code: "JP", label: "Japan" },
  { code: "JO", label: "Jordan" },
  { code: "KZ", label: "Kazakhstan" },
  { code: "KE", label: "Kenya" },
  { code: "KG", label: "Kyrgyzstan" },
  { code: "KI", label: "Kiribati" },
  { code: "KW", label: "Kuwait" },
  { code: "LA", label: "Laos" },
  { code: "LS", label: "Lesotho" },
  { code: "LV", label: "Latvia" },
  { code: "LB", label: "Lebanon" },
  { code: "LR", label: "Liberia" },
  { code: "LY", label: "Libya" },
  { code: "LI", label: "Liechtenstein" },
  { code: "LT", label: "Lithuania" },
  { code: "LU", label: "Luxembourg" },
  { code: "MO", label: "Macau" },
  { code: "MG", label: "Madagascar" },
  { code: "MY", label: "Malaysia" },
  { code: "MW", label: "Malawi" },
  { code: "MV", label: "Maldives" },
  { code: "ML", label: "Mali" },
  { code: "MT", label: "Malta" },
  { code: "MA", label: "Morocco" },
  { code: "MU", label: "Mauritius" },
  { code: "MR", label: "Mauritania" },
  { code: "MX", label: "Mexico" },
  { code: "MD", label: "Moldova" },
  { code: "MC", label: "Monaco" },
  { code: "MN", label: "Mongolia" },
  { code: "ME", label: "Montenegro" },
  { code: "MZ", label: "Mozambique" },
  { code: "NA", label: "Namibia" },
  { code: "NP", label: "Nepal" },
  { code: "NI", label: "Nicaragua" },
  { code: "NE", label: "Niger" },
  { code: "NG", label: "Nigeria" },
  { code: "NO", label: "Norway" },
  { code: "NZ", label: "New Zealand" },
  { code: "OM", label: "Oman" },
  { code: "UG", label: "Uganda" },
  { code: "UZ", label: "Uzbekistan" },
  { code: "PK", label: "Pakistan" },
  { code: "PA", label: "Panama" },
  { code: "PG", label: "Papua New Guinea" },
  { code: "PY", label: "Paraguay" },
  { code: "NL", label: "Netherlands" },
  { code: "PE", label: "Peru" },
  { code: "PH", label: "Philippines" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "QA", label: "Qatar" },
  { code: "CF", label: "Central African Republic" },
  { code: "DO", label: "Dominican Republic" },
  { code: "CZ", label: "Czech Republic" },
  { code: "RO", label: "Romania" },
  { code: "GB", label: "United Kingdom" },
  { code: "RU", label: "Russia" },
  { code: "RW", label: "Rwanda" },
  { code: "KN", label: "Saint Kitts and Nevis" },
  { code: "SM", label: "San Marino" },
  { code: "LC", label: "Saint Lucia" },
  { code: "VC", label: "Saint Vincent and the Grenadines" },
  { code: "SV", label: "El Salvador" },
  { code: "WS", label: "Samoa" },
  { code: "ST", label: "Sao Tome and Principe" },
  { code: "SN", label: "Senegal" },
  { code: "RS", label: "Serbia" },
  { code: "SC", label: "Seychelles" },
  { code: "SL", label: "Sierra Leone" },
  { code: "SG", label: "Singapore" },
  { code: "SK", label: "Slovakia" },
  { code: "SI", label: "Slovenia" },
  { code: "SO", label: "Somalia" },
  { code: "SD", label: "Sudan" },
  { code: "SS", label: "South Sudan" },
  { code: "LK", label: "Sri Lanka" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "SR", label: "Suriname" },
  { code: "SZ", label: "Eswatini" },
  { code: "SY", label: "Syria" },
  { code: "TJ", label: "Tajikistan" },
  { code: "TW", label: "Taiwan" },
  { code: "TZ", label: "Tanzania" },
  { code: "TD", label: "Chad" },
  { code: "TH", label: "Thailand" },
  { code: "TL", label: "Timor-Leste" },
  { code: "TG", label: "Togo" },
  { code: "TO", label: "Tonga" },
  { code: "TT", label: "Trinidad and Tobago" },
  { code: "TN", label: "Tunisia" },
  { code: "TM", label: "Turkmenistan" },
  { code: "TR", label: "Turkey" },
  { code: "TV", label: "Tuvalu" },
  { code: "UA", label: "Ukraine" },
  { code: "UY", label: "Uruguay" },
  { code: "VU", label: "Vanuatu" },
  { code: "VA", label: "Vatican City" },
  { code: "VE", label: "Venezuela" },
  { code: "VN", label: "Vietnam" },
  { code: "YE", label: "Yemen" },
  { code: "ZM", label: "Zambia" },
  { code: "ZW", label: "Zimbabwe" },
];

export default function TeamPage() {
  const router = useRouter();
  const { organization, membership, isLoaded } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();
  const isStarter = ent.plan === "starter";

  const canUseTerritoriesUi = !isStarter;
  const canUseRoutingModeUi = !isStarter;

  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!organization) return;
    if (!isAdmin) router.replace("/");
  }, [isLoaded, organization, isAdmin, router]);

  useEffect(() => {
    if (!inviteOpen) return;
    if (typeof window !== "undefined") window.location.hash = "members";
  }, [inviteOpen]);

  const canQuery = Boolean(organization && isAdmin);

  const widgetSettings = useQuery(
    api.private.widgetSettings.getOne,
    canQuery ? ({} as any) : ("skip" as any),
  ) as { routingMode?: RoutingMode } | undefined;

  const setRoutingMode = useMutation(api.private.widgetSettings.setRoutingMode);

  useEffect(() => {
    if (!canQuery) return;
    if (!isStarter) return;
    if (widgetSettings === undefined) return;
    const current = widgetSettings?.routingMode ?? "auto_assign";
    if (current !== "visitor_choice") {
      setRoutingMode({ routingMode: "visitor_choice" } as any).catch(() => {});
    }
  }, [canQuery, isStarter, widgetSettings, setRoutingMode]);

  // Territories
  const territories = useQuery(
    api.private.territories.listForOrg,
    canQuery && canUseTerritoriesUi
      ? ({ organizationId: organization!.id } as any)
      : ("skip" as any),
  ) as
    | {
        _id: string;
        key: string;
        label: string;
        countryCodes?: string[];
        sortOrder?: number;
      }[]
    | undefined;

  const upsertTerritory = useMutation(api.private.territories.upsert);
  const removeTerritory = useMutation(api.private.territories.remove);

  const territoryOptions: TerritoryOption[] = useMemo(
    () => (territories ?? []).map((t) => ({ label: t.label, value: t.key })),
    [territories],
  );

  // Routing mode UI
  const [autoRouting, setAutoRouting] = useState(true);

  useEffect(() => {
    if (!widgetSettings) return;
    const mode: RoutingMode = widgetSettings.routingMode ?? "auto_assign";
    setAutoRouting(mode === "auto_assign");
  }, [widgetSettings]);

  const handleToggleRouting = async (checked: boolean) => {
    if (isStarter) return;

    const nextAuto = Boolean(checked);
    setAutoRouting(nextAuto);

    try {
      await setRoutingMode({
        routingMode: nextAuto ? "auto_assign" : "visitor_choice",
      } as any);
      toast.success("Routing mode updated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update routing mode");
      setAutoRouting(!nextAuto);
    }
  };

  // Load Clerk members
  const [members, setMembers] = useState<Membership[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!organization || !isAdmin) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoadingMembers(true);
        const res = await organization.getMemberships();
        const memberships = res.data ?? [];
        if (cancelled) return;

        const mapped: Membership[] = memberships.map((m: any) => {
          const userData = m.publicUserData ?? {};
          const name =
            (userData.firstName || "") +
            (userData.lastName ? ` ${userData.lastName}` : "");

          return {
            id: m.id,
            userId: userData.userId ?? m.userId,
            email: userData.identifier ?? "",
            name: name || userData.identifier || "Unknown user",
          };
        });

        setMembers(mapped);
      } catch (e) {
        console.error("Failed to load memberships", e);
        toast.error("Failed to load team members");
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [organization, isAdmin]);

  // repsPresence
  const reps = useQuery(
    api.team.listRepsForOrg,
    canQuery ? ({} as any) : ("skip" as any),
  ) as
    | {
        _id: string;
        organizationId: string;
        userId: string;
        regions?: string[];
        available: boolean;
        slackUserId?: string;
        slackDmChannel?: string;
        updatedAt: number;
      }[]
    | undefined;

  const upsertRep = useMutation(api.team.upsertRepPresence);

  const rows = useMemo(() => {
    if (!organization) return [];

    const byUserId =
      reps?.reduce<Record<string, (typeof reps)[number]>>((acc, rep) => {
        acc[rep.userId] = rep;
        return acc;
      }, {}) ?? {};

    return members.map((m) => {
      const rep = byUserId[m.userId];
      return {
        member: m,
        regions: (rep?.regions as string[] | undefined) ?? [],
        available: rep?.available ?? false,
        slackUserId: rep?.slackUserId,
        slackDmChannel: rep?.slackDmChannel,
      };
    });
  }, [members, reps, organization]);

  const handleSaveRep = async (row: {
    member: Membership;
    regions: string[];
    available: boolean;
    slackUserId?: string;
    slackDmChannel?: string;
  }) => {
    if (!organization || !isAdmin) return;

    try {
      await upsertRep({
        userId: row.member.userId,
        regions: row.regions,
        available: row.available,
        slackUserId: row.slackUserId,
        slackDmChannel: row.slackDmChannel,
      } as any);
      toast.success(`Updated ${row.member.name || row.member.email}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save rep settings");
    }
  };

  // Territories form
  const [territoryLabel, setTerritoryLabel] = useState("");
  const [territoryKey, setTerritoryKey] = useState("");
  const [countryCodesRaw, setCountryCodesRaw] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("custom");
  const [selectedCountry, setSelectedCountry] = useState<string>("");

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const handlePresetChange = (val: PresetId) => {
    setSelectedPreset(val);
    if (val === "custom") {
      setCountryCodesRaw("");
      return;
    }

    const preset = PRESET_TERRITORIES.find((p) => p.id === val);
    if (!preset) return;

    setTerritoryLabel(preset.label);
    setTerritoryKey(preset.key);
    if (val === "whole_world") {
      setCountryCodesRaw(WHOLE_WORLD_COUNTRY_CODES);
    } else {
      setCountryCodesRaw("");
    }
  };

  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    setCountryCodesRaw(code);

    const country = COUNTRY_PRESETS.find((c) => c.code === code);
    if (country) {
      if (!territoryLabel) setTerritoryLabel(country.label);
      if (!territoryKey) setTerritoryKey(slugify(country.label));
    }
  };

  const handleCreateTerritory = async () => {
    if (!organization || !isAdmin) return;

    const trimmedLabel = territoryLabel.trim();
    const trimmedKey = (territoryKey || slugify(territoryLabel)).trim();

    if (!trimmedLabel || !trimmedKey) {
      toast.error("Label and key are required");
      return;
    }

    const raw = countryCodesRaw.trim();
    const codes =
      raw.length === 0
        ? undefined
        : raw
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);

    try {
      await upsertTerritory({
        organizationId: organization.id,
        key: trimmedKey,
        label: trimmedLabel,
        countryCodes: codes,
      } as any);

      toast.success("Territory saved");
      setTerritoryLabel("");
      setTerritoryKey("");
      setCountryCodesRaw("");
      setSelectedPreset("custom");
      setSelectedCountry("");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save territory");
    }
  };

  const handleDeleteTerritory = async (id: string) => {
    if (!isAdmin) return;
    try {
      await removeTerritory({ territoryId: id as any });
      toast.success("Territory removed");
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove territory");
    }
  };

  if (!organization) {
    return (
      <Protect>
        <div className="p-8">
          <h1 className="text-2xl font-semibold">Team & Territories</h1>
          <p className="mt-4 text-muted-foreground">
            You must be in an organization to manage your team.
          </p>
        </div>
      </Protect>
    );
  }

  if (isLoaded && !isAdmin) {
    return <Protect>{null}</Protect>;
  }

  return (
    <Protect>
      <div className="flex min-h-screen flex-col bg-muted p-8">
        <div className="mx-auto w-full max-w-5xl space-y-8">
          {/* HEADER + INVITE MODAL */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-4xl">Team</h1>
              <p className="text-sm text-muted-foreground">
                Manage who receives inbound leads and their availability.
                {isStarter ? " (Starter: visitor chooses rep, no territories.)" : null}
              </p>
            </div>

            <Button onClick={() => setInviteOpen(true)} className="shrink-0 bg-gradient-to-r from-fuchsia-600 to-rose-500 hover:from-fuchsia-700 hover:to-rose-600 border-0">
              Invite member
            </Button>
          </div>

          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent
              className="
                !p-0 !overflow-hidden
                !max-w-none
                !w-[95vw] !h-[90vh]
                sm:!w-[min(1100px,95vw)] sm:!h-[min(760px,90vh)]
              "
            >
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>Members</DialogTitle>
              </DialogHeader>

              <div className="h-[calc(100%-72px)] px-6 pb-6">
                <div className="h-full w-full rounded-xl border bg-background overflow-hidden">
                  <OrganizationProfile
                    routing="hash"
                    appearance={{
                      elements: {
                        organizationProfileDangerSection: "hidden",
                        organizationProfileLeaveOrganization: "hidden",
                        organizationProfileDeleteOrganization: "hidden",
                        organizationProfileLeaveOrganizationAction: "hidden",
                        organizationProfileDeleteOrganizationAction: "hidden",
                        organizationProfilePage: "p-0",
                        organizationProfileSectionTitle: "hidden",
                        organizationProfileSectionContent: "p-0",
                        navbar: "hidden",
                        navbarMobileMenuButton: "hidden",
                        navbarButtons: "hidden",
                        rootBox: "w-full h-full max-w-none",
                        card: "w-full h-full max-w-none border-0 shadow-none rounded-none",
                        pageScrollBox: "w-full h-full max-w-none",
                      },
                    }}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ROUTING MODE (hidden for Starter) */}
          {canUseRoutingModeUi ? (
            <>
              <div className="rounded-xl border bg-background p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shadow-sm hover:border-fuchsia-200 transition">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Routing mode</p>
                  <p className="text-xs text-muted-foreground">
                    Switch between <span className="font-medium">auto-assign</span> (presence + territories)
                    or letting visitors <span className="font-medium">choose a rep</span>.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs md:text-sm">
                  <span className={!autoRouting ? "font-medium" : "text-muted-foreground"}>
                    Visitor chooses rep
                  </span>
                  <Switch checked={autoRouting} onCheckedChange={handleToggleRouting} />
                  <span className={autoRouting ? "font-medium" : "text-muted-foreground"}>
                    Auto-assign best rep
                  </span>
                </div>
              </div>

              <Separator />
            </>
          ) : null}

          {/* TEAM TABLE */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Team</h2>
            {loadingMembers && <p className="text-sm text-muted-foreground">Loading team…</p>}

            <div className="overflow-x-auto rounded-xl border bg-background shadow-sm hover:border-fuchsia-200 transition">
              <table className="min-w-full text-sm">
                <thead className="bg-fuchsia-50/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">User</th>

                    {!isStarter ? (
                      <th className="px-4 py-3 text-left font-medium">Territories</th>
                    ) : null}

                    <th className="px-4 py-3 text-left font-medium">Receives leads</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <TeamRow
                      key={row.member.userId}
                      row={row}
                      territoryOptions={territoryOptions}
                      hideTerritories={isStarter}
                      onSave={async (payload) =>
                        handleSaveRep({
                          ...payload,
                          slackUserId: row.slackUserId,
                          slackDmChannel: row.slackDmChannel,
                        })
                      }
                    />
                  ))}

                  {rows.length === 0 && !loadingMembers && (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted-foreground"
                        colSpan={isStarter ? 3 : 4}
                      >
                        No members found in this organization.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!isStarter ? (
              <p className="text-xs text-muted-foreground">
                Visitors are assigned based on territories (country → territory → rep regions).
              </p>
            ) : null}
          </div>

          {/* TERRITORIES (hidden for Starter) */}
          {canUseTerritoriesUi ? (
            <>
              <Separator />

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Territories</h2>

                <Card className="rounded-2xl border shadow-sm hover:shadow-md hover:border-fuchsia-200 transition">
                  <CardHeader>
                    <CardTitle>Create a territory</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Region preset (optional)</Label>
                        <Select
                          value={selectedPreset}
                          onValueChange={(v) => handlePresetChange(v as PresetId)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a preset…" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRESET_TERRITORIES.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.label}
                                {p.hint ? ` – ${p.hint}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Pick a region (MENA, Europe…) to auto-configure label & key.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label>Country preset (optional)</Label>
                        <Select value={selectedCountry} onValueChange={handleCountryChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a country…" />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRY_PRESETS.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.label} ({c.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Label</Label>
                        <Input
                          placeholder="France, DACH, North America…"
                          value={territoryLabel}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTerritoryLabel(v);
                            if (!territoryKey) setTerritoryKey(slugify(v));
                          }}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Key (slug)</Label>
                        <Input
                          placeholder="france, dach, north_america…"
                          value={territoryKey}
                          onChange={(e) => setTerritoryKey(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Country codes (optional)</Label>
                        <Input
                          placeholder="FR, BE, LU"
                          value={countryCodesRaw}
                          onChange={(e) => setCountryCodesRaw(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleCreateTerritory} className="bg-gradient-to-r from-fuchsia-600 to-rose-500 hover:from-fuchsia-700 hover:to-rose-600 border-0">Save territory</Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border shadow-sm hover:shadow-md hover:border-fuchsia-200 transition">
                  <CardHeader>
                    <CardTitle>Existing territories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {territories && territories.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No territories yet. Create at least one then map reps to them.
                      </p>
                    )}

                    {territories && territories.length > 0 && (
                      <div className="overflow-x-auto rounded-xl border bg-background shadow-sm">
                        <table className="min-w-full text-sm">
                          <thead className="bg-fuchsia-50/60">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium">Label</th>
                              <th className="px-4 py-3 text-left font-medium">Key</th>
                              <th className="px-4 py-3 text-left font-medium">Country codes</th>
                              <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {territories.map((t) => (
                              <tr key={t._id}>
                                <td className="px-4 py-3 align-middle">{t.label}</td>
                                <td className="px-4 py-3 align-middle font-mono text-xs">{t.key}</td>
                                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                                  {(t.countryCodes ?? []).join(", ") || "—"}
                                </td>
                                <td className="px-4 py-3 align-middle text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteTerritory(t._id)}
                                  >
                                    Delete
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Protect>
  );
}

function TeamRow({
  row,
  territoryOptions,
  hideTerritories,
  onSave,
}: {
  row: {
    member: Membership;
    regions: string[];
    available: boolean;
    slackUserId?: string;
    slackDmChannel?: string;
  };
  territoryOptions: TerritoryOption[];
  hideTerritories?: boolean;
  onSave: (row: {
    member: Membership;
    regions: string[];
    available: boolean;
  }) => void;
}) {
  const [regions, setRegions] = useState<string[]>(row.regions || []);
  const [available, setAvailable] = useState(row.available);
  const [saving, setSaving] = useState(false);

  const handleClickSave = async () => {
    setSaving(true);
    await onSave({ member: row.member, regions: hideTerritories ? [] : regions, available });
    setSaving(false);
  };

  return (
    <tr>
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col">
          <span className="font-medium">{row.member.name || row.member.email}</span>
          <span className="text-xs text-muted-foreground">{row.member.email}</span>
        </div>
      </td>

      {!hideTerritories ? (
        <td className="px-4 py-3 align-middle">
          <Label className="sr-only">Territories</Label>
          <MultiSelect
            options={territoryOptions}
            value={regions}
            onValueChange={setRegions}
            placeholder={territoryOptions.length ? "Select territories" : "No territories yet"}
            className="max-w-xs"
          />
        </td>
      ) : null}

      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <Switch checked={available} onCheckedChange={(v) => setAvailable(Boolean(v))} />
          <span className="text-xs text-muted-foreground">{available ? "Online" : "Offline"}</span>
        </div>
      </td>

      <td className="px-4 py-3 align-middle text-right">
        <Button size="sm" onClick={handleClickSave} disabled={saving} className="bg-fuchsia-600 hover:bg-fuchsia-700 border-0">
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}
