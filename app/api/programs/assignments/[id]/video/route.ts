import {type NextRequest,NextResponse} from "next/server";import {createClient} from "@/lib/supabase/server";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return NextResponse.json({error:"Authorization unavailable"},{status:503});if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return NextResponse.json({error:"Staff only"},{status:403});
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 const body=await request.json().catch(()=>null);const exerciseId=body&&typeof body.exercise_id==="string"?body.exercise_id:null;if(!exerciseId)return NextResponse.json({error:"Choose an exercise video"},{status:400});
 const assignment=await db.from("program_exercises").select("id,program_id,exercise_id").eq("id",id).maybeSingle();if(assignment.error)return NextResponse.json({error:"Assignment lookup unavailable"},{status:503});if(!assignment.data)return NextResponse.json({error:"Assignment not found"},{status:404});
 const program=await db.from("programs").select("id,status").eq("id",assignment.data.program_id).maybeSingle();if(program.error||!program.data)return NextResponse.json({error:"Program unavailable"},{status:503});if(program.data.status!=="draft")return NextResponse.json({error:"Only draft programs can change exercise media"},{status:409});
 if(assignment.data.exercise_id!==exerciseId)return NextResponse.json({error:"Video must belong to the assigned exercise"},{status:409});
 const exercise=await db.from("exercises").select("id,video_url,client_visible").eq("id",exerciseId).maybeSingle();const review=await db.from("exercise_reviews").select("safety_status").eq("exercise_id",exerciseId).maybeSingle();
 if(exercise.error||review.error)return NextResponse.json({error:"Exercise video verification unavailable"},{status:503});if(!exercise.data?.client_visible||!exercise.data.video_url||review.data?.safety_status!=="approved")return NextResponse.json({error:"Exercise needs an approved, client-visible library video first"},{status:409});
 return NextResponse.json({ok:true,exercise_id:exerciseId,video_url:exercise.data.video_url},{headers:{"Cache-Control":"private, no-store"}});
}
