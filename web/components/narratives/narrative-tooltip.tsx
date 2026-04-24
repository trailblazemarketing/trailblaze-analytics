"use client";
import * as React from "react";
import Link from "next/link";
import type { Narrative } from "@/lib/hooks/use-narrative";
import { useNarrative } from "@/lib/hooks/use-narrative";

const DWELL_MS = 300;
const MAX_PREVIEW_CHARS = 500;

export function NarrativeIndicator({
  entity,
  metric,
  period,
  market,
  size = 10,
  className = "",
}: {
  entity: string | null | undefined;
  metric: string | null | undefined;
  period: string | null | undefined;
  market?: string | null;
  size?: number;
  className?: string;
}) {
  // Two-stage fetch: first fire is cheap (endpoint is a cache read), so
  // we pull eagerly when mounted. If the row's not cached, the indicator
  // simply never appears. Hover doesn't re-fetch.
  const { hasNarrative, narrative } = useNarrative({
    entity, metric, period, market, enabled: true,
  });
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const hoverTimer = React.useRef<number | null>(null);
  const wrapRef = React.useRef<HTMLSpanElement>(null);

  if (!hasNarrative || !narrative) return null;

  const handleEnter = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect());
      setOpen(true);
    }, DWELL_MS);
  };
  const handleLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setOpen(false);
  };

  return (
    <span
      ref={wrapRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`inline-flex items-center align-baseline ${className}`}
      aria-label="View source narrative"
    >
      <span
        className="inline-block rounded-full bg-tb-blue/60"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      {open && rect && <NarrativeCard narrative={narrative} anchor={rect} />}
    </span>
  );
}

function NarrativeCard({
  narrative,
  anchor,
}: {
  narrative: Narrative;
  anchor: DOMRect;
}) {
  const left = Math.min(anchor.left, window.innerWidth - 380);
  const top = anchor.bottom + 6;
  const text =
    narrative.narrative_text.length > MAX_PREVIEW_CHARS
      ? narrative.narrative_text.slice(0, MAX_PREVIEW_CHARS - 1) + "…"
      : narrative.narrative_text;
  const date = narrative.source_report.published
    ? new Date(narrative.source_report.published).toISOString().slice(0, 10)
    : null;
  return (
    <div
      className="pointer-events-auto fixed z-50 max-w-[360px] animate-in fade-in-0 rounded border border-tb-blue/30 bg-tb-surface px-3 py-2 text-[11px] leading-relaxed text-tb-text shadow-lg"
      style={{ left, top }}
      role="tooltip"
    >
      <div className="whitespace-pre-wrap text-tb-text/90">{text}</div>
      <div className="mt-2 border-t border-tb-border pt-1.5 font-mono text-[10px] text-tb-muted">
        From{" "}
        <Link
          href={`/reports?id=${narrative.source_report.id}`}
          className="text-tb-blue hover:underline"
          target="_blank"
        >
          {narrative.source_report.filename}
        </Link>
        {date && <span> · {date}</span>}
      </div>
    </div>
  );
}
