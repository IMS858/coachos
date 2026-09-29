import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {smallJson} from '@/lib/media/request';
import {requireGrowthOwner,GrowthAccessError} from '@/lib/growth/owner-access';
import {acquisitionCommandSchema,CONNECTORS,day,validAcquisitionReceipt} from '@/lib/growth/acquisition/model';
import {loadAcquisition,refreshAcquisition} from '@/lib/growth/acquisition/server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const refreshSchema=z.object({action:z.literal('refresh'),request_id:z.string().uuid(),connector:z.enum(CONNECTORS),start:day,end:day,source_read_confirmed:z.literal(true)}).strict();
export async function GET(){try{const {db}=await requireGrowthOwner();return reply(await loadAcquisition(db));}catch(e){return reply({error:e instanceof GrowthAccessError?e.message:'Acquisition evidence is unavailable. No empty totals were inferred.'},e instanceof GrowthAccessError?e.status:503);}}
export async function POST(request:NextRequest){if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 try{const {db,user}=await requireGrowthOwner();let raw;try{raw=await smallJson(request,12000);}catch{return reply({error:'Invalid acquisition request.'},400);}
  const refresh=refreshSchema.safeParse(raw);
  if(refresh.success){const c=refresh.data;if(c.end<c.start||Date.parse(c.end)>=Date.now()||(Date.parse(c.end)-Date.parse(c.start))/86400000>89)return reply({error:'Use a past reporting window of at most 90 days.'},400);const run=await refreshAcquisition(db,user.id,c.request_id,c.connector,c.start,c.end);return reply({ok:true,request_id:c.request_id,action:'refresh',run});}
  const command=acquisitionCommandSchema.safeParse(raw);if(!command.success)return reply({error:'Review the source options, task evidence or refresh fields.'},400);const c=command.data;
  if(c.action==='save_task'&&c.status==='done'&&c.note.trim().length<10)return reply({error:'Record what was completed before marking the task done.'},400);
  const result=await db.rpc('execute_acquisition_command',{p_command:c});if(result.error)return reply({error:['40001','23505'].includes(result.error.code)?'The record changed. Refresh and review before editing.':'Save not confirmed. Retry the preserved request.'},['40001','23505'].includes(result.error.code)?409:503);
  if(!validAcquisitionReceipt(result.data,c))return reply({error:'Incomplete receipt. Retry this exact save.'},503);return reply(result.data);
 }catch(e){return reply({error:e instanceof GrowthAccessError?e.message:'Acquisition refresh or save was not confirmed. Check the source connection and recover the same request.'},e instanceof GrowthAccessError?e.status:503);}}
