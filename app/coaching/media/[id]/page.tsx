import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {mayAccessMedia} from "@/lib/media/feedback";
import {AppShell} from "@/components/layout/app-shell";
import {ClientCoachingThread} from "@/components/media/client-coaching-thread";
export const dynamic="force-dynamic";
export default async function CoachingMediaPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))notFound();
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/coaching/media/"+id);
 const me=await db.from("profiles").select("id,role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Coaching authorization unavailable.");if(!me.data||me.data.deleted_at)notFound();
 const media=await db.from("client_media").select("id,client_id,uploaded_by,storage_path,archived_at").eq("id",id).maybeSingle();
 if(media.error)throw new Error("Coaching record could not be loaded.");
 if(!media.data||media.data.archived_at||media.data.uploaded_by!==media.data.client_id||!media.data.storage_path?.startsWith(media.data.client_id+"/from-client-"))notFound();
 const client=await db.from("clients").select("primary_trainer_id").eq("id",media.data.client_id).maybeSingle();
 if(client.error)throw new Error("Client assignment could not be checked.");if(!client.data||!mayAccessMedia(me.data,media.data.client_id,client.data.primary_trainer_id))notFound();
 const isClient=me.data.role==="client";
 return <AppShell><main className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-12"><Link href={isClient?"/plan":"/action-center"} className="inline-flex min-h-12 items-center text-sm font-semibold text-sky">{isClient?"← My Plan":"← Action Center"}</Link><ClientCoachingThread clientId={media.data.client_id} mediaId={id}/></main></AppShell>;
}
