import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // Recycle idle clients well before Neon's pooled endpoint drops them
  // server-side — otherwise the pool can hand a query a connection that's
  // already dead, which surfaces as an opaque "Failed query" error.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// A dropped idle connection emits `error` on the pool; without a listener
// that's an unhandled event instead of a log line.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export const db = drizzle(pool);
