"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  MessageCircle,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only bottom navigation for staff (owner/trainer).
 * The full sidebar is hidden below the `lg` breakpoint; this gives
 * thumb-friendly access to the core surfaces without rotating the phone.
 */
const items = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/assessments", label: "Assess", icon: ClipboardList },
  { href: "/messages", label: "Inbox", icon: MessageCircle },
];

export function StaffBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-divider bg-navy-deep/95 backdrop-blur supports-[backdrop-filter]:bg-navy-deep/80 lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                  active ? "text-sky" : "text-cream-faint"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-sky")} />
                <span className={cn(active && "font-medium")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
