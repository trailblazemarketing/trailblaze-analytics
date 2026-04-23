# Phase 1.2.5 — Source Priority & Synthetic PDF Deduplication

**Status:** Design. Based on diagnosis from session 4 (2026-04-23). Not implemented.
**Prereq:** Phase 1.1 closed (✅). Sequenced alongside Phase 1.2 (entity canonicalisation) — see §7.
**Blocks:** Meaningful Company detail page rendering for entities covered by both pipelines; Phase 2 data expansion (which assumes a clean source hierarchy); Phase 2.5 rich extraction (which should only run against canonical sources, not derivations).

---

## 1. The problem, in one sentence

The DB currently ingests analyst content via two parallel pipelines — Oyvind Miller's raw emails (via Gmail) and Trailblaze synthetic PDFs (OpenAI-generated narrative reformattings of those same emails, created for the `reporting.trailblaze-marketing.com` portal). Both feed the parser. The result is functionally duplicate, often lower-quality extractions from the synthetics polluting the corpus, with no source-priority rule deciding which wins when they overlap.

## 2. The diagnosis (session 4 evidence)

Concrete example: NorthStar Gaming Q3-25.

Two reports attributed to NorthStar:
- `gmail_oyvindmiller_20251128_allwyn-cmd-tsogo-sun-and-northstar-gamin.pdf` — raw Oyvind email, `document_type='analyst_call'`
- `Tsogo_Sun_and_NorthStar_Gaming_1764343980.pdf` — Trailblaze synthetic reformatting of the same content, `document_type='company_report'`

Fourteen metric rows between them. Four metrics have identical Q3-25 values from both sources (revenue 6.9 CAD, marketing_spend 2.3 CAD, operating_profit -2.0 CAD, marketing_pct_revenue ~32.6/33). The Oyvind extraction is consistently richer — it has trailing 9M-25 and Q3-24 data the synthetic doesn't. The synthetic introduced one bad row (`casino_revenue=6.1 CAD`) that is actually Ontario gaming revenue misclassified.

**Every single row has `is_canonical = false`.** Zero canonical rows across both sources. The `is_canonical` flag exists in the schema but is not being set on any of these rows.

The Company detail page renders €4.2M total revenue (correct — 6.9 CAD FX-converted) but a thin view of the entity, because the UI's aggregation is reading a narrow slice of what the DB actually holds.

Pattern likely repeats across Flutter (7 source reports visible on that page, looks like 4 synthetics + 3 Oyvinds) and many other entities.

## 3. The policy (Andrew's decision, 2026-04-23)

Three-part rule:

1. **If an Oyvind email exists for a given analytical content: Oyvind is canonical.** The corresponding synthetic PDF's metric_values are non-canonical, ignored by the UI.
2. **If no Oyvind email exists: the synthetic PDF is canonical.** Historical reports where the synthetic is the only source remain usable.
3. **Going forward: stop ingesting synthetic PDFs into the parser.** The reporting portal still produces them for human consumption, but they should not reach `reports` or `metric_values`.

This is a clean, product-justified rule: Oyvind is the primary source of truth, synthetics are a presentation layer, and there's no need to keep polluting the dataset.

## 4. Three workstreams

The policy decomposes into three independent workstreams with different risk profiles.

### Workstream A — Historical dedup (cleanup)

For every (Oyvind, synthetic) pair where both exist in the DB covering the same analytical content:
- Mark the synthetic's metric_values as non-canonical (or delete them, or delete the synthetic report entirely — decision open, see §5)
- Leave Oyvind-only and synthetic-only rows untouched for now

**Risk:** destructive if we delete rather than flag. Reversible if we use the `is_canonical` flag, irreversible if we use hard deletes.

**Blocker:** needs a **matching heuristic** to pair synthetics with their Oyvind originals — see §5.

### Workstream B — Stop the tap (ingest-side fix)

