import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the redirect after magic-link click or OAuth callback.
 * Exchanges the auth code for a session, then sends the user to `next`.
 *
 * SECURITY: `next` is attacker-controllable (it rides in the emailed link's
 * query string). It must be a same-origin path — otherwise a crafted link
 * like ?next=//evil.com would bounce a freshly-authenticated user to a
 * phishing site. Only relative paths that start with exactly one "/" pass.
 */
function safeNext(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw) return fallback;
  // Must start with "/" but not "//" (protocol-relative) or "/\" (IE quirk)
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  // Reject anything that smuggles a scheme or CR/LF
  if (raw.includes(":") || raw.includes("\n") || raw.includes("\r")) {
    return fallback;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
