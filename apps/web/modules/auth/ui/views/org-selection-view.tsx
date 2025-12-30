"use client";

import { OrganizationList, useOrganizationList } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";

export const OrgSelectionView = () => {
  const { isLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const memberships = userMemberships?.data ?? [];
  const hasOrg = memberships.length > 0;

  // Tant que Clerk charge
  if (!isLoaded) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      </div>
    );
  }

  // ✅ Cas important : user connecté, mais AUCUNE org
  // => on ne lui propose PAS de créer une org.
  // => on lui dit d’attendre l’invite (ton modèle commercial).
  if (!hasOrg) {
    return (
      <div className="max-w-xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for an invite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your account is ready, but you don&apos;t belong to any organization yet.
            </p>
            <p>
              Please ask your admin to invite you, or check your inbox for the invitation email.
            </p>

            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                I already have an invite
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ Cas normal : user a ≥1 org → on affiche la liste (sans create)
  return (
    <OrganizationList
      hidePersonal
      skipInvitationScreen
      afterSelectOrganizationUrl="/"
      appearance={{
        elements: {
          organizationListCreateOrganizationAction: "hidden",
          organizationListCreateOrganization: "hidden",
          organizationListCreateOrganizationButton: "hidden",
          organizationListCreateOrganizationLink: "hidden",
          organizationListActions: "hidden",
        },
      }}
    />
  );
};
