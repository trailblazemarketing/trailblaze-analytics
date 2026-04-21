"use client";
import * as React from "react";

// Tiny inline sparkline — 8 points default. Renders as SVG for crisp rendering
// at any pixel density. Beacon™ points drawn in orange; disclosed in blue.
export function Sparkline({
  values,
  beaconMask,
  width = 64,
  height = 18,
  className,
}: {
  values: (number | null)[];
  beaconMask?: boolean[]; // same length as values; true = that index is Beacon™
  width?: number;
  height?: number;
  className?: string;
}) {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (clean.length < 2) {
    return (
      <span className={className} style={{ display: "inline-block", width, height }}>
        <span className="font-mono text-[9px] text-tb-muted">—</span>
      </span>
    );
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  // Build the path coordinates, skipping nulls
  const pts = values.map((v, i) => {
    if (v == null) return null;
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return { x, y, i };
  });

  const segments: { x: number; y: number; i: number }[][] = [];
  let cur: { x: number; y: number; i: number }[] = [];
  for (const p of pts) {
    if (p == null) {
      if (cur.length > 0) segments.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if (cur.length > 0) segments.push(cur);

  const last = pts.filter((p): p is { x: number; y: number; i: number } => p != null).at(-1);
  const lastIsBeacon = last && beaconMask?.[last.i];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      {segments.map((seg, idx) => {
        const d = seg.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        const allBeacon = seg.every((p) => beaconMask?.[p.i]);
        return (
          <path
            key={idx}
            d={d}
            fill="none"
            stroke={allBeacon ? "var(--tb-beacon)" : "var(--tb-blue)"}
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={allBeacon ? "2 2" : undefined}
          />
        );
      })}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={1.6}
          fill={lastIsBeacon ? "var(--tb-beacon)" : "var(--tb-blue)"}
        />
      )}
    </svg>
  );
}
