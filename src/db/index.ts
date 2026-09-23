import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Defer SUPABASE_DB_URL validation to query time so the module can be safely
// imported during `next build` without a live database connection.
function getPool(): Pool {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL is required");
  }

  const globalForDb = globalThis as typeof globalThis & {
    __arenaSuperbasePool?: Pool;
  };

  if (!globalForDb.__arenaSuperbasePool) {
    globalForDb.__arenaSuperbasePool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return globalForDb.__arenaSuperbasePool;
}

// Lazy pool proxy — the Pool (and SUPABASE_DB_URL check) is only created on
// first actual database access, not when the module is imported.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db = drizzle(pool);
