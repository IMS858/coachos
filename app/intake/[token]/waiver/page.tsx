import { createServiceClient } from "@/lib/supabase/server";
import { WaiverFlow } from "@/components/intake/waiver-flow";

export default async function WaiverPage({
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

  if (!tokenRow || new Date(tokenRow.expires_at) < new Date() || tokenRow.used_at) {
    return (
      <div className="theme-light min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-navy mb-2">
            Link unavailable
          </h1>
          <p className="text-sm text-navy/60">
            Contact your coach to continue. (619) 937-1434
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-light min-h-screen bg-paper py-8 px-4">
      <div className="mx-auto max-w-xl">
        <WaiverFlow token={token} clientId={tokenRow.client_id} />
      </div>
    </div>
  );
}
