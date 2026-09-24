export const LEGACY_CONTACT_SOURCES = new Set(["vagaro", "jason_contacts", "marketing"]);
export const INQUIRY_SOURCES = new Set(["website_contact", "manual", "referral", "consultation", "event_inquiry"]);
export const RESEARCH_SOURCE = "agent_research";
export type LeadBucket = "pipeline" | "contacts" | "research";
export interface LeadRecord {
  id: string; full_name: string; email: string | null; phone: string | null;
  interest: string | null; source: string | null; stage: string;
  appointments_booked: number; last_visited: string | null; prior_trainer: string | null;
  last_contacted_at: string | null; created_at: string; updated_at: string; notes: string | null;
}
export function hasWebsiteInquiry(notes: string | null): boolean {
  return (notes ?? "").split("\n").some(line => {
    const match = /^\[Website enquiry:[A-Za-z0-9_-]+\] (.+)$/.exec(line);
    if (!match) return false;
    try { const data: unknown = JSON.parse(match[1]); return !!data && typeof data === "object" && "message" in data && typeof data.message === "string" && !!data.message.trim(); } catch { return false; }
  });
}
/** Import status 'new' does not establish present interest. Preserve the source. */
export function leadBucket(lead: Pick<LeadRecord, "source" | "notes">): LeadBucket {
  if (lead.source === RESEARCH_SOURCE) return "research";
  if (INQUIRY_SOURCES.has(lead.source ?? "") || hasWebsiteInquiry(lead.notes)) return "pipeline";
  return "contacts";
}
export function leadWorkspace(rows: LeadRecord[]) {
  const pipeline = rows.filter(row => leadBucket(row) === "pipeline");
  const contacts = rows.filter(row => leadBucket(row) === "contacts");
  const research = rows.filter(row => leadBucket(row) === "research");
  const open = pipeline.filter(row => !["converted", "not_interested"].includes(row.stage));
  return { pipeline, contacts, research, open, untouched: open.filter(row => !row.last_contacted_at), booked: open.filter(row => row.stage === "booked"), converted: pipeline.filter(row => row.stage === "converted") };
}
export function sourceLabel(source: string | null): string {
  return ({ vagaro: "Historical Vagaro contact", jason_contacts: "Jason's contacts", marketing: "Historical marketing list", website_contact: "Website inquiry", manual: "Manually added inquiry", agent_research: "Research candidate — not qualified" } as Record<string, string>)[source ?? ""] ?? (source?.replaceAll("_", " ") || "Source needs review");
}

export function researchBrief(area: string, lane: string): string {
  return `Research new business opportunities for Innovative Movement Solutions (IMS Fitness), a personal training studio in Scripps Ranch, San Diego.\nArea: ${area.trim().slice(0, 160) || "Scripps Ranch and nearby San Diego communities"}\nResearch lane: ${lane}\n\nFind up to 10 current organizations, public events or employer/community partnerships with a documented fit for in-person personal training. Use official public websites and cite the exact evidence URL and the date checked. These are research candidates, NOT confirmed consumer leads. Explain the fit, proposed first step and what remains unknown. Do not invent demand, contact details, decision-makers or claimed relationships. Do not reuse the IMS historical contact list. Do not scrape individuals, patient/member lists, social followers or sensitive health data. Use public organization contact channels only. Never send email/SMS, submit a contact form, buy data, or add anyone to a marketing list.\n\nReturn a JSON array of objects with: organization, website_url (HTTPS), evidence_url (HTTPS), fit_reason, next_step, checked_on (YYYY-MM-DD). Only return source-backed findings; omit unsupported candidates. An IMS owner will review before qualification or any outreach.`;
}
