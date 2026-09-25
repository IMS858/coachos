import test from "node:test";import assert from "node:assert/strict";
import {campaignMetrics,opportunityState,duplicateCandidateIds,publicSourceUrl,type GrowthCampaign,type GrowthLead,type GrowthAttribution,type OpportunityReview} from "../lib/growth/model";
const campaign:GrowthCampaign={id:"campaign",name:"Synthetic channel",channel:"local_search",audience:"both",area:"Synthetic area",offer:"Synthetic offer",budget_cents:10000,status:"draft",updated_at:"2026-01-01T00:00:00Z"};
const lead:GrowthLead={id:"inquiry",source:"manual",notes:null,stage:"converted",appointments_booked:1,updated_at:"2026-01-01T00:00:00Z",full_name:"Synthetic inquiry"};
const link:GrowthAttribution={lead_id:lead.id,campaign_id:campaign.id,candidate_id:null,evidence:"Synthetic source evidence",client_id:"client",revenue_from:"2026-01-01",updated_at:lead.updated_at};
const candidate:GrowthLead={...lead,id:"candidate",source:"agent_research",notes:JSON.stringify({type:"research_opportunity",organization:"Synthetic organization",website_url:"https://example.org",evidence_url:"https://example.org/community",fit_reason:"A public organization channel",next_step:"Verify the official public evidence",checked_on:"2026-01-01"})};
test("research cannot inflate a funnel even when passed as pipeline input",()=>{
  const m=campaignMetrics(campaign,[lead,candidate],[link,{...link,lead_id:candidate.id,client_id:null,revenue_from:null}],[],[]);
  assert.equal(m.inquiries,1);assert.equal(m.consultations,1);assert.equal(m.converted,1);assert.equal(m.recordedSpend,null);assert.equal(m.successfulPayments,null);
});
test("receipts are deduped, date-bounded, successful USD source evidence only",()=>{
  const p={id:"paid",client_id:"client",amount_cents:20000,currency:"usd",status:"succeeded",paid_at:"2026-01-01T00:00:00+00:00"};
  const m=campaignMetrics(campaign,[lead],[link],[{id:"expense",campaign_id:campaign.id,amount_cents:15000,category:"research",incurred_on:"2026-01-01",evidence_reference:"Synthetic invoice",voided_at:null}],[p,p,{...p,id:"refund",status:"refunded"},{...p,id:"failed",status:"failed"},{...p,id:"old",paid_at:"2025-12-31T23:59:59Z"},{...p,id:"foreign",currency:"eur"}]);
  assert.equal(m.successfulPayments,20000);assert.equal(m.receiptCount,1);assert.equal(m.excludedCurrency,1);assert.equal(m.recordedSpend,15000);assert.equal(m.overBudget,true);
});
test("source edits invalidate approval; duplicate domains are warnings, not deleted evidence",()=>{
  const review:OpportunityReview={candidate_id:candidate.id,campaign_id:campaign.id,decision:"approve",rationale:"Owner reviewed the sources",next_action:"Prepare an introduction",due_on:"2026-01-02",outreach_draft:"",source_updated_at:candidate.updated_at,reviewed_by:"owner",updated_at:candidate.updated_at};
  assert.equal(opportunityState(candidate,review,"2026-01-03").decision,"approve");assert.equal(opportunityState(candidate,review,"2026-01-03").overdue,true);
  assert.equal(opportunityState({...candidate,updated_at:"2026-01-02T00:00:00Z"},review,"2026-01-03").decision,"needs_review");
  assert.equal(duplicateCandidateIds([candidate,{...candidate,id:"second"}]).size,2);
});
test("unsafe URLs and malformed/future source dates cannot appear approved",()=>{
  for(const url of ["javascript:alert(1)","https://127.0.0.1","https://172.16.0.1","https://user:password@example.org","http://example.org","https://internal.local"])assert.equal(publicSourceUrl(url),null);
  assert.equal(opportunityState({...candidate,notes:"not json"},undefined,"2026-01-03").sourceInvalid,true);
  assert.equal(opportunityState(candidate,undefined,"2025-12-31").sourceInvalid,true);
});
