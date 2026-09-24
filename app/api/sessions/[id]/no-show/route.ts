import {type NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function update(request:NextRequest,context:Context,mark:boolean){
 const {id}=await context.params;
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=mark?await request.json().catch(()=>({})):{};
 const {data,error}=await supabase.rpc('set_session_no_show',{p_id:id,p_mark:mark,p_charge:body.charge!==false});
 if(error)return NextResponse.json({error:error.code==='23P01'?'Restoring this session would overlap another booking.':'No-show change could not be saved',detail:error.message},
 {status:error.code==='42501'?403:error.code==='P0002'?404:['22023','23P01'].includes(error.code)?409:503});
 return NextResponse.json(data);
}
export async function POST(request:NextRequest,context:Context){return update(request,context,true);}
export async function DELETE(request:NextRequest,context:Context){return update(request,context,false);}
