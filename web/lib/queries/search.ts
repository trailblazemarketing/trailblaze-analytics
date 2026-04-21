import "server-only";
import { query } from "@/lib/db";
import type { SearchHit } from "@/lib/types";

// Unified fuzzy search over markets + companies + metrics. Capped at ~20
// results per bucket; the UI groups them.
export async function globalSearch(
  q: string,
  limit = 8,
): Promise<SearchHit[]> {
  const needle = q.trim();
  if (!needle) return [];
  const like = `%${needle}%`;

  const markets = await query<{
    id: string;
    slug: string;
    name: string;
    market_type: string;
    iso_country: string | null;
  }>(
    `SELECT id, slug, name, market_type, iso_country
     FROM markets
     WHERE name ILIKE $1 OR slug ILIKE $1 OR $2 = ANY(coalesce(aliases, ARRAY[]::text[]))
     ORDER BY CASE WHEN name ILIKE $3 THEN 0 ELSE 1 END, name
     LIMIT $4`,
    [like, needle, `${needle}%`, limit],
  );

  const companies = await query<{
    id: string;
    slug: string;
    name: string;
    ticker: string | null;
  }>(
    `SELECT id, slug, name, ticker
     FROM entities
     WHERE is_active = true AND (name ILIKE $1 OR slug ILIKE $1 OR ticker ILIKE $1 OR $2 = ANY(coalesce(aliases, ARRAY[]::text[])))
     ORDER BY CASE WHEN name ILIKE $3 THEN 0 ELSE 1 END, name
     LIMIT $4`,
    [like, needle, `${needle}%`, limit],
  );

  const metrics = await query<{
    id: string;
    code: string;
    display_name: string;
    category: string | null;
  }>(
    `SELECT id, code, display_name, category
     FROM metrics
     WHERE code ILIKE $1 OR display_name ILIKE $1 OR short_name ILIKE $1
     ORDER BY CASE WHEN display_name ILIKE $2 THEN 0 ELSE 1 END, display_name
     LIMIT $3`,
    [like, `${needle}%`, limit],
  );

  const hits: SearchHit[] = [
    ...markets.map((m) => ({
      kind: "market" as const,
      id: m.id,
      slug: m.slug,
      label: m.name,
      sublabel: [m.market_type, m.iso_country].filter(Boolean).join(" · ") || null,
    })),
    ...companies.map((c) => ({
      kind: "company" as const,
      id: c.id,
      slug: c.slug,
      label: c.name,
      sublabel: c.ticker,
    })),
    ...metrics.map((m) => ({
      kind: "metric" as const,
      id: m.id,
      slug: m.code,
      label: m.display_name,
      sublabel: m.category,
    })),
  ];

  return hits;
}
