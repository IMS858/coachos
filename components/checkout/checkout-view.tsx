"use client";

import { useState } from "react";
import { Loader2, CreditCard, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

interface Client {
  id: string;
  full_name: string;
}

const CATALOG = {
  memberships: [
    { lookup_key: "essentials_2x_monthly", name: "Essentials", detail: "2× / week", price: "$780/mo" },
    { lookup_key: "standard_3x_monthly", name: "Standard", detail: "3× / week · most popular", price: "$1,169/mo" },
    { lookup_key: "premium_4x_monthly", name: "Premium", detail: "4× / week", price: "$1,559/mo" },
    { lookup_key: "recovery_monthly", name: "Recovery", detail: "Recovery access", price: "$100/mo" },
  ],
  packages: [
    { lookup_key: "package_6", name: "6-Session Package", detail: "$100/session", price: "$600" },
    { lookup_key: "package_12", name: "12-Session Package", detail: "$95/session", price: "$1,140" },
    { lookup_key: "package_24", name: "24-Session Package", detail: "$90/session", price: "$2,160" },
  ],
};

export function CheckoutView({
  clients,
  flash,
}: {
  clients: Client[];
  flash?: "success" | "canceled" | null;
}) {
  const [clientId, setClientId] = useState<string>("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const selected = clients.find((c) => c.id === clientId);
  const filtered = query
    ? clients.filter((c) => c.full_name.toLowerCase().includes(query.toLowerCase()))
    : clients;

  async function buy(lookup_key: string) {
    if (!clientId) {
      setError("Pick a client first.");
      return;
    }
    setBusyKey(lookup_key);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, lookup_key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url; // → Stripe Checkout
        return;
      }
      setError(data.detail || data.error || "Couldn't start checkout.");
    } catch {
      setError("Couldn't reach checkout. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {flash === "success" && (
        <div className="rounded-lg bg-status-optimal/10 border border-status-optimal/30 px-4 py-3 text-sm text-status-optimal flex items-center gap-2">
          <Check className="h-4 w-4" /> Payment complete. The plan is now active for the client.
        </div>
      )}
      {flash === "canceled" && (
        <div className="rounded-lg bg-status-moderate/10 border border-status-moderate/30 px-4 py-3 text-sm text-status-moderate">
          Checkout canceled — no charge was made.
        </div>
      )}

      {/* Step 1: pick client */}
      <div>
        <div className="text-xs uppercase tracking-widest text-sky mb-2">1 · Client</div>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-divider bg-navy-elev px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar name={selected.full_name} size="sm" />
              <span className="text-cream">{selected.full_name}</span>
            </div>
            <button onClick={() => setClientId("")} className="text-xs text-cream-faint hover:text-cream">
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              className="w-full bg-navy-deep border border-divider rounded-lg px-3 py-2 text-sm text-cream mb-2 focus:outline-none focus:border-sky"
              placeholder="Search clients…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClientId(c.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-navy-elev text-left"
                >
                  <Avatar name={c.full_name} size="sm" />
                  <span className="text-sm text-cream">{c.full_name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-cream-faint px-3 py-2">No matches.</p>
              )}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-status-limited">{error}</p>}

      {/* Step 2: pick product */}
      <div className={selected ? "" : "opacity-50 pointer-events-none"}>
        <div className="text-xs uppercase tracking-widest text-sky mb-2">2 · Membership</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {CATALOG.memberships.map((p) => (
            <Card key={p.lookup_key}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <div className="text-cream font-medium">{p.name}</div>
                  <div className="text-xs text-cream-faint">{p.detail}</div>
                  <div className="text-sm text-sky mt-0.5">{p.price}</div>
                </div>
                <Button size="sm" onClick={() => buy(p.lookup_key)} disabled={busyKey !== null}>
                  {busyKey === p.lookup_key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Sell
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-xs uppercase tracking-widest text-sky mb-2">Or · Session Package</div>
        <div className="grid sm:grid-cols-3 gap-3">
          {CATALOG.packages.map((p) => (
            <Card key={p.lookup_key}>
              <CardContent className="py-4">
                <div className="text-cream font-medium">{p.name}</div>
                <div className="text-xs text-cream-faint">{p.detail}</div>
                <div className="text-sm text-sky mt-0.5 mb-2">{p.price}</div>
                <Button size="sm" className="w-full" onClick={() => buy(p.lookup_key)} disabled={busyKey !== null}>
                  {busyKey === p.lookup_key ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sell"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
