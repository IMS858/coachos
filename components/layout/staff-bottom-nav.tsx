"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarDays, MoreHorizontal, Target, Search, Dumbbell, MessageCircle, DollarSign, CreditCard, BarChart3, Settings, Mail, X, ListChecks, BookOpen, ClipboardList, Activity, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";

const coreItems = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/action-center", label: "Actions", icon: ListChecks },
];
const ownerMore = [
  { href: "/operating-system", label: "IMS OS", icon: Activity },
  { href: "/growth", label: "Growth Center", icon: Target },
  { href: "/leads/research", label: "Research Desk", icon: Search },
  { href: "/leads", label: "New business", icon: Target },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/library", label: "Exercise Library", icon: Dumbbell },
  { href: "/programs", label: "Programs", icon: Dumbbell },
  { href: "/fuel", label: "Fuel & Performance", icon: Activity },
  { href: "/classes/manage", label: "Classes", icon: GraduationCap },
  { href: "/messages", label: "Communications", icon: MessageCircle },
  { href: "/team", label: "Team Hub", icon: BookOpen },
  { href: "/checkout", label: "Checkout", icon: CreditCard },
  { href: "/financials", label: "Financials", icon: DollarSign },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Owner Settings", icon: Settings },
  { href: "/settings/services", label: "Services", icon: Settings },
  { href: "/settings/email", label: "Logins", icon: Mail },
];
const trainerMore = [
  { href: "/library", label: "Exercise Library", icon: Dumbbell },
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/programs", label: "Programs", icon: Dumbbell },
  { href: "/fuel", label: "Fuel & Performance", icon: Activity },
  { href: "/messages", label: "Communications", icon: MessageCircle },
  { href: "/team", label: "Team Hub", icon: BookOpen },
];

export function StaffBottomNav({ role }: { role: Exclude<UserRole,"client"> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreItems = role === "owner" ? ownerMore : trainerMore;
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open]);
  return <>
    {open && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close more navigation" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)}/><section role="dialog" aria-modal="true" aria-label="More navigation" className="band absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-divider p-5 pb-28 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">More</h2><p className="mt-0.5 text-[11px] capitalize text-white/50">{role} tools</p></div><button onClick={() => setOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center text-white" aria-label="Close menu"><X className="h-5 w-5"/></button></div><div className="grid grid-cols-3 gap-2">{moreItems.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-center text-xs", pathname === item.href ? "bg-white/15 text-white" : "bg-white/5 text-white/80")}><Icon className="h-5 w-5"/>{item.label}</Link>; })}</div></section></div>}
    <nav aria-label="Staff mobile navigation" className="band safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-divider lg:hidden"><ul className="mx-auto grid max-w-2xl grid-cols-5 px-2">{coreItems.map(item => { const active = pathname === item.href || pathname.startsWith(item.href + "/"); const Icon = item.icon; return <li key={item.href}><Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px]", active ? "bg-white/10 text-white" : "text-white/65")}><Icon className="h-5 w-5"/><span>{item.label}</span></Link></li>; })}<li><button aria-expanded={open} onClick={() => setOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] text-white/65"><MoreHorizontal className="h-5 w-5"/><span>More</span></button></li></ul></nav>
  </>;
}
