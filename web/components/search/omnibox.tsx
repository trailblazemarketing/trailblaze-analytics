"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, Building2, Globe2, Ruler } from "lucide-react";
import type { SearchHit } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Omnibox() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  // ⌘K / Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced fetch
  React.useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setHits(data.hits ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    if (hit.kind === "market") router.push(`/markets/${hit.slug}`);
    else if (hit.kind === "company") router.push(`/companies/${hit.slug}`);
    else if (hit.kind === "metric") router.push(`/metrics/${hit.slug}`);
  }

  const grouped = React.useMemo(() => {
    const g = { market: [] as SearchHit[], company: [] as SearchHit[], metric: [] as SearchHit[] };
    for (const h of hits) g[h.kind].push(h);
    return g;
  }, [hits]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-tb-border bg-tb-bg px-3 text-xs text-tb-muted",
          "transition-colors hover:border-tb-blue/60",
        )}
        aria-label="Search"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">
          Search markets, companies, metrics…
        </span>
        <kbd className="rounded border border-tb-border bg-tb-surface px-1.5 py-0.5 font-mono text-[10px] text-tb-muted">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              label="Search"
              className="bg-transparent"
              shouldFilter={false}
            >
              <div className="flex items-center gap-2 border-b border-tb-border px-3 py-2">
                <Search className="h-3.5 w-3.5 text-tb-muted" />
                <Command.Input
                  autoFocus
                  value={q}
                  onValueChange={setQ}
                  placeholder="Search markets, companies, metrics…"
                  className="flex-1 bg-transparent text-sm text-tb-text outline-none placeholder:text-tb-muted"
                />
                {loading && (
                  <span className="font-mono text-[10px] text-tb-muted">
                    …
                  </span>
                )}
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-1">
                {!q.trim() && (
                  <div className="px-3 py-8 text-center text-xs text-tb-muted">
                    Start typing to search.
                  </div>
                )}
                {q.trim() && !loading && hits.length === 0 && (
                  <Command.Empty className="px-3 py-6 text-center text-xs text-tb-muted">
                    No results.
                  </Command.Empty>
                )}
                {grouped.market.length > 0 && (
                  <Command.Group heading="Markets" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-tb-muted">
                    {grouped.market.map((h) => (
                      <HitItem key={h.id} hit={h} onSelect={() => go(h)} icon={<Globe2 className="h-3.5 w-3.5 text-tb-blue" />} />
                    ))}
                  </Command.Group>
                )}
                {grouped.company.length > 0 && (
                  <Command.Group heading="Companies" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-tb-muted">
                    {grouped.company.map((h) => (
                      <HitItem key={h.id} hit={h} onSelect={() => go(h)} icon={<Building2 className="h-3.5 w-3.5 text-tb-blue" />} />
                    ))}
                  </Command.Group>
                )}
                {grouped.metric.length > 0 && (
                  <Command.Group heading="Metrics" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-tb-muted">
                    {grouped.metric.map((h) => (
                      <HitItem key={h.id} hit={h} onSelect={() => go(h)} icon={<Ruler className="h-3.5 w-3.5 text-tb-blue" />} />
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="flex items-center justify-between border-t border-tb-border px-3 py-1.5 text-[10px] text-tb-muted">
                <span>↵ select · ↑↓ navigate · esc close</span>
                <span className="font-mono">{hits.length} results</span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}

function HitItem({
  hit,
  onSelect,
  icon,
}: {
  hit: SearchHit;
  onSelect: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Command.Item
      value={`${hit.kind}-${hit.id}-${hit.label}`}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-tb-text aria-selected:bg-tb-blue/15 aria-selected:text-tb-text"
    >
      {icon}
      <span className="flex-1 truncate">{hit.label}</span>
      {hit.sublabel && (
        <span className="shrink-0 font-mono text-[10px] text-tb-muted">
          {hit.sublabel}
        </span>
      )}
    </Command.Item>
  );
}
