import { Skeleton, SkeletonTable } from "@/components/layout/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="mb-1 h-5 w-40 border-0 bg-tb-border" />
        <Skeleton className="h-3 w-64 border-0 bg-tb-border" />
      </div>
      <Skeleton className="h-[320px] rounded-md border-0 bg-tb-surface" />
      <SkeletonTable rows={15} />
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonTable rows={5} />
        <SkeletonTable rows={5} />
        <SkeletonTable rows={5} />
      </div>
    </div>
  );
}
