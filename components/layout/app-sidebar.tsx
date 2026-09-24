"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  DollarSign,
  CreditCard,
  Users,
  Target,
  ClipboardList,
  CalendarDays,
  Dumbbell,
  Activity,
  MessageCircle,
  BarChart3,
  Settings,
  Mail,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  owner: [
    { href: "/dashboard", label: "Today", icon: LayoutDashboard },
    { href: "/dashboard?view=owner", label: "Business Overview", icon: BarChart3 },
    { href: "/clients", label: "Clients", icon: Users },
    { href: "/leads", label: "Leads", icon: Target },
    { href: "/programs", label: "Programs", icon: Dumbbell },
    { href: "/exercise-reviews/catalog", label: "Exercise Catalog", icon: ClipboardList },
    { href: "/assessments", label: "Assessments", icon: ClipboardList },
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/schedule/agenda", label: "Daily Agenda", icon: CalendarDays },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/financials", label: "Financials", icon: DollarSign },
    { href: "/checkout", label: "Checkout", icon: CreditCard },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    { href: "/settings/services", label: "Services", icon: Settings },
  { href: "/settings/email", label: "Logins", icon: Mail },
  ],
  trainer: [
    { href: "/dashboard", label: "Today", icon: LayoutDashboard },
    { href: "/clients", label: "Clients", icon: Users },
    { href: "/leads", label: "Leads", icon: Target },
    { href: "/assessments", label: "Assessments", icon: ClipboardList },
    { href: "/programs", label: "Programs", icon: Dumbbell },
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/messages", label: "Messages", icon: MessageCircle },
  ],
  client: [
    { href: "/dashboard", label: "Today", icon: Activity },
    { href: "/plan", label: "My Plan", icon: Dumbbell },
    { href: "/progress", label: "Progress", icon: BarChart3 },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    { href: "/account", label: "Account", icon: Settings },
  ],
};

interface AppSidebarProps {
  role: UserRole;
  fullName: string;
  email: string;
}

export function AppSidebar({ role, fullName, email }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const items = NAV_BY_ROLE[role];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="band sticky top-0 hidden lg:flex h-screen w-64 shrink-0 flex-col border-r border-divider shadow-xl">
      {/* Logo / brand */}
      <div className="flex h-20 items-center px-5 border-b border-divider">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ims-mark.png"
            alt="IMS"
            className="h-7 w-auto shrink-0"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-cream">
              Coach OS
            </span>
            <span className="text-[10px] uppercase tracking-widest text-cream-faint">
              {role}
            </span>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = item.href === "/dashboard?view=owner"
              ? pathname === "/dashboard" && searchParams.get("view") === "owner"
              : item.href === "/dashboard"
                ? pathname === "/dashboard" && searchParams.get("view") !== "owner"
                : pathname === item.href || (item.href !== "/schedule" && pathname.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                    active
                      ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                      : "text-cream-dim hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-sky-light" : "text-cream-faint group-hover:text-cream-dim"
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-divider p-3">
        <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="text-sm font-medium text-cream truncate">
            {fullName}
          </div>
          <div className="text-xs text-cream-faint truncate">{email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
