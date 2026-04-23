"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import { ISO_NUMERIC_TO_ALPHA2 } from "@/lib/iso-3166";
import { formatEur } from "@/lib/format";

export interface CountryDatum {
  iso2: string;
  slug: string;
  name: string;
  onlineGgrEur: number | null;
  yoyPct: number | null;
  operatorCount: number;
  latestPeriodCode: string | null;
}

// Cyan gradient — dark for low, bright for high. Drives `fill` per
// country geography by mapping the country's online_ggr value into a
// log-scaled [0..1] band, then interpolating between baseline grey
// and bright cyan.
function fillForValue(value: number | null, max: number): string {
  if (value == null || value <= 0) return "#1f2230";
  if (max <= 0) return "#1f2230";
  // Log-scale so a small handful of huge markets don't flatten the
  // rest into invisibility. clamp to [0.05, 1].
  const logV = Math.log10(value + 1);
  const logM = Math.log10(max + 1);
  const t = Math.max(0.05, Math.min(1, logV / logM));
  // Interpolate from #003a4d (dark cyan) → #00d2ff (bright cyan)
  const r = Math.round(0 + (0 - 0) * t);
  const g = Math.round(58 + (210 - 58) * t);
  const b = Math.round(77 + (255 - 77) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

type GeoFeature = {
  rsmKey: string;
  id: string | number;
  properties: { name?: string };
};

export function WorldHeatmap({
  geoUrl,
  countries,
  height = 450,
}: {
  geoUrl: string;
  countries: CountryDatum[];
  height?: number;
}) {
  const router = useRouter();
  const [hover, setHover] = React.useState<{
    geoName: string;
    datum: CountryDatum | null;
    cx: number;
    cy: number;
  } | null>(null);

  // Lookup map iso2 → datum, plus the max value for the colour scale.
  const byIso2 = React.useMemo(() => {
    const m = new Map<string, CountryDatum>();
    for (const c of countries) m.set(c.iso2, c);
    return m;
  }, [countries]);
  const max = React.useMemo(
    () => countries.reduce((m, c) => Math.max(m, c.onlineGgrEur ?? 0), 0),
    [countries],
  );

  return (
    <div className="relative" style={{ height }}>
      <ComposableMap
        projectionConfig={{ scale: 145 }}
        width={900}
        height={height}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={geoUrl}>
          {({ geographies }: { geographies: GeoFeature[] }) =>
            geographies.map((geo) => {
              const numId = String(geo.id).padStart(3, "0");
              const iso2 = ISO_NUMERIC_TO_ALPHA2[numId] ?? null;
              const datum = iso2 ? (byIso2.get(iso2) ?? null) : null;
              const fill = fillForValue(datum?.onlineGgrEur ?? null, max);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="var(--tb-bg)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none", cursor: datum ? "pointer" : "default" },
                    hover: { outline: "none", fill: datum ? "#00d2ff" : fill },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(e) => {
                    setHover({
                      geoName: geo.properties.name ?? "",
                      datum,
                      cx: e.clientX,
                      cy: e.clientY,
                    });
                  }}
                  onMouseMove={(e) => {
                    setHover((h) =>
                      h ? { ...h, cx: e.clientX, cy: e.clientY } : null,
                    );
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    if (datum?.slug) {
                      window.open(`/markets/${datum.slug}`, "_blank");
                    }
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-tb-border bg-tb-surface px-3 py-2 text-[11px] font-mono text-tb-text shadow-lg"
          style={{
            left: hover.cx + 12,
            top: hover.cy + 12,
            transform: "translate(0, 0)",
          }}
        >
          <div className="font-semibold normal-case">
            {hover.datum?.name ?? hover.geoName}
            {!hover.datum && (
              <span className="ml-2 text-[10px] text-tb-muted">no data</span>
            )}
          </div>
          {hover.datum?.onlineGgrEur != null && (
            <div className="mt-0.5 text-tb-muted">
              Online GGR{" "}
              <span className="text-tb-text">
                {formatEur(hover.datum.onlineGgrEur)}
              </span>
              {hover.datum.latestPeriodCode && (
                <span className="ml-1 text-[10px]">
                  · {hover.datum.latestPeriodCode}
                </span>
              )}
            </div>
          )}
          {hover.datum && (
            <div className="text-tb-muted">
              {hover.datum.operatorCount} operator
              {hover.datum.operatorCount === 1 ? "" : "s"}
              {hover.datum.yoyPct != null && (
                <span
                  className={
                    "ml-2 " +
                    (hover.datum.yoyPct > 0
                      ? "text-tb-success"
                      : hover.datum.yoyPct < 0
                        ? "text-tb-danger"
                        : "text-tb-muted")
                  }
                >
                  YoY {hover.datum.yoyPct > 0 ? "+" : ""}
                  {hover.datum.yoyPct.toFixed(1)}%
                </span>
              )}
            </div>
          )}
          {hover.datum && (
            <div className="mt-1 text-[10px] text-tb-blue">
              click → open in new tab
            </div>
          )}
        </div>
      )}
    </div>
  );
}
