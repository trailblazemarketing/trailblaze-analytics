import { Skeleton, SkeletonTable } from "@/components/layout/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 border-0 bg-tb-surface" />
      <Skeleton className="h-9 border-0 bg-tb-surface" />
      <SkeletonTable rows={20} />
    </div>
  );
}
