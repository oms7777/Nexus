"use client";

import { UserButton } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        Welcome to Inboundless
      </p>

      <UserButton />
    </div>
  );
}
