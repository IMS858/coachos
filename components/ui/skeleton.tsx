import { cn } from "@/lib/utils";

/**
 * Skeleton — shimmer placeholder shown while data loads.
 *
 * Usage:
 *   <Skeleton className="h-8 w-48" />            // a heading
 *   <Skeleton className="h-24 w-full" />          // a card
 *   {rows ?? Array.from({length: 5}).map((_, i) => (
 *     <Skeleton key={i} className="h-10 w-full" />
 *   ))}
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Pre-built skeleton for the KPI card grid (4 cards). */
export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[108px] w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Pre-built skeleton for table/list rows. */
export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
