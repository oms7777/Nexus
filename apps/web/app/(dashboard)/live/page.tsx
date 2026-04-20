// apps/web/app/(dashboard)/live/page.tsx

import LiveMapView from "@/modules/live/LiveMapView";

export default function Page() {
  return (
    <div className="h-full min-h-0">
      <LiveMapView />
    </div>
  );
}
