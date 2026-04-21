// Shared DB row types. These mirror SCHEMA_SPEC.md v0.1.

export type DisclosureStatus =
  | "disclosed"
  | "not_disclosed"
  | "partially_disclosed"
  | "beacon_estimate"
  | "derived";

export type SourceType =
  | "trailblaze_pdf"
  | "regulator_filing"
  | "sec_filing"
  | "company_ir"
  | "stock_api"
  | "industry_trade"
  | "social_media"
  | "beacon_estimate"
  | "manual_entry";

export type UnitMultiplier = "units" | "thousands" | "millions" | "billions" | null;

export type UnitType = "currency" | "count" | "percentage" | "ratio" | "text";

export type MarketType =
  | "region"
  | "country"
  | "state"
  | "province"
  | "territory"
  | "custom_grouping";

export type DocumentType =
  | "market_update"
  | "company_report"
  | "presentation"
  | "trading_update"
  | "analyst_call"
  | "capital_markets_day"
  | "ma_announcement"
  | "regulatory_update"
  | "shell";

export interface Market {
  id: string;
  name: string;
  slug: string;
  market_type: MarketType;
  iso_country: string | null;
  iso_subdivision: string | null;
  regulator_name: string | null;
  regulator_url: string | null;
  is_regulated: boolean | null;
  regulation_date: string | null;
  currency: string | null;
  tax_rate_igaming: string | null;
  tax_rate_osb: string | null;
  parent_market_id: string | null;
}

export interface Entity {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  country_of_listing: string | null;
  headquarters_country: string | null;
  description: string | null;
  is_active: boolean;
  entity_type_codes: string[]; // aggregated from entity_type_assignments
}

export interface Metric {
  id: string;
  code: string;
  display_name: string;
  short_name: string | null;
  category: string | null;
  unit_type: UnitType;
  description: string | null;
}

export interface Period {
  id: string;
  code: string;
  period_type: string;
  fiscal_year: number | null;
  quarter: number | null;
  start_date: string;
  end_date: string;
  display_name: string | null;
}

export interface Report {
  id: string;
  filename: string;
  document_type: DocumentType;
  published_timestamp: string | null;
  parse_status: string;
  metric_count: number | null;
  parser_version: string | null;
  parsed_at: string | null;
}

export interface MetricValueRow {
  metric_value_id: string;
  entity_id: string | null;
  market_id: string | null;
  metric_id: string;
  metric_code: string;
  metric_display_name: string;
  metric_unit_type: UnitType;
  period_id: string;
  period_code: string;
  period_display_name: string | null;
  period_start: string;
  period_end: string;
  report_id: string | null;
  source_type: SourceType;
  value_numeric: string | null; // pg Numeric returns as string
  value_text: string | null;
  currency: string | null;
  unit_multiplier: UnitMultiplier;
  disclosure_status: DisclosureStatus;
  confidence_score: string | null;
  published_timestamp: string | null;
}

export interface BeaconEstimate {
  metric_value_id: string;
  methodology_code: string;
  model_version: string | null;
  confidence_score: string | null;
  confidence_band_low: string | null;
  confidence_band_high: string | null;
  methodology_notes: string | null;
  inputs: Record<string, unknown> | null;
}

export interface Narrative {
  id: string;
  report_id: string;
  entity_id: string | null;
  market_id: string | null;
  section_code: string;
  content: string;
}

export interface SearchHit {
  kind: "market" | "company" | "metric";
  id: string;
  slug: string | null;
  label: string;
  sublabel: string | null;
}
