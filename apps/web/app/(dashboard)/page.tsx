// apps/web/app/(dashboard)/page.tsx
"use client";

import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export default function Page() {
  // crée/patch le user courant dans la table `users`
  const ensureMe = useMutation(api.private.users.meSetAvatar);

  const onClickAdd = async () => {
    // avatar facultatif -> undefined
    await ensureMe({ avatarUrl: undefined });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-svh gap-4">
      <p>apps/web</p>
      <UserButton />
      <OrganizationSwitcher hidePersonal />
      <Button onClick={onClickAdd}>Add / Ensure my user</Button>
    </div>
  );
}
