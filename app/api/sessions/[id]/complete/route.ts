import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';

async function complete(request:NextRequest,id:string,value:boolean) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=value ? await request.json().catch(()=>null) : {};
  if (!body || (body.service_type != null && !['training','massage','pilates'].includes(body.service_type))) {
    return NextResponse.json({error:'Invalid service type'},{status:400});
  }
  const {data,error}=await supabase.rpc('set_session_completion',{
    p_session_id:id,p_complete:value,p_service_type:body.service_type ?? null,
  });
  if(error?.code === "40P01") return NextResponse.json({error:"Another booking changed at the same time. Refresh availability and retry."},{status:409});
  if (error) {
    const status=error.code==='42501'?403:error.code==='P0002'?404:['22023','23P01'].includes(error.code)?409:503;
    return NextResponse.json({error:status===503?'Completion service unavailable. Retry after checking the session.':error.message},{status});
  }
  await recordAudit({actorId:user.id,action:value?'session.completed':'session.completion_reverted',entityType:'session',entityId:id,changes:{service_type:body.service_type ?? null}});
  return NextResponse.json(data);
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  return complete(request,(await params).id,true);
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  return complete(request,(await params).id,false);
}
