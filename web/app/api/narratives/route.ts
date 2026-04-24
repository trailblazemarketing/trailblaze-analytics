import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/narratives?entity=<slug>&metric=<code>&period=<code>&market=<slug>
//
// Pure cache read — never generates a narrative on demand (that would
// block the UI for multi-second Haiku calls). If no cached row exists,
// returns null body with `X-Narrative-Status: not-cached`. Client UI
// should render no tooltip + hide the has-narrative indicator.
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity")?.trim();
  const metric = searchParams.get("metric")?.trim();
  const period = searchParams.get("period")?.trim();
  const market = searchParams.get("market")?.trim() || null;

  if (!entity || !metric || !period) {
    return NextResponse.json(
      { error: "entity, metric, period are required" },
      { status: 400 },
    );
  }

  try {
    const rows = await query<{
      narrative_text: string;
      verified_number_match: boolean;
      extraction_model: string;
      is_stale: boolean;
      report_id: string;
      report_filename: string;
      report_published: string | null;
    }>(
      `SELECT mn.narrative_text, mn.verified_number_match,
              mn.extraction_model, mn.is_stale,
              mn.source_report_id AS report_id,
              r.filename AS report_filename,
              r.published_timestamp::text AS report_published
       FROM metric_narratives mn
       JOIN entities e ON e.id = mn.entity_id
       JOIN metrics  m ON m.id = mn.metric_id
       JOIN periods  p ON p.id = mn.period_id
       LEFT JOIN markets mk ON mk.id = mn.market_id
       JOIN reports  r ON r.id = mn.source_report_id
       WHERE e.slug = $1
         AND m.code = $2
         AND p.code = $3
         AND (
           ($4::text IS NULL AND mn.market_id IS NULL)
           OR mk.slug = $4
         )
         AND mn.verified_number_match = true
         AND mn.is_stale = false
       ORDER BY mn.extraction_timestamp DESC
       LIMIT 1`,
      [entity, metric, period, market],
    );

    if (rows.length === 0) {
      return new NextResponse(null, {
        status: 200,
        headers: { "X-Narrative-Status": "not-cached" },
      });
    }

    const r = rows[0];
    return NextResponse.json({
      narrative_text: r.narrative_text,
      source_report: {
        id: r.report_id,
        filename: r.report_filename,
        published: r.report_published,
      },
      verified: r.verified_number_match,
      extraction_model: r.extraction_model,
    });
  } catch (err) {
    console.error("[narratives]", err);
    return NextResponse.json(
      { error: "lookup_failed" },
      { status: 500 },
    );
  }
}
