"use client";

import React from "react";

export function LockedSignalsAdvancedCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md hover:border-fuchsia-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Advanced Signals</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Unlock territory + UTM enrichment and deeper attribution.
          </div>
        </div>
        <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700">Locked</div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
        <div>• Territory (from countryCode → territories)</div>
        <div>• UTM source attribution</div>
        <div>• Better “hot accounts” prioritization</div>
      </div>

      <div className="mt-6 rounded-xl bg-fuchsia-50/60 p-4 text-sm border border-fuchsia-100">
        Enable <span className="font-medium">Advanced Analytics</span> to see extra columns.
      </div>
    </div>
  );
}
