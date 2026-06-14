import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-navy-elev text-cream-dim border border-divider",
        optimal: "bg-status-optimal/15 text-status-optimal border border-status-optimal/30",
        moderate: "bg-status-moderate/15 text-status-moderate border border-status-moderate/30",
        limited: "bg-status-limited/15 text-status-limited border border-status-limited/30",
        sky: "bg-sky/15 text-sky-light border border-sky/30",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
