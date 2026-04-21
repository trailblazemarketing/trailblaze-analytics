import { Skeleton, SkeletonTable } from "@/components/layout/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-tb-border bg-tb-surface p-4">
        <Skeleton className="mb-2 h-6 w-64 border-0 bg-tb-border" />
        <Skeleton className="h-3 w-96 border-0 bg-tb-border" />
        <div className="mt-4 grid grid-cols-4 gap-px bg-tb-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-20 rounded-none border-0 bg-tb-surface"
            />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonTable rows={8} />
        <SkeletonTable rows={8} />
      </div>
    </div>
  );
}
