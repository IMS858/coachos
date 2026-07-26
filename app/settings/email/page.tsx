import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { EmailDiagnostics } from "@/components/settings/email-diagnostics";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email" };

export default async function EmailSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "owner") redirect("/dashboard");

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-2xl">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="text-3xl font-bold text-cream">Email</h1>
          <p className="prose-ims text-sm text-cream-dim mt-1">
            Client invites, password resets, booking confirmations and session
            reminders all go out from here.
          </p>
        </div>
        <EmailDiagnostics defaultTo={me?.email ?? user.email ?? ""} />
      </div>
    </AppShell>
  );
}
