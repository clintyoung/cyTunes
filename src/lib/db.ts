import { Pool, PoolClient } from "pg";
import { env } from "@/lib/env";
import { ensureMigrated } from "@/lib/migrate";

// Single shared pool. Next.js can hot-reload modules in dev, so we cache
// the pool on globalThis to avoid leaking connections.

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  await ensureMigrated(pool); // one-time per process; near-zero overhead after first call
  const result = await pool.query(text, params as never);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureMigrated(pool);
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
