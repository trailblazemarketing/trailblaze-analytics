// POST /api/profile/upload-picture — multipart image upload.
//
// Max 2MB; jpg/png/webp only. Writes to
// web/public/uploads/profile-pictures/<uuid>.<ext> and updates
// users.profile_picture_path with the public URL path.
// Demo-grade: no virus scan, no content-type sniffing beyond extension +
// mime declared by the browser. Phase 7 swaps to object storage + proper
// validation.

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Directory resolved relative to the Next dev/prod cwd (``web/``).
const UPLOAD_DIR = path.resolve(
  process.cwd(),
  "public",
  "uploads",
  "profile-pictures",
);

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "bad_type", accepted: Object.keys(ALLOWED) },
      { status: 415 },
    );
  }

  const filename = `${randomUUID()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buf);

  // Best-effort cleanup of the prior picture. Non-fatal if missing.
  const prior = await queryOne<{ profile_picture_path: string | null }>(
    `SELECT profile_picture_path FROM users WHERE id = $1`,
    [session.userId],
  );
  if (prior?.profile_picture_path) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(prior.profile_picture_path));
    if (existsSync(oldPath)) {
      await unlink(oldPath).catch(() => {});
    }
  }

  const publicPath = `/uploads/profile-pictures/${filename}`;
  await query(
    `UPDATE users SET profile_picture_path = $1 WHERE id = $2`,
    [publicPath, session.userId],
  );
  return NextResponse.json({ ok: true, profile_picture_path: publicPath });
}
