import { leadBucket } from "../leads/workspace";
/** Pure growth reporting. Research approval never establishes a consumer inquiry. */
export const GROWTH_CHANNELS = ["local_search", "referral_partnerships", "community", "workplace", "client_referrals"] as const;
export type GrowthChannel = typeof GROWTH_CHANNELS[number];
export const CHANNEL_LABELS: Record<GrowthChannel, string> = {
  local_search: "Local search & paid search", referral_partnerships: "Referral partnerships",
  community: "Community & adult recreation", workplace: "Workplace wellness", client_referrals: "Client referrals",
};
export interface GrowthCampaign {
  id: string; name: string; channel: GrowthChannel; audience: "general_population" | "private_coaching" | "both";
  area: string; offer: string; budget_cents: number | null; status: "draft" | "tracking" | "paused"; updated_at: string;
}
export interface OpportunityReview {
  candidate_id: string; campaign_id: string | null; decision: "approve" | "hold" | "dismiss";
  rationale: string; next_action: string; due_on: string | null; outreach_draft: string;
  source_updated_at: string; reviewed_by: string; updated_at: string;
}
export interface GrowthSpend {
  id: string; campaign_id: string; amount_cents: number; category: string; incurred_on: string;
  evidence_reference: string; voided_at: string | null;
}
export interface GrowthAttribution {
  lead_id: string; campaign_id: string; candidate_id: string | null; evidence: string;
  client_id: string | null; revenue_from: string | null; updated_at: string;
}
export interface GrowthPayment { id: string; client_id: string; amount_cents: number; currency: string; status: string; paid_at: string | null }
export interface GrowthLead { id: string; source: string | null; notes: string | null; stage: string; appointments_booked: number; updated_at: string; full_name: string }
export interface ResearchEvidence { organization: string; website_url: string; evidence_url: string; fit_reason: string; next_step: string; checked_on: string }
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".")
      || /^\[|^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
      || /\.(local|internal|invalid)$/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
    return url.toString();
  } catch { return null; }
}
export function researchEvidence(notes: string | null): ResearchEvidence | null {
  try {
    const v = JSON.parse(notes ?? "null");
    if (!v || v.type !== "research_opportunity" || !publicSourceUrl(v.website_url) || !publicSourceUrl(v.evidence_url)) return null;
    if (["organization", "fit_reason", "next_step", "checked_on"].some(k => typeof v[k] !== "string" || !v[k].trim())) return null;
    const date = new Date(`${v.checked_on}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checked_on) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== v.checked_on) return null;
    return { organization: v.organization, website_url: v.website_url, evidence_url: v.evidence_url, fit_reason: v.fit_reason, next_step: v.next_step, checked_on: v.checked_on };
  } catch { return null; }
}
export function opportunityState(lead: GrowthLead, review: OpportunityReview | undefined, today: string) {
  const evidence = researchEvidence(lead.notes);
  const sourceInvalid = !evidence || evidence.checked_on > today;
  const stale = !!review && new Date(review.source_updated_at).getTime() !== new Date(lead.updated_at).getTime();
  const decision = sourceInvalid || stale || !review ? "needs_review" : review.decision;
  const overdue = decision !== "dismiss" && !!review?.due_on && review.due_on <= today;
  return { evidence, sourceInvalid, stale, decision, overdue };
}
export function duplicateCandidateIds(leads: GrowthLead[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const lead of leads) {
    const evidence = researchEvidence(lead.notes);
    if (!evidence) continue;
    const key = new URL(evidence.website_url).hostname.toLowerCase().replace(/^www\./, "");
    groups.set(key, [...(groups.get(key) ?? []), lead.id]);
  }
  return new Set([...groups.values()].filter(ids => ids.length > 1).flat());
}
/** Inputs are fully loaded or the caller throws; missing source reads must never become zero. */
export function campaignMetrics(campaign: GrowthCampaign, pipeline: GrowthLead[], attributions: GrowthAttribution[], spend: GrowthSpend[], payments: GrowthPayment[]) {
  const real = new Map(pipeline.filter(lead => leadBucket(lead) === "pipeline").map(lead => [lead.id, lead]));
  const links = attributions.filter(row => row.campaign_id === campaign.id && real.has(row.lead_id));
  const leads = links.map(row => real.get(row.lead_id)!);
  const expenses = spend.filter(row => row.campaign_id === campaign.id && !row.voided_at);
  const recordedSpend = expenses.length ? expenses.reduce((sum, row) => sum + row.amount_cents, 0) : null;
  const clients = new Map(links.filter(row => row.client_id && row.revenue_from && real.get(row.lead_id)?.stage === "converted").map(row => [row.client_id!, row]));
  const seen = new Set<string>(); let receiptCount = 0, successfulPayments = 0, excludedCurrency = 0;
  for (const payment of payments) {
    const attribution = clients.get(payment.client_id);
    if (!attribution || seen.has(payment.id) || payment.status !== "succeeded" || !payment.paid_at) continue;
    // revenue_from is an explicit owner-selected UTC date, displayed as such in the UI.
    const paidAt = Date.parse(payment.paid_at), since = Date.parse(`${attribution.revenue_from}T00:00:00.000Z`);
    if (!Number.isFinite(paidAt) || !Number.isFinite(since)) throw new Error("Invalid payment attribution date.");
    if (paidAt < since) continue;
    seen.add(payment.id);
    if (payment.currency.toLowerCase() !== "usd") { excludedCurrency++; continue; }
    if (!Number.isSafeInteger(payment.amount_cents)) throw new Error("Invalid payment evidence.");
    receiptCount++; successfulPayments += payment.amount_cents;
  }
  return { inquiries: leads.length, consultations: leads.filter(lead => lead.appointments_booked > 0 || lead.stage === "booked").length,
    converted: leads.filter(lead => lead.stage === "converted").length, mappedClients: clients.size,
    recordedSpend, overBudget: recordedSpend !== null && campaign.budget_cents !== null && recordedSpend > campaign.budget_cents,
    successfulPayments: receiptCount ? successfulPayments : null, receiptCount, excludedCurrency };
}
export const CAMPAIGN_STARTERS = [
  { name: "Scripps Ranch strength & mobility", channel: "local_search", audience: "general_population", offer: "Private coaching consultation for strength, mobility and a sustainable training routine." },
  { name: "35+ private coaching & longevity", channel: "referral_partnerships", audience: "private_coaching", offer: "Individual coaching for adults 35+ who value strength, mobility and measurable progress. No inferred income or health profiling." },
  { name: "Active-adult recreation", channel: "community", audience: "both", offer: "Explore organization-level golf, racquet and recreation partnerships. Research is not a member contact list." },
  { name: "Trusted client referrals", channel: "client_referrals", audience: "both", offer: "Make it easy for a current client to introduce someone who has asked about personal training." },
] as const;
