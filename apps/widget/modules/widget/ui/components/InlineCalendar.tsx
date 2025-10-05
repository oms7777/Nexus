// apps/widget/modules/widget/ui/components/InlineCalendar.tsx
"use client";
export default function InlineCalendar({
  baseUrl, name, email,
}: { baseUrl: string; name?: string; email?: string }) {
  const url =
    `${baseUrl}?hide_event_type_details=1` +
    `&name=${encodeURIComponent(name || "")}` +
    `&email=${encodeURIComponent(email || "")}`;
  return (
    <div className="rounded-md border m-2 overflow-hidden">
      <iframe src={url} className="w-full h-[620px]" />
    </div>
  );
}
