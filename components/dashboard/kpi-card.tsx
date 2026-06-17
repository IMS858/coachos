import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  icon?: LucideIcon;
  hint?: string;
}

export function KpiCard({ label, value, delta, icon: Icon, hint }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-cream-faint">
          {label}
        </div>
        {Icon && <Icon className="h-4 w-4 text-cream-faint" />}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 font-medium",
              delta.direction === "up" && "text-status-optimal",
              delta.direction === "down" && "text-status-limited",
              delta.direction === "flat" && "text-cream-faint"
            )}
          >
            {delta.direction === "up" && <ArrowUpRight className="h-3 w-3" />}
            {delta.direction === "down" && <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
        {hint && <span className="text-cream-faint">{hint}</span>}
      </div>
    </div>
  );
}
