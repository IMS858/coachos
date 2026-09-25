import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, MessageCircle, CreditCard, ClipboardList, Dumbbell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ClientEditor } from "@/components/clients/client-editor";
import { SessionTracker } from "@/components/clients/session-tracker";
import { ClientProgressReport } from "@/components/clients/client-progress-report";
import { ClientProgramLink } from "@/components/clients/client-program-link";
import { ClientExerciseSets } from "@/components/clients/client-exercise-sets";
import { ClientProgrammingStatus } from "@/components/clients/client-programming-status";
import { ClientEvidenceSummary } from "@/components/clients/client-evidence-summary";
import { ClientCoachBrief } from "@/components/clients/client-coach-brief";
import { ClientCoachingTimeline } from "@/components/clients/client-coaching-timeline";
import { SendAgreement } from "@/components/clients/send-agreement";
import { WaiverPanel } from "@/components/clients/waiver-panel";
import { MedicalPanel } from "@/components/clients/medical-panel";
import { SendVideoPanel } from "@/components/media/send-video-panel";
import { ClientVideoWorkflow } from "@/components/clients/client-video-workflow";
import { ClientLoginPanel } from "@/components/clients/client-login-panel";
import { IntakeLinkButton } from "@/components/clients/intake-link-button";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewerProfile, error: viewerError } = await supabase.from("profiles")
    .select("role, deleted_at").eq("id", user.id).single();
  if (viewerError || !viewerProfile || viewerProfile.deleted_at || !["owner", "trainer"].includes(viewerProfile.role)) redirect("/dashboard");
  const { data: profileRow, error: clientError } = await supabase.from("profiles")
    .select("id, full_name, email, phone, avatar_url").eq("id", id)
    .eq("role", "client").is("deleted_at", null).maybeSingle();
  if (clientError) throw new Error("Client profile could not be loaded.");
  if (!profileRow) notFound();
  const { data: plans, error: plansError } = await supabase.from("plans")
    .select("*").eq("client_id", id).order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (plansError) throw new Error("Client plans could not be loaded.");
  const actionClass = "flex min-h-24 min-w-0 flex-col gap-3 rounded-2xl border border-divider bg-white p-4 text-left shadow-sm transition hover:border-sky/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";

  return <AppShell><div className="flex min-w-0 flex-col gap-6">
    <Link href="/clients" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-cream-dim hover:text-cream"><ArrowLeft aria-hidden="true" className="h-4 w-4" />All clients</Link>
    <section className="rounded-3xl border border-sky/15 bg-gradient-to-br from-white via-white to-sky/5 p-4 shadow-sm sm:p-5"><p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-sky">Coach actions</p><nav aria-label="Client actions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Link href={`/sessions/new?client_id=${id}`} className={actionClass}><CalendarPlus aria-hidden="true" className="h-5 w-5 text-sky" /><span className="text-sm font-semibold text-cream">Book training</span></Link>
      <Link href={`/library?client_id=${id}`} className={actionClass}><Dumbbell aria-hidden="true" className="h-5 w-5 text-sky" /><span className="text-sm font-semibold text-cream">Quick programming</span></Link>
      <Link href={`/messages/${id}`} className={actionClass}><MessageCircle aria-hidden="true" className="h-5 w-5 text-sky" /><span className="text-sm font-semibold text-cream">Message client</span></Link>
      {viewerProfile.role === "owner" && <Link href={`/checkout?client_id=${id}`} className={actionClass}><CreditCard aria-hidden="true" className="h-5 w-5 text-sky" /><span className="text-sm font-semibold text-cream">Client checkout</span></Link>}
      <Link href="#client-plans" className={actionClass}><ClipboardList aria-hidden="true" className="h-5 w-5 text-sky" /><span className="text-sm font-semibold text-cream">Manage plans</span></Link>
    </nav></section>
    <ClientCoachBrief clientId={id}/>
    <section id="client-plans" className="flex scroll-mt-24 flex-col gap-6" aria-label="Client profile and plans"><ClientEditor clientId={id} initialProfile={profileRow} initialPlans={plans ?? []}/></section>
    <ClientProgrammingStatus clientId={id}/>
    <ClientEvidenceSummary clientId={id}/>
    <ClientCoachingTimeline clientId={id}/>
    <ClientExerciseSets clientId={id}/>
    <SessionTracker clientId={id}/>
    <ClientProgramLink clientId={id}/>
    <ClientProgressReport clientId={id} clientName={profileRow.full_name}/>
    <SendAgreement clientId={id} defaultEmail={profileRow.email ?? ""} defaultName={profileRow.full_name}/>
    <WaiverPanel clientId={id}/>
    <MedicalPanel clientId={id}/>
    <ClientVideoWorkflow clientId={id}/>
    <div id="coach-video"><SendVideoPanel clientId={id} clientName={profileRow.full_name}/></div>
    <ClientLoginPanel clientId={id} clientName={profileRow.full_name} hasEmail={Boolean(profileRow.email)} isOwner={viewerProfile.role === "owner"}/>
    <IntakeLinkButton clientId={id} clientName={profileRow.full_name} clientEmail={profileRow.email}/>
  </div></AppShell>;
}
