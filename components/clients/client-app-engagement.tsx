import {z} from "zod";
import {Activity,CalendarClock,MessageCircle,PlayCircle} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {CLIENT_USAGE_LABELS,CLIENT_USAGE_SURFACES} from "@/lib/usage/client-event";

const recentSchema=z.object({event:z.enum(["view","watch","book","message","complete"]),surface:z.enum(CLIENT_USAGE_SURFACES),created_at:z.string()});
const summarySchema=z.object({
 client_id:z.string().uuid(),portal_provisioned:z.boolean(),last_active_at:z.string().nullable(),
 events_7d:z.number().int().nonnegative(),events_30d:z.number().int().nonnegative(),
 active_days_7d:z.number().int().nonnegative(),active_days_30d:z.number().int().nonnegative(),
 actions_30d:z.object({videos_watched:z.number().int().nonnegative(),messages_sent:z.number().int().nonnegative(),booking_requests:z.number().int().nonnegative()}),
 surfaces_30d:z.object({dashboard:z.number().int().nonnegative(),training:z.number().int().nonnegative(),fuel:z.number().int().nonnegative(),progress:z.number().int().nonnegative(),messages:z.number().int().nonnegative(),booking:z.number().int().nonnegative(),classes:z.number().int().nonnegative()}),
 recent:z.array(recentSchema).max(8)
});
function daysSince(value:string|null){if(!value)return null;const ms=Date.now()-new Date(value).getTime();return Number.isFinite(ms)?Math.max(0,Math.floor(ms/86400000)):null;}
function when(value:string|null){if(!value)return "No recorded activity";const d=daysSince(value);if(d===0)return "Today";if(d===1)return "Yesterday";if(d!==null&&d<21)return `${d} days ago`;return d===null?"Unavailable":`${d} days ago`;}
function eventLabel(event:z.infer<typeof recentSchema>["event"],surface:z.infer<typeof recentSchema>["surface"]){if(event==="watch")return "Opened a coaching video";if(event==="message")return "Sent a coach message";if(event==="book")return "Submitted a training request";if(event==="complete")return "Completed an app action";return `Viewed ${CLIENT_USAGE_LABELS[surface]}`;}
export async function ClientAppEngagement({clientId}:{clientId:string}){
 const db=await createClient();
 const result=await db.rpc("get_client_app_engagement",{p_client:clientId});
 if(result.error){if(result.error.code==="42501")return null;return <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Client app engagement</h2><p role="alert" className="mt-2 text-sm leading-6 text-cream-dim">Engagement evidence is unavailable. No inactivity status is being inferred.</p></section>;}
 const parsed=summarySchema.safeParse(result.data);if(!parsed.success)return <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Client app engagement</h2><p role="alert" className="mt-2 text-sm leading-6 text-cream-dim">Engagement evidence could not be validated. No inactivity status is being inferred.</p></section>;
 const s=parsed.data,d=daysSince(s.last_active_at);
 const status=!s.portal_provisioned?"Portal login not provisioned":d===null?"No recorded app activity":d>=21?`App quiet for ${d} days`:d>=7?`No recorded activity for ${d} days`:"Active recently";
 const metrics=[["Last recorded",when(s.last_active_at)],["Active days · 7d",String(s.active_days_7d)],["Active days · 30d",String(s.active_days_30d)],["Recorded events · 30d",String(s.events_30d)]];
 return <section className="rounded-2xl border border-divider bg-white p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky">Client portal</p><h2 className="mt-1 text-xl font-semibold text-cream">App engagement</h2></div><span className="rounded-full border border-divider bg-surface-soft px-3 py-1 text-xs font-semibold text-cream-dim">{status}</span></div>
  {!s.portal_provisioned?<p className="mt-3 text-sm leading-6 text-cream-dim">This client does not currently have a provisioned portal login, so a lack of app events is not treated as inactivity.</p>:<>
   <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label,value])=><div key={label} className="rounded-xl bg-surface-soft p-3"><p className="text-xs text-cream-faint">{label}</p><p className="mt-1 font-semibold text-cream">{value}</p></div>)}</div>
   <div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-xl border border-divider p-4"><h3 className="text-sm font-semibold text-cream">Where they used Coach OS · 30d</h3><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{Object.entries(s.surfaces_30d).map(([surface,count])=><div className="flex justify-between gap-3" key={surface}><span className="text-cream-dim">{CLIENT_USAGE_LABELS[surface as keyof typeof CLIENT_USAGE_LABELS]}</span><strong className="tabular text-cream">{count}</strong></div>)}</div></div>
   <div className="rounded-xl border border-divider p-4"><h3 className="text-sm font-semibold text-cream">Meaningful actions · 30d</h3><div className="mt-3 grid gap-2 text-sm"><p className="flex justify-between"><span className="flex items-center gap-2 text-cream-dim"><PlayCircle className="h-4 w-4"/>Coaching videos opened</span><strong>{s.actions_30d.videos_watched}</strong></p><p className="flex justify-between"><span className="flex items-center gap-2 text-cream-dim"><MessageCircle className="h-4 w-4"/>Messages sent</span><strong>{s.actions_30d.messages_sent}</strong></p><p className="flex justify-between"><span className="flex items-center gap-2 text-cream-dim"><CalendarClock className="h-4 w-4"/>Training requests submitted</span><strong>{s.actions_30d.booking_requests}</strong></p></div></div></div>
   {s.recent.length>0&&<details className="mt-4 rounded-xl border border-divider p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-sky">Recent recorded activity</summary><ul className="mt-2 space-y-2">{s.recent.map((r,i)=><li className="flex items-center justify-between gap-3 text-sm" key={r.created_at+i}><span className="text-cream-dim">{eventLabel(r.event,r.surface)}</span><time className="shrink-0 text-xs text-cream-faint">{new Date(r.created_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></li>)}</ul></details>}
  </>}
  <p className="mt-4 flex gap-2 text-xs leading-5 text-cream-faint"><Activity className="mt-0.5 h-4 w-4 shrink-0"/>Private Coach OS activity only. No location, device fingerprint, message contents, health data or Google Analytics identifier is stored here. Recorded app silence does not mean the client stopped training or disengaged from coaching.</p>
 </section>;
}
