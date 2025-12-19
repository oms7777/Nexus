"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

export default function QualifyCard({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: { name?: string; email?: string; company?: string; role?: string; phone?: string };
  onCancel?: () => void;
  onSubmit: (v: { name: string; email: string; company?: string; role?: string; phone?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? ""); // ✅ NEW

  const canSubmit = name.trim() && /\S+@\S+\.\S+/.test(email);

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
                phone: phone.trim() || undefined, // ✅ NEW
                company: company.trim() || undefined,
                role: role.trim() || undefined,
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
