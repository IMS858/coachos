import {type NextRequest,NextResponse} from "next/server";import {createClient} from "@/lib/supabase/server";
const BLOCKS=new Set(["warmup","main","finisher","cooldown"]);
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return NextResponse.json({error:"Authorization unavailable"},{status:503});if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return NextResponse.json({error:"Staff only"},{status:403});
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Invalid prescription"},{status:400});
 const b=body as Record<string,unknown>;const update:Record<string,unknown>={};
 if(b.sets!==undefined){const n=Number(b.sets);if(!Number.isInteger(n)||n<1||n>20)return NextResponse.json({error:"Sets must be 1–20"},{status:400});update.sets=n;}
 if(b.reps!==undefined){if(typeof b.reps!=="string"||!b.reps.trim()||b.reps.length>40)return NextResponse.json({error:"Enter a valid rep prescription"},{status:400});update.reps=b.reps.trim();}
 if(b.load!==undefined){if(typeof b.load!=="string"||b.load.length>120)return NextResponse.json({error:"Load is too long"},{status:400});update.load_prescription=b.load.trim()||null;}
 if(b.rest_seconds!==undefined){const n=Number(b.rest_seconds);if(!Number.isInteger(n)||n<0||n>900)return NextResponse.json({error:"Rest must be 0–900 seconds"},{status:400});update.rest_seconds=n;}
 if(b.tempo!==undefined){if(typeof b.tempo!=="string"||b.tempo.length>40)return NextResponse.json({error:"Tempo is too long"},{status:400});update.tempo=b.tempo.trim()||null;}
 if(b.notes!==undefined){if(typeof b.notes!=="string"||b.notes.length>1000)return NextResponse.json({error:"Client note is too long"},{status:400});update.notes=b.notes.trim()||null;}
 if(b.block!==undefined){if(typeof b.block!=="string"||!BLOCKS.has(b.block))return NextResponse.json({error:"Invalid training block"},{status:400});update.block=b.block;}
 if(!Object.keys(update).length)return NextResponse.json({error:"Nothing to update"},{status:400});
 const current=await db.from("program_exercises").select("id,program_id").eq("id",id).maybeSingle();if(current.error)return NextResponse.json({error:"Exercise lookup unavailable"},{status:503});if(!current.data)return NextResponse.json({error:"Exercise assignment not found"},{status:404});
 const program=await db.from("programs").select("id,status").eq("id",current.data.program_id).maybeSingle();if(program.error)return NextResponse.json({error:"Program lookup unavailable"},{status:503});if(!program.data||program.data.status!=="draft")return NextResponse.json({error:"Only draft programs can be prescribed"},{status:409});
 const saved=await db.from("program_exercises").update(update).eq("id",id).select("id").maybeSingle();if(saved.error||!saved.data)return NextResponse.json({error:"Could not save prescription"},{status:503});return NextResponse.json({ok:true});
}
