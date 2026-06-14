import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ClientBottomNav } from "@/components/layout/client-bottom-nav";
import { StaffBottomNav } from "@/components/layout/staff-bottom-nav";
import type { UserRole } from "@/lib/types/database";

/**
 * Loads the current user + profile and renders the appropriate shell.
 * Trainers/owners get a left sidebar (desktop). Clients get a mobile bottom nav.
 */
export async function AppShell({
  children,
  expectedRole,
}: {
  children: React.ReactNode;
  expectedRole?: UserRole;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // If a section requires a higher role than the user has, kick them out
  if (expectedRole) {
    const ladder: Record<UserRole, number> = { client: 0, trainer: 1, owner: 2 };
    if (ladder[profile.role as UserRole] < ladder[expectedRole]) {
      redirect("/dashboard");
    }
  }

  const role = profile.role as UserRole;

  if (role === "client") {
    return (
      <div className="theme-light min-h-screen bg-paper pb-20">
        <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
        <ClientBottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-navy">
      <AppSidebar
        role={role}
        fullName={profile.full_name}
        email={profile.email}
      />
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
      <StaffBottomNav />
    </div>
  );
}
