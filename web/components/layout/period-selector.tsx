"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodRow } from "@/lib/queries/periods";

type Groups = {
  quarters: PeriodRow[];
  trailing: PeriodRow[];
  fullYears: PeriodRow[];
  months: PeriodRow[];
  other: PeriodRow[];
};

export function PeriodSelector({
  groups,
  currentCode,
  className,
}: {
  groups: Groups;
  currentCode: string | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(code: string | null) {
    const next = new URLSearchParams(Array.from(search.entries()));
    if (code) next.set("period", code);
    else next.delete("period");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
    setOpen(false);
  }

  const all = [
    ...groups.quarters,
    ...groups.trailing,
    ...groups.fullYears,
    ...groups.months,
    ...groups.other,
  ];
  const current = currentCode ? all.find((p) => p.code === currentCode) : null;
  const label = current ? current.display_name ?? current.code : "Latest";

  return (
    <div className={cn("relative inline-block", className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-tb-border bg-tb-surface px-2.5 py-1 text-xs text-tb-text transition-colors hover:border-tb-blue"
      >
        <Calendar className="h-3 w-3 text-tb-muted" />
        <span className="font-mono text-[11px]">{label}</span>
        <ChevronDown className="h-3 w-3 text-tb-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-40 w-64 overflow-hidden rounded-md border border-tb-border bg-tb-surface text-xs shadow-lg animate-fade-in">
          <button
            onClick={() => pick(null)}
            className={cn(
              "flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-tb-border/40",
              !currentCode && "bg-tb-blue/10 text-tb-blue",
            )}
          >
            <span>Latest (auto)</span>
            <span className="font-mono text-[10px] text-tb-muted">default</span>
          </button>
          <Group label="Quarters" rows={groups.quarters} current={currentCode} onPick={pick} />
          <Group label="Trailing" rows={groups.trailing} current={currentCode} onPick={pick} />
          <Group label="Full years" rows={groups.fullYears} current={currentCode} onPick={pick} />
          <Group label="Months" rows={groups.months} current={currentCode} onPick={pick} />
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  rows,
  current,
  onPick,
}: {
  label: string;
  rows: PeriodRow[];
  current: string | null;
  onPick: (code: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-tb-border">
      <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-tb-muted">
        {label}
      </div>
      <div className="max-h-44 overflow-y-auto">
        {rows.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.code)}
            className={cn(
              "flex w-full items-center justify-between px-3 py-1 text-left hover:bg-tb-border/40",
              current === p.code && "bg-tb-blue/10 text-tb-blue",
            )}
          >
            <span className="font-mono text-[11px]">
              {p.display_name ?? p.code}
            </span>
            <span className="font-mono text-[10px] text-tb-muted">
              {p.val_count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
