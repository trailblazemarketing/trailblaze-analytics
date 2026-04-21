"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { code: "operator", label: "Operators" },
  { code: "affiliate", label: "Affiliates" },
  { code: "b2b_platform", label: "B2B" },
] as const;

export function OperatorsSubTabs({ active }: { active: string }) {
  return (
    <div className="mb-2 flex items-center gap-1 border-b border-tb-border">
      {TABS.map((t) => (
        <Link
          key={t.code}
          href={`/?sub=${t.code}`}
          scroll={false}
          className={cn(
            "relative px-3 py-2 text-[11px] font-medium transition-colors",
            active === t.code
              ? "text-tb-text"
              : "text-tb-muted hover:text-tb-text",
          )}
        >
          {t.label}
          {active === t.code && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-tb-blue" />
          )}
        </Link>
      ))}
    </div>
  );
}
