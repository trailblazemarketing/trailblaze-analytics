"use client";
import * as React from "react";
import { useReportViewer } from "./viewer-context";
import { cn } from "@/lib/utils";

// Drop-in replacement for <Link href="/reports/[id]">. Renders as a button
// styled like a link; default click opens the report in the overlay modal
// (URL unchanged). Cmd/Ctrl-click falls back to opening the standalone
// /reports/[id] page in a new tab, matching native anchor behavior.
export function ReportLink({
  reportId,
  className,
  children,
  ...rest
}: {
  reportId: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const { openReport } = useReportViewer();

  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer text-left text-tb-text hover:text-tb-blue focus-visible:text-tb-blue",
        className,
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
          window.open(`/reports/${reportId}`, "_blank", "noopener");
          return;
        }
        openReport(reportId);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          window.open(`/reports/${reportId}`, "_blank", "noopener");
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
