"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Dumbbell,
  TrendingUp,
  MessageCircle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/messages", label: "Inbox", icon: MessageCircle },
  { href: "/account", label: "Me", icon: User },
];

export function ClientBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-paper-deep/95 backdrop-blur supports-[backdrop-filter]:bg-paper-deep/80">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                  active ? "text-sky" : "text-navy-soft/60"
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
