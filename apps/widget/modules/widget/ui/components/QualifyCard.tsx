// apps/widget/modules/widget/ui/components/QualifyCard.tsx
"use client";

import { useState } from "react";
import {
  widgetCopyFor,
  type WidgetUiLanguage,
} from "../../../../lib/widget-chat-i18n";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea"; // ✅ NEW (shadcn)

export default function QualifyCard({
  uiLang = "en",
  initial,
  onCancel,
  onSubmit,
}: {
  uiLang?: WidgetUiLanguage;
  initial?: {
    name?: string;
    email?: string;
    company?: string;
    role?: string;
    phone?: string;
    description?: string; // ✅ NEW
  };
  onCancel?: () => void;
  onSubmit: (v: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    phone?: string;
    description: string; // ✅ REQUIRED
  }) => void;
}) {
  const tc = widgetCopyFor(uiLang);

  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");

  // ✅ NEW required field
  const [description, setDescription] = useState(initial?.description ?? "");

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const canSubmit = name.trim() && emailOk && description.trim().length >= 5;

  return (
    <div className="p-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "color-mix(in srgb, var(--widget-primary) 25%, transparent)" }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--widget-primary)" }} />
          <span className="text-sm font-semibold">{tc.qualifyBookMeeting}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {tc.qualifyIntro}
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyName}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyEmail}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyCompany}</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={tc.qualifyCompanyPlaceholder} className="h-9 rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyRole}</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={tc.qualifyRolePlaceholder} className="h-9 rounded-lg" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyPhoneOptional}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tc.qualifyPhonePlaceholder} inputMode="tel" className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">{tc.qualifyWhatAchieve}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tc.qualifyBriefPlaceholder} className="min-h-[72px] resize-none rounded-lg text-sm" />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
              {tc.qualifyCancel}
            </Button>
          )}
          <Button
            disabled={!canSubmit}
            size="sm"
            className="rounded-lg px-4 text-white hover:opacity-90"
            style={{ backgroundColor: "var(--widget-primary)", color: "var(--widget-primary-text)" }}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim() || undefined,
                company: company.trim() || undefined,
                role: role.trim() || undefined,
                description: description.trim(),
              })
            }
          >
            {tc.qualifyContinueArrow}
          </Button>
        </div>
      </div>
    </div>
  );
}
