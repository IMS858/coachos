import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Landing point for emailed auth links (password invites and resets).
 *
 * IMPORTANT — why this route builds its own Supabase client instead of using
 * lib/supabase/server:
 *
 * verifyOtp succeeds on the Supabase side and hands back session cookies. Those
 * cookies have to be attached to the response the browser actually receives.
 * The shared server client writes to next/headers cookies() inside a try/catch
 * that intentionally swallows failures (correct for Server Components), so the
 * write could vanish silently — verifyOtp reported success, the redirect fired,
 * and the browser arrived at /set-password with no session. Middleware then
 * bounced it to /login, which looked like "the link did nothing".
 *
 * Constructing the redirect first and writing cookies directly onto it makes
 * the session ride along with the redirect, which is the whole fix.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const rawNext = searchParams.get("next") || "/dashboard";
  // Only allow internal paths — never redirect off-site from an auth callback.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/dashboard";

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Build the destination response up front so cookies can be written onto it.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return response;
    console.error("[auth/callback] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
    console.error("[auth/callback] code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}/login?error=link_missing`);
}
