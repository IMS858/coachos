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

  // waivers.client_id is a foreign key to clients(id), so only actual clients
  // can sign here. Staff have a profile but no clients row — without this guard
  // an owner reaching /waivers signs successfully in the UI and then fails on a
  // foreign key violation at insert.
  const svcCheck = createServiceClient();
  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer || viewer.role !== "client") redirect("/dashboard");

  // A client-role profile with no clients row can't sign — the foreign key has
  // nothing to point at. Send them on rather than showing a form that will fail
  // at the last step.
  const { data: clientRecord } = await svcCheck
    .from("clients")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!clientRecord) redirect("/dashboard");

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
