import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
export async function SessionLastDebrief({sessionId}:{sessionId:string}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 const failed=<section className="rounded-2xl border border-divider bg-white p-4"><h2 className="font-semibold">Last-session handoff</h2><p role="alert" className="mt-2 text-sm text-status-limited">Previous debrief could not be loaded. No coaching context was inferred.</p></section>;
 if(viewer.error)return failed;if(!viewer.data||viewer.data.deleted_at||!["owner","trainer"].includes(viewer.data.role))return null;
 const current=await db.from("sessions").select("client_id,trainer_id,scheduled_at").eq("id",sessionId).maybeSingle();if(current.error)return failed;if(!current.data)return null;
 const client=await db.from("clients").select("primary_trainer_id").eq("id",current.data.client_id).maybeSingle();if(client.error)return failed;
 if(!client.data||(viewer.data.role!=="owner"&&current.data.trainer_id!==user.id&&client.data.primary_trainer_id!==user.id))return null;
 const previous=await db.from("sessions").select("id,scheduled_at,notes_post").eq("client_id",current.data.client_id).eq("status","completed").lt("scheduled_at",current.data.scheduled_at).lte("scheduled_at",new Date().toISOString()).order("scheduled_at",{ascending:false}).limit(1).maybeSingle();
 if(previous.error)return failed;
 return <section className="rounded-2xl border border-sky/20 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-sky">Coaching memory · recorded context</p><h2 className="mt-1 text-lg font-semibold">Last-session handoff</h2>
 {previous.data?<><Link href={`/sessions/${previous.data.id}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-sky">Previous completed session · {new Date(previous.data.scheduled_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric"})} →</Link><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-cream-dim">{previous.data.notes_post?.trim()||"No post-session debrief was recorded for that session."}</p></>:<p className="mt-2 text-sm text-cream-dim">No earlier completed session is recorded.</p>}
 <p className="mt-3 text-xs leading-5 text-cream-faint">Read-only source context. This does not copy old results into today, change a prescription, or send a client message.</p></section>;
}
