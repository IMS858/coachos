import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {ArrowLeft,Mail,Phone,UserRound} from "lucide-react";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {ContactClientConversion} from "@/components/leads/contact-client-conversion";
import {leadBucket,sourceLabel} from "@/lib/leads/workspace";
export const dynamic="force-dynamic";
export default async function ContactProfile({params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/contacts/"+id);
 const {data:me,error:meError}=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(meError||!me||me.deleted_at||!["owner","trainer"].includes(me.role))redirect("/dashboard");
 const {data:contact,error}=await db.from("leads").select("id,full_name,email,phone,interest,stage,source,appointments_booked,last_visited,prior_trainer,last_contacted_at,created_at,updated_at,notes").eq("id",id).maybeSingle();
 if(error)throw new Error("Contact profile could not be loaded.");if(!contact||leadBucket(contact)!=="contacts")notFound();
 const {data:staff,error:staffError}=await db.from("profiles").select("id,full_name,role").in("role",["owner","trainer"]).is("deleted_at",null).order("full_name");
 if(staffError)throw new Error("Coach list could not be loaded.");
 const existing=contact.email?await db.from("profiles").select("id,full_name,role").ilike("email",contact.email.trim()).is("deleted_at",null):{data:[],error:null};
 if(existing.error)throw new Error("Duplicate client check could not be completed.");
 const clientMatch=(existing.data??[]).find(row=>row.role==="client");
 return <AppShell><main className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-12">
  <Link href="/contacts" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-cream-dim"><ArrowLeft className="h-4 w-4"/>All contacts</Link>
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-[.18em] text-white/60">IMS / Contact profile</p><h1 className="mt-2 text-3xl font-bold">{contact.full_name}</h1><p className="mt-2 text-sm text-white/75">{sourceLabel(contact.source)} · historical relationship record</p></header>
  <section className="grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Contact details</h2><div className="mt-4 space-y-3 text-sm">{contact.email?<a className="flex min-h-11 items-center gap-3 break-all text-sky" href={"mailto:"+contact.email}><Mail className="h-4 w-4"/>{contact.email}</a>:<p className="text-cream-faint">Email not recorded</p>}{contact.phone?<a className="flex min-h-11 items-center gap-3 text-sky" href={"tel:"+contact.phone}><Phone className="h-4 w-4"/>{contact.phone}</a>:<p className="text-cream-faint">Phone not recorded</p>}</div></article>
  <article className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Relationship history</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-cream-faint">Historical visits</dt><dd className="mt-1 font-semibold">{contact.appointments_booked??0}</dd></div><div><dt className="text-xs text-cream-faint">Last recorded visit</dt><dd className="mt-1 font-semibold">{contact.last_visited??"Unknown"}</dd></div><div><dt className="text-xs text-cream-faint">Prior trainer</dt><dd className="mt-1 font-semibold">{contact.prior_trainer??"Unknown"}</dd></div><div><dt className="text-xs text-cream-faint">Interest tag</dt><dd className="mt-1 font-semibold">{contact.interest??"None recorded"}</dd></div></dl></article></section>
  {contact.notes&&<section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Contact notes</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-cream-dim">{contact.notes}</p></section>}
  <section className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-start gap-3"><UserRound className="mt-0.5 h-5 w-5 text-sky"/><div><h2 className="font-semibold text-cream">Coach OS client</h2><p className="mt-1 text-sm leading-6 text-cream-dim">A contact stays historical until you explicitly add them as a client. Conversion does not infer a package, balance, payment, appointment or current purchase intent.</p></div></div>
   {clientMatch?<div className="mt-4 rounded-xl border border-sky/30 bg-sky/5 p-4"><p className="text-sm font-semibold text-cream">A current client already uses this email.</p><Link href={"/clients/"+clientMatch.id} className="mt-2 inline-flex min-h-11 items-center font-semibold text-sky">Open client profile →</Link></div>:<ContactClientConversion contactId={contact.id} defaultEmail={contact.email??""} trainers={(staff??[]).map(row=>({id:row.id,name:row.full_name}))}/>}
  </section>
 </main></AppShell>;
}
