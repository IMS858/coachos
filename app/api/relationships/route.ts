import {NextResponse,type NextRequest} from 'next/server';
import {requireGrowthOwner,GrowthAccessError} from '@/lib/growth/owner-access';
import {smallJson} from '@/lib/media/request';
import {parseRelationshipCommand,validRelationshipReceipt} from '@/lib/leads/relationships';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Internal records only. No email, text, authentication identity, payment or schedule mutation. */
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 try{const {db}=await requireGrowthOwner();let command;try{command=parseRelationshipCommand(await smallJson(request,20000));}catch(e){return reply({error:e instanceof Error&&!e.message.startsWith('[')?e.message:'Review the required fields and current record version.'},400);}
  const result=await db.rpc('execute_relationship_command',{p_command:command});
  if(result.error){const code=result.error.code;return reply({error:['40001','23505'].includes(code)?'The record changed or overlaps an existing identity. Refresh and review; nothing was merged.':code==='42501'?'Owner permission or the selected staff/client is no longer valid.':['22023','23514','23503','22P02','22007','22008'].includes(code)?'The record, evidence or permission state did not pass validation. Nothing was saved.':'Save unconfirmed. Retry this exact request before editing.'},['40001','23505'].includes(code)?409:code==='42501'?403:['22023','23514','23503','22P02','22007','22008'].includes(code)?400:503);}
  if(!validRelationshipReceipt(result.data,command))return reply({error:'Incomplete receipt. Retry the preserved request.'},503);return reply(result.data);
 }catch(e){return reply({error:e instanceof GrowthAccessError?e.message:'Relationship save unavailable. No success was inferred.'},e instanceof GrowthAccessError?e.status:503);}
}
