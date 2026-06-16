"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  MoreHorizontal,
  Target,
  Dumbbell,
  MessageCircle,
  DollarSign,
  CreditCard,
  BarChart3,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only bottom navigation for staff (owner/trainer).
 * 4 core tabs + a "More" drawer that reaches every other surface,
 * so the whole app is usable on a phone.
 */
const coreItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/assessments", label: "Assess", icon: ClipboardList },
];

const moreItems = [
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/programs", label: "Programs", icon: Dumbbell },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/checkout", label: "Checkout", icon: CreditCard },
  { href: "/financials", label: "Financials", icon: DollarSign },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings/services", label: "Services", icon: Settings },
];

export function StaffBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* More drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-navy-deep border-t border-divider rounded-t-2xl p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-cream">More</span>
              <button onClick={() => setOpen(false)} className="text-cream-faint">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl py-4 text-xs",
                      active ? "bg-sky/10 text-sky" : "bg-navy-soft text-cream-dim"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-divider bg-navy-deep/95 backdrop-blur supports-[backdrop-filter]:bg-navy-deep/80 lg:hidden">
        <ul className="grid grid-cols-5">
          {coreItems.map((item) => {
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
          <li>
            <button
              onClick={() => setOpen(true)}
              className="w-full flex flex-col items-center gap-1 py-2.5 text-xs text-cream-faint"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
