"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
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
  key: string; // territory.key utilisé côté backend
  hint?: string; // juste pour l’UX, pas utilisé en DB
}[] = [
  {
    id: "custom",
    label: "Custom territory",
    key: "",
  },
  {
    id: "france",
    label: "France",
    key: "france",
    hint: "FR",
  },
  {
    id: "morocco",
    label: "Morocco",
    key: "morocco",
    hint: "MA",
  },
  {
    id: "mena",
    label: "MENA",
    key: "mena",
    hint: "DZ, BH, EG, JO, KW, LB, MA, OM, QA, SA, AE, TN…",
  },
  {
    id: "europe",
    label: "Europe",
    key: "europe",
    hint: "Most EU / EEA countries",
  },
  {
    id: "north_america",
    label: "North America",
    key: "north_america",
    hint: "US, CA, MX…",
  },
  {
    id: "apac",
    label: "APAC",
    key: "apac",
    hint: "Asia-Pacific countries",
  },
];

// 🔹 Presets de pays (tu peux compléter la liste au besoin)
type CountryPreset = {
  code: string; // ISO (FR, DE, ES…)
  label: string;
};

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
  // TODO: compléter avec tous les pays si tu veux full coverage
];

export default function TeamPage() {
  const { organization } = useOrganization();

  // 🔹 Widget settings (routingMode)
  const widgetSettings = useQuery(api.private.widgetSettings.getOne, {}) as
    | { routingMode?: RoutingMode }
    | undefined;

  const setRoutingMode = useMutation(api.private.widgetSettings.setRoutingMode);

  // 🔹 Territories dynamiques (par org)
  const territories = useQuery(
    api.private.territories.listForOrg,
    organization ? ({ organizationId: organization.id } as any) : ("skip" as any),
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
    () =>
      (territories ?? []).map((t) => ({
        label: t.label,
        value: t.key, // on stocke la key dans repsPresence.regions
      })),
    [territories],
  );

  // 🔁 State local du toggle, initialisé depuis widgetSettings
  const [autoRouting, setAutoRouting] = useState(true);

  useEffect(() => {
    if (!widgetSettings) return;
    const mode: RoutingMode = widgetSettings.routingMode ?? "auto_assign";
    setAutoRouting(mode === "auto_assign");
  }, [widgetSettings]);

  // 🔹 Load Clerk Members
  const [members, setMembers] = useState<Membership[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!organization) return;

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
  }, [organization]);

  // 🔹 Load repsPresence
  const reps = useQuery(
    api.team.listRepsForOrg,
    organization ? { organizationId: organization.id } : ("skip" as any),
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
        title?: string;
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
        rep,
        role: (rep?.role as "sales" | "support" | undefined) ?? "sales",
        regions: (rep?.regions as string[] | undefined) ?? [],
        available: rep?.available ?? false,
        title: rep?.title ?? "",
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
    title?: string;
    slackUserId?: string;
    slackDmChannel?: string;
  }) => {
    if (!organization) return;

    try {
      await upsertRep({
        organizationId: organization.id,
        userId: row.member.userId,
        role: row.role,
        regions: row.regions,
        available: row.available,
        title: row.title?.trim() || undefined,
        slackUserId: row.slackUserId,
        slackDmChannel: row.slackDmChannel,
      } as any);
      toast.success(`Updated ${row.member.name || row.member.email}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save rep settings");
    }
  };

  const handleToggleRouting = async (checked: boolean) => {
    const nextAuto = Boolean(checked);
    setAutoRouting(nextAuto);

    try {
      await setRoutingMode({
        routingMode: nextAuto ? "auto_assign" : "visitor_choice",
      });
      toast.success("Routing mode updated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update routing mode");
      setAutoRouting(!nextAuto); // rollback si erreur
    }
  };

  // 🔹 Form state pour la création de territories (dans la même page)
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
      // Ne force rien, l’admin garde la main
      return;
    }

    const preset = PRESET_TERRITORIES.find((p) => p.id === val);
    if (!preset) return;

    // On force label + key depuis le preset, et on laisse les countryCodes vides
    setTerritoryLabel(preset.label);
    setTerritoryKey(preset.key);
    setCountryCodesRaw("");
  };

  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    setCountryCodesRaw(code); // remplis l’input "FR, ..." avec 1 code

    const country = COUNTRY_PRESETS.find((c) => c.code === code);
    if (country) {
      // Si rien n’a été mis à la main, on préremplit label + key
      if (!territoryLabel) setTerritoryLabel(country.label);
      if (!territoryKey) setTerritoryKey(slugify(country.label));
    }
  };

  const handleCreateTerritory = async () => {
    if (!organization) return;

    const trimmedLabel = territoryLabel.trim();
    const trimmedKey = (territoryKey || slugify(territoryLabel)).trim();

    if (!trimmedLabel || !trimmedKey) {
      toast.error("Label and key are required");
      return;
    }

    const raw = countryCodesRaw.trim();

    // ⬇️ IMPORTANT : undefined si vide → laisse le backend appliquer le preset
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
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Team & Routing</h1>
        <p className="mt-4 text-muted-foreground">
          You must be in an organization to manage your team.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted p-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-4xl">Team & Territories</h1>
          <p className="text-sm text-muted-foreground">
            Choose which teammates receive inbound leads, which territories they
            cover, and how routing behaves.
          </p>
        </div>

        {/* ROUTING MODE TOGGLE */}
        <div className="rounded-lg border bg-background p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Routing mode</p>
            <p className="text-xs text-muted-foreground">
              Switch between{" "}
              <span className="font-medium">auto-assign</span> (using rules +
              presence + territories) or letting visitors{" "}
              <span className="font-medium">choose a rep</span> in the widget.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm">
            <span
              className={
                !autoRouting ? "font-medium" : "text-muted-foreground"
              }
            >
              Visitor chooses rep
            </span>
            <Switch checked={autoRouting} onCheckedChange={handleToggleRouting} />
            <span
              className={
                autoRouting ? "font-medium" : "text-muted-foreground"
              }
            >
              Auto-assign best rep
            </span>
          </div>
        </div>

        <Separator />

        {/* TEAM TABLE */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Team</h2>
          {loadingMembers && (
            <p className="text-sm text-muted-foreground">Loading team…</p>
          )}

          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Title (shown to visitors)
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Territories
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Receives leads
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <TeamRow
                    key={row.member.userId}
                    row={row}
                    territoryOptions={territoryOptions}
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
                      colSpan={6}
                    >
                      No members found in this organization.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Routing uses these settings together with your rules (geo, URL,
            UTM…) and territories to pick the right rep for each visitor. The{" "}
            <span className="font-medium">title</span> is what visitors will see
            in the rep chooser and booking confirmation (e.g.{" "}
            <code className="font-mono">Solutions Engineer EMEA</code>).
          </p>
        </div>

        <Separator />

        {/* TERRITORIES SECTION (même module) */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Territories</h2>
          <Card>
            <CardHeader>
              <CardTitle>Create a territory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Presets row */}
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
                  <Select
                    value={selectedCountry}
                    onValueChange={handleCountryChange}
                  >
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
                    This will fill the country codes field with one ISO code
                    (FR, DE, …). You can still edit or add more codes manually.
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
                      if (!territoryKey) {
                        setTerritoryKey(slugify(v));
                      }
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
                    Used internally to link reps & routing rules (ex:{" "}
                    <code className="font-mono">mena</code>,{" "}
                    <code className="font-mono">europe</code>,{" "}
                    <code className="font-mono">north_america</code>).
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
                    Comma-separated ISO codes (ex: FR, DE, ES). Leave empty to
                    use the built-in preset mapping.
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
                  No territories yet. Create at least one (e.g. France, MENA,
                  North America…) and map reps to them above.
                </p>
              )}

              {territories && territories.length > 0 && (
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">
                          Label
                        </th>
                        <th className="px-4 py-3 text-left font-medium">Key</th>
                        <th className="px-4 py-3 text-left font-medium">
                          Country codes
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {territories.map((t) => (
                        <tr key={t._id}>
                          <td className="px-4 py-3 align-middle">{t.label}</td>
                          <td className="px-4 py-3 align-middle font-mono text-xs">
                            {t.key}
                          </td>
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
      </div>
    </div>
  );
}

function TeamRow({
  row,
  territoryOptions,
  onSave,
}: {
  row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[]; // = territories.key[]
    available: boolean;
    title?: string;
  };
  territoryOptions: TerritoryOption[];
  onSave: (row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[];
    available: boolean;
    title?: string;
  }) => void;
}) {
  const [role, setRole] = useState<"sales" | "support">(row.role);
  const [regions, setRegions] = useState<string[]>(row.regions || []);
  const [available, setAvailable] = useState(row.available);
  const [title, setTitle] = useState(row.title ?? "");
  const [saving, setSaving] = useState(false);

  const handleClickSave = async () => {
    setSaving(true);
    await onSave({
      member: row.member,
      role,
      regions,
      available,
      title,
    });
    setSaving(false);
  };

  return (
    <tr>
      {/* USER */}
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col">
          <span className="font-medium">
            {row.member.name || row.member.email}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.member.email}
          </span>
        </div>
      </td>

      {/* TITLE (affiché dans le widget) */}
      <td className="px-4 py-3 align-middle max-w-xs">
        <Label className="sr-only">Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Solutions Engineer EMEA, Account Executive France…"
        />
      </td>

      {/* ROLE */}
      <td className="px-4 py-3 align-middle">
        <Select
          value={role}
          onValueChange={(v) => setRole(v as "sales" | "support")}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="support">Support</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* TERRITORIES MultiSelect */}
      <td className="px-4 py-3 align-middle">
        <Label className="sr-only">Territories</Label>
        <MultiSelect
          options={territoryOptions}
          value={regions}
          onValueChange={setRegions}
          placeholder={
            territoryOptions.length
              ? "Select territories"
              : "No territories yet"
          }
          className="max-w-xs"
        />
      </td>

      {/* AVAILABLE */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <Switch
            checked={available}
            onCheckedChange={(v) => setAvailable(Boolean(v))}
          />
          <span className="text-xs text-muted-foreground">
            {available ? "Online" : "Offline"}
          </span>
        </div>
      </td>

      {/* SAVE */}
      <td className="px-4 py-3 align-middle text-right">
        <Button size="sm" onClick={handleClickSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}
