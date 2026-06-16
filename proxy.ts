import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Routes that don't require authentication.
 * Anything not matched here requires a logged-in user.
 */
const PUBLIC_ROUTES = ["/login", "/api/auth/callback", "/intake"];

/**
 * Role-based default landing pages after login.
 */
const ROLE_HOME = {
  owner: "/dashboard?view=owner",
  trainer: "/dashboard?view=trainer",
  client: "/dashboard",
} as const;

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // If Supabase env vars aren't configured yet, let everything through
  // so the page-level checks can render a useful error instead of 403/500
  // at the middleware layer.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let user, response, supabase;
  try {
    const result = await updateSession(request);
    user = result.user;
    response = result.response;
    supabase = result.supabase;
  } catch (err) {
    console.error("[middleware] updateSession failed:", err);
    // Don't block the request on auth errors — let pages handle it
    return NextResponse.next({ request });
  }

  // Allow public routes through unauthenticated
  const isPublic = PUBLIC_ROUTES.some(
    (r) => path === r || path.startsWith(`${r}/`)
  );
  if (isPublic) return response;

  // No session — bounce to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    if (path !== "/") loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Resolve role from profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "client";

  // Block roles from each other's surfaces.
  // The (owner) / (trainer) / (client) route groups in app/ are convention only —
  // the actual gate is here.
  const ownerOnly = ["/owner", "/settings/services", "/settings/team"];
  const trainerPlus = ["/clients", "/assessments", "/programs"];

  const isOwnerArea = ownerOnly.some((r) => path.startsWith(r));
  const isTrainerArea = trainerPlus.some((r) => path.startsWith(r));

  if (isOwnerArea && role !== "owner") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isTrainerArea && role === "client") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Root redirect — send each role to their landing page
  if (path === "/") {
    return NextResponse.redirect(new URL(ROLE_HOME[role as keyof typeof ROLE_HOME], request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public files (svg, png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
