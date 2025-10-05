"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

export default function QualifyModal() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [useCase, setUseCase] = React.useState("");

  React.useEffect(() => {
    const onOpen = (e: any) => {
      const d = e.detail || {};
      if (d.name) setName(d.name);
      if (d.email) setEmail(d.email);
      setOpen(true);
    };
    window.addEventListener("nexus:open-qualify", onOpen);
    return () => window.removeEventListener("nexus:open-qualify", onOpen);
  }, []);

  const submit = () => {
    (window as any).__nexusContact = { name, email, company, useCase };
    window.dispatchEvent(
      new CustomEvent("nexus:open-inline-booker", { detail: { name, email } })
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tell us a bit before booking</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>What do you want to achieve?</Label>
            <Input
              value={useCase}
              onChange={e => setUseCase(e.target.value)}
              placeholder="Pricing, integrations, support…"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>Continue to calendar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
