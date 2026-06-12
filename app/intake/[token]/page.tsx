import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { IntakeForm } from "@/components/intake/intake-form";
import { Logo } from "@/components/brand/logo";

/**
 * Public intake form. Accessed via tokenized link emailed to a lead
 * after they book their movement assessment.
 *
 * Flow:
 *   1. Look up the token (uses service-role to bypass RLS)
 *   2. Verify it's not expired and not used
 *   3. Render the multi-step intake form
 *   4. On submit, save responses + redirect to /intake/[token]/waiver
 */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: tokenRow } = await supabase
    .from("intake_tokens")
    .select("client_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) {
    return (
      <IntakeError
        title="Link not found"
        message="This intake link doesn't look right. Double-check the URL or contact us at (619) 937-1434."
      />
    );
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <IntakeError
        title="Link expired"
        message="This intake link has expired. Reply to your booking email and we'll send you a fresh one."
      />
    );
  }

  if (tokenRow.used_at) {
    return (
      <IntakeError
        title="Already submitted"
        message="This intake has already been completed. If you need to make changes, contact your coach."
      />
    );
  }

  // Load client basics so we can pre-fill name/email
  const { data: client } = await supabase
    .from("clients")
    .select("id, profiles:profiles!inner(full_name, email, phone)")
    .eq("id", tokenRow.client_id)
    .single();

  if (!client) redirect("/");

  return (
    <div className="theme-light min-h-screen bg-paper py-8 px-4">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <Logo width={130} withTagline className="mx-auto mb-3" priority />
          <h1 className="text-2xl font-semibold text-navy">
            Welcome to IMS
          </h1>
          <p className="text-sm text-navy/60 mt-1.5">
            A few minutes here saves us time when you walk in. Your assessment
            will be sharper, faster, and more useful.
          </p>
        </header>

        <IntakeForm
          token={token}
          clientId={tokenRow.client_id}
          prefill={{
            full_name: (client.profiles as any)?.full_name ?? "",
            email: (client.profiles as any)?.email ?? "",
            phone: (client.profiles as any)?.phone ?? "",
          }}
        />
      </div>
    </div>
  );
}

function IntakeError({ title, message }: { title: string; message: string }) {
  return (
    <div className="theme-light min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-navy mb-2">{title}</h1>
        <p className="text-sm text-navy/60">{message}</p>
      </div>
    </div>
  );
}
