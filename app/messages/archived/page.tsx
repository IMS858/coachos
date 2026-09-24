import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { RestoreThreadButton } from "@/components/messages/restore-thread-button";
export const dynamic="force-dynamic";
export default async function ArchivedMessagesPage(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:me}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();if(!me||!["owner","trainer"].includes(me.role))redirect("/messages");
 const {data:states}=await supabase.from("message_thread_state").select("client_id,archived_at").not("archived_at","is",null).order("archived_at",{ascending:false});
 const ids=(states??[]).map(s=>s.client_id);let names:Record<string,string>={};if(ids.length){const {data:p}=await supabase.from("profiles").select("id,full_name").in("id",ids);names=Object.fromEntries((p??[]).map(x=>[x.id,x.full_name]));}
 return <AppShell><div className="mx-auto flex max-w-4xl flex-col gap-5"><Link href="/messages" className="inline-flex w-fit items-center gap-1 text-sm text-cream-dim"><ArrowLeft className="h-4 w-4"/>Communications</Link><div className="rounded-3xl bg-band px-6 py-7 text-white"><p className="text-[11px] uppercase tracking-[0.2em] text-white/60">Communications</p><h1 className="mt-2 text-4xl font-bold">Archived</h1><p className="mt-2 text-sm text-white/75">Cleared conversations stay here. Nothing is deleted.</p></div><div className="overflow-hidden rounded-2xl border border-divider bg-white">{!states?.length?<div className="p-10 text-center"><Archive className="mx-auto h-6 w-6 text-cream-faint"/><p className="mt-3 text-sm text-cream-dim">No archived conversations.</p></div>:<div className="divide-y divide-divider">{states.map(s=><div key={s.client_id} className="flex items-center gap-3 p-4"><Avatar name={names[s.client_id]??"?"}/><Link href={`/messages/${s.client_id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-cream">{names[s.client_id]??"Client"}</p><p className="text-xs text-cream-faint">Cleared {s.archived_at?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(new Date(s.archived_at)):""}</p></Link><RestoreThreadButton clientId={s.client_id}/></div>)}</div>}</div></div></AppShell>;
}
