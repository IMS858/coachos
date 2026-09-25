import {ClipboardList} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {ProgramDecisionComposer} from "@/components/programs/program-decision-composer";

export async function ProgramDecisionLog({programId}:{programId:string}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return null;
 const notesQ=await db.from("program_decision_notes").select("id,actor_id,category,note,created_at").eq("program_id",programId).order("created_at",{ascending:false}).limit(30);
 if(notesQ.error)return <section className="rounded-2xl border border-status-limited/30 bg-white p-5"><h2 className="font-semibold text-cream">Program decision trail</h2><p role="alert" className="mt-2 text-sm text-status-limited">Decision history is unavailable. Existing program data was not changed.</p></section>;
 const notes=notesQ.data??[],actorIds=[...new Set(notes.map(n=>n.actor_id))];
 const namesQ=actorIds.length?await db.from("profiles").select("id,full_name").in("id",actorIds):{data:[],error:null};
 const names=new Map((namesQ.data??[]).map(p=>[p.id,p.full_name]));
 return <section className="rounded-3xl border border-divider bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky/10 p-2.5"><ClipboardList className="h-5 w-5 text-sky"/></div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky">Program reasoning</p><h2 className="mt-1 text-lg font-semibold text-cream">Decision trail</h2><p className="mt-1 text-sm leading-6 text-cream-dim">Why the coach progressed, regressed or changed the plan. These staff-only notes complement prescription history; they do not publish to the client.</p></div></div><div className="mt-4"><ProgramDecisionComposer programId={programId}/></div>
 {notes.length?<div className="mt-5 divide-y divide-divider">{notes.map(n=><article key={n.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold capitalize text-cream-dim">{String(n.category).replaceAll("_"," ")}</span><time className="text-[11px] text-cream-faint">{new Date(n.created_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-cream">{n.note}</p><p className="mt-1 text-xs text-cream-faint">{names.get(n.actor_id)??"IMS coach"}</p></article>)}</div>:<p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-cream-dim">No coaching decision notes yet. Add one when the reason for a meaningful program change should remain part of the client’s durable history.</p>}
 </section>;
}
