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

import { useEntitlements } from "@/modules/billing/hooks/use-entitlements";

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
  | "france"
  | "morocco"
  | "mena"
  | "europe"
  | "north_america"
  | "apac";

const PRESET_TERRITORIES: {
  id: PresetId;
  label: string;
  key: string;
  hint?: string;
}[] = [
  { id: "custom", label: "Custom territory", key: "" },
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

const COUNTRY_PRESETS: CountryPreset[] = [
  { code: "FR", label: "France" },
  { code: "MA", label: "Morocco" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "MX", label: "Mexico" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "QA", label: "Qatar" },
  { code: "BH", label: "Bahrain" },
  { code: "EG", label: "Egypt" },
  { code: "IN", label: "India" },
  { code: "SG", label: "Singapore" },
  { code: "JP", label: "Japan" },
  { code: "CN", label: "China" },
];

export default function TeamPage() {
  const router = useRouter();
  const { organization, membership, isLoaded } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const ent = useEntitlements();
  const isStarter = ent.plan === "starter";

  // ✅ policy produit
  // Starter: pas de territoires + pas d'auto-assign, donc pas besoin de routing avancé UI.
  const canUseTerritoriesUi = !isStarter; // (tu peux aussi le lier à canUseAdvancedRouting)
  const canUseRoutingModeUi = !isStarter; // Starter => toujours visitor_choice

  const [inviteOpen, setInviteOpen] = useState(false);

  // ✅ Admin-only: redirect silencieux
  useEffect(() => {
    if (!isLoaded) return;
    if (!organization) return;
    if (!isAdmin) router.replace("/");
  }, [isLoaded, organization, isAdmin, router]);

  // ✅ force l'onglet Members quand on ouvre
  useEffect(() => {
    if (!inviteOpen) return;
    if (typeof window !== "undefined") {
      window.location.hash = "members";
    }
  }, [inviteOpen]);

  const canQuery = Boolean(organization && isAdmin);

  // 🔹 Widget settings
  const widgetSettings = useQuery(
    api.private.widgetSettings.getOne,
    canQuery ? ({} as any) : ("skip" as any),
  ) as { routingMode?: RoutingMode } | undefined;

  const setRoutingMode = useMutation(api.private.widgetSettings.setRoutingMode);

  // ✅ Starter: force visitor_choice (hard policy)
  useEffect(() => {
    if (!canQuery) return;
    if (!isStarter) return;
    if (widgetSettings === undefined) return; // loading
    const current = widgetSettings?.routingMode ?? "auto_assign";
    if (current !== "visitor_choice") {
      // pas de toast, on force silencieusement
      setRoutingMode({ routingMode: "visitor_choice" } as any).catch(() => {});
    }
  }, [canQuery, isStarter, widgetSettings, setRoutingMode]);

  // 🔹 Territories
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

  // 🔁 Routing mode toggle
  const [autoRouting, setAutoRouting] = useState(true);

  useEffect(() => {
    if (!widgetSettings) return;
    const mode: RoutingMode = widgetSettings.routingMode ?? "auto_assign";
    setAutoRouting(mode === "auto_assign");
  }, [widgetSettings]);

  // 🔹 Load Clerk Members (admin only)
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

  // 🔹 repsPresence
  const reps = useQuery(
    api.team.listRepsForOrg,
    canQuery ? ({} as any) : ("skip" as any),
  ) as
    | {
        _id: string;
        organizationId: string;
        userId: string;
        role: "sales" | "support";
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
        role: (rep?.role as "sales" | "support" | undefined) ?? "sales",
        regions: (rep?.regions as string[] | undefined) ?? [],
        available: rep?.available ?? false,
        slackUserId: rep?.slackUserId,
        slackDmChannel: rep?.slackDmChannel,
      };
    });
  }, [members, reps, organization]);

  const handleSaveRep = async (row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[];
    available: boolean;
    slackUserId?: string;
    slackDmChannel?: string;
  }) => {
    if (!organization || !isAdmin) return;

    try {
      await upsertRep({
        userId: row.member.userId,
        role: row.role,
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

  // Fonction de basculement entre les modes de routage
  const handleToggleRouting = async (checked: boolean) => {
    // Si c'est un plan "starter", on ne permet pas le changement de mode de routage
    if (isStarter) return;

    const nextAuto = Boolean(checked);
    setAutoRouting(nextAuto);

    try {
      // Enregistrer la modification dans les paramètres de routage
      await setRoutingMode({
        routingMode: nextAuto ? "auto_assign" : "visitor_choice",
      } as any);
      toast.success("Routing mode updated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update routing mode");
      setAutoRouting(!nextAuto); // Revert to previous state on error
    }
  };

  // Changement de l'état de l'auto-routing selon le mode actuel
  useEffect(() => {
    if (!widgetSettings) return;
    const mode: RoutingMode = widgetSettings.routingMode ?? "auto_assign";
    setAutoRouting(mode === "auto_assign");  // Si mode est auto_assign, on active le mode automatique
  }, [widgetSettings]);


  // 🔹 Territories form state
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
    if (val === "custom") return;

    const preset = PRESET_TERRITORIES.find((p) => p.id === val);
    if (!preset) return;

    setTerritoryLabel(preset.label);
    setTerritoryKey(preset.key);
    setCountryCodesRaw("");
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

            <Button onClick={() => setInviteOpen(true)} className="shrink-0">
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
              <div className="rounded-lg border bg-background p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Routing mode</p>
                  <p className="text-xs text-muted-foreground">
                    Switch between <span className="font-medium">auto-assign</span> (rules + presence + territories)
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

            <div className="overflow-x-auto rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Role</th>

                    {/* Starter: hide territories column entirely */}
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
                        colSpan={isStarter ? 4 : 5}
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
                Routing uses these settings together with your rules (geo, URL, UTM…) and territories to pick the right rep.
              </p>
            ) : null}
          </div>

          {/* TERRITORIES (hidden for Starter) */}
          {canUseTerritoriesUi ? (
            <>
              <Separator />

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Territories</h2>

                <Card>
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
                          Leave country codes empty to use the built-in mapping.
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
                        <p className="text-xs text-muted-foreground">
                          This fills the country codes field with one ISO code (FR, DE, …).
                          You can still edit it.
                        </p>
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
                        <p className="text-xs text-muted-foreground">
                          Used internally to link reps & routing rules (ex: <code className="font-mono">mena</code>).
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label>Country codes (optional)</Label>
                        <Input
                          placeholder="FR, BE, LU"
                          value={countryCodesRaw}
                          onChange={(e) => setCountryCodesRaw(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Comma-separated ISO codes. Leave empty to use the preset mapping.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleCreateTerritory}>Save territory</Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
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
                      <div className="overflow-x-auto rounded-lg border bg-background">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/60">
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
    role: "sales" | "support";
    regions: string[];
    available: boolean;
    slackUserId?: string;
    slackDmChannel?: string;
  };
  territoryOptions: TerritoryOption[];
  hideTerritories?: boolean;
  onSave: (row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[];
    available: boolean;
  }) => void;
}) {
  const [role, setRole] = useState<"sales" | "support">(row.role);
  const [regions, setRegions] = useState<string[]>(row.regions || []);
  const [available, setAvailable] = useState(row.available);
  const [saving, setSaving] = useState(false);

  const handleClickSave = async () => {
    setSaving(true);
    await onSave({ member: row.member, role, regions: hideTerritories ? [] : regions, available });
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

      <td className="px-4 py-3 align-middle">
        <Select value={role} onValueChange={(v) => setRole(v as "sales" | "support")}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="support">Support</SelectItem>
          </SelectContent>
        </Select>
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
        <Button size="sm" onClick={handleClickSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}
