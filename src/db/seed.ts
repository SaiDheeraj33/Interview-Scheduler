/**
 * `npm run db:seed`            apply migrations, then load fresh demo data
 * `tsx src/db/seed.ts --if-empty`  same, but leave existing data alone (runs before `dev` and `build`,
 *                                  so every deploy brings the database schema up to date)
 */
import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./client";
import { users } from "./schema";
import { seedDemo } from "./seed-data";

async function main() {
  // Hosted platforms have no persistent disk: a local SQLite file would vanish between requests.
  if (process.env.VERCEL && !/^(libsql|https|wss?):/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("DATABASE_URL must point at a hosted libSQL/Turso database (libsql://...) on Vercel. See README → Deploy.");
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  if (process.argv.includes("--if-empty")) {
    const [row] = await db.select({ n: count() }).from(users);
    if (row && row.n > 0) return;
  }
  const result = await seedDemo(db);
  console.log(`Seeded ${result.students} students, ${result.slots} slots, ${result.bookings} bookings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
