import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assessWaivers, outstandingRequired } from "@/lib/waivers";
import { ResignFlow } from "@/components/waivers/resign-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreements" };

/**
 * Where a client re-signs. Reached either from the login gate (a required
 * waiver has lapsed) or from their own account page.
 *
 * Deliberately outside AppShell: when this is blocking, it shouldn't sit inside
 * navigation that invites them to wander off before signing.
 */
export default async function WaiversPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // Massage consent only applies to clients who actually receive bodywork, and
  // minor consent only under 18 — derived rather than assumed.
  const { data: clientRow } = await svc
    .from("clients")
    .select("date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  const { data: massagePlans } = await svc
    .from("plans")
    .select("id")
    .eq("client_id", user.id)
    .eq("service_type", "massage")
    .limit(1);
  const dob = (clientRow as any)?.date_of_birth;
  const isMinor = dob
    ? (Date.now() - new Date(dob).getTime()) / 31557600000 < 18
    : false;
  const receivesMassage = ((massagePlans ?? []) as any[]).length > 0;

  const { data: rows } = await svc
    .from("waivers")
    .select("waiver_type, waiver_version, signed_at")
    .eq("client_id", user.id);

  const statuses = assessWaivers((rows ?? []) as any, { receivesMassage, isMinor });
  const outstanding = outstandingRequired(statuses);

  // Nothing to do — don't strand them on a page with no purpose.
  if (outstanding.length === 0) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-navy">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="eyebrow">Agreements</div>
          <h1 className="text-3xl font-bold text-cream">
            {statuses.some((s) => s.state === "expired" || s.state === "outdated")
              ? "Time to renew"
              : "Before your next session"}
          </h1>
          <p className="prose-ims text-sm text-cream-dim mt-1">
            {outstanding.length === 1
              ? "One agreement needs your signature."
              : `${outstanding.length} agreements need your signature.`}{" "}
            It only takes a minute.
          </p>
        </div>
        <ResignFlow types={outstanding.map((o) => o.type)} />
      </div>
    </main>
  );
}
