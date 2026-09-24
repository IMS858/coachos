import Link from "next/link";
import { ChevronRight, TrendingUp, DollarSign, Users, FileSpreadsheet, Activity, Target, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    href: "/reports/operations",
    title: "Operations Health",
    desc: "Package renewals, payment exceptions, no-shows and client setup gaps that need attention.",
    icon: ShieldCheck,
  },
  {
    href: "/reports/leads",
    title: "New Business & Conversion",
    desc: "Current inquiries, first-contact health, booked prospects and conversion by source. Historical contacts are excluded.",
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
    title: "Client Engagement",
    desc: "App activity, assigned media engagement and clients who may be going quiet.",
    icon: Activity,
  },
  {
    href: "/reports/financials",
    title: "Monthly Revenue",
    desc: "Recurring plan value, package activity, renter rent and delivered sessions. Not a P&L.",
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
    title: "Accountant Payment Summary",
    desc: "Succeeded payment ledger summarized by month and source. Not a tax return.",
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
