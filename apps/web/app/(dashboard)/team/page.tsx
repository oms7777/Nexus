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
import { toast } from "sonner";
import { MultiSelect } from "@/modules/team/ui/multi-select";

// ⭐ Regions officielles
const REGION_OPTIONS = [
  { label: "France", value: "FR" },
  { label: "Morocco", value: "MA" },
  { label: "MENA", value: "MENA" },
  { label: "Europe", value: "EU" },
  { label: "North America", value: "NA" },
  { label: "APAC", value: "APAC" },
];

type Membership = {
  id: string;
  userId: string;
  email: string;
  name: string;
};

type RoutingMode = "auto_assign" | "visitor_choice";

export default function TeamPage() {
  const { organization } = useOrganization();

  // 🔹 Widget settings (pour routingMode)
  const widgetSettings = useQuery(
    api.private.widgetSettings.getOne,
    {}
  ) as { routingMode?: RoutingMode } | undefined;

  const setRoutingMode = useMutation(
    api.private.widgetSettings.setRoutingMode
  );

  // 🔁 State local du toggle, initialisé depuis widgetSettings
  const [autoRouting, setAutoRouting] = useState(true);

  useEffect(() => {
    if (!widgetSettings) return;
    // défaut = auto_assign si rien en base
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
    organization ? { organizationId: organization.id } : ("skip" as any)
  );

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
      };
    });
  }, [members, reps, organization]);

  const handleSave = async (row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[];
    available: boolean;
  }) => {
    if (!organization) return;

    try {
      await upsertRep({
        organizationId: organization.id,
        userId: row.member.userId,
        role: row.role,
        regions: row.regions,
        available: row.available,
        // on ne touche pas ici aux champs Slack (gérés par Connect Slack)
        slackUserId: undefined,
        slackDmChannel: undefined,
      });
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
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-4xl">Team & Territories</h1>
          <p className="text-sm text-muted-foreground">
            Choose which teammates receive inbound leads and which territories they cover.
          </p>
        </div>

        {/* ROUTING MODE TOGGLE */}
        <div className="rounded-lg border bg-background p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Routing mode</p>
            <p className="text-xs text-muted-foreground">
              Switch between{" "}
              <span className="font-medium">auto-assign</span> (using rules + presence)
              or letting visitors{" "}
              <span className="font-medium">choose a rep</span> in the widget.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm">
            <span className={!autoRouting ? "font-medium" : "text-muted-foreground"}>
              Visitor chooses rep
            </span>
            <Switch
              checked={autoRouting}
              onCheckedChange={handleToggleRouting}
            />
            <span className={autoRouting ? "font-medium" : "text-muted-foreground"}>
              Auto-assign best rep
            </span>
          </div>
        </div>

        <Separator />

        {loadingMembers && (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        )}

        {/* TABLE */}
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Regions</th>
                <th className="px-4 py-3 text-left font-medium">Receives leads</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <TeamRow
                  key={row.member.userId}
                  row={row}
                  onSave={handleSave}
                />
              ))}

              {rows.length === 0 && !loadingMembers && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No members found in this organization.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Routing uses these settings together with your rules (geo, URL, UTM…)
          to pick the right rep for each visitor.
        </p>
      </div>
    </div>
  );
}

function TeamRow({
  row,
  onSave,
}: {
  row: {
    member: Membership;
    role: "sales" | "support";
    regions: string[];
    available: boolean;
  };
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
    await onSave({
      member: row.member,
      role,
      regions,
      available,
    });
    setSaving(false);
  };

  return (
    <tr>
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

      {/* REGIONS MultiSelect */}
      <td className="px-4 py-3 align-middle">
        <Label className="sr-only">Regions</Label>
        <MultiSelect
          options={REGION_OPTIONS}
          value={regions}
          onValueChange={setRegions}
          placeholder="Select regions"
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
