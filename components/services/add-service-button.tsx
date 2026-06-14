"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddServiceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [dropInPrice, setDropInPrice] = useState("25");
  const [memberIncluded, setMemberIncluded] = useState(true);

  function reset() {
    setName("");
    setDescription("");
    setDuration("30");
    setDropInPrice("25");
    setMemberIncluded(true);
    setError(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the service a name.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        duration_minutes: duration ? Number(duration) : null,
        member_included: memberIncluded,
        drop_in_eligible: true,
        drop_in_price_cents: dropInPrice
          ? Math.round(Number(dropInPrice) * 100)
          : null,
        active: true,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setOpen(false);
      reset();
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.detail ?? err.error ?? "Could not create service.");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4" />
        Add new service
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-divider bg-navy-soft p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-cream">
                New service
              </h2>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-cream-faint hover:text-cream transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-cream-dim mb-1.5">
                  Name <span className="text-status-attention">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cold Plunge"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-cream-dim mb-1.5">
                  Description
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One-line description clients will see"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-cream-dim mb-1.5">
                    Duration (min)
                  </label>
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-cream-dim mb-1.5">
                    Drop-in price ($)
                  </label>
                  <Input
                    type="number"
                    value={dropInPrice}
                    onChange={(e) => setDropInPrice(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-cream-dim cursor-pointer">
                <input
                  type="checkbox"
                  checked={memberIncluded}
                  onChange={(e) => setMemberIncluded(e.target.checked)}
                  className="h-4 w-4 accent-current"
                />
                Free with training membership
              </label>

              {error && (
                <p className="text-sm text-status-attention">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create service
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
