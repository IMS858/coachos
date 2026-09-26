import { createClient } from "@/lib/supabase/server";
import { allCatalogPages } from "@/lib/exercises/catalog";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { campaignMetrics, type GrowthCampaign, type OpportunityReview, type GrowthSpend, type GrowthAttribution, type GrowthPayment } from "./model";

export async function loadGrowthCenter(db: Awaited<ReturnType<typeof createClient>>) {
  const [campaigns, reviews, spend, attributions, workspace, profiles, clientRows] = await Promise.all([
    allCatalogPages<GrowthCampaign>((from,to) => db.from("growth_campaigns").select("id,name,channel,audience,area,offer,budget_cents,status,updated_at", {count:"exact"}).order("id").range(from,to)),
    allCatalogPages<OpportunityReview>((from,to) => db.from("growth_opportunity_reviews").select("candidate_id,campaign_id,decision,rationale,next_action,due_on,outreach_draft,source_updated_at,reviewed_by,updated_at", {count:"exact"}).order("candidate_id").range(from,to)),
    allCatalogPages<GrowthSpend>((from,to) => db.from("growth_spend").select("id,campaign_id,amount_cents,category,incurred_on,evidence_reference,voided_at", {count:"exact"}).order("id").range(from,to)),
    allCatalogPages<GrowthAttribution>((from,to) => db.from("growth_attributions").select("lead_id,campaign_id,candidate_id,evidence,client_id,revenue_from,updated_at", {count:"exact"}).order("lead_id").range(from,to)),
    loadLeadWorkspace(db),
    allCatalogPages<{id:string;full_name:string}>((from,to) => db.from("profiles").select("id,full_name", {count:"exact"}).eq("role","client").is("deleted_at",null).order("id").range(from,to)),
    allCatalogPages<{id:string}>((from,to) => db.from("clients").select("id", {count:"exact"}).order("id").range(from,to)),
  ]);
  const clientIds = [...new Set(attributions.flatMap(row => row.client_id ? [row.client_id] : []))];
  const payments: GrowthPayment[] = [];
  // Bound IN queries and paginate every result; a server row cap is never a financial total.
  for (let index=0; index<clientIds.length; index+=100) {
    payments.push(...await allCatalogPages<GrowthPayment>((from,to) => db.from("payments")
      .select("id,client_id,amount_cents,currency,status,paid_at", {count:"exact"})
      .in("client_id",clientIds.slice(index,index+100)).order("id").range(from,to)));
  }
  const ids = new Set(clientRows.map(row => row.id));
  return { campaigns, reviews, spend, attributions, pipeline: workspace.pipeline, research: workspace.research,
    clients: profiles.filter(row => ids.has(row.id)).sort((a,b) => a.full_name.localeCompare(b.full_name)),
    metrics: campaigns.map(campaign => ({campaign_id:campaign.id,...campaignMetrics(campaign,workspace.pipeline,attributions,spend,payments)})) };
}
export type GrowthCenterData = Awaited<ReturnType<typeof loadGrowthCenter>>;