Modify the ingestion pipeline so new synthetic PDFs are either:
- **(b1)** not ingested at all into `reports` / `metric_values`, OR
- **(b2)** ingested but marked `is_canonical = false` from birth, and filtered out of UI queries

**Risk:** low. Ingest-side change only. Doesn't touch existing data.

**Blocker:** need to identify where synthetic PDFs enter the pipeline. Likely an HTTP-based ingest from `reporting.trailblaze-marketing.com` or a file-drop watcher. Candidate for Claude Code investigation.

### Workstream C — Canonical flag wiring (deeper fix)

`is_canonical` is false on every row we've looked at. Either:
- The canonicalisation logic isn't running
- It is running but nothing qualifies under its current rules
- It was never wired up and the column is dormant
- The UI queries don't filter on it anyway, so it doesn't matter

Regardless of A and B, this needs investigating — because if we flip Oyvind rows to canonical and the UI still doesn't read them, we're not done.

**Risk:** medium. Touches query-building code. Could surface broader issues with how canonicalisation is supposed to work.

**Prerequisite:** understand what's currently in `web/lib/queries/companies.ts` and related files — does it filter on `is_canonical = true`, or does it aggregate over all rows and deduplicate some other way?

## 5. Open design questions (flagged unknowns — must be answered before Workstream A)

These are genuinely open. The "skip investigation" decision means we've captured them here for when implementation begins.

1. **Matching heuristic.** How do we pair a synthetic PDF with its Oyvind original? Candidates:
   - (a) Filename pattern matching (synthetic filenames follow a pattern like `CompanyName_Topic_<timestamp>.pdf`; Oyvind filenames are `gmail_oyvindmiller_<YYYYMMDD>_<slug>.pdf`). Need timestamp ↔ date proximity match + content-slug similarity.
   - (b) Content-hash similarity on `reports.raw_text`.
   - (c) Manual pairing via a mapping table.
   - (d) Skip matching entirely — assume ALL synthetics are derivations of SOME Oyvind, and just demote all synthetics once Oyvind coverage is verified for a given period/entity.

   Recommendation to start: (a) filename + timestamp proximity, falling back to (b) content similarity for anything unmatched. Manual review of the unmatched residue.

2. **Demote or delete?** Two strategies for the historical cleanup:
   - **Demote** — flip `is_canonical` to `false` on synthetic metric_values. Reversible. Keeps raw_text around. UI filters them out. But DB keeps growing.
   - **Delete** — drop synthetic reports + their metric_values entirely. Irreversible. Cleaner DB. Loses the ability to "see what the synthetic said" if we ever need to audit.

   Recommendation: **demote first**, monitor for a few weeks, delete later if nothing references the demoted rows.

3. **Does `is_canonical` actually get read by the UI?** Unknown. Needs Claude Code investigation of `web/lib/queries/` files. If no, Workstream C becomes bigger than just "flip flags."

4. **Synthetic PDFs serving the portal.** Are the synthetic PDFs still being generated for `reporting.trailblaze-marketing.com` human consumption? If yes, Workstream B needs to preserve that generation path while stopping the parser ingestion. If no, the whole synthetic pipeline can be deprecated.

5. **Scale unknown.** We haven't counted how many synthetic-pipeline reports exist. Could be 10, could be 200+. Affects effort estimate for Workstream A. Deliberately deferred per session 4 decision.

6. **Entity-attribution side issues.** The NorthStar investigation surfaced a misclassification (`casino_revenue = 6.1 CAD` which is actually Ontario gaming revenue). That's a parser-quality issue on the synthetic, not a dedup issue. Demoting synthetic rows fixes it by making the misclassification invisible — but the root cause (synthetic PDFs producing weaker extractions) is worth naming here. Phase 2.5's rich extraction on Oyvind originals makes this less relevant over time.

## 6. Implementation sequence (when this starts)

Sequential — each step unblocks the next.

