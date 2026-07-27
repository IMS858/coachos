import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { StandingBookingForm } from "@/components/sessions/standing-booking-form";

// Live client list so a just-created client is bookable immediately.
export const dynamic = "force-dynamic";

/**
 * /schedule/standing — create a recurring "standing" appointment: a client
 * booked into the same weekly slot(s) that auto-fill the calendar until
 * the series is cancelled.
 */
export default async function StandingBookingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/schedule/standing");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  // Clients from the billing-summary view (same reliable source the picker uses)
  const { data: clientsData } = await supabase
    .from("client_billing_summary")
    .select("client_id, full_name, email, status")
    .in("status", ["active", "lead"])
    .order("full_name", { ascending: true });

  const clients = (clientsData ?? []).map((c: any) => ({
    id: c.client_id,
    full_name: c.full_name ?? "—",
    email: c.email ?? "",
  }));

  // Trainers (staff)
  const { data: trainersData } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["trainer", "owner"])
    .order("full_name", { ascending: true });

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-3xl">
        <div>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1 text-sm text-cream-faint hover:text-cream"
          >
            <ArrowLeft className="h-4 w-4" /> Back to schedule
          </Link>
          <h1 className="text-2xl font-semibold text-cream mt-2">
            Standing Booking
          </h1>
          <p className="text-cream-faint text-sm">
            Reserve a recurring weekly slot. We auto-fill the calendar and keep
            it filled until you cancel.
          </p>
        </div>

        <StandingBookingForm
          clients={clients}
          trainers={trainersData ?? []}
          currentUserId={user.id}
        />
      </div>
    </AppShell>
  );
}
