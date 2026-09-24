"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, CreditCard, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

interface Client { id: string; full_name: string }
const CATALOG = {
  memberships: [
    { lookup_key: "essentials_2x_monthly", name: "Essentials", detail: "2 sessions / week" },
    { lookup_key: "standard_3x_monthly", name: "Standard", detail: "3 sessions / week" },
    { lookup_key: "premium_4x_monthly", name: "Premium", detail: "4 sessions / week" },
    { lookup_key: "recovery_monthly", name: "Recovery", detail: "Recovery access" },
  ],
  packages: [
    { lookup_key: "package_6", name: "6-session package", detail: "Training package" },
    { lookup_key: "package_12", name: "12-session package", detail: "Training package" },
    { lookup_key: "package_24", name: "24-session package", detail: "Training package" },
  ],
};

export function CheckoutView({ clients, flash, initialClientId }: {
  clients: Client[];
  flash?: "success" | "canceled" | null;
  initialClientId?: string;
}) {
  const [clientId, setClientId] = useState(clients.some((client) => client.id === initialClientId) ? initialClientId! : "");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const submitting = useRef(false);
  const selected = clients.find((client) => client.id === clientId);
  const filtered = clients.filter((client) => client.full_name.toLowerCase().includes(query.trim().toLowerCase()));

  async function buy(lookupKey: string) {
    if (submitting.current) return;
    if (!selected) { setError("Choose a client first."); return; }
    submitting.current = true;
    setBusyKey(lookupKey);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected.id, lookup_key: lookupKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error("checkout_unavailable");
      const destination = new URL(data.url);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com" || destination.username || destination.password) {
        throw new Error("invalid_checkout_destination");
      }
      window.location.assign(destination.toString());
    } catch {
      setError("Checkout could not be opened. Check the connection and catalog configuration before trying again.");
    } finally {
      submitting.current = false;
      setBusyKey(null);
    }
  }

  return <div className="flex min-w-0 flex-col gap-6">
    {flash === "success" && <div role="status" className="rounded-2xl border border-sky/30 bg-sky/5 p-4 text-sm text-cream">
      <Info aria-hidden="true" className="mb-2 h-5 w-5 text-sky" />Returned from Stripe. Check the payment record and client plan before confirming activation. This return link is not proof of payment.
      <Link href="/financials" className="mt-2 flex min-h-11 w-fit items-center font-semibold text-sky-deep underline">Review payment records</Link>
    </div>}
    {flash === "canceled" && <div role="status" className="rounded-2xl border border-divider bg-white p-4 text-sm text-cream-dim">Checkout was closed. Review the payment record before trying again if the client attempted payment.</div>}

    <section aria-labelledby="checkout-client">
      <h2 id="checkout-client" className="mb-3 text-sm font-semibold text-cream">1 · Choose client</h2>
      {selected ? <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-divider bg-white p-4">
        <div className="flex min-w-0 items-center gap-3"><Avatar name={selected.full_name} size="sm" /><span className="break-words font-medium text-cream">{selected.full_name}</span></div>
        <button type="button" disabled={busyKey !== null} onClick={() => setClientId("")} className="min-h-11 shrink-0 px-2 text-sm font-medium text-sky-deep disabled:opacity-50">Change</button>
      </div> : <>
        <label htmlFor="checkout-client-search" className="mb-1.5 block text-sm text-cream-dim">Search by name</label>
        <input id="checkout-client-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          className="mb-2 min-h-12 w-full rounded-xl border border-divider bg-white px-4 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky" />
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl border border-divider bg-white p-1">
          {filtered.map((client) => <button key={client.id} type="button" onClick={() => setClientId(client.id)}
            className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-left text-cream hover:bg-sky/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"><Avatar name={client.full_name} size="sm" /><span className="break-words text-sm">{client.full_name}</span></button>)}
          {filtered.length === 0 && <p className="p-4 text-sm text-cream-dim">{clients.length === 0 ? "No client records available for checkout." : "No matching clients."}</p>}
        </div>
      </>}
    </section>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <fieldset disabled={!selected || busyKey !== null} className="min-w-0 space-y-5 disabled:opacity-60">
      <legend className="mb-2 text-sm font-semibold text-cream">2 · Choose a plan</legend>
      <p className="text-sm text-cream-dim">Final price and billing terms are shown in Stripe before payment. No prices are loaded on this page.</p>
      {(["memberships", "packages"] as const).map((kind) => <section key={kind} aria-label={kind}>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cream-dim">{kind === "memberships" ? "Memberships" : "Session packages"}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATALOG[kind].map((product) => <Card key={product.lookup_key}><CardContent className="flex flex-col gap-3 pt-5">
            <div><h4 className="font-semibold text-cream">{product.name}</h4><p className="mt-1 text-sm text-cream-dim">{product.detail}</p></div>
            <Button type="button" className="min-h-12 w-full rounded-xl" disabled={!selected || busyKey !== null} onClick={() => void buy(product.lookup_key)}>
              {busyKey === product.lookup_key ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CreditCard aria-hidden="true" className="h-4 w-4" />}
              {busyKey === product.lookup_key ? "Opening checkout…" : "Review in Stripe"}
            </Button>
          </CardContent></Card>)}
        </div>
      </section>)}
    </fieldset>
  </div>;
}
