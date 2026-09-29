import {NextResponse,type NextRequest} from 'next/server';
import {smallJson} from '@/lib/media/request';
import {requireGrowthOwner,GrowthAccessError} from '@/lib/growth/owner-access';
import {researchControlSchema} from '@/lib/growth/research-engine';
import {researchSnapshot,startResearch,pollResearch} from '@/lib/growth/research-server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){try{const {db}=await requireGrowthOwner();return reply(await researchSnapshot(db));}catch(e){return reply({error:e instanceof Error?e.message:'Research unavailable.'},e instanceof GrowthAccessError?e.status:503);}}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 try{const {db,user}=await requireGrowthOwner();let command;try{command=researchControlSchema.parse(await smallJson(request,20000));}catch{return reply({error:'Review the research controls and confirmations.'},400);}
  if(command.action==='settings'){const r=await db.rpc('save_growth_research_settings',{p_request:command.request_id,p_expected:command.expected_revision,p_config:command.config});if(r.error)return reply({error:'Settings changed or were not saved. Refresh before changing the request.'},['40001','23505'].includes(r.error.code)?409:503);return reply(r.data);}
  if(command.action==='run'){const environment=process.env.VERCEL_ENV==='production'?'production':'preview';const run=await startResearch(db,user.id,command.request_id,command.expected_revision,'manual',environment);return reply({ok:true,request_id:command.request_id,run});}
  const run=await pollResearch(db,command.run_id,undefined,command.action==='cancel');return reply({ok:true,run});
 }catch(e){return reply({error:e instanceof Error?e.message:'Research unconfirmed. Recover the same run.'},e instanceof GrowthAccessError?e.status:503);}
}
