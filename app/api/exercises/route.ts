import {type NextRequest,NextResponse} from "next/server";import {createClient} from "@/lib/supabase/server";
const slugify=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
export async function POST(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return NextResponse.json({error:"Authorization unavailable"},{status:503});if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return NextResponse.json({error:"Staff only"},{status:403});
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 const b=await request.json().catch(()=>null);if(!b||typeof b!=="object")return NextResponse.json({error:"Invalid exercise"},{status:400});
 const name=typeof b.name==="string"?b.name.trim():"";if(name.length<2||name.length>160)return NextResponse.json({error:"Exercise name is required"},{status:400});
 const category=["mobility","strength","corrective","conditioning","recovery"].includes(b.category)?b.category:"mobility";const pattern=typeof b.movement_pattern==="string"?b.movement_pattern:"isolated_joint";
 const base=slugify(name);if(!base)return NextResponse.json({error:"Exercise name needs letters or numbers"},{status:400});
 const slug=base+"-"+crypto.randomUUID().slice(0,8);
 const cues=Array.isArray(b.coaching_cues)?b.coaching_cues.filter((x:unknown)=>typeof x==="string").map((x:string)=>x.trim()).filter(Boolean).slice(0,8):[];
 const saved=await db.from("exercises").insert({name,ims_label:name,slug,category,movement_pattern:pattern,level:"intermediate",primary_joints:Array.isArray(b.primary_joints)?b.primary_joints.slice(0,5):[],equipment:Array.isArray(b.equipment)?b.equipment.slice(0,10):[],coaching_cues:cues,system_tags:Array.isArray(b.system_tags)?b.system_tags.slice(0,10):[],tags:Array.isArray(b.tags)?b.tags.slice(0,15):[],video_provider:b.video_storage_path?"supabase":"placeholder",video_url:null,thumbnail_url:null,programming_notes:[typeof b.description==="string"?b.description.trim().slice(0,1600):"",typeof b.video_storage_path==="string"?`[draft_video:${b.video_storage_path}]`:""].filter(Boolean).join("\\n")||null,client_visible:false,status:"draft",created_by:user.id}).select("id,name,slug,status,client_visible").single();
 if(saved.error||!saved.data)return NextResponse.json({error:"Could not create exercise draft"},{status:503});
 return NextResponse.json({ok:true,exercise:saved.data},{status:201});
}
