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
      <div className="rounded-lg border bg-background p-3">
        <div className="font-semibold mb-1">Tell us a bit before booking</div>
        <p className="text-sm text-muted-foreground mb-3">
          We’ll use this to tailor the call and match you with the right expert.
        </p>

        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label>Phone (optional)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              inputMode="tel"
            />
          </div>

          <div>
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>

          <div>
            <Label>Role / Job title</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>

          {/* ✅ NEW */}
          <div>
            <Label>What do you want to achieve? (required)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[90px]"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Please share a short context (at least 5 characters).
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}

          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim() || undefined,
                company: company.trim() || undefined,
                role: role.trim() || undefined,
                description: description.trim(), // ✅ REQUIRED
              })
            }
          >
            Continue to calendar
          </Button>
        </div>
      </div>
    </div>
  );
}
