import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Routes that don't require authentication.
 * Anything not matched here requires a logged-in user.
 */
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/intake"];

/**
 * Role-based default landing pages after login.
 */
const ROLE_HOME = {
  owner: "/dashboard?view=owner",
  trainer: "/dashboard?view=trainer",
  client: "/dashboard",
} as const;

export async function middleware(request: NextRequest) {
  const { user, response, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

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
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
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
