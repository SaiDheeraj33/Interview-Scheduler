/**
 * One Postgres database, two ways to reach it:
 *  - DATABASE_URL set to a postgres:// URL (Supabase in production): a pooled connection.
 *  - otherwise: PGlite, a full Postgres compiled to WebAssembly, stored in ./data/pglite.
 *    Local development and tests need no database server, and run the exact same SQL.
 *
 * The connection opens on first use, not on import, so `next build` never touches it.
 */
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MIGRATIONS = { migrationsFolder: "./drizzle" };
const LOCAL_DIR = "./data/pglite";

interface Connection {
  db: Db;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

export const databaseUrl = () => process.env.DATABASE_URL?.trim() || undefined;
export const isHostedDatabase = (url = databaseUrl()) => !!url && /^postgres(ql)?:\/\//.test(url);

function open(): Connection {
  const url = databaseUrl();
  if (isHostedDatabase(url)) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url!);
    const sql = postgres(url!, {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      ssl: local ? false : "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const db = drizzlePostgres(sql, { schema });
    return { db, migrate: () => migratePostgres(db, MIGRATIONS), close: () => sql.end({ timeout: 5 }) };
  }
  if (url) throw new Error("DATABASE_URL must be a postgres:// connection string, or unset to use the local database.");
  mkdirSync(LOCAL_DIR, { recursive: true });
  const client = new PGlite(LOCAL_DIR);
  const db = drizzlePglite(client, { schema });
  return { db, migrate: () => migratePglite(db, MIGRATIONS), close: () => client.close() };
}

// One connection per process, kept across hot reloads in development.
const globalForDb = globalThis as unknown as { __gritDb?: Connection };
function connection(): Connection {
  return (globalForDb.__gritDb ??= open());
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connection().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Apply pending SQL migrations from ./drizzle. */
export const migrateDatabase = () => connection().migrate();

/** Close the connection so scripts can exit. */
export async function closeDatabase() {
  const conn = globalForDb.__gritDb;
  globalForDb.__gritDb = undefined;
  await conn?.close();
}
