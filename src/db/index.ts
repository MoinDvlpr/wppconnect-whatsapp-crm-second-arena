import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Defer DATABASE_URL validation to query time so the module can be safely
// imported during `next build` without a live database connection.
function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const globalForDb = globalThis as typeof globalThis & {
    __arenaNextJsPostgresqlPool?: Pool;
  };

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return globalForDb.__arenaNextJsPostgresqlPool;
}

// Lazy pool proxy — the Pool (and DATABASE_URL check) is only created on
// first actual database access, not when the module is imported.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db = drizzle(pool);
