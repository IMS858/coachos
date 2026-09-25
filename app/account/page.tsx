import {redirect} from "next/navigation";
import Link from "next/link";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {AvatarUpload} from "@/components/account/avatar-upload";
import {InstallPrompt} from "@/components/account/install-prompt";
import {AccountProfileForm} from "@/components/account/account-profile-form";
import {SignOutButton} from "@/components/account/sign-out-button";
import {packageBalance} from "@/lib/billing/package-balance";
export const dynamic="force-dynamic";
export const metadata={title:"Account"};
export default async function AccountPage(){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/account");
  const profileQ=await db.from("profiles").select("full_name,email,phone,role,avatar_url,deleted_at").eq("id",user.id).maybeSingle();
  if(profileQ.error)throw new Error("Your account could not be loaded. Refresh to retry.");
  const profile=profileQ.data;if(!profile||profile.deleted_at||profile.role!=="client")redirect("/dashboard");
  const [plansQ,waiversQ]=await Promise.all([
    db.from("plans").select("id,kind,tier,custom_label,status,current_session_number,sessions_used,total_sessions,expires_at,service_type").eq("client_id",user.id).eq("status","active").order("created_at"),
    db.from("waivers").select("waiver_version,signed_at").eq("client_id",user.id).order("signed_at",{ascending:false}),
  ]);
  return <AppShell><main className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-12">
    <header><p className="text-xs uppercase tracking-widest text-sky">Account</p><h1 className="mt-2 text-3xl font-bold">{profile.full_name.split(" ")[0]||"Your account"}</h1></header>
    <nav aria-label="Account shortcuts" className="grid grid-cols-2 gap-3">{[["/book","Book a session"],["/messages","Message coach"],["/plan#form-video-review","Video feedback"],["/account/billing","Billing history"]].map(([href,label])=><Link key={href} href={href} className="flex min-h-16 items-center rounded-2xl border border-divider bg-white p-4 text-sm font-semibold text-sky">{label} →</Link>)}</nav>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Your details</h2><div className="mb-5 border-b border-divider pb-5"><AvatarUpload userId={user.id} initialUrl={profile.avatar_url} name={profile.full_name}/></div><AccountProfileForm initialName={profile.full_name} initialPhone={profile.phone??""} email={profile.email}/><Link href="/forgot-password" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Reset your password →</Link></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold">Your plans</h2><p className="mt-1 text-xs text-cream-dim">Remaining sessions are separate from payments and amounts due.</p>
      {plansQ.error?<p role="alert" className="mt-3 text-sm text-status-limited">Your plans could not be loaded. This does not mean you have no plan or a zero balance.</p>:(plansQ.data??[]).length?<div className="mt-4 divide-y divide-divider">{plansQ.data!.map(p=>{const balance=packageBalance(p);return <article key={p.id} className="py-3"><h3 className="font-semibold">{p.custom_label||String(p.tier??p.kind).replaceAll("_"," ")}</h3>{balance.state==="unknown"?<p role="status" className="mt-2 text-sm text-cream-dim">Remaining sessions need review. No missing counter has been treated as zero.</p>:balance.state==="membership"?<p className="mt-2 text-sm text-cream-dim">Active membership · terms are recorded with your coach.</p>:<><p className="mt-2 text-sm text-cream-dim">{balance.remaining} of {balance.total} sessions left</p>{balance.remaining<=2&&<p className="mt-2 text-sm text-cream-dim">{balance.remaining===0?"Package depleted.":"Package running low."} <Link href="/messages" className="font-semibold text-sky">Ask your coach about renewal →</Link></p>}</>}{p.expires_at&&<p className="mt-2 text-xs text-cream-faint">Recorded expiration: {new Date(p.expires_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"short",day:"numeric"})}</p>}</article>;})}</div>:<p className="mt-3 text-sm text-cream-dim">No active plan is recorded in Coach OS. Ask your coach about records that may still be in another system.</p>}
    </section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold">Signed documents</h2>{waiversQ.error?<p role="alert" className="mt-3 text-sm text-status-limited">Your signed-document history is unavailable. No missing signature has been inferred.</p>:(waiversQ.data??[]).length?<ul className="mt-3 space-y-2">{waiversQ.data!.map((w,i)=><li key={i} className="flex flex-wrap justify-between gap-2 text-sm"><span>Waiver {w.waiver_version}</span><time dateTime={w.signed_at}>{new Date(w.signed_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"short",day:"numeric"})}</time></li>)}</ul>:<p className="mt-3 text-sm text-cream-dim">No signed documents are recorded here yet. Your coach will share the required forms.</p>}</section>
    <InstallPrompt/><section className="flex items-center justify-between gap-3 rounded-2xl border border-divider bg-white p-4"><h2 className="text-sm font-semibold">Sign out of this device</h2><SignOutButton/></section>
    <p className="text-center text-xs text-cream-faint">Questions about your plan? Message IMS or call (619) 937-1434.</p>
  </main></AppShell>;
}
