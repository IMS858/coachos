import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Activity, Eye, Video } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/reports/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "App usage" };

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function relative(iso: string | null): string {
  const d = daysSince(iso);
  if (d === null) return "never";
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} wk ago`;
  return `${Math.floor(d / 30)} mo ago`;
}

export default async function UsagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "owner") redirect("/dashboard");

  const svc = createServiceClient();

  const { data: engagement } = await svc
    .from("client_engagement")
    .select("*");

  const { data: recent } = await svc
    .from("app_events")
    .select("user_id, role, event, path, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  const rows = (engagement ?? []) as any[];

  // Names for the activity feed, resolved in one query.
  const ids = [...new Set((recent ?? []).map((r: any) => r.user_id).filter(Boolean))];
  let names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await svc
      .from("profiles").select("id, full_name").in("id", ids);
    names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
  }

  const active7 = rows.filter((r) => Number(r.events_7d) > 0).length;
  const active30 = rows.filter((r) => Number(r.events_30d) > 0).length;
  const neverOpened = rows.filter((r) => !r.last_active_at);
  // The number worth acting on: had the app, stopped using it.
  const wentQuiet = rows
    .filter((r) => {
      const d = daysSince(r.last_active_at);
      return d !== null && d >= 21;
    })
    .sort(
      (a, b) =>
        new Date(a.last_active_at).getTime() - new Date(b.last_active_at).getTime()
    );

  const totalWatched = rows.reduce((n, r) => n + Number(r.videos_watched ?? 0), 0);

  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="stat-rule rounded-lg rounded-t-sm border border-divider bg-navy-soft p-4">
      <div className="text-[11px] uppercase tracking-widest text-cream-faint">{label}</div>
      <div
        className="tabular text-3xl font-bold text-sky mt-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-cream-faint mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-5 print-area">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Reports</div>
            <h1 className="text-3xl font-bold text-cream">App usage</h1>
            <p className="prose-ims text-sm text-cream-dim mt-1">
              Who&apos;s actually opening the app — and who&apos;s gone quiet.
            </p>
          </div>
          <div className="no-print"><PrintButton /></div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat("Active this week", active7, `of ${rows.length} clients`)}
          {stat("Active this month", active30, `of ${rows.length} clients`)}
          {stat("Videos watched", totalWatched, "all time")}
          {stat("Never opened", neverOpened.length, "no activity yet")}
        </div>

        {/* The actionable list, first — this is the churn signal */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-status-moderate" />
              <h2 className="text-base font-semibold text-cream">Gone quiet</h2>
            </div>
            <p className="prose-ims text-sm text-cream-dim mb-3">
              Used the app before, nothing in three weeks. Usually the first sign
              someone&apos;s drifting.
            </p>
            {wentQuiet.length === 0 ? (
              <p className="text-sm text-status-optimal">
                Nobody&apos;s gone quiet. Everyone active in the last three weeks.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {wentQuiet.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b border-divider last:border-0 pb-2 last:pb-0"
                  >
                    <Link href={`/clients/${r.id}`} className="text-cream hover:text-sky truncate">
                      {r.full_name}
                    </Link>
                    <span className="text-sm text-status-moderate shrink-0">
                      {relative(r.last_active_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {neverOpened.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-base font-semibold text-cream mb-1">Never opened it</h2>
              <p className="prose-ims text-sm text-cream-dim mb-3">
                Accounts exist but have never been used. Most likely they never
                got — or never opened — their invite.
              </p>
              <ul className="flex flex-col gap-2">
                {neverOpened.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b border-divider last:border-0 pb-2 last:pb-0"
                  >
                    <Link href={`/clients/${r.id}`} className="text-cream hover:text-sky truncate">
                      {r.full_name}
                    </Link>
                    <span className="text-xs text-cream-faint truncate">{r.email}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Everyone, ranked by how recently they were here */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Every client</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-cream-faint border-b border-divider">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium text-right">Last seen</th>
                    <th className="pb-2 font-medium text-right">7d</th>
                    <th className="pb-2 font-medium text-right">30d</th>
                    <th className="pb-2 font-medium text-right">Watched</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.last_active_at ?? 0).getTime() -
                        new Date(a.last_active_at ?? 0).getTime()
                    )
                    .map((r) => (
                      <tr key={r.id} className="border-b border-divider/60 last:border-0">
                        <td className="py-2">
                          <Link href={`/clients/${r.id}`} className="text-cream hover:text-sky">
                            {r.full_name}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-cream-dim">
                          {relative(r.last_active_at)}
                        </td>
                        <td className="py-2 text-right tabular text-cream-dim">{r.events_7d}</td>
                        <td className="py-2 text-right tabular text-cream-dim">{r.events_30d}</td>
                        <td className="py-2 text-right tabular text-cream-dim">
                          {r.videos_watched}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Recent activity</h2>
            </div>
            <ul className="flex flex-col gap-1.5">
              {(recent ?? []).map((r: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-cream truncate">
                    {names[r.user_id] ?? "Someone"}
                    <span className="text-cream-faint">
                      {" "}
                      {r.event === "watch" ? (
                        <>
                          <Video className="inline h-3 w-3" /> watched a video
                        </>
                      ) : (
                        `opened ${r.path ?? "the app"}`
                      )}
                    </span>
                  </span>
                  <span className="text-xs text-cream-faint shrink-0">
                    {new Date(r.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
              {(recent ?? []).length === 0 && (
                <li className="text-sm text-cream-faint">
                  Nothing yet — activity appears here once people start using the app.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-cream-faint">
          Page views and video plays only. No location, device or browsing data
          is collected, and this page is visible to you alone.
        </p>
      </div>
    </AppShell>
  );
}
