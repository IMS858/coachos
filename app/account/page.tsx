import { redirect } from "next/navigation";
import { User, CreditCard, FileCheck, LogOut, Smartphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AccountProfileForm } from "@/components/account/account-profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

/**
 * The client's own account page: who they are, what they're on, what they've
 * signed. Everything here is read from real records — nothing is a placeholder.
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  // Staff have their own surfaces; this page is the client's.
  if (profile && profile.role !== "client") redirect("/dashboard");

  const { data: plans } = await supabase
    .from("plans")
    .select("kind, tier, custom_label, status, current_session_number, total_sessions")
    .eq("client_id", user.id)
    .eq("status", "active");

  const { data: waivers } = await supabase
    .from("waivers")
    .select("waiver_version, signed_at")
    .eq("client_id", user.id)
    .order("signed_at", { ascending: false });

  const planLabel = (p: any) =>
    p.custom_label ||
    String(p.tier ?? p.kind ?? "Plan")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="text-3xl font-bold text-cream">
            {profile?.full_name?.split(" ")[0] ?? "Your account"}
          </h1>
        </div>

        {/* Details — editable */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Your details</h2>
            </div>
            <AccountProfileForm
              initialName={profile?.full_name ?? ""}
              initialPhone={profile?.phone ?? ""}
              email={profile?.email ?? user.email ?? ""}
            />
          </CardContent>
        </Card>

        {/* Plan */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Your plan</h2>
            </div>
            {plans && plans.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {plans.map((p: any, i: number) => {
                  const used = p.current_session_number ?? 0;
                  const total = p.total_sessions ?? null;
                  const left = total !== null ? Math.max(total - used, 0) : null;
                  return (
                    <li key={i} className="border-b border-divider last:border-0 pb-3 last:pb-0">
                      <div className="text-cream font-medium">{planLabel(p)}</div>
                      {total !== null ? (
                        <>
                          <div className="tabular text-sm text-cream-dim mt-0.5">
                            {left} of {total} sessions left
                          </div>
                          <div className="h-2 rounded-full bg-navy-elev mt-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-sky"
                              style={{ width: `${total ? Math.min((used / total) * 100, 100) : 0}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-cream-dim mt-0.5">Membership · active</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="prose-ims text-sm text-cream-dim">
                No active plan on file. Ask Jason at your next session and he&apos;ll
                get you set up.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Signed documents */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Signed documents</h2>
            </div>
            {waivers && waivers.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {waivers.map((w: any, i: number) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span className="text-cream">
                      Waiver <span className="text-cream-faint">{w.waiver_version}</span>
                    </span>
                    <span className="text-cream-faint tabular">
                      {new Date(w.signed_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="prose-ims text-sm text-cream-dim">
                Nothing signed yet. Jason will send your intake form and waiver
                before your first session.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Install prompt — this is how the app gets onto their phone */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold text-cream">Add to your phone</h2>
            </div>
            <p className="prose-ims text-sm text-cream-dim">
              In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
              IMS opens full screen like any other app.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-cream-faint" />
                <span className="text-sm text-cream">Sign out of this device</span>
              </div>
              <SignOutButton />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-cream-faint text-center">
          Questions about billing or your plan? Message Jason or call (619) 937-1434.
        </p>
      </div>
    </AppShell>
  );
}
