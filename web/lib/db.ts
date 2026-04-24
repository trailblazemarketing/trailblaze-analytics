import "server-only";
import pg, { Pool, type QueryResultRow } from "pg";

// pg returns DATE columns as JS Date objects by default, which trips up
// string-based sorting and JSON serialization in RSCs. Force DATE (OID 1082)
// to pass through as the raw "YYYY-MM-DD" string instead.
pg.types.setTypeParser(1082, (v) => v);

// Singleton pool — Next.js dev hot-reloads modules; stash it on globalThis so
// we don't leak connections every edit.
declare global {
  // eslint-disable-next-line no-var
  var __tb_pool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__tb_pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://trailblaze:trailblaze@localhost:5432/trailblaze";
    // node-postgres doesn't reliably honour `sslmode=require` from the URL
    // alone — Neon + most managed Postgres need an explicit ssl object.
    // Heuristic: require SSL whenever the URL isn't pointing at localhost
    // (dev machines use plain TCP; every real host expects TLS).
    const needsSsl =
      !/^postgres(ql)?(\+psycopg)?:\/\/[^@]*@(localhost|127\.0\.0\.1|::1)(:|\/)/.test(
        connectionString,
      );
    globalThis.__tb_pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__tb_pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
