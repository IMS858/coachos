"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Plus,
  Minus,
  Trash2,
  Loader2,
  AlertCircle,
  Repeat,
  Package as PackageIcon,
  Check,
  RotateCcw,
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
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

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

const SERVICE_TYPES = [
  { value: "training", label: "Training" },
  { value: "massage", label: "Massage" },
  { value: "pilates", label: "Pilates" },
] as const;

interface ProfileData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url?: string | null;
}

interface Plan {
  id: string;
  kind: "subscription" | "package";
  tier: string;
  service_type: string | null;
  custom_label: string | null;
  status: string;
  current_session_number: number | null;
  total_sessions: number | null;
  sessions_used: number | null;
  monthly_rate_cents: number | null;
  sessions_per_week: number | null;
  package_total_cents: number | null;
  start_date: string;
  notes: string | null;
}

interface ClientEditorProps {
  clientId: string;
  initialProfile: ProfileData;
  initialPlans: Plan[];
}

export function ClientEditor({
  clientId,
  initialProfile,
  initialPlans,
}: ClientEditorProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [profile, setProfile] = useState(initialProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [plans, setPlans] = useState(initialPlans);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  const activePlans = plans.filter((p) => p.status === "active");
  const inactivePlans = plans.filter((p) => p.status !== "active");

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "profile",
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        avatar_url: profile.avatar_url || null,
      }),
    });
    setProfileSaving(false);
    if (res.ok) {
      setProfileMessage("Saved.");
      startTransition(() => router.refresh());
    } else {
      setProfileMessage("Error saving");
    }
  }

  async function addPlan(payload: any) {
    const res = await fetch(`/api/clients/${clientId}/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const { plan } = await res.json();
      setPlans([plan, ...plans]);
      setShowAddPanel(false);
      startTransition(() => router.refresh());
      return { ok: true };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error ?? "Save failed" };
  }

  async function updatePlan(planId: string, patch: any) {
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setPlans(plans.map((p) => (p.id === planId ? { ...p, ...patch } : p)));
      startTransition(() => router.refresh());
      return { ok: true };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error ?? "Save failed" };
  }

  async function cancelPlan(planId: string) {
    const res = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    if (res.ok) {
      setPlans(
        plans.map((p) =>
          p.id === planId ? { ...p, status: "cancelled" } : p
        )
      );
      startTransition(() => router.refresh());
    }
  }

  async function reactivatePlan(planId: string) {
    setReactivateError(null);
    const result = await updatePlan(planId, { status: "active" });
    if (!result.ok) {
      setReactivateError(result.error ?? null);
    }
  }

  const totalMonthly = activePlans
    .filter((p) => p.kind === "subscription")
    .reduce((sum, p) => sum + (p.monthly_rate_cents ?? 0), 0);
  const activePackagesByService = activePlans.filter((p) => p.kind === "package");

  return (
    <>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-navy-deep border border-divider flex items-center justify-center shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-cream-faint">
                {profile.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.full_name}
            </h1>
            <p className="text-sm text-cream-dim mt-1">
              {profile.email}
              {profile.phone ? ` · ${profile.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          {totalMonthly > 0 && (
            <div>
              <div className="text-xs text-cream-faint uppercase tracking-wider">
                Monthly
              </div>
              <div className="text-lg font-semibold text-cream">
                {formatCurrency(totalMonthly)}
              </div>
            </div>
          )}
          {activePackagesByService.length > 0 && (
            <div>
              <div className="text-xs text-cream-faint uppercase tracking-wider">
                Packages
              </div>
              <div className="text-lg font-semibold text-cream">
                {activePackagesByService.length}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active Plans</h2>
            <Button
              size="sm"
              onClick={() => setShowAddPanel(!showAddPanel)}
              variant={showAddPanel ? "secondary" : "primary"}
            >
              {showAddPanel ? "Cancel" : (
                <>
                  <Plus className="h-4 w-4" />
                  Add plan
                </>
              )}
            </Button>
          </div>

          {showAddPanel && (
            <AddPlanPanel
              onAdd={addPlan}
              onCancel={() => setShowAddPanel(false)}
            />
          )}

          {activePlans.length === 0 && !showAddPanel && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-cream-faint italic">
                  No active plans. Click "Add plan" to start.
                </p>
              </CardContent>
            </Card>
          )}

          {activePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onUpdate={(patch) => updatePlan(plan.id, patch)}
              onCancel={() => cancelPlan(plan.id)}
            />
          ))}

          {/* Past plans with Reactivate */}
          {inactivePlans.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-cream-faint cursor-pointer hover:text-cream-dim">
                Past plans ({inactivePlans.length})
              </summary>
              <div className="mt-3 space-y-2">
                {reactivateError && (
                  <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {reactivateError}
                  </div>
                )}
                {inactivePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-md border border-divider bg-navy-deep p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-cream-dim truncate">
                          {planLabel(plan)}
                          {plan.kind === "package" && plan.current_session_number !== null && (
                            <span className="text-cream-faint ml-2">
                              #{plan.current_session_number}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-cream-faint">
                          {plan.status} ·{" "}
                          {new Date(plan.start_date).toLocaleDateString("en-US")}
                        </div>
                      </div>
                      {plan.status === "cancelled" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => reactivatePlan(plan.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  value={profile.full_name}
                  onChange={(e) =>
                    setProfile({ ...profile, full_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({ ...profile, email: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={profile.phone ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Photo URL</Label>
                <Input
                  type="url"
                  placeholder="https://… (paste an image link)"
                  value={profile.avatar_url ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, avatar_url: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-divider">
                <span className="text-xs text-cream-faint">{profileMessage}</span>
                <Button onClick={saveProfile} disabled={profileSaving} size="sm">
                  {profileSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   ADD PLAN PANEL
   ============================================================================ */

function AddPlanPanel({
  onAdd,
  onCancel,
}: {
  onAdd: (payload: any) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<"subscription" | "package">("subscription");
  const [tier, setTier] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [packageSize, setPackageSize] = useState(12);
  const [serviceType, setServiceType] = useState<string>("training");
  const [sessionCount, setSessionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);

    const payload: any = { kind };

    if (kind === "subscription") {
      if (!tier) {
        setError("Pick a tier");
        setSaving(false);
        return;
      }
      payload.tier = tier;
      const tierDef = SUBSCRIPTION_TIERS.find((t) => t.value === tier);
      if (tier === "custom") {
        if (!customLabel.trim()) {
          setError("Custom plan needs a name");
          setSaving(false);
          return;
        }
        const rate = Number.parseFloat(customRate);
        if (!rate || rate <= 0) {
          setError("Custom plan needs a monthly rate");
          setSaving(false);
          return;
        }
        payload.custom_label = customLabel.trim();
        payload.monthly_rate_cents = Math.round(rate * 100);
      } else {
        payload.monthly_rate_cents = tierDef?.rate;
        payload.sessions_per_week = tierDef?.sessionsPerWeek;
      }
    } else {
      payload.tier = `package_${packageSize}`;
      payload.service_type = serviceType;
      payload.total_sessions = packageSize;
      payload.current_session_number = sessionCount;
      payload.sessions_used = sessionCount;
      const preset = PACKAGE_PRESETS.find((p) => p.value === packageSize);
      payload.package_total_cents = preset?.priceCents;
    }

    const result = await onAdd(payload);
    setSaving(false);
    if (!result.ok) setError(result.error ?? "Save failed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a plan</CardTitle>
        <CardDescription>
          Subscriptions bill monthly. Packages count down as sessions complete.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind("subscription")}
            className={`rounded-md border p-3 flex items-center gap-2 transition-colors ${
              kind === "subscription"
                ? "border-sky bg-sky/10"
                : "border-divider hover:border-cream-faint"
            }`}
          >
            <Repeat className="h-4 w-4" />
            <span className="text-sm font-medium">Subscription</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("package")}
            className={`rounded-md border p-3 flex items-center gap-2 transition-colors ${
              kind === "package"
                ? "border-sky bg-sky/10"
                : "border-divider hover:border-cream-faint"
            }`}
          >
            <PackageIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Package</span>
          </button>
        </div>

        {kind === "subscription" && (
          <div className="space-y-3">
            <div>
              <Label>Tier</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                {SUBSCRIPTION_TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTier(t.value)}
                    className={`rounded-md border p-3 text-left text-sm transition-colors ${
                      tier === t.value
                        ? "border-sky bg-sky/10 text-cream"
                        : "border-divider text-cream-dim hover:border-cream-faint"
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    {t.rate !== null && (
                      <div className="text-xs text-cream-faint mt-0.5">
                        {formatCurrency(t.rate)}/month
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {tier === "custom" && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-divider">
                <div>
                  <Label>Plan name</Label>
                  <Input
                    placeholder="e.g. Nikki Custom"
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

        {kind === "package" && (
          <div className="space-y-3">
            <div>
              <Label>Service type</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {SERVICE_TYPES.map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setServiceType(st.value)}
                    className={`rounded-md border py-2 text-sm font-medium transition-colors ${
                      serviceType === st.value
                        ? "border-sky bg-sky/10 text-cream"
                        : "border-divider text-cream-dim hover:border-cream-faint"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Size</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
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
                      {formatCurrency(p.priceCents)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Starting session count</Label>
              <p className="text-xs text-cream-faint mb-2">
                For new packages, leave at 0. For migrated/existing clients, enter the current count.
              </p>
              <CounterInput value={sessionCount} onChange={setSessionCount} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="text-xs">
            {error && (
              <span className="text-status-limited flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {error}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Add plan
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================================
   PLAN CARD
   ============================================================================ */

function PlanCard({
  plan,
  onUpdate,
  onCancel,
}: {
  plan: Plan;
  onUpdate: (patch: any) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sessionCount, setSessionCount] = useState(plan.current_session_number ?? 0);
  const [customRate, setCustomRate] = useState(
    plan.monthly_rate_cents ? (plan.monthly_rate_cents / 100).toString() : ""
  );
  const [customLabel, setCustomLabel] = useState(plan.custom_label ?? "");
  const [saving, setSaving] = useState(false);

  const isCustom = plan.tier === "custom";
  const isPackage = plan.kind === "package";

  async function saveQuick(patch: any) {
    setSaving(true);
    const result = await onUpdate(patch);
    setSaving(false);
    if (result.ok) setEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {plan.kind === "subscription" ? (
              <Badge tone="sky">
                <Repeat className="h-3 w-3 mr-1" />
                Subscription
              </Badge>
            ) : (
              <Badge tone="optimal">
                <PackageIcon className="h-3 w-3 mr-1" />
                {plan.service_type
                  ? plan.service_type[0]!.toUpperCase() + plan.service_type.slice(1)
                  : "Package"}
              </Badge>
            )}
            <CardTitle className="text-base">{planLabel(plan)}</CardTitle>
          </div>
          <CardDescription className="mt-1">
            {plan.kind === "subscription"
              ? `${formatCurrency(plan.monthly_rate_cents ?? 0)}/month`
              : `${plan.total_sessions}-session pack`}
            {" · started "}
            {new Date(plan.start_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          title="Cancel this plan"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {isPackage && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="!mb-0">Session count</Label>
              <span className="text-xs text-cream-faint">
                next = #{sessionCount + 1}
              </span>
            </div>
            <CounterInput
              value={sessionCount}
              onChange={async (v) => {
                setSessionCount(v);
                saveQuick({
                  current_session_number: v,
                  sessions_used: v,
                });
              }}
            />
          </div>
        )}

        {isCustom && editing && (
          <div className="space-y-2 pt-2 border-t border-divider">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Plan name</Label>
                <Input
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
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={() =>
                  saveQuick({
                    custom_label: customLabel.trim(),
                    monthly_rate_cents: Math.round(
                      Number.parseFloat(customRate) * 100
                    ),
                  })
                }
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}

        {isCustom && !editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="!h-7 text-xs"
          >
            Edit name & rate
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================================
   COUNTER + HELPERS
   ============================================================================ */

function CounterInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value) || 0)}
        className="w-24 text-center text-base font-semibold"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5 ${className ?? ""}`}
    >
      {children}
    </label>
  );
}

function planLabel(plan: Plan): string {
  if (plan.tier === "custom" && plan.custom_label) return plan.custom_label;
  switch (plan.tier) {
    case "essentials_2x": return "Essentials (2x/wk)";
    case "standard_3x": return "Standard (3x/wk)";
    case "premium_4x": return "Premium (4x/wk)";
    case "recovery_monthly": return "Recovery";
    case "custom": return "Custom plan";
    case "package_6": return "6-session pack";
    case "package_12": return "12-session pack";
    case "package_24": return "24-session pack";
    default: return plan.tier;
  }
}
