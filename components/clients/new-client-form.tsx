"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Repeat,
  Package as PackageIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUBSCRIPTION_TIERS = [
  { value: "essentials_2x", label: "Essentials (2x/wk)", rate: 78000, sessionsPerWeek: 2 },
  { value: "standard_3x", label: "Standard (3x/wk)", rate: 116900, sessionsPerWeek: 3 },
  { value: "premium_4x", label: "Premium (4x/wk)", rate: 155900, sessionsPerWeek: 4 },
  { value: "recovery_monthly", label: "Recovery only", rate: 10000, sessionsPerWeek: null },
  { value: "custom", label: "Custom plan", rate: null, sessionsPerWeek: null },
] as const;

const PACKAGE_PRESETS = [
  { value: 6, label: "6-pack", priceCents: 60000 },
  { value: 12, label: "12-pack", priceCents: 114000 },
  { value: 24, label: "24-pack", priceCents: 216000 },
] as const;

type BillingChoice = "skip" | "subscription" | "package";

export function NewClientForm() {
  const router = useRouter();

  // Identity
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"active" | "lead">("active");

  // Billing choice
  const [billingChoice, setBillingChoice] = useState<BillingChoice>("skip");

  // Subscription fields
  const [subTier, setSubTier] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");
  const [customRate, setCustomRate] = useState("");

  // Package fields
  const [serviceType, setServiceType] = useState<"training" | "massage" | "pilates">("training");
  const [packageSize, setPackageSize] = useState(12);
  const [startingSession, setStartingSession] = useState(0);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildInitialPlan() {
    if (billingChoice === "skip") return undefined;

    if (billingChoice === "subscription") {
      if (!subTier) return null;
      const tierDef = SUBSCRIPTION_TIERS.find((t) => t.value === subTier);
      if (subTier === "custom") {
        if (!customLabel.trim()) return null;
        const rate = Number.parseFloat(customRate);
        if (!rate || rate <= 0) return null;
        return {
          kind: "subscription" as const,
          tier: "custom",
          custom_label: customLabel.trim(),
          monthly_rate_cents: Math.round(rate * 100),
        };
      }
      return {
        kind: "subscription" as const,
        tier: subTier,
        monthly_rate_cents: tierDef?.rate,
        sessions_per_week: tierDef?.sessionsPerWeek ?? undefined,
      };
    }

    const preset = PACKAGE_PRESETS.find((p) => p.value === packageSize);
    return {
      kind: "package" as const,
      tier: `package_${packageSize}`,
      service_type: serviceType,
      total_sessions: packageSize,
      current_session_number: startingSession,
      package_total_cents: preset?.priceCents,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const initialPlan = buildInitialPlan();
    if (billingChoice !== "skip" && !initialPlan) {
      setError(
        billingChoice === "subscription"
          ? subTier === "custom"
            ? "Custom subscription needs a label and a positive monthly rate."
            : "Pick a subscription tier."
          : "Configure the package — size and starting session number."
      );
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone: phone || undefined,
        status,
        initial_plan: initialPlan,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      router.push(`/clients/${result.client_id}`);
      router.refresh();
    } else if (res.status === 207) {
      const result = await res.json();
      // Client created, plan errored — go to profile with a warning
      alert(result.warning);
      router.push(`/clients/${result.client_id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      const baseError = err.error ?? "Could not create client.";
      const fullError = err.detail ? `${baseError} — ${err.detail}` : baseError;
      setError(fullError);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            Use the client's real email — magic-link sign-in goes here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Full name *</Label>
            <Input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Cooper"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Email *</Label>
              <Input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(619) 555-1234"
              />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-2">
              <TypeButton
                active={status === "active"}
                onClick={() => setStatus("active")}
              >
                Active client
              </TypeButton>
              <TypeButton
                active={status === "lead"}
                onClick={() => setStatus("lead")}
              >
                Lead (not yet signed)
              </TypeButton>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Initial billing */}
      <Card>
        <CardHeader>
          <CardTitle>Initial billing</CardTitle>
          <CardDescription>
            Set up their first plan now, or skip and add it from their profile later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <TypeButton
              active={billingChoice === "skip"}
              onClick={() => setBillingChoice("skip")}
            >
              Skip for now
            </TypeButton>
            <TypeButton
              active={billingChoice === "subscription"}
              onClick={() => setBillingChoice("subscription")}
            >
              <Repeat className="h-4 w-4" />
              Subscription
            </TypeButton>
            <TypeButton
              active={billingChoice === "package"}
              onClick={() => setBillingChoice("package")}
            >
              <PackageIcon className="h-4 w-4" />
              Package
            </TypeButton>
          </div>

          {billingChoice === "subscription" && (
            <div className="space-y-3 pt-2 border-t border-divider">
              <div>
                <Label>Tier</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUBSCRIPTION_TIERS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSubTier(t.value)}
                      className={`rounded-md border p-3 text-left text-sm transition-colors ${
                        subTier === t.value
                          ? "border-sky bg-sky/10 text-cream"
                          : "border-divider text-cream-dim hover:border-cream-faint"
                      }`}
                    >
                      <div className="font-medium">{t.label}</div>
                      {t.rate !== null && (
                        <div className="text-xs text-cream-faint mt-0.5">
                          ${(t.rate / 100).toLocaleString()}/month
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {subTier === "custom" && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-divider">
                  <div>
                    <Label>Plan name</Label>
                    <Input
                      placeholder="e.g. Jane Custom"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Monthly rate</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-cream-faint">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="3550.00"
                        value={customRate}
                        onChange={(e) => setCustomRate(e.target.value)}
                        className="pl-7"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {billingChoice === "package" && (
            <div className="space-y-3 pt-2 border-t border-divider">
              <div>
                <Label>Service type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["training", "massage", "pilates"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setServiceType(st)}
                      className={`rounded-md border py-2 text-sm font-medium capitalize transition-colors ${
                        serviceType === st
                          ? "border-sky bg-sky/10 text-cream"
                          : "border-divider text-cream-dim hover:border-cream-faint"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Size</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PACKAGE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPackageSize(p.value)}
                      className={`rounded-md border p-3 text-center transition-colors ${
                        packageSize === p.value
                          ? "border-sky bg-sky/10 text-cream"
                          : "border-divider text-cream-dim hover:border-cream-faint"
                      }`}
                    >
                      <div className="font-medium text-sm">{p.value} sessions</div>
                      <div className="text-xs text-cream-faint mt-0.5">
                        ${(p.priceCents / 100).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Starting session number</Label>
                <p className="text-xs text-cream-faint mb-2">
                  Leave at 0 for new clients. Set higher only when migrating
                  someone with existing sessions.
                </p>
                <Input
                  type="number"
                  min={0}
                  value={startingSession}
                  onChange={(e) => setStartingSession(Number.parseInt(e.target.value) || 0)}
                  className="w-32"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-4 py-3 text-sm text-status-limited flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/clients")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !fullName || !email}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Create client
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------ helpers ----------------------------------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
      {children}
    </label>
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-sky text-white"
          : "bg-navy-deep border border-divider text-cream-dim hover:text-cream hover:border-cream-faint"
      }`}
    >
      {children}
    </button>
  );
}
