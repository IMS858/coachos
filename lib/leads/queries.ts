import {createClient} from '@/lib/supabase/server';
import {allCatalogPages} from '@/lib/exercises/catalog';
import {leadWorkspace,type LeadRecord} from './workspace';
import type {LeadWorkflow} from './relationships';
export const LEAD_COLUMNS='id,full_name,email,phone,interest,stage,source,appointments_booked,last_visited,prior_trainer,last_contacted_at,created_at,updated_at,notes';
export async function loadLeadWorkspace(db:Awaited<ReturnType<typeof createClient>>){const [rows,work]=await Promise.all([allCatalogPages<LeadRecord>((a,b)=>db.from('leads').select(LEAD_COLUMNS,{count:'exact'}).order('id').range(a,b)),allCatalogPages<LeadWorkflow>((a,b)=>db.from('lead_workflows').select('*',{count:'exact'}).order('lead_id').range(a,b) as any)]);const workflows=new Map(work.map(w=>[w.lead_id,w]));return leadWorkspace(rows.map(row=>({...row,workflow:workflows.get(row.id)})));}
