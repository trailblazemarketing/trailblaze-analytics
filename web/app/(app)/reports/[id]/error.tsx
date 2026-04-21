"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/reports/[id]]", error);
  }, [error]);

  return (
    <div className="panel mx-auto max-w-xl p-6 text-xs">
      <h2 className="mb-2 text-sm font-semibold text-tb-danger">
        Report failed to load
      </h2>
      <p className="mb-3 text-tb-muted">
        {error.message || "An unknown error occurred."}
      </p>
      {error.digest && (
        <p className="mb-3 font-mono text-[10px] text-tb-muted">
          digest: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md border border-tb-border px-3 py-1 text-tb-text hover:border-tb-blue"
        >
          Retry
        </button>
        <Link
          href="/reports"
          className="rounded-md border border-tb-border px-3 py-1 text-tb-text hover:border-tb-blue"
        >
          Back to reports
        </Link>
      </div>
    </div>
  );
}
