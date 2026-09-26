import { z } from "zod";
import { GROWTH_CHANNELS } from "./model";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Use a real date.");
const version = z.string().refine(v => Number.isFinite(Date.parse(v)), "Reload the latest record.");
const base = { request_id: z.string().uuid() };
export const growthCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("save_campaign"), campaign_id: z.string().uuid().nullable(), expected_updated_at: version.nullable(),
    name: z.string().trim().min(2).max(160), channel: z.enum(GROWTH_CHANNELS), audience: z.enum(["general_population", "private_coaching", "both"]),
    area: z.string().trim().min(2).max(160), offer: z.string().trim().min(10).max(1000), budget_cents: z.number().int().min(0).max(10000000).nullable(),
    status: z.enum(["draft", "tracking", "paused"]) }).strict(),
  z.object({ ...base, action: z.literal("review_opportunity"), candidate_id: z.string().uuid(), campaign_id: z.string().uuid().nullable(),
    expected_source_updated_at: version, expected_updated_at: version.nullable(), decision: z.enum(["approve", "hold", "dismiss"]),
    rationale: z.string().trim().min(10).max(2000), next_action: z.string().trim().max(500), due_on: date.nullable(), outreach_draft: z.string().max(5000) }).strict(),
  z.object({ ...base, action: z.literal("record_spend"), campaign_id: z.string().uuid(), amount_cents: z.number().int().min(1).max(10000000),
    category: z.enum(["research", "advertising", "creative", "other"]), incurred_on: date, evidence_reference: z.string().trim().min(5).max(500) }).strict(),
  z.object({ ...base, action: z.literal("link_inquiry"), lead_id: z.string().uuid(), campaign_id: z.string().uuid(), candidate_id: z.string().uuid().nullable(),
    expected_source_updated_at: version, expected_updated_at: version.nullable(), evidence: z.string().trim().min(10).max(2000),
    client_id: z.string().uuid().nullable(), revenue_from: date.nullable() }).strict(),
]);
export type GrowthCommand = z.infer<typeof growthCommandSchema>;
