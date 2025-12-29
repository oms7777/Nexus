"use client";

import React from "react";

export function LockedSignalsAdvancedCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Advanced Signals</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Unlock territory + UTM enrichment and deeper attribution.
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-xs font-medium">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Territory (from countryCode → territories)</div>
        <div>• UTM source attribution</div>
        <div>• Better “hot accounts” prioritization</div>
      </div>

      <div className="mt-6 rounded-xl bg-muted p-4 text-sm">
        Enable <span className="font-medium">Advanced Analytics</span> to see extra columns.
      </div>
    </div>
  );
}
