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

  if (!isLoaded) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      </div>
    );
  }

  // Aucun droit de créer une org → on force "invite-only"
  if (!hasOrg) {
    return (
      <div className="max-w-xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for an invite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your account is ready, but you don&apos;t belong to any organization yet.</p>
            <p>Please ask your admin to invite you, or check your inbox for the invitation email.</p>

            <div className="pt-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                I already have an invite
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <OrganizationList
      hidePersonal
      skipInvitationScreen
      afterSelectOrganizationUrl="/"
      appearance={{
        elements: {
          // ces clés varient selon versions, celles inconnues sont ignorées
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
