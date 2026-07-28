import { cn } from "@/lib/utils";

/** Shimmering placeholder. Uses the .skeleton class so it adapts to both themes. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** Standard page-loading shape: title, then a stack of cards. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="p-4 lg:p-8 flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
