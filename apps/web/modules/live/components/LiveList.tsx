"use client";
import { Visitor } from "./LiveMap";

type Props = {
  visitors: Visitor[];
  onSelect?: (v: Visitor) => void;
  filter?: (v: Visitor) => boolean;
};

export default function LiveList({ visitors, onSelect, filter }: Props) {
  const data = filter ? visitors.filter(filter) : visitors;

  return (
    <div className="h-full overflow-auto border-r">
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {data.length} online
      </div>
      <ul className="space-y-1 p-2">
        {data.map(v => (
          <li key={v._id}>
            <button
              onClick={() => onSelect?.(v)}
              className="w-full rounded-md p-2 text-left hover:bg-accent"
              title={v.currentUrl}
            >
              <div className="text-sm font-medium">{v.name || "Visitor"}</div>
              <div className="text-xs text-muted-foreground">
                {v.city ?? "—"}{v.countryCode ? `, ${v.countryCode}` : ""} · {v.currentUrl?.split("?")[0] ?? "—"}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
