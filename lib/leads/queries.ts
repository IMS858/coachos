import { createClient } from "@/lib/supabase/server";
import { allCatalogPages } from "@/lib/exercises/catalog";
import { leadWorkspace, type LeadRecord } from "./workspace";

export const LEAD_COLUMNS = "id,full_name,email,phone,interest,stage,source,appointments_booked,last_visited,prior_trainer,last_contacted_at,created_at,updated_at,notes";
export async function loadLeadWorkspace(db: Awaited<ReturnType<typeof createClient>>) {
  const rows = await allCatalogPages<LeadRecord>((from, to) => db.from("leads").select(LEAD_COLUMNS, { count: "exact" }).order("id").range(from, to));
  return leadWorkspace(rows);
}
