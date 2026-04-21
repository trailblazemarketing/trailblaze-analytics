import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-tb-border bg-tb-surface",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-tb-border/30 before:to-transparent",
        className,
      )}
    />
  );
}

export function SkeletonHeader() {
  return <Skeleton className="h-5 w-48" />;
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <Skeleton className="h-3 w-32 border-0 bg-tb-border" />
      </div>
      <div className="divide-y divide-tb-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="h-3 w-5 border-0 bg-tb-border" />
            <Skeleton className="h-3 flex-1 border-0 bg-tb-border" />
            <Skeleton className="h-3 w-16 border-0 bg-tb-border" />
            <Skeleton className="h-3 w-10 border-0 bg-tb-border" />
          </div>
        ))}
      </div>
    </div>
  );
}
