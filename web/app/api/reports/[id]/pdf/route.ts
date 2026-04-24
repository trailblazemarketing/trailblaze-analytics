import { NextResponse, type NextRequest } from "next/server";
import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Root directory that holds the source PDFs. Relative to web/ at runtime.
const PDF_ROOT = path.resolve(process.cwd(), "..", "pdfs");

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const row = await queryOne<{
    filename: string;
    local_path: string | null;
    original_path: string | null;
  }>(
    "SELECT filename, local_path, original_path FROM reports WHERE id = $1",
    [params.id],
  );
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Resolve the file path. Prefer local_path if present; otherwise fall back
  // to PDF_ROOT/filename. In either case, the resolved path must live inside
  // PDF_ROOT to prevent traversal.
  const candidates: string[] = [];
  if (row.local_path) candidates.push(row.local_path);
  candidates.push(path.join(PDF_ROOT, row.filename));

  let resolved: string | null = null;
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (!abs.toLowerCase().startsWith(PDF_ROOT.toLowerCase())) continue;
    try {
      const s = await stat(abs);
      if (s.isFile()) {
        resolved = abs;
        break;
      }
    } catch {
      /* next */
    }
  }

  if (!resolved)
    return NextResponse.json({ error: "file_missing" }, { status: 404 });

  const size = (await stat(resolved)).size;
  const filename = path.basename(resolved);

  // Small files: read into buffer and return — simpler and plays nicely with
  // Next's response handling. Large files: stream.
  if (size < 25 * 1024 * 1024) {
    const buf = await readFile(resolved);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const stream = createReadStream(resolved);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
