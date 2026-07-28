import { PublicSignFlow } from "@/components/waivers/public-sign-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign — IMS", robots: { index: false } };

/**
 * Public signing page. No account, no login — the token in the URL is the
 * credential. Used for membership and package agreements sent before someone's
 * first session, and for partner participants who will never be IMS clients.
 */
export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-navy">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ims-logo.png" alt="IMS" className="h-10 w-auto mb-4" />
          <h1 className="text-3xl font-bold text-cream">Please review and sign</h1>
        </div>
        <PublicSignFlow token={token} />
      </div>
    </main>
  );
}
