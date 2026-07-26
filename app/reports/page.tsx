import Link from "next/link";
import { ChevronRight, TrendingUp, DollarSign, Users, FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    href: "/reports/progress",
    title: "Client Progress Report",
    desc: "Printable progress summary for a client — movement, strength, body comp. Hand it to them.",
    icon: TrendingUp,
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
      <div className="max-w-3xl mx-auto py-6">
        <h1 className="text-2xl font-semibold text-cream mb-1">Reports</h1>
        <p className="text-sm text-cream-faint mb-6">
          Business intelligence and printable client documents.
        </p>
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
