import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { loadGrowthCenter, type GrowthCenterData } from "@/lib/growth/server";
import { GrowthCenter } from "@/components/growth/growth-center";
export const dynamic="force-dynamic";
export default async function GrowthPage(){
  const db=await createClient(); const {data:{user}}=await db.auth.getUser();
  if(!user)redirect("/login?next=/growth");
  const profile=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(profile.error)throw new Error("Growth authorization is unavailable.");
  if(profile.data?.role!=="owner" || profile.data.deleted_at)redirect("/dashboard");
  let data: GrowthCenterData;
  try { data=await loadGrowthCenter(db); }
  catch { return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl space-y-4 py-6"><h1 className="text-3xl font-bold">Growth Center</h1><p role="alert" className="rounded-2xl border border-status-limited/40 bg-white p-5 text-sm leading-6">Growth data could not be fully loaded. No counts or revenue totals are being estimated. Check the growth migration and database connection, then reload. Existing leads and research have not been changed.</p><Link href="/leads/research" className="inline-flex min-h-11 items-center font-semibold text-sky">Open existing Research Desk</Link></main></AppShell>; }
  return <AppShell expectedRole="owner"><GrowthCenter data={data} today={new Date().toISOString().slice(0,10)}/></AppShell>;
}
