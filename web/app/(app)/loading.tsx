import { Skeleton, SkeletonTable } from "@/components/layout/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 border-0 bg-tb-surface" />
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonTable rows={10} />
        <SkeletonTable rows={6} />
      </div>
      <SkeletonTable rows={10} />
    </div>
  );
}
