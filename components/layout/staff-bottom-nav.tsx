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
  Mail,
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
  { href: "/settings/email", label: "Logins", icon: Mail },
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
            className="band absolute bottom-0 left-0 right-0 border-t border-divider rounded-t-3xl p-5 pb-28 shadow-2xl"
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
                      active ? "bg-white/10 text-sky" : "bg-navy-soft text-cream-dim"
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

      <nav className="band safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-divider lg:hidden">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 px-2">
          {coreItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] transition-all",
                    active ? "bg-white/10 text-white" : "text-cream-faint hover:text-white"
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
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] text-cream-faint hover:bg-white/5 hover:text-white"
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
