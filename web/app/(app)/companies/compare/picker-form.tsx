"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function CompanyPickerForm({
  all,
  selected,
}: {
  all: { slug: string; name: string; ticker: string | null }[];
  selected: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>(selected);
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 40);
    return all
      .filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.slug.toLowerCase().includes(needle) ||
          c.ticker?.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [q, all]);

  function toggle(slug: string) {
    setPicked((cur) =>
      cur.includes(slug)
        ? cur.filter((s) => s !== slug)
        : [...cur, slug].slice(0, 6),
    );
  }

  function apply() {
    router.push(`/companies/compare?slugs=${picked.join(",")}`);
  }

  return (
    <div className="panel p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {picked.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wider text-tb-muted">
            No companies selected
          </span>
        ) : (
          picked.map((slug) => {
            const c = all.find((x) => x.slug === slug);
            return (
              <button
                key={slug}
                onClick={() => toggle(slug)}
                className="inline-flex items-center gap-1 rounded-md border border-tb-blue/40 bg-tb-blue/10 px-2 py-0.5 text-xs text-tb-blue hover:bg-tb-blue/20"
              >
                {c?.name ?? slug}
                <X className="h-3 w-3" />
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or ticker…"
          className="h-8 flex-1 rounded-md border border-tb-border bg-tb-bg px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
        />
        <button
          onClick={apply}
          disabled={picked.length === 0}
          className="rounded-md bg-tb-blue px-3 text-xs font-medium text-white disabled:opacity-40"
        >
          Compare ({picked.length})
        </button>
      </div>
      <div className="mt-2 grid max-h-48 grid-cols-2 gap-1 overflow-y-auto md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((c) => {
          const active = picked.includes(c.slug);
          return (
            <button
              key={c.slug}
              onClick={() => toggle(c.slug)}
              className={`truncate rounded px-2 py-1 text-left text-[11px] transition-colors ${
                active
                  ? "bg-tb-blue/15 text-tb-blue"
                  : "text-tb-text hover:bg-tb-border/40"
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.ticker && (
                <span className="ml-1 font-mono text-[10px] text-tb-muted">
                  {c.ticker}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
