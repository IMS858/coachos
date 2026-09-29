import {timingSafeEqual,createHash} from 'node:crypto';
import {NextResponse,type NextRequest} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {startResearch,pollResearch} from '@/lib/growth/research-server';
import {researchProviderReady} from '@/lib/growth/research-provider';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET,provided=request.headers.get('authorization')??'',expected='Bearer '+secret;
 if(!secret||provided.length!==expected.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return reply({error:'Unauthorized.'},401);
 // Preview deployments cannot silently create a second daily paid radar.
 if(process.env.VERCEL_ENV!=='production')return reply({skipped:'Automatic Radar is production-only. Use the authenticated manual run in preview.'});
 if(!researchProviderReady())return reply({skipped:'Research provider disabled.'});
 const db=createServiceClient(),settings=await db.from('growth_research_settings').select('owner_id,revision,config').eq('singleton',true).maybeSingle();
 if(settings.error)return reply({error:'Research configuration unavailable.'},503);if(!settings.data?.config?.radar_enabled||!settings.data.config.enabled)return reply({skipped:'Owner Radar toggle is off.'});
 const owner=settings.data.owner_id,actor=await db.from('profiles').select('role,deleted_at').eq('id',owner).maybeSingle();if(actor.error||actor.data?.role!=='owner'||actor.data.deleted_at)return reply({skipped:'Radar authorizing owner is not active.'});
 try{
  const pending=await db.from('growth_research_runs').select('id').eq('environment','production').in('status',['researching','unconfirmed']).not('response_id','is',null).order('created_at',{ascending:false}).limit(2);if(pending.error)throw Error('Run history unavailable.');
  for(const run of pending.data??[])await pollResearch(db,run.id);
  const today=new Date().toISOString().slice(0,10),hex=createHash('sha256').update('ims-growth-radar:'+today).digest('hex'),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const run=await startResearch(db,owner,id,settings.data.revision,'radar','production');return reply({ok:true,id:run.id,status:run.status,outreach_sent:false});
 }catch{return reply({error:'Radar did not confirm completion. Inspect Research Desk run history; no blind retries or outreach.'},503);}
}
