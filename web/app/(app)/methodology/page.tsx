import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Beacon™ Methodology — Trailblaze Analytics" };

// TODO: Replace placeholder copy with the real methodology write-up once
// the product team finalizes it. Each methodology_code in beacon_estimates
// should map to a section here (hash link: #tax-rate-implied, etc.).

const METHODOLOGIES: {
  code: string;
  title: string;
  summary: string;
  example: string;
}[] = [
  {
    code: "tax_rate_implied",
    title: "Tax-rate implied GGR",
    summary:
      "Derives market-level GGR from disclosed gaming-tax revenue divided by the applicable tax rate for that period.",
    example: "Placeholder — real write-up TBD.",
  },
  {
    code: "peer_ratio",
    title: "Peer-ratio extrapolation",
    summary:
      "Estimates a missing metric using the ratio of that metric to an anchor metric, observed across a peer cohort.",
    example: "Placeholder — real write-up TBD.",
  },
  {
    code: "linear_interpolation",
    title: "Linear interpolation",
    summary:
      "Fills in a missing period between two disclosed periods by linear interpolation on the relevant dimension.",
    example: "Placeholder — real write-up TBD.",
  },
  {
    code: "stock_price_implied",
    title: "Stock-price implied",
    summary:
      "Uses listed-market pricing signals to back out implied operating metrics under a stated valuation model.",
    example: "Placeholder — real write-up TBD.",
  },
  {
    code: "prior_period_extrapolation",
    title: "Prior-period extrapolation",
    summary:
      "Extrapolates forward from the most recent disclosed period using a declared growth assumption.",
    example: "Placeholder — real write-up TBD.",
  },
  {
    code: "composite_model",
    title: "Composite model",
    summary:
      "Blended estimate combining two or more methodologies; per-input weights are listed on the specific value.",
    example: "Placeholder — real write-up TBD.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="beacon">Beacon™</Badge>
          <span className="text-[10px] uppercase tracking-wider text-tb-muted">
            Methodology
          </span>
        </div>
        <h1 className="text-xl font-semibold">
          Trailblaze Beacon™ Methodology
        </h1>
        <p className="mt-2 text-xs text-tb-muted">
          Where operators don't disclose what investors and operators need,
          Trailblaze Beacon™ estimates fill the gap. Every Beacon™ value is
          flagged on-screen (dotted chart lines, ™ superscript) and links back
          to the methodology below.
        </p>
      </div>

      <div className="panel p-4 text-xs text-tb-muted">
        <strong className="text-tb-beacon">Placeholder content.</strong> This
        page exists so the nav link works and so every Beacon™-flagged number
        can deep-link here. Final copy is pending.
      </div>

      <div className="space-y-3">
        {METHODOLOGIES.map((m) => (
          <Card key={m.code} id={m.code.replace(/_/g, "-")}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{m.title}</CardTitle>
                <code className="font-mono text-[10px] text-tb-muted">
                  {m.code}
                </code>
              </div>
              <Badge variant="beacon">Beacon™</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed text-tb-text">
              <p>{m.summary}</p>
              <p className="text-tb-muted">{m.example}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
