"""Narrative extraction — per-metric-value paragraph cache.

For each displayed metric_value, pre-extract the paragraph from the source
report that contains / explains that value, verify the number actually
appears (±2% tolerance), and cache it for instant tooltip display. The
cache is the single source of truth for on-page narratives; no on-demand
LLM calls happen from the API layer.
"""
