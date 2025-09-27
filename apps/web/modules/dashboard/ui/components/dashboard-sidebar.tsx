"use client";

import { OrganizationSwitcher, UserButton, useOrganization } from "@clerk/nextjs";
import {
  CreditCardIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  MapIcon,
  Mic,
  PaletteIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import { usePathname } from "next/navigation";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";

/* ----------------------------- Presence control ---------------------------- */

function PresenceToggle() {
  const me = useQuery(api.private.reps.me, {});
  const setAvailability = useMutation(api.private.reps.setAvailability);
  const [role, setRole] = useState<"sales" | "support">("sales");
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setRole((me.role as "sales" | "support") ?? "sales");
      setAvailable(!!me.available);
    }
  }, [me]);

  const save = async (next: { role?: "sales" | "support"; available?: boolean }) => {
    setSaving(true);
    try {
      await setAvailability({
        role: next.role ?? role,
        available: next.available ?? available,
        regions: me?.regions ?? ["EMEA"],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="opacity-70">Role</span>
        <select
          className="rounded border bg-transparent px-2 py-1"
          value={role}
          onChange={async (e) => {
            const r = e.target.value as "sales" | "support";
            setRole(r);
            await save({ role: r });
          }}
          disabled={saving}
        >
          <option value="sales">Sales</option>
          <option value="support">Support</option>
        </select>
      </div>

      <button
        onClick={async () => {
          const next = !available;
          setAvailable(next);
          await save({ available: next });
        }}
        disabled={saving}
        className={cn(
          "rounded px-2 py-1",
          available ? "bg-green-600 text-white" : "bg-muted text-foreground"
        )}
        title="Toggle availability"
      >
        {available ? "Available" : "Away"}
      </button>
    </div>
  );
}

/* --------------------------------- Sidebar -------------------------------- */

export const DashboardSidebar = () => {
  const pathname = usePathname();

  // ✅ la bonne façon : membership vient du hook directement
  const { membership, isLoaded: orgLoaded } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  // Rôle “opérationnel” (sales/support) depuis Convex
  const me = useQuery(api.private.reps.me, {});
  const role = (me?.role as "sales" | "support" | undefined) ?? undefined;
  const isSales = role === "sales";
  const isSupport = role === "support";

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const salesItems = [{ title: "Live Map", url: "/live", icon: MapIcon }];

  const supportItems = [
    { title: "Conversations", url: "/conversations", icon: InboxIcon },
    { title: "Knowledge Base", url: "/files", icon: LibraryBigIcon },
  ];

  const configurationItems = [
    { title: "Widget Customization", url: "/customization", icon: PaletteIcon },
    { title: "Integrations", url: "/integrations", icon: LayoutDashboardIcon },
    { title: "Voice Assistant", url: "/plugins/vapi", icon: Mic },
  ];

  const accountItems = [{ title: "Plans & Billing", url: "/billing", icon: CreditCardIcon }];

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <OrganizationSwitcher
                hidePersonal
                skipInvitationScreen
                appearance={{
                  elements: {
                    rootBox: "w-full! h-8!",
                    avatarBox: "size-4! rounded-sm!",
                    organizationSwitcherTrigger:
                      "w-full! justify-start! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
                    organizationPreview: "group-data-[collapsible=icon]:justify-center! gap-2",
                    organizationPreviewTextContainer:
                      "group-data-[collapsible=icon]:hidden! text-xs! font-medium! text-sidebar-foreground!",
                    organizationSwitcherTriggerIcon:
                      "group-data-[collapsible=icon]:hidden! ml-auto! text-sidebar-foreground!",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* ⛔️ seulement pour les admins */}
        {isAdmin && <PresenceToggle />}
      </SidebarHeader>

      <SidebarContent>
        {/* SALES / Revenue */}
        {(isSales || isAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel>Revenue</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {salesItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={cn(
                        isActive(item.url) &&
                          "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground! hover:to-[#0b63f3]/90!"
                      )}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* SUPPORT */}
        {(isSupport || isAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel>Customer Support</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {supportItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={cn(
                        isActive(item.url) &&
                          "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground! hover:to-[#0b63f3]/90!"
                      )}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* CONFIGURATION – admin only */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configurationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={cn(
                        isActive(item.url) &&
                          "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground! hover:to-[#0b63f3]/90!"
                      )}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ACCOUNT – admin only */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {accountItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={cn(
                        isActive(item.url) &&
                          "bg-gradient-to-b from-sidebar-primary to-[#0b63f3]! text-sidebar-primary-foreground! hover:to-[#0b63f3]/90!"
                      )}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <UserButton
            showName
            appearance={{
              elements: {
                rootBox: "w-full! h-8!",
                userButtonTrigger:
                  "w-full! p-2! hover:bd-sidebar-accent! hover:text-sidebar-accent-foreground! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
                userButtonBox:
                  "w-full! flex-row-reverse! justify-end! gap-2! group-data-[collapsible=icon]:justify-center! text-sidebar-foreground!",
                userButtonOuterIdentifier: "pl-0! group-data-[collapsible=icon]:hidden!",
                avatarBox: "size-4!",
              },
            }}
          />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};