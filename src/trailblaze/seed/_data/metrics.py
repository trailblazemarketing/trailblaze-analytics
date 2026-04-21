"""Metric dictionary. Per SCHEMA_SPEC.md §metrics initial seed list."""

from __future__ import annotations


def _m(code: str, display_name: str, category: str, unit_type: str,
       short_name: str | None = None, description: str | None = None,
       is_calculable: bool = False, calculation_formula: str | None = None) -> dict:
    return {
        "code": code,
        "display_name": display_name,
        "short_name": short_name,
        "category": category,
        "unit_type": unit_type,
        "default_currency_handling": "as_reported" if unit_type == "currency" else None,
        "is_calculable": is_calculable,
        "calculation_formula": calculation_formula,
        "description": description,
    }


METRICS: list[dict] = [
    # Revenue & GGR
    _m("revenue", "Revenue", "revenue", "currency", "Revenue"),
    _m("ggr", "Gross Gaming Revenue", "revenue", "currency", "GGR"),
    _m("ngr", "Net Gaming Revenue", "revenue", "currency", "NGR"),
    _m("online_revenue", "Online Revenue", "revenue", "currency"),
    _m("online_ggr", "Online GGR", "revenue", "currency"),
    _m("online_ngr", "Online NGR", "revenue", "currency"),

    # Volume
    _m("handle", "Handle", "volume", "currency", "Handle"),
    _m("turnover", "Turnover", "volume", "currency"),
    _m("sportsbook_handle", "Sportsbook Handle", "volume", "currency"),
    _m("sportsbook_turnover", "Sportsbook Turnover", "volume", "currency"),
    _m("casino_turnover", "Casino Turnover", "volume", "currency"),

    # Profitability
    _m("ebitda", "EBITDA", "profitability", "currency", "EBITDA",
       description="Reported EBITDA (IFRS / GAAP as stated)."),
    _m("adjusted_ebitda", "Adjusted EBITDA", "profitability", "currency", "Adj EBITDA",
       description="Management-adjusted EBITDA, excluding one-offs (M&A, legal, restructuring). Headline metric for most operators."),
    _m("staff_costs", "Staff Costs", "profitability", "currency",
       description="Personnel expense line. Common in IFRS filings."),
    _m("online_ebitda", "Online EBITDA", "profitability", "currency"),
    _m("ebitda_margin", "EBITDA Margin", "profitability", "percentage",
       is_calculable=True, calculation_formula="ebitda / revenue"),
    _m("online_ebitda_margin", "Online EBITDA Margin", "profitability", "percentage",
       is_calculable=True, calculation_formula="online_ebitda / online_revenue"),
    _m("operating_profit", "Operating Profit", "profitability", "currency"),
    _m("ebit_margin", "EBIT Margin", "profitability", "percentage",
       is_calculable=True, calculation_formula="operating_profit / revenue"),
    _m("net_income", "Net Income", "profitability", "currency"),
    _m("gross_margin", "Gross Margin", "profitability", "percentage", is_calculable=True),

    # Customers
    _m("active_customers", "Active Customers", "customers", "count"),
    _m("monthly_actives", "Monthly Active Customers", "customers", "count", "MAU"),
    _m("arpu", "ARPU", "customers", "currency", "ARPU",
       is_calculable=True, calculation_formula="revenue / active_customers"),
    _m("ftd", "First-Time Depositors", "customers", "count", "FTD"),
    _m("ndc", "New Depositing Customers", "customers", "count", "NDC"),
    _m("customer_deposits", "Customer Deposits", "customers", "currency"),

    # Marketing
    _m("marketing_spend", "Marketing Spend", "marketing", "currency"),
    _m("marketing_pct_revenue", "Marketing % of Revenue", "marketing", "percentage",
       is_calculable=True, calculation_formula="marketing_spend / revenue"),
    _m("paid_media_spend", "Paid Media Spend", "marketing", "currency"),
    _m("seo_revenue", "SEO Revenue", "marketing", "currency"),

    # Share
    _m("market_share", "Market Share", "share", "percentage",
       description="Generic share of revenue / GGR when the report does not specify which basis."),
    _m("market_share_ggr", "Market Share (GGR)", "share", "percentage",
       description="Operator's share of total market GGR."),
    _m("market_share_handle", "Market Share (Handle)", "share", "percentage",
       description="Operator's share of total market handle (volume-based)."),
    _m("share_change", "Market Share Change", "share", "percentage"),

    # Sportsbook-specific
    _m("sports_margin_pct", "Sportsbook Gross Win Margin", "operational", "percentage"),
    _m("inplay_pct", "In-play Share of Handle", "operational", "percentage"),

    # Vertical splits
    _m("casino_revenue", "Casino Revenue", "revenue", "currency"),
    _m("casino_ggr", "Casino GGR", "revenue", "currency",
       description="Pre-bonus/promo gross gaming revenue from online casino. iGaming segment."),
    _m("sportsbook_revenue", "Sportsbook Revenue", "revenue", "currency"),
    _m("sportsbook_ggr", "Sportsbook GGR", "revenue", "currency",
       description="Pre-bonus/promo gross gaming revenue from sports betting."),
    _m("lottery_revenue", "Lottery Revenue", "revenue", "currency"),
    _m("dfs_revenue", "DFS Revenue", "revenue", "currency"),
    _m("bingo_revenue", "Bingo Revenue", "revenue", "currency"),
    _m("poker_revenue", "Poker Revenue", "revenue", "currency"),
    _m("horseracing_revenue", "Horseracing Revenue", "revenue", "currency"),

    # Valuation
    _m("ev_ebitda_multiple", "EV/EBITDA", "valuation", "ratio"),
    _m("pe_ratio", "P/E Ratio", "valuation", "ratio"),
    _m("market_cap", "Market Cap", "valuation", "currency"),
    _m("stock_price", "Stock Price", "valuation", "currency"),
    _m("equity_value", "Equity Value", "valuation", "currency"),
    _m("enterprise_value", "Enterprise Value", "valuation", "currency"),
    _m("ownership_stake_pct", "Ownership Stake", "valuation", "percentage"),

    # Cost & spend
    _m("promotions_expense", "Promotions Expense", "profitability", "currency"),
    _m("promotions_pct_ggr", "Promotions % of GGR", "profitability", "percentage",
       is_calculable=True, calculation_formula="promotions_expense / ggr"),

    # Other operational
    _m("app_downloads", "App Downloads", "operational", "count"),
    _m("live_streamed_events", "Live-Streamed Events", "operational", "count"),
    _m("gaming_library_size", "Gaming Library Size", "operational", "count"),
    _m("licensee_count", "Licensee Count", "operational", "count"),

    # Forward guidance
    _m("revenue_guidance", "Revenue Guidance", "guidance", "currency",
       description="Management's forward revenue guidance (point, midpoint, or range)."),
    _m("ebitda_guidance", "EBITDA Guidance", "guidance", "currency",
       description="Management's forward EBITDA guidance (point, midpoint, or range)."),
]
