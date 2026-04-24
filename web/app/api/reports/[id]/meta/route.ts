import { NextResponse, type NextRequest } from "next/server";
import {
  getReportById,
  getReportMetricValues,
  getReportNarratives,
  getReportAssociations,
} from "@/lib/queries/reports";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const report = await getReportById(params.id);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [values, narratives, assoc] = await Promise.all([
    getReportMetricValues(params.id),
    getReportNarratives(params.id),
    getReportAssociations(params.id),
  ]);

  const beacon = await getBeaconEstimatesForValues(
    values
      .filter(
        (v) =>
          v.disclosure_status === "beacon_estimate" ||
          v.disclosure_status === "derived",
      )
      .map((v) => v.metric_value_id),
  );

  return NextResponse.json({
    report,
    values,
    narratives,
    entities: assoc.entities,
    markets: assoc.markets,
    beacon: Object.fromEntries(beacon),
  });
}