**Step 0.5 — Scope investigation (read-only, ~30 min)**
- Count synthetic vs Gmail-sourced reports in the DB
- Sample filename patterns for both
- Count `is_canonical` distribution across all metric_values
- Grep `web/lib/queries/` for `is_canonical` usage
- Outputs: scope numbers, matching-heuristic feasibility assessment, UI-filter confirmation

**Step 1 — Workstream B (stop the tap) — 1-2 hours**
- Identify where synthetic PDFs enter the parser pipeline
- Disable that path, OR add a guard that tags their metric_values as non-canonical
- Test: upload a synthetic PDF, confirm it doesn't produce canonical rows
- Low risk, immediately valuable — stops the bleeding

**Step 2 — Workstream C (canonical flag wiring) — 2-4 hours**
- Audit `web/lib/queries/companies.ts` and related for `is_canonical` handling
- If UI doesn't currently filter on it, add the filter
- Write/verify the canonicalisation logic: for each (entity_id, metric_id, period_id) group, exactly one row should be canonical per source-priority rule
- Test against known entities with multiple sources (NorthStar, Flutter)

**Step 3 — Workstream A (historical dedup) — 2-4 hours, needs care**
- Implement the matching heuristic
- For each matched synthetic, flip its metric_values to `is_canonical = false`
- Leave raw_text + report row intact (demote, don't delete)
- Dry-run first with a report of what WOULD change
- Execute after sign-off
- Spot-check UI for NorthStar, Flutter, and 3 other entities post-change

**Step 4 — Roadmap update**
- Mark Phase 1.2.5 as closed
- Note any residue (e.g., X synthetic reports couldn't be auto-matched, requiring manual review)

## 7. Sequencing relative to Phase 1.2

Phase 1.2 is entity canonicalisation (~506 auto_added entities). This phase is source canonicalisation (~unknown number of synthetic PDFs).

**They should probably happen in parallel or overlapping**, because:
- Entity canonicalisation benefits from clean source hierarchy (you don't want to merge "NorthStar Gaming" with "Northstar Gaming Corp" while staring at a synthetic PDF's entity noise)
- Source canonicalisation benefits from clean entities (the matching heuristic for synthetic ↔ Oyvind may involve entity slugs)
- Both are Phase 1 cleanup work blocking Phase 2 onwards

**Recommendation:** Run Step 0.5 (scope investigation) of this phase BEFORE starting Phase 1.2, so we know the scale and can decide sequencing properly. Then interleave: start Phase 1.2 entity work, run Step 1 (stop the tap) of this phase in parallel as it's low-risk, do entity canonicalisation in the main session, return to this phase's Steps 2-3 once entities are clean.

## 8. What this phase does NOT include

- Changes to the Oyvind ingestion pipeline itself (it's working fine)
- Changes to the synthetic PDF *generation* (that's a separate portal concern — the PDFs can keep being made for humans to read)
- Parser quality improvements on synthetic-derived extractions (not needed if we demote them all)
- Entity canonicalisation (that's Phase 1.2)
- Changes to `disclosure_status` semantics (`derived`, `beacon_estimate`, etc. — unrelated)

## 9. Related files

- `documentation/ROADMAP_2.md` — insert Phase 1.2.5 entry referencing this doc
- `documentation/PHASE_2_5_DESIGN_v2.md` — Phase 2.5 depends on clean sources; rich extraction should only run against canonical (Oyvind) raw_text
- `web/lib/queries/companies.ts` — likely contains the Company detail page query; needs audit in Step 0.5
- `web/lib/queries/analytics.ts` — may also contain relevant query logic
- Ingest pipeline entry point for synthetic PDFs — unknown location, identify in Step 1

## 10. Change log

- **2026-04-23** — Initial draft after NorthStar Gaming session-4 diagnosis. Captures the three-part source-priority rule from Andrew's sign-off and the three-workstream decomposition. Unknowns deliberately flagged rather than investigated.

---

**End of design doc.**
