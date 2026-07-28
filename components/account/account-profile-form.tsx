"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Clients can correct their own name and phone. Email is shown but not
 * editable — it's their login identity, so changing it is a staff action.
 */
export function AccountProfileForm({
  initialName,
  initialPhone,
  email,
}: {
  initialName: string;
  initialPhone: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== initialName || phone !== initialPhone;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSaved(true);
      else setError(data.error ?? "Couldn't save.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-xs font-medium text-cream-dim mb-1.5";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={label} htmlFor="acct-name">Name</label>
        <Input id="acct-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
      </div>
      <div>
        <label className={label} htmlFor="acct-phone">Phone</label>
        <Input id="acct-phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="(619) 555-0100" />
      </div>
      <div>
        <label className={label}>Email</label>
        <div className="rounded-lg border border-divider bg-navy-elev px-3 py-2 text-sm text-cream-faint">
          {email}
        </div>
        <p className="text-xs text-cream-faint mt-1">
          This is your sign-in address — ask Jason if it needs changing.
        </p>
      </div>

      {error && <p className="text-sm text-status-limited">{error}</p>}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy || !dirty || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
        {saved && (
          <span className="text-sm text-status-optimal flex items-center gap-1">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
