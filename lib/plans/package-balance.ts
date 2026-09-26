export type PackageCounterInput = {
  id?: string | null;
  kind?: string | null;
  service_type?: string | null;
  status?: string | null;
  total_sessions?: number | null;
  sessions_used?: number | null;
  current_session_number?: number | null;
};

export type PackageBalanceEvidence =
  | { status: "none"; remaining: null; used: null; total: null; overrun: null; planId: null }
  | { status: "ambiguous"; remaining: null; used: null; total: null; overrun: null; planId: null }
  | { status: "unknown"; remaining: null; used: number | null; total: number | null; overrun: null; planId: string | null }
  | { status: "known"; remaining: number; used: number; total: number; overrun: number; planId: string | null };

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function packageBalanceEvidence(plan: PackageCounterInput): PackageBalanceEvidence {
  const total = nonNegativeInteger(plan.total_sessions) ? Number(plan.total_sessions) : null;
  const used = nonNegativeInteger(plan.sessions_used) ? Number(plan.sessions_used) : null;
  const current = nonNegativeInteger(plan.current_session_number) ? Number(plan.current_session_number) : null;
  const planId = typeof plan.id === "string" ? plan.id : null;

  if (total === null || used === null) {
    return { status: "unknown", remaining: null, used, total, overrun: null, planId };
  }
  if (current !== null && current !== used) {
    return { status: "unknown", remaining: null, used, total, overrun: null, planId };
  }
  return {
    status: "known",
    remaining: Math.max(0, total - used),
    used,
    total,
    overrun: Math.max(0, used - total),
    planId,
  };
}

export function activeTrainingPackageBalance(plans: PackageCounterInput[], linkedPlanId?: string | null): PackageBalanceEvidence {
  const candidates = plans.filter(plan => plan.kind === "package"
    && (plan.status === undefined || plan.status === null || plan.status === "active")
    && (plan.service_type === undefined || plan.service_type === null || plan.service_type === "training"));

  if (linkedPlanId) {
    const linked = candidates.find(plan => plan.id === linkedPlanId);
    return linked ? packageBalanceEvidence(linked) : { status: "unknown", remaining: null, used: null, total: null, overrun: null, planId: linkedPlanId };
  }
  if (candidates.length === 0) return { status: "none", remaining: null, used: null, total: null, overrun: null, planId: null };
  if (candidates.length > 1) return { status: "ambiguous", remaining: null, used: null, total: null, overrun: null, planId: null };
  return packageBalanceEvidence(candidates[0]);
}

export function packageBalanceLabel(evidence: PackageBalanceEvidence): string {
  if (evidence.status === "none") return "No active training package";
  if (evidence.status === "ambiguous") return "Multiple active packages · review";
  if (evidence.status === "unknown") return "Package balance needs review";
  if (evidence.overrun > 0) return `0 remaining · ${evidence.overrun} over package`;
  return `${evidence.remaining} session${evidence.remaining === 1 ? "" : "s"} remaining`;
}
