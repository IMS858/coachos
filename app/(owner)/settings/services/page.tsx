import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CreditCard, Dumbbell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { AddServiceButton } from "@/components/services/add-service-button";
import { ServiceCard } from "@/components/services/service-card";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profileError || profile?.role !== "owner" || profile.deleted_at) redirect("/dashboard");
  const { data: services, error } = await db.from("service_catalog").select("*").order("display_order").order("id");
  const training = (services ?? []).filter(s => s.slug === "facility_training");
  const supporting = (services ?? []).filter(s => s.slug !== "facility_training");
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">IMS / Offerings</p><h1 className="mt-2 text-4xl font-bold">Training comes first.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">One clear client booking flow: personal training. Manage how training is presented here, with packages, scheduling and supporting catalog records kept distinct.</p></header>
    <nav aria-label="Training operations" className="grid gap-3 sm:grid-cols-3">
      <Link href="/schedule" className="rounded-2xl border border-divider bg-white p-5 shadow-sm"><CalendarDays className="h-5 w-5 text-sky"/><h2 className="mt-3 font-semibold text-cream">Training schedule</h2><p className="mt-1 text-sm text-cream-dim">Coach calendars and booking requests</p></Link>
      <Link href="/checkout" className="rounded-2xl border border-divider bg-white p-5 shadow-sm"><CreditCard className="h-5 w-5 text-sky"/><h2 className="mt-3 font-semibold text-cream">Packages & checkout</h2><p className="mt-1 text-sm text-cream-dim">Purchases belong in the billing workflow</p></Link>
      <Link href="/library" className="rounded-2xl border border-divider bg-white p-5 shadow-sm"><Dumbbell className="h-5 w-5 text-sky"/><h2 className="mt-3 font-semibold text-cream">Exercise library</h2><p className="mt-1 text-sm text-cream-dim">Build client exercise sets from your database</p></Link>
    </nav>
    {error ? <p role="alert" className="rounded-2xl border border-status-limited p-5">The service catalog could not be loaded. No service settings were changed.</p> : <>
      <section className="space-y-4"><div><h2 className="text-xl font-semibold text-cream">Personal Training</h2><p className="mt-1 text-sm text-cream-dim">The client request flow is training-only. Catalog visibility does not turn other services into bookable appointments.</p></div><div className="grid gap-5 md:grid-cols-2">{training.map(service => <ServiceCard key={service.id} service={service as never}/>)}{training.length === 0 && <p className="rounded-2xl border border-divider p-5 text-sm">The training catalog record needs configuration. Existing bookings have not been changed.</p>}<div className="rounded-2xl border border-divider bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-sky">Booking boundary</p><h3 className="mt-3 text-lg font-semibold text-cream">Personal Training · 60-minute request</h3><p className="mt-3 text-sm leading-6 text-cream-dim">Assigned coach, available time, request, staff confirmation. Package balance is shown as context; completing a session is a separate billing action.</p><p className="mt-3 text-xs leading-5 text-cream-faint">Vagaro remains the booking source until the migration and cutover are verified. The Coach OS calendar is not a full Vagaro mirror.</p></div></div></section>
      <details className="rounded-2xl border border-divider bg-white"><summary className="cursor-pointer p-5"><span className="font-semibold text-cream">Supporting catalog & legacy entries</span><span className="ml-2 text-sm text-cream-faint">{supporting.length} records</span><p className="mt-1 text-sm leading-6 text-cream-dim">Facility, recovery and other records stay available for administration. They are not part of client training self-booking.</p></summary><div className="border-t border-divider p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="max-w-lg text-sm text-cream-dim">No records or historical prices have been deleted. Only change visibility deliberately—it can affect existing catalog displays.</p><AddServiceButton/></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{supporting.map(service => <ServiceCard key={service.id} service={service as never}/>)}</div></div></details>
    </>}
  </main></AppShell>;
}
