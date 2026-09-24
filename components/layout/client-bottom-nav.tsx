"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Dumbbell,
  CalendarPlus,
  TrendingUp,
  MessageCircle,
  ClipboardList,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: Dumbbell },
  { href: "/workouts", label: "Log", icon: ClipboardList },
  { href: "/book", label: "Book", icon: CalendarPlus },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/account", label: "Me", icon: UserRound },
];

export function ClientBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="band safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-divider">
      <ul className="mx-auto grid max-w-2xl grid-cols-6 px-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] transition-all",
                  active ? "bg-white/10 text-white" : "text-cream-dim hover:text-white"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-band-accent")} />
                <span className={cn(active && "font-medium")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
