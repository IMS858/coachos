import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { NewClientForm } from "@/components/clients/new-client-form";

export default async function NewClientPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "client") redirect("/dashboard");

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-2xl">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          All clients
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New client</h1>
          <p className="text-sm text-cream-dim mt-1">
            Create the account, optionally set initial billing. Real email so
            magic-link sign-in works.
          </p>
        </div>

        <NewClientForm />
      </div>
    </AppShell>
  );
}
