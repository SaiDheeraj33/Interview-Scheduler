/**
 * Proves the guarantee the feature rests on: even if application code is wrong
 * or two requests race, the database refuses a second live booking for the same
 * slot or the same candidacy. Runs against a throwaway SQLite file.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";

const dir = mkdtempSync(path.join(tmpdir(), "grit-test-"));
const client = createClient({ url: `file:${path.join(dir, "test.db")}` });
const db = drizzle(client, { schema });

const START = Date.UTC(2026, 10, 20, 5, 30);
const booking = (id: string, candidacyId: string, slotId: string, studentId: string) => ({
  id,
  candidacyId,
  slotId,
  studentId,
  interviewerId: "int",
  startsAt: START,
  endsAt: START + 1_800_000,
  attemptNo: 1,
  status: "scheduled" as const,
  meetingUrl: "https://meet.example.com/x",
  createdAt: START,
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.users).values([
    { id: "int", role: "interviewer", name: "I", email: "i@x" },
    { id: "s1", role: "student", name: "A", email: "a@x" },
    { id: "s2", role: "student", name: "B", email: "b@x" },
  ]);
  await db.insert(schema.badges).values({ id: "b", track: "T", tier: "Novice", bonusMiles: 500 });
  await db.insert(schema.candidacies).values([
    { id: "c1", studentId: "s1", badgeId: "b", eligibleAt: START },
    { id: "c2", studentId: "s2", badgeId: "b", eligibleAt: START },
  ]);
  await db.insert(schema.slots).values([
    { id: "slot1", interviewerId: "int", startsAt: START, endsAt: START + 1_800_000, createdAt: START },
    { id: "slot2", interviewerId: "int", startsAt: START + 1_800_000, endsAt: START + 3_600_000, createdAt: START },
  ]);
});

afterAll(() => {
  client.close();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows can keep the SQLite file locked briefly after close; the OS temp dir is cleaned up anyway.
  }
});

describe("database invariants", () => {
  it("lets exactly one of two racing students take a slot", async () => {
    const results = await Promise.allSettled([db.insert(schema.bookings).values(booking("k1", "c1", "slot1", "s1")), db.insert(schema.bookings).values(booking("k2", "c2", "slot1", "s2"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(schema.bookings).where(eq(schema.bookings.slotId, "slot1"))).toHaveLength(1);
  });

  it("refuses a second live booking for the same candidacy", async () => {
    const [winner] = await db.select().from(schema.bookings);
    await expect(db.insert(schema.bookings).values(booking("k3", winner!.candidacyId, "slot2", winner!.studentId))).rejects.toThrow();
  });

  it("frees the slot once the booking is cancelled", async () => {
    const [winner] = await db.select().from(schema.bookings);
    await db.update(schema.bookings).set({ status: "cancelled", cancelledBy: "student" }).where(eq(schema.bookings.id, winner!.id));
    const other = winner!.candidacyId === "c1" ? (["c2", "s2"] as const) : (["c1", "s1"] as const);
    await expect(db.insert(schema.bookings).values(booking("k4", other[0], "slot1", other[1]))).resolves.toBeDefined();
  });

  it("refuses two slots for one interviewer at the same time", async () => {
    await expect(db.insert(schema.slots).values({ id: "dup", interviewerId: "int", startsAt: START, endsAt: START + 1_800_000, createdAt: START })).rejects.toThrow();
  });
});
