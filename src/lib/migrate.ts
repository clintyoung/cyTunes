import { readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

// =============================================================================
// One-time, idempotent schema application at startup.
//
// We read db/schema.sql (bundled into the Docker image) and run it on first
// DB use. The schema uses CREATE TABLE IF NOT EXISTS, DROP TRIGGER IF EXISTS +
// CREATE TRIGGER, and CREATE EXTENSION IF NOT EXISTS — all safe to re-run.
//
// Cached on globalThis so Next.js dev-mode hot reload doesn't re-run it on
// every reload, and so concurrent first requests await the same promise.
// =============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __cytunesMigrations: Promise<void> | undefined;
}

const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

async function runMigrations(pool: Pool): Promise<void> {
  let schemaSql: string;
  try {
    schemaSql = readFileSync(SCHEMA_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `[migrate] Could not read schema at ${SCHEMA_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Postgres may take a moment to be reachable on first boot even after the
  // healthcheck flips. Retry a small number of times before giving up.
  const maxAttempts = 10;
  const delayMs = 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query(schemaSql);
        // eslint-disable-next-line no-console
        console.log("[migrate] schema applied");
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.warn(
        `[migrate] attempt ${attempt}/${maxAttempts} failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(
    `[migrate] giving up after ${maxAttempts} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

/**
 * Resolves once the schema has been applied. Safe to call concurrently — all
 * callers await the same Promise. On failure, the cached Promise is cleared
 * so the next call retries.
 */
export function ensureMigrated(pool: Pool): Promise<void> {
  if (!global.__cytunesMigrations) {
    global.__cytunesMigrations = runMigrations(pool).catch((err) => {
      global.__cytunesMigrations = undefined;
      throw err;
    });
  }
  return global.__cytunesMigrations;
}
