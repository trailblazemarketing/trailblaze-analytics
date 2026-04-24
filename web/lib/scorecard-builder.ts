// Build KpiTile arrays for Scorecard primitives from canonical DB rows.
// Defines the per-entity-type KPI panel recipe from UI_SPEC_2.

import "server-only";
import type { KpiTile } from "@/components/primitives/scorecard";
import type { CanonicalRow } from "@/lib/queries/analytics";
import {
  nativeToEur,
  nativeToEurInferred,
  toRawNumeric,
  yoyPctGated,
} from "@/lib/queries/analytics";
import { formatMetricValueEur, inferUnitMultiplier } from "@/lib/format";
import type {
  BeaconEstimate,
  MetricValueRow,
  UnitType,
} from "@/lib/types";

// UI_SPEC_2 Panel definitions — metric code → label + unit hint.
export const PANELS = {
  operator: {
    // T2 small-fix 3: operator primary is now Revenue / EBITDA Margin plus
    // two custom stock-snapshot tiles rendered by the Company detail page
    // (Market Cap + Stock Price). Active Users + ARPU moved to secondary so
    // they still appear in the 8-tile row when the entity reports them.
    primary: [
      { code: "revenue", label: "Total Revenue" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
    ],
    secondary: [
      { code: "active_customers", label: "Active Users" },
      { code: "arpu", label: "ARPU" },
      { code: "ftd", label: "FTDs" },
      { code: "marketing_pct_revenue", label: "Marketing % Rev" },
      { code: "online_revenue", label: "Online Rev" },
      { code: "casino_revenue", label: "Casino Rev" },
      { code: "sportsbook_revenue", label: "Sportsbook Rev" },
      { code: "sports_margin_pct", label: "Sports Margin" },
      { code: "ebitda", label: "EBITDA" },
      { code: "ngr", label: "NGR" },
    ],
  },
  affiliate: {
    primary: [
      { code: "revenue", label: "Total Revenue" },
      { code: "ebitda", label: "EBITDA" },
      { code: "ndc", label: "NDCs" },
      { code: "arpu", label: "Revenue / NDC" },
    ],
    secondary: [
      { code: "seo_revenue", label: "SEO Revenue" },
      { code: "paid_media_spend", label: "Paid Media" },
      { code: "ftd", label: "FTDs" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
      { code: "marketing_spend", label: "Marketing Spend" },
      { code: "ngr", label: "NGR" },
      { code: "market_share", label: "Market Share" },
      { code: "ebit_margin", label: "EBIT Margin" },
    ],
  },
  b2b_platform: {
    primary: [
      { code: "revenue", label: "Total Revenue" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
      { code: "turnover", label: "Op. Turnover" },
      { code: "ebitda", label: "EBITDA" },
    ],
    secondary: [
      { code: "licensee_count", label: "Licensees" },
      { code: "live_streamed_events", label: "Live Events" },
      { code: "gaming_library_size", label: "Library Size" },
      { code: "online_revenue", label: "Online Rev" },
      { code: "casino_revenue", label: "Casino Rev" },
      { code: "sportsbook_revenue", label: "Sportsbook Rev" },
      { code: "ngr", label: "NGR" },
      { code: "ebit_margin", label: "EBIT Margin" },
    ],
  },
  b2b_supplier: {
    primary: [
      { code: "revenue", label: "Total Revenue" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
      { code: "licensee_count", label: "Licensees" },
      { code: "ebitda", label: "EBITDA" },
    ],
    secondary: [
      { code: "gaming_library_size", label: "Library Size" },
      { code: "online_revenue", label: "Online Rev" },
      { code: "market_share", label: "Market Share" },
      { code: "gross_margin", label: "Gross Margin" },
      { code: "net_income", label: "Net Income" },
      { code: "operating_profit", label: "Op Profit" },
      { code: "ngr", label: "NGR" },
      { code: "ebit_margin", label: "EBIT Margin" },
    ],
  },
  lottery: {
    primary: [
      { code: "ggr", label: "Total GGR" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
      { code: "online_ggr", label: "Online GGR" },
      { code: "active_customers", label: "Active Players" },
    ],
    secondary: [
      { code: "lottery_revenue", label: "Lottery Rev" },
      { code: "casino_revenue", label: "Casino Rev" },
      { code: "sportsbook_revenue", label: "Sports Rev" },
      { code: "ebitda", label: "EBITDA" },
      { code: "net_income", label: "Net Income" },
      { code: "ftd", label: "FTDs" },
      { code: "arpu", label: "ARPU" },
      { code: "ngr", label: "NGR" },
    ],
  },
  dfs: {
    primary: [
      { code: "revenue", label: "Revenue" },
      { code: "ebitda", label: "EBITDA" },
      { code: "monthly_actives", label: "Monthly Actives" },
      { code: "app_downloads", label: "App Downloads" },
    ],
    secondary: [
      { code: "ftd", label: "FTDs" },
      { code: "ebitda_margin", label: "EBITDA Margin" },
      { code: "arpu", label: "ARPU" },
      { code: "active_customers", label: "Active Users" },
      { code: "dfs_revenue", label: "DFS Revenue" },
      { code: "ngr", label: "NGR" },
      { code: "marketing_pct_revenue", label: "Marketing %" },
      { code: "promotions_expense", label: "Promotions" },
    ],
  },
  market: {
    // Primary slot 3 was `handle` ("Sportsbook Handle"): 8 rows across 3
    // state markets globally — sparse and semantically misleading (the
    // dictionary display_name for `handle` is just "Handle"). Swapped with
    // secondary `sportsbook_handle` which carries 391 rows across 29
    // markets at country + province + state scope and is the actual
    // sportsbook-handle metric. Label now matches the dictionary.
    primary: [
      { code: "online_ggr", label: "Online GGR (LTM)" },
      { code: "online_ngr", label: "Online NGR" },
      { code: "sportsbook_handle", label: "Sportsbook Handle" },
      { code: "ggr", label: "Total GGR" },
    ],
    secondary: [
      { code: "sportsbook_revenue", label: "Sportsbook Rev" },
      { code: "casino_revenue", label: "iGaming Rev" },
      { code: "handle", label: "Total Handle" },
      { code: "sportsbook_turnover", label: "Sports Turnover" },
      { code: "active_customers", label: "Active Players" },
      { code: "ftd", label: "FTDs" },
      { code: "market_share", label: "Market Share" },
      { code: "ngr", label: "NGR" },
    ],
  },
} as const;

export type PanelKind = keyof typeof PANELS;

export function buildKpiTile(
  recipe: { code: string; label: string },
  rows: CanonicalRow[] | undefined,
  beacon: Map<string, BeaconEstimate>,
): KpiTile | null {
  if (!rows || rows.length === 0) {
    return {
      code: recipe.code,
      label: recipe.label,
      valueFormatted: null,
      yoy: null,
      spark: [],
      source: null,
      disclosureStatus: undefined,
    };
  }

  // rows come sorted DESC by start_date — newest first
  const latest = rows[0];
  // Find YoY comparison — same cadence, ~12 months back by start_date.
  // Restricting to matching period_type is essential: without it, a Q1
  // pick was being compared to a sibling H1 / 9M / FY row that
  // happened to share the same start_date (e.g. Betsson Q1-26 vs 9M-25
  // both start 2025-01-01 → bogus -68% YoY). LTM and derived rows are
  // also excluded so a synthesised LTM doesn't anchor a real-period
  // comparison.
  const latestStart = new Date(latest.period_start).getTime();
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  const prev = rows.find((r) => {
    if (r === latest) return false;
    if (r.period_type !== latest.period_type) return false;
    if (r.period_type === "ltm") return false;
    const d = new Date(r.period_start).getTime();
    return Math.abs(d - (latestStart - yearMs)) < 45 * 24 * 60 * 60 * 1000;
  });

  const isCurrency = latest.metric_unit_type === "currency";
  const spark = [...rows]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .slice(-8)
    .map((r) =>
      isCurrency
        ? nativeToEurInferred(r.value_numeric, r.unit_multiplier, r.eur_rate, r.metric_code)
        : toRawNumeric(r.value_numeric, r.unit_multiplier),
    );
  const beaconMask = [...rows]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .slice(-8)
    .map(
      (r) =>
        r.disclosure_status === "beacon_estimate" ||
        r.disclosure_status === "derived",
    );

  // Defensive multiplier inference: some extraction paths (notably US
  // state regulator rows attached at the market level — online_ggr,
  // ggr, casino_revenue on /markets/us-new-jersey) carry
  // unit_multiplier=NULL despite the value being millions of the
  // reported currency. Without this step the formatter renders
  // "€236.65" instead of "€236.65M". Parser root-cause tracked in
  // COMPANY_AUDIT_PARSER_TODOS.md; this inference is the defensive
  // display-layer fallback that also protects every other market page
  // with the same data shape.
  const inferredMult = inferUnitMultiplier(
    latest.value_numeric != null ? Number(latest.value_numeric) : null,
    latest.metric_code,
    latest.unit_multiplier,
  );
  const { display, tooltip } = formatMetricValueEur(
    {
      value_numeric: latest.value_numeric,
      value_text: latest.value_text,
      metric_unit_type: latest.metric_unit_type,
      currency: latest.currency,
      unit_multiplier: inferredMult,
    },
    latest.eur_rate,
  );

  const yoy = prev
    ? yoyPctGated({
        cur: latest.value_numeric,
        curMult: latest.unit_multiplier,
        curCcy: latest.currency,
        curRate: latest.eur_rate,
        curDisclosure: latest.disclosure_status,
        prev: prev.value_numeric,
        prevMult: prev.unit_multiplier,
        prevCcy: prev.currency,
        prevRate: prev.eur_rate,
        prevDisclosure: prev.disclosure_status,
        unitType: latest.metric_unit_type,
      })
    : null;

  // Compact period label for the tile — round-7 truth-check surfaced
  // that Hero tiles mixed single-quarter Revenue with LTM NGR and looked
  // like NGR > Revenue. Tag every tile with its actual period. Prefer
  // the DB display_name ("Q1 2026", "LTM Q1 2026", "FY 2025"), fall back
  // to the raw code.
  const period = latest.period_display_name ?? latest.period_code ?? null;
  // Raw period code separately — the narrative cache (API + hook) keys
  // on the code, not the display string.
  const periodCode = latest.period_code ?? null;

  return {
    code: recipe.code,
    label: recipe.label,
    valueFormatted: display,
    nativeTooltip: tooltip,
    yoy,
    spark,
    beaconMask,
    source: latest.source_type,
    disclosureStatus: latest.disclosure_status,
    beacon: beacon.get(latest.metric_value_id) ?? null,
    unitHint: unitHint(latest.metric_unit_type),
    period,
    periodCode,
  };
}

function unitHint(u: UnitType): string | null {
  if (u === "currency") return null; // symbol baked into formatted value
  if (u === "percentage") return "%";
  if (u === "count") return "#";
  if (u === "ratio") return "×";
  return null;
}

// T2 small-fix 2: derive EBITDA margin from ebitda + revenue when no
// disclosed margin row exists for a period. The computed value carries
// disclosure_status='derived' (not 'beacon_estimate' — Beacon™ is reserved
// for the estimate engine). Render treatment is the caller's concern —
// this function only materializes the row into the byCode map so every
// downstream reader (primary tile, quarterly table, sparkline) sees it.
function deriveMarginForPeriod(
  periodCode: string,
  byCode: Map<string, CanonicalRow[]>,
): CanonicalRow | null {
  const ebitdaRow = (byCode.get("ebitda") ?? []).find(
    (r) => r.period_code === periodCode,
  );
  const revRow = (byCode.get("revenue") ?? []).find(
    (r) => r.period_code === periodCode,
  );
  if (!ebitdaRow || !revRow) return null;
  // Require both sides to be real disclosed values. Partially_disclosed is
  // still source-of-truth. Beacon™ / not_disclosed are rejected so we don't
  // present a model-implied ratio as derived.
  const okDisclose = (s: string | null) =>
    s === "disclosed" || s === "partially_disclosed";
  if (!okDisclose(ebitdaRow.disclosure_status)) return null;
  if (!okDisclose(revRow.disclosure_status)) return null;
  if (ebitdaRow.value_numeric == null || revRow.value_numeric == null) return null;

  const ebitdaEur = nativeToEur(
    ebitdaRow.value_numeric,
    ebitdaRow.unit_multiplier,
    ebitdaRow.eur_rate,
  );
  const revEur = nativeToEur(
    revRow.value_numeric,
    revRow.unit_multiplier,
    revRow.eur_rate,
  );
  if (ebitdaEur == null || revEur == null) return null;
  if (Math.abs(revEur) < 1) return null; // guard near-zero
  const pct = (ebitdaEur / revEur) * 100;
  if (!Number.isFinite(pct)) return null;
  if (Math.abs(pct) > 200) return null; // outlier / unit mismatch guard

  return {
    ...ebitdaRow,
    metric_value_id: `derived:ebitda_margin:${periodCode}:${ebitdaRow.entity_id ?? ebitdaRow.market_id}`,
    metric_id: "derived",
    metric_code: "ebitda_margin",
    metric_display_name: "EBITDA Margin (derived)",
    metric_unit_type: "percentage",
    value_numeric: pct.toFixed(4),
    unit_multiplier: null,
    currency: null,
    disclosure_status: "derived",
    confidence_score: null,
    eur_rate: null,
  };
}

// For every period in which ebitda_margin has no disclosed row but ebitda +
// revenue both do, insert a derived CanonicalRow into the map. Returns a
// new map; the original is not mutated.
export function augmentDerivedEbitdaMargin(
  byCode: Map<string, CanonicalRow[]>,
): Map<string, CanonicalRow[]> {
  const marginRows = byCode.get("ebitda_margin") ?? [];
  const havePeriods = new Set(
    marginRows
      .filter((r) => r.value_numeric != null)
      .map((r) => r.period_code),
  );
  const ebitdaRows = byCode.get("ebitda") ?? [];
  const additions: CanonicalRow[] = [];
  for (const er of ebitdaRows) {
    if (havePeriods.has(er.period_code)) continue;
    const derived = deriveMarginForPeriod(er.period_code, byCode);
    if (derived) additions.push(derived);
  }
  if (additions.length === 0) return byCode;
  const next = new Map(byCode);
  const combined = [...marginRows, ...additions].sort((a, b) =>
    b.period_start.localeCompare(a.period_start),
  );
  next.set("ebitda_margin", combined);
  return next;
}

// Per-panel-kind tile suppression: irrelevant tiles for non-operator
// entity types render em-dash for any data that happens to be present
// because the source extractor often misclassifies a small adjacent
// number (e.g. a casino-side promotional spend on a lottery operator).
// Until the proper specialised panels land (Phase 2.5 Unit C/D), gate
// the generic Operator-style recipes so lottery / affiliate / B2B / DFS
// pages don't show Casino Rev or Sportsbook Rev tiles that don't fit
// the entity. For lottery, casino_revenue stays visible only when
// `casino_ggr` is also disclosed — that signals a real casino arm
// rather than parser bleed-through.
function isSuppressedForKind(
  kind: PanelKind,
  code: string,
  byCode: Map<string, CanonicalRow[]>,
): boolean {
  switch (kind) {
    case "lottery":
      if (code === "sportsbook_revenue") return true;
      if (code === "casino_revenue") {
        const hasCasinoGgr = (byCode.get("casino_ggr") ?? []).some(
          (r) => r.value_numeric != null,
        );
        return !hasCasinoGgr;
      }
      return false;
    case "affiliate":
    case "b2b_platform":
    case "b2b_supplier":
    case "dfs":
      return code === "casino_revenue" || code === "sportsbook_revenue";
    case "operator":
    case "market":
      return false;
  }
}

// Filter: a panel tile is shown only if we have >=1 row of data (not all null).
// Otherwise hide (per spec: "Better to have 7 tiles than 8 with a blank one").
export function buildPanelTiles(
  kind: PanelKind,
  byCode: Map<string, CanonicalRow[]>,
  beacon: Map<string, BeaconEstimate>,
): { primary: KpiTile[]; secondary: KpiTile[] } {
  const recipe = PANELS[kind];
  const primaryRecipes = recipe.primary.filter(
    (r) => !isSuppressedForKind(kind, r.code, byCode),
  );
  const secondaryRecipes = recipe.secondary.filter(
    (r) => !isSuppressedForKind(kind, r.code, byCode),
  );
  const primary = primaryRecipes
    .map((r) => buildKpiTile(r, byCode.get(r.code), beacon))
    .filter((t): t is KpiTile => !!t && (t.valueFormatted != null || primaryRecipes.length <= 4));
  const secondary = secondaryRecipes
    .map((r) => buildKpiTile(r, byCode.get(r.code), beacon))
    .filter((t): t is KpiTile => !!t && t.valueFormatted != null);
  return { primary, secondary };
}
