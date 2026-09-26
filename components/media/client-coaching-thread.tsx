import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {mayAccessMedia} from "@/lib/media/feedback";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {ClientMediaReview} from "@/components/media/client-media-review";
import {ClipPlayback} from "@/components/media/clip-playback";
const unavailable=<section id="form-video-review" className="scroll-mt-24 rounded-2xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold">Form videos & coach feedback</h2><p role="alert" className="mt-2 text-sm text-status-limited">Coaching feedback could not be loaded. Pending reviews were not reported as complete. Refresh to retry.</p></section>;
export async function ClientCoachingThread({clientId,mediaId}:{clientId:string;mediaId?:string}){
 if(mediaId&&!CAPTURE_UUID.test(mediaId))return unavailable;
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const viewer=await db.from("profiles").select("id,role,deleted_at").eq("id",user.id).maybeSingle();
 if(viewer.error)return unavailable;if(!viewer.data||viewer.data.deleted_at)return null;
 const client=await db.from("clients").select("id,primary_trainer_id").eq("id",clientId).maybeSingle();
 if(client.error)return unavailable;if(!client.data||!mayAccessMedia(viewer.data,clientId,client.data.primary_trainer_id))return null;
 const isStaff=viewer.data.role==="owner"||viewer.data.role==="trainer";
 let source=db.from("client_media").select("id,title,kind,note,created_at,review_status,coach_feedback,reviewed_at").eq("client_id",clientId).eq("uploaded_by",clientId).like("storage_path",clientId+"/from-client-%").is("archived_at",null);
 if(mediaId)source=source.eq("id",mediaId);
 const query=await source.order("created_at",{ascending:false}).limit(mediaId?1:21);
 if(query.error)return unavailable;
 const rows=(query.data??[]).slice(0,20);
 return <section id="form-video-review" aria-label="Form videos and coach feedback" className="scroll-mt-24 rounded-3xl border border-sky/20 bg-white p-5 shadow-sm">
  <p className="text-xs font-semibold uppercase tracking-widest text-sky">Movement → feedback → next session</p><h2 className="mt-2 text-xl font-semibold text-cream">Form videos & coach feedback</h2>
  <p className="mt-2 text-sm leading-6 text-cream-dim">{isStaff?"Open the client’s submission and finalize the response they should see. This is coaching feedback, not automatic progression or a published prescription.":"Your submissions and the feedback your coach has saved. Replies are not monitored for emergencies."}</p>
  {rows.length?<div className="mt-5 space-y-4">{rows.map(row=><article key={row.id} id={"clip-"+row.id} className="scroll-mt-24 rounded-2xl border border-divider p-4">
   <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-cream">{row.title||"Technique clip"}</h3><span className="rounded-full bg-surface-soft px-3 py-1 text-xs text-cream-dim">{row.review_status==="reviewed"?"Coach responded":row.review_status==="awaiting_review"?"Awaiting coach review":"Review status unavailable"}</span></div>
   <time dateTime={row.created_at} className="mt-2 block text-xs text-cream-faint">{new Date(row.created_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})}</time>
   {row.note&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-cream-dim">{row.note}</p>}<ClipPlayback id={row.id} kind={row.kind} title={row.title||"Client technique clip"}/>
   {row.review_status==="reviewed"&&row.coach_feedback?<div className="mt-4 rounded-xl bg-sky/5 p-4"><h4 className="text-sm font-semibold text-sky">Coach feedback</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-cream">{row.coach_feedback}</p>{row.reviewed_at&&<time dateTime={row.reviewed_at} className="mt-2 block text-xs text-cream-faint">Recorded {new Date(row.reviewed_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric"})}</time>}</div>:isStaff&&row.review_status==="awaiting_review"?<ClientMediaReview id={row.id}/>:null}
   {!mediaId&&<Link href={"/coaching/media/"+row.id} className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-sky">Open this coaching record →</Link>}
  </article>)}</div>:<p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-cream-dim">{mediaId?"This submission is unavailable or has been archived.":isStaff?"No client-submitted clips are recorded yet. Ask the client to send a movement from My Plan.":"No client-submitted clips are recorded yet. Send a clip above when you need technique feedback."}</p>}
  {(query.data??[]).length>20&&<p className="mt-3 text-xs text-cream-faint">Showing the latest 20 submissions. Older entries remain in the coaching record; queued reviews open their exact submission.</p>}
  <Link href={isStaff?"/messages/"+clientId:"/messages"} className="mt-4 inline-flex min-h-12 items-center text-sm font-semibold text-sky">Send a follow-up message →</Link>
 </section>;
}
