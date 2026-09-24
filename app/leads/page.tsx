import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { LeadsView } from "@/components/leads/leads-view";

export const dynamic = "force-dynamic";

/**
 * /leads — imported prospect pipeline with copy-paste outreach templates.
 * Owner + trainer.
 */
export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/leads");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  const svc = createServiceClient();
  const { data: leads } = await svc
    .from("leads")
    .select(
      "id, full_name, email, phone, interest, stage, source, appointments_booked, last_visited, prior_trainer, last_contacted_at, created_at, updated_at"
    )
    .neq("stage", "converted")
    .order("appointments_booked", { ascending: false })
    .order("full_name", { ascending: true });

  const rows = leads ?? [];
  const now = Date.now();
  const open = rows.filter((l) => !["not_interested", "converted"].includes(l.stage));
  const stale = open.filter((l) => !l.last_contacted_at || now - new Date(l.last_contacted_at).getTime() > 7 * 86400000).length;
  const booked = rows.filter((l) => l.stage === "booked").length;
  const newCount = rows.filter((l) => l.stage === "new").length;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1 className="text-3xl font-bold text-cream">Leads &amp; Outreach</h1>
          <p className="text-cream-faint text-sm">
            Your prospect list with ready-to-send follow-up templates. Copy a
            message, send it from your phone or GoHighLevel, then mark the stage.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">New</p><p className="mt-1 text-3xl font-bold text-cream">{newCount}</p><p className="text-xs text-cream-dim">need first touch</p></div><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Open</p><p className="mt-1 text-3xl font-bold text-cream">{open.length}</p><p className="text-xs text-cream-dim">active pipeline</p></div><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Booked</p><p className="mt-1 text-3xl font-bold text-cream">{booked}</p><p className="text-xs text-cream-dim">ready to convert</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs uppercase tracking-wider text-amber-700">Follow-up</p><p className="mt-1 text-3xl font-bold text-amber-900">{stale}</p><p className="text-xs text-amber-700">untouched 7+ days</p></div></div>

        <LeadsView leads={rows} />
      </div>
    </AppShell>
  );
}
