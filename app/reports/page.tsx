import Link from "next/link";
import { ChevronRight, TrendingUp, DollarSign, Users, FileSpreadsheet, Activity, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    href: "/reports/leads",
    title: "Lead Pipeline & Conversion",
    desc: "Open pipeline, follow-up health, booked prospects and conversion by source.",
    icon: Target,
  },
  {
    href: "/reports/progress",
    title: "Client Progress Report",
    desc: "Printable progress summary for a client — movement, strength, body comp. Hand it to them.",
    icon: TrendingUp,
  },
  {
    href: "/reports/usage",
    title: "App Usage",
    desc: "Who's opening the app, who's watching their homework, and who's gone quiet.",
    icon: Activity,
  },
  {
    href: "/reports/financials",
    title: "Monthly P&L / Revenue",
    desc: "Revenue, MRR, package income, and renter rent for the month. Print-ready.",
    icon: DollarSign,
  },
  {
    href: "/reports/trainers",
    title: "Trainer Utilization",
    desc: "Sessions delivered per trainer this week and month.",
    icon: Users,
  },
  {
    href: "/reports/retention",
    title: "Retention & Churn",
    desc: "Active vs churned clients, retention rate, and new signups.",
    icon: TrendingUp,
  },
  {
    href: "/reports/tax",
    title: "Tax Summary",
    desc: "Yearly payments by month and source — hand it to your accountant.",
    icon: DollarSign,
  },
  {
    href: "/reports/exports",
    title: "Member & Payment Exports",
    desc: "Download CSV files — members list, payments register, session history.",
    icon: FileSpreadsheet,
  },
];

export default function ReportsPage() {
  return (
    <AppShell expectedRole="owner">
      <div className="max-w-4xl mx-auto py-6">
        <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Owner intelligence</p><h1 className="mt-2 text-4xl font-bold">Reports</h1><p className="mt-2 text-sm text-white/75">Growth, revenue, retention, utilization and client outcomes in one place.</p></div>
        <div className="flex flex-col gap-3">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.href} href={r.href}>
                <Card className="hover:bg-navy-elev transition-colors">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="h-10 w-10 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-sky" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-cream font-medium">{r.title}</div>
                      <div className="text-xs text-cream-faint">{r.desc}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-cream-faint shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
