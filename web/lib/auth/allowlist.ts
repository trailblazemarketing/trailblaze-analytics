// Email allowlist for magic-link sign-in.
//
// TODO: To add more emails, append entries to ALLOWED_EMAILS below.
// TODO: Before production, move this list to an env var (e.g. AUTH_ALLOWED_EMAILS,
//       comma-separated) OR to a `auth_allowed_emails` table in Postgres so
//       non-engineers can grant access without a deploy.
//
// Example env-var migration:
//   const env = process.env.AUTH_ALLOWED_EMAILS ?? "";
//   const ALLOWED_EMAILS = new Set(env.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
//
// Matching is case-insensitive. Exact-match only — no wildcard domains for now.

const ALLOWED_EMAILS = new Set<string>([
  "andrew@trailblaze-marketing.com",
]);

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export function allowlistSize(): number {
  return ALLOWED_EMAILS.size;
}
