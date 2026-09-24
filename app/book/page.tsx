import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { BookingForm } from "@/components/booking/booking-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Book a Session" };

/**
 * Client self-booking. Request a slot + see upcoming sessions and
 * the status of pending requests.
 */
export default async function BookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: activePlans } = await svc.from("plans").select("id,kind,status,total_sessions,sessions_used,expires_at,custom_label,tier").eq("client_id",user.id).eq("status","active").order("created_at",{ascending:false});
  const trainingPackage = (activePlans ?? []).find((p:any)=>p.kind==="package" && p.total_sessions != null);
  const remaining = trainingPackage ? Math.max(0, Number(trainingPackage.total_sessions)-Number(trainingPackage.sessions_used??0)) : null;

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, scheduled_at, session_type, status, duration_minutes")
    .eq("client_id", user.id)
    .gte("scheduled_at", new Date().toISOString())
    .in("status", ["requested", "scheduled", "confirmed"])
    .order("scheduled_at")
    .limit(10);

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book a Session</h1>
          <p className="text-sm text-cream-dim mt-1">
            Request a time and we&apos;ll confirm it — usually within a few hours.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Training balance</p><p className="mt-1 text-2xl font-bold text-cream">{remaining === null ? "—" : remaining}</p><p className="text-xs text-cream-dim">{trainingPackage?.custom_label || trainingPackage?.tier?.replaceAll("_"," ") || "No active package found"}</p></div><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Booking</p><p className="mt-1 text-sm font-semibold text-cream">{remaining === 0 ? "Package depleted" : "Personal Training"}</p><p className="text-xs text-cream-dim">{remaining === 0 ? "You can still request a time; your coach will resolve the package before completion." : "60-minute request"}</p></div></div>

        <BookingForm />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your upcoming sessions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(sessions ?? []).length === 0 && (
              <p className="text-sm text-cream-faint">
                Nothing scheduled yet — request a time above.
              </p>
            )}
            {(sessions ?? []).map((s: any) => (
              <div
                key={s.id}
                className="flex items-center justify-between border-b border-divider/40 pb-2 last:border-0"
              >
                <div>
                  <div className="text-sm text-cream">
                    {new Date(s.scheduled_at).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-xs text-cream-faint capitalize">
                    {s.session_type} · {s.duration_minutes} min
                  </div>
                </div>
                <Badge
                  tone={
                    s.status === "requested"
                      ? "moderate"
                      : s.status === "confirmed" || s.status === "scheduled"
                      ? "optimal"
                      : "neutral"
                  }
                >
                  {s.status === "requested" ? "pending" : s.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
