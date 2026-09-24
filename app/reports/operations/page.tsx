import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, CalendarX2, CreditCard, PackageSearch } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function OperationsHealthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reports/operations");
  const { data: me } = await supabase.from("profiles").select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "owner" || me.deleted_at) redirect("/dashboard");
  const svc = createServiceClient();
  const [sessionsQ, plansQ, paymentsQ, clientsQ] = await Promise.all([
    svc.from("sessions").select("id,status,client_id,scheduled_at,cancellation_reason").in("status",["cancelled","no_show"]).limit(500),
    svc.from("plans").select("id,client_id,status,total_sessions,current_session_number,sessions_used,expires_at").eq("status","active").limit(500),
    svc.from("payments").select("id,client_id,status,amount_cents,paid_at,description").in("status",["failed","pending"]).limit(200),
    svc.from("clients").select("id,status,billing_type").eq("status","active").limit(500),
  ]);
  if (sessionsQ.error || plansQ.error || paymentsQ.error || clientsQ.error) throw new Error("Operations reporting source unavailable");
  const sessions=sessionsQ.data??[], plans=plansQ.data??[], payments=paymentsQ.data??[], clients=clientsQ.data??[];
  const cancelled=sessions.filter((s:any)=>s.status==="cancelled"), noShows=sessions.filter((s:any)=>s.status==="no_show");
  const lowPlans=plans.map((p:any)=>({ ...p, remaining: p.total_sessions == null ? null : Math.max(0, Number(p.total_sessions)-Number(p.sessions_used ?? p.current_session_number ?? 0)) }))
    .filter((p:any)=>p.remaining !== null && p.remaining <= 2);
  const failed=payments.filter((p:any)=>p.status==="failed"), pending=payments.filter((p:any)=>p.status==="pending");
  const unconfigured=clients.filter((c:any)=>!c.billing_type || c.billing_type==="unset");
  return <AppShell expectedRole="owner"><div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
    <Link href="/reports" className="inline-flex w-fit items-center gap-1 text-sm text-cream-dim"><ArrowLeft className="h-4 w-4"/>Reports</Link>
    <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Owner control</p><h1 className="mt-2 text-4xl font-bold">Operations health</h1><p className="mt-2 text-sm text-white/75">Exceptions that need attention before they become client problems.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><PackageSearch className="h-5 w-5 text-amber-700"/><p className="mt-3 text-3xl font-bold text-amber-900">{lowPlans.length}</p><p className="text-xs text-amber-700">Packages ≤2</p></div>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><CreditCard className="h-5 w-5 text-red-700"/><p className="mt-3 text-3xl font-bold text-red-900">{failed.length}</p><p className="text-xs text-red-700">Failed payments</p></div>
      <div className="rounded-2xl border border-divider bg-white p-4"><CalendarX2 className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{noShows.length}</p><p className="text-xs text-cream-faint">No-shows in loaded history</p></div>
      <div className="rounded-2xl border border-divider bg-white p-4"><AlertTriangle className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{unconfigured.length}</p><p className="text-xs text-cream-faint">Active clients need billing</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-cream">Package renewal queue</h2><Link href="/clients" className="text-xs font-semibold text-sky">Clients →</Link></div><div className="mt-4 divide-y divide-divider">{lowPlans.length===0?<p className="py-4 text-sm text-cream-faint">No active packages at two sessions or fewer.</p>:lowPlans.slice(0,20).map((p:any)=><div key={p.id} className="flex items-center justify-between py-3"><span className="text-sm text-cream">Client package</span><span className="text-sm font-semibold text-amber-700">{p.remaining} left</span></div>)}</div></div>
      <div className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Payment exceptions</h2><div className="mt-4 divide-y divide-divider">{failed.length+pending.length===0?<p className="py-4 text-sm text-cream-faint">No failed or pending payment records in the loaded ledger.</p>:[...failed,...pending].slice(0,20).map((p:any)=><div key={p.id} className="flex items-center justify-between gap-3 py-3"><p className="truncate text-sm text-cream">{p.description||"IMS payment"}</p><span className={`text-xs font-semibold capitalize ${p.status==="failed"?"text-red-700":"text-amber-700"}`}>{p.status}</span></div>)}</div></div>
    </div>
    <p className="text-xs text-cream-faint">This screen is an exception queue, not an accounting statement. Session history is capped at 500 rows, plans/clients at 500, and payment exceptions at 200.</p>
  </div></AppShell>;
}
