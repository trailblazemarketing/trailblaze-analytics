import { NextResponse } from "next/server";
import { globalSearch } from "@/lib/queries/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ hits: [] });
  try {
    const hits = await globalSearch(q);
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("[search]", err);
    return NextResponse.json({ hits: [], error: "search_failed" }, { status: 200 });
  }
}
