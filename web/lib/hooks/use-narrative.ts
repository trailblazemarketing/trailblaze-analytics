"use client";
import * as React from "react";

export interface Narrative {
  narrative_text: string;
  source_report: {
    id: string;
    filename: string;
    published: string | null;
  };
  verified: boolean;
  extraction_model: string;
}

export interface UseNarrativeParams {
  entity: string | null | undefined;
  metric: string | null | undefined;
  period: string | null | undefined;
  market?: string | null;
  // If false, the hook never fetches (consumer controls when to trigger,
  // e.g. after a 300ms hover dwell). Default true so callers can opt
  // into lazy behaviour explicitly.
  enabled?: boolean;
}

type Cached = Narrative | "not-cached" | null;

// Simple in-memory cache keyed on tuple. The /api/narratives endpoint
// is itself a cache read, but we don't want every hover to re-fetch the
// same tuple across mounts — this elides redundant network calls for
// the session.
const _cache = new Map<string, Cached>();

function cacheKey(p: UseNarrativeParams): string | null {
  if (!p.entity || !p.metric || !p.period) return null;
  return `${p.entity}|${p.metric}|${p.period}|${p.market ?? ""}`;
}

export function useNarrative(params: UseNarrativeParams): {
  narrative: Narrative | null;
  loading: boolean;
  hasNarrative: boolean;
} {
  const enabled = params.enabled !== false;
  const key = cacheKey(params);
  const cached = key ? _cache.get(key) ?? null : null;

  const [data, setData] = React.useState<Cached>(cached);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!enabled || !key) return;
    if (_cache.has(key)) {
      setData(_cache.get(key) ?? null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const url = new URL("/api/narratives", window.location.origin);
    url.searchParams.set("entity", params.entity!);
    url.searchParams.set("metric", params.metric!);
    url.searchParams.set("period", params.period!);
    if (params.market) url.searchParams.set("market", params.market);
    fetch(url.toString(), { cache: "force-cache" })
      .then(async (r) => {
        if (!r.ok) return null;
        if (r.headers.get("X-Narrative-Status") === "not-cached") return "not-cached";
        const body = await r.json().catch(() => null);
        return body as Narrative | null;
      })
      .then((result) => {
        if (cancelled) return;
        const normalised: Cached = result === "not-cached" ? "not-cached" : result;
        _cache.set(key, normalised);
        setData(normalised);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, params.entity, params.metric, params.period, params.market]);

  const narrative =
    data && data !== "not-cached" ? (data as Narrative) : null;
  return {
    narrative,
    loading,
    hasNarrative: narrative !== null,
  };
}
