// apps/widget/modules/widget/ui/components/QualifyCard.tsx
"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea"; // ✅ NEW (shadcn)

export default function QualifyCard({
  initial,
  onCancel,
  onSubmit,
}: {
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
      <div className="rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
          <span className="text-sm font-semibold">Book a meeting</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          We’ll use this to tailor the call and match you with the right expert.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." className="h-9 rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Role</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. PM" className="h-9 rounded-lg" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" inputMode="tel" className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">What do you want to achieve?</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief context…" className="min-h-[72px] resize-none rounded-lg text-sm" />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
              Cancel
            </Button>
          )}
          <Button
            disabled={!canSubmit}
            size="sm"
            className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-rose-500 px-4 hover:from-fuchsia-700 hover:to-rose-600"
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
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
