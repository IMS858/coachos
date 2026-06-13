import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

/**
 * Refresh the user's session and return the user along with a response
 * carrying any updated cookies.
 *
 * Called from middleware.ts on every request to:
 *   1. Refresh expired access tokens transparently
 *   2. Sync auth cookies between request and response
 *   3. Provide the resolved user for role-based routing decisions
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT against Supabase. Don't use getSession()
  // here — getSession() returns whatever's in cookies without validation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response: supabaseResponse };
}
