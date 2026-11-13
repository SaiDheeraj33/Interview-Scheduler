"use server";

/**
 * Every write in the feature. Each action follows the same four steps:
 *   1. validate the input (never trust the client)
 *   2. identify the caller and check their role and ownership
 *   3. re-read the rows inside one immediate transaction and apply the pure
 *      rules from src/domain against the fresh state
 *   4. write the change, an audit event and the student's message together
 * The UI's own checks are a courtesy; these are the ones that count.
 */
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db/client";
import { badgeRequirements, badges, bookingScores, bookings, candidacies, events, notifications, slots, users } from "@/db/schema";
import type { Badge, Booking, Candidacy, EventType, User } from "@/db/schema";
import { seedDemo } from "@/db/seed-data";
import {
  bookedPatch,
  checkCanBook,
  checkCanChange,
  checkCanRecord,
  checkCanReschedule,
  checkSlotTime,
  clearFlagPatch,
  deriveState,
  flagPatch,
  OUTCOMES,
  outcomePatch,
  unbookedPatch,
} from "@/domain/journey";
import { MS, POLICY } from "@/domain/policy";
import { criteriaFor, needsScorecard, suggestOutcome } from "@/domain/rubric";
import { notify, type Message } from "@/lib/messages";
import { dayKeyToStart, fmtDayTime, isDayKey, istHour, startOfDay } from "@/lib/time";
import { CLOCK_COOKIE, clampOffset, getClockOffset, getNow } from "./clock";
import { getSession, homeFor, SESSION_COOKIE } from "./session";

export type ActionResult = { ok: true; message: string } | { ok: false; code: string; message: string };

const SLOT = POLICY.slotMinutes * MS.MINUTE;
const fail = (code: string, message: string): ActionResult => ({ ok: false, code, message });
const done = (message: string): ActionResult => ({ ok: true, message });
const BAD_INPUT = fail("BAD_INPUT", "That request wasn't valid. Refresh the page and try again.");
const FORBIDDEN = fail("FORBIDDEN", "You don't have access to do that.");
const NOT_FOUND = fail("NOT_FOUND", "We couldn't find that. It may have changed. Refresh and try again.");
const SLOT_TAKEN = fail("SLOT_TAKEN", "That slot was just taken by someone else. Pick another time. The list below is up to date.");

const id = z.string().min(1).max(80);
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function caller(...roles: User["role"][]): Promise<User | null> {
  const user = await getSession();
  return user && roles.includes(user.role) ? user : null;
}

/** SQLite allows one writer at a time; `immediate` takes the write lock up front so a read can't go stale mid-transaction. */
async function write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(fn, { behavior: "immediate" });
    } catch (err) {
      if (attempt < 3 && errorText(err).includes("SQLITE_BUSY")) {
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

function errorText(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    const x = e as { message?: string; code?: string; cause?: unknown };
    parts.push(String(x.code ?? ""), String(x.message ?? ""));
    e = x.cause;
  }
  return parts.join(" ");
}
const isUniqueViolation = (err: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(errorText(err));

function refresh() {
  revalidatePath("/", "layout");
}

/* ---------------------------------------------------------- shared helpers */

async function loadCandidacy(tx: Tx, candidacyId: string) {
  const [row] = await tx
    .select({ c: candidacies, badge: badges })
    .from(candidacies)
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .where(eq(candidacies.id, candidacyId))
    .limit(1);
  return row ?? null;
}

async function liveBooking(tx: Tx, candidacyId: string): Promise<Booking | null> {
  const [row] = await tx.select().from(bookings).where(and(eq(bookings.candidacyId, candidacyId), eq(bookings.status, "scheduled"))).limit(1);
  return row ?? null;
}

async function log(tx: Tx, candidacyId: string, actorId: string | null, type: EventType, summary: string, now: number) {
  await tx.insert(events).values({ id: newId("evt"), candidacyId, actorId, type, summary, createdAt: now });
}

async function tell(tx: Tx, userId: string, candidacyId: string, kind: string, m: Message, now: number) {
  await tx.insert(notifications).values({ id: newId("ntf"), userId, candidacyId, kind, title: m.title, body: m.body, createdAt: now });
}

/**
 * Students choose a time, not a person. Among interviewers free at that time we pick
 * the one with the fewest interviews that day, and avoid the interviewer from the
 * student's previous attempt when someone else is free (a second opinion on a retake).
 */
async function pickOpenSlot(tx: Tx, startsAt: number, opts: { avoidInterviewer?: string | null; exclude?: string } = {}) {
  const open = await tx
    .select({ id: slots.id, interviewerId: slots.interviewerId, name: users.name })
    .from(slots)
    .innerJoin(users, eq(users.id, slots.interviewerId))
    .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
    .where(and(eq(slots.startsAt, startsAt), eq(slots.active, true), isNull(bookings.id)));
  const candidates = open.filter((o) => o.interviewerId !== opts.exclude);
  if (!candidates.length) return null;

  const dayStart = startOfDay(startsAt);
  const load = await tx
    .select({ interviewerId: bookings.interviewerId, n: count() })
    .from(bookings)
    .where(and(eq(bookings.status, "scheduled"), gte(bookings.startsAt, dayStart), lt(bookings.startsAt, dayStart + MS.DAY)))
    .groupBy(bookings.interviewerId);
  const loadOf = (interviewerId: string) => load.find((l) => l.interviewerId === interviewerId)?.n ?? 0;
  candidates.sort(
    (a, b) =>
      Number(a.interviewerId === opts.avoidInterviewer) - Number(b.interviewerId === opts.avoidInterviewer) ||
      loadOf(a.interviewerId) - loadOf(b.interviewerId) ||
      a.interviewerId.localeCompare(b.interviewerId),
  );
  return candidates[0]!;
}

/* ------------------------------------------------------------------ student */

const bookInput = z.object({ candidacyId: id, startsAt: z.number().int().positive() });

/** Book a slot, or move an existing booking to a new slot (the one free reschedule). */
export async function bookSlot(input: z.input<typeof bookInput>): Promise<ActionResult> {
  const parsed = bookInput.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("student");
  if (!me) return FORBIDDEN;
  const { candidacyId, startsAt } = parsed.data;
  const now = await getNow();

  let result: ActionResult;
  try {
    result = await write(async (tx) => {
      const row = await loadCandidacy(tx, candidacyId);
      if (!row || row.c.studentId !== me.id) return NOT_FOUND;
      const { c, badge } = row;
      const current = await liveBooking(tx, c.id);
      const state = deriveState(c, current, now);
      const moving = state === "BOOKED" && current !== null;

      if (moving) {
        if (current.startsAt === startsAt) return fail("SAME_SLOT", "That is the time you already have.");
        const allowed = checkCanReschedule(c, current.startsAt, now);
        if (!allowed.ok) return allowed;
      } else {
        const allowed = checkCanBook(state);
        if (!allowed.ok) return allowed;
      }
      const timeOk = checkSlotTime(startsAt, now);
      if (!timeOk.ok) return timeOk;

      // A student with two badges in play cannot be in two interviews at once.
      const [clash] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.studentId, me.id),
            eq(bookings.status, "scheduled"),
            ne(bookings.candidacyId, c.id),
            lt(bookings.startsAt, startsAt + SLOT),
            gt(bookings.endsAt, startsAt),
          ),
        )
        .limit(1);
      if (clash) return fail("OVERLAP", "You already have another interview at that time.");

      const [previous] = await tx
        .select({ interviewerId: bookings.interviewerId })
        .from(bookings)
        .where(and(eq(bookings.candidacyId, c.id), eq(bookings.status, "completed")))
        .orderBy(desc(bookings.startsAt))
        .limit(1);
      const slot = await pickOpenSlot(tx, startsAt, { avoidInterviewer: previous?.interviewerId });
      if (!slot) return SLOT_TAKEN;

      if (moving)
        await tx.update(bookings).set({ status: "cancelled", cancelledBy: "student", cancelReason: "Rescheduled by student" }).where(eq(bookings.id, current.id));

      const bookingId = newId("bkg");
      await tx.insert(bookings).values({
        id: bookingId,
        candidacyId: c.id,
        slotId: slot.id,
        studentId: me.id,
        interviewerId: slot.interviewerId,
        startsAt,
        endsAt: startsAt + SLOT,
        attemptNo: c.attemptCount + 1,
        status: "scheduled",
        meetingUrl: `/call/${bookingId}`,
        createdAt: now,
      });
      await tx
        .update(candidacies)
        .set({ ...bookedPatch(), reschedulesUsed: c.reschedulesUsed + (moving ? 1 : 0) })
        .where(eq(candidacies.id, c.id));

      if (moving) {
        await log(tx, c.id, me.id, "rescheduled", `Moved from ${fmtDayTime(current.startsAt)} to ${fmtDayTime(startsAt)} with ${slot.name}`, now);
        await tell(tx, me.id, c.id, "rescheduled", notify.rescheduled(badge, startsAt, startsAt + SLOT, slot.name), now);
        return done(`Moved to ${fmtDayTime(startsAt)} IST.`);
      }
      await log(tx, c.id, me.id, "booked", `Booked ${fmtDayTime(startsAt)} with ${slot.name}`, now);
      await tell(tx, me.id, c.id, "booked", notify.booked(badge, startsAt, startsAt + SLOT, slot.name), now);
      return done(`Booked for ${fmtDayTime(startsAt)} IST.`);
    });
  } catch (err) {
    // Two requests raced past the read; the partial unique index stopped the second one.
    if (!isUniqueViolation(err)) throw err;
    result = SLOT_TAKEN;
  }
  refresh();
  return result;
}

export async function cancelBooking(input: { bookingId: string }): Promise<ActionResult> {
  const parsed = z.object({ bookingId: id }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("student");
  if (!me) return FORBIDDEN;
  const now = await getNow();

  const result = await write(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
    if (!booking || booking.studentId !== me.id || booking.status !== "scheduled") return NOT_FOUND;
    const allowed = checkCanChange(booking.startsAt, now);
    if (!allowed.ok) return allowed;
    const row = await loadCandidacy(tx, booking.candidacyId);
    if (!row) return NOT_FOUND;

    await tx.update(bookings).set({ status: "cancelled", cancelledBy: "student", cancelReason: "Cancelled by student" }).where(eq(bookings.id, booking.id));
    await tx.update(candidacies).set(unbookedPatch()).where(eq(candidacies.id, booking.candidacyId));
    await log(tx, booking.candidacyId, me.id, "cancelled_by_student", `Cancelled ${fmtDayTime(booking.startsAt)}`, now);
    await tell(tx, me.id, booking.candidacyId, "cancelled", notify.cancelled(row.badge, booking.startsAt), now);
    return done("Interview cancelled. The slot is open for others again.");
  });
  refresh();
  return result;
}

/* -------------------------------------------------------------- interviewer */

function checkOfferable(startsAt: number, now: number): ActionResult | null {
  const hour = istHour(startsAt);
  if (startsAt % SLOT !== 0 || hour < POLICY.dayStartHour || hour >= POLICY.dayEndHour) return BAD_INPUT;
  if (startsAt <= now) return fail("PAST", "That time has already passed.");
  if (startsAt > now + (POLICY.horizonDays + 1) * MS.DAY) return fail("TOO_FAR", `Availability can be set up to ${POLICY.horizonDays} days ahead.`);
  return null;
}

/** Turn one slot on or off. A slot with a student in it cannot be switched off here. */
export async function toggleSlot(input: { startsAt: number }): Promise<ActionResult> {
  const parsed = z.object({ startsAt: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("interviewer");
  if (!me) return FORBIDDEN;
  const { startsAt } = parsed.data;
  const now = await getNow();
  const invalid = checkOfferable(startsAt, now);
  if (invalid) return invalid;

  const result = await write(async (tx) => {
    const [slot] = await tx.select().from(slots).where(and(eq(slots.interviewerId, me.id), eq(slots.startsAt, startsAt))).limit(1);
    if (!slot) {
      await tx.insert(slots).values({ id: newId("slot"), interviewerId: me.id, startsAt, endsAt: startsAt + SLOT, createdAt: now });
      return done("Slot opened.");
    }
    if (!slot.active) {
      await tx.update(slots).set({ active: true }).where(eq(slots.id, slot.id));
      return done("Slot opened.");
    }
    const [taken] = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.slotId, slot.id), eq(bookings.status, "scheduled"))).limit(1);
    if (taken) return fail("HAS_BOOKING", "A student has booked this slot. Use “I can't make it” on your schedule so they are moved or told.");
    await tx.update(slots).set({ active: false }).where(eq(slots.id, slot.id));
    return done("Slot closed.");
  });
  refresh();
  return result;
}

/** Open every free slot of a working day (10:00–13:00 and 14:00–17:00), or close all unbooked ones. */
export async function setDay(input: { day: string; mode: "fill" | "clear" }): Promise<ActionResult> {
  const parsed = z.object({ day: z.string().refine(isDayKey), mode: z.enum(["fill", "clear"]) }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("interviewer");
  if (!me) return FORBIDDEN;
  const now = await getNow();
  const dayStart = dayKeyToStart(parsed.data.day);

  const result = await write(async (tx) => {
    const existing = await tx
      .select({ id: slots.id, startsAt: slots.startsAt, active: slots.active, bookingId: bookings.id })
      .from(slots)
      .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
      .where(and(eq(slots.interviewerId, me.id), gte(slots.startsAt, dayStart), lt(slots.startsAt, dayStart + MS.DAY)));

    if (parsed.data.mode === "clear") {
      const closable = existing.filter((s) => s.active && !s.bookingId && s.startsAt > now).map((s) => s.id);
      if (closable.length) await tx.update(slots).set({ active: false }).where(inArray(slots.id, closable));
      const kept = existing.filter((s) => s.active && s.bookingId).length;
      return done(kept ? `Closed ${closable.length} open slots. ${kept} booked slot${kept === 1 ? " stays" : "s stay"}.` : `Closed ${closable.length} open slots.`);
    }
    let opened = 0;
    for (const [from, to] of [[10, 13], [14, 17]] as const)
      for (let h = from; h < to; h += 0.5) {
        const startsAt = dayStart + h * MS.HOUR;
        if (checkOfferable(startsAt, now)) continue;
        const have = existing.find((s) => s.startsAt === startsAt);
        if (have?.active) continue;
        if (have) await tx.update(slots).set({ active: true }).where(eq(slots.id, have.id));
        else await tx.insert(slots).values({ id: newId("slot"), interviewerId: me.id, startsAt, endsAt: startsAt + SLOT, createdAt: now });
        opened++;
      }
    return done(opened ? `Opened ${opened} slots.` : "Nothing to open. Those slots are already open or in the past.");
  });
  refresh();
  return result;
}

/**
 * Open or close many slots in one go (drag across the availability grid).
 * Invalid and booked cells are skipped, never silently changed, and the reply says so.
 */
export async function setSlots(input: { starts: number[]; open: boolean }): Promise<ActionResult> {
  const parsed = z.object({ starts: z.array(z.number().int().positive()).min(1).max(200), open: z.boolean() }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("interviewer");
  if (!me) return FORBIDDEN;
  const now = await getNow();
  const starts = [...new Set(parsed.data.starts)].filter((t) => !checkOfferable(t, now));
  if (!starts.length) return fail("PAST", "Those times have already passed.");

  const result = await write(async (tx) => {
    const existing = await tx
      .select({ id: slots.id, startsAt: slots.startsAt, active: slots.active, bookingId: bookings.id })
      .from(slots)
      .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
      .where(and(eq(slots.interviewerId, me.id), inArray(slots.startsAt, starts)));
    let changed = 0;
    let locked = 0;
    for (const startsAt of starts) {
      const have = existing.find((e) => e.startsAt === startsAt);
      if (parsed.data.open) {
        if (have?.active) continue;
        if (have) await tx.update(slots).set({ active: true }).where(eq(slots.id, have.id));
        else await tx.insert(slots).values({ id: newId("slot"), interviewerId: me.id, startsAt, endsAt: startsAt + SLOT, createdAt: now });
        changed++;
      } else {
        if (!have?.active) continue;
        if (have.bookingId) {
          locked++;
          continue;
        }
        await tx.update(slots).set({ active: false }).where(eq(slots.id, have.id));
        changed++;
      }
    }
    const verb = parsed.data.open ? "Opened" : "Closed";
    const base = changed ? `${verb} ${changed} slot${changed === 1 ? "" : "s"}.` : "Nothing changed.";
    return done(locked ? `${base} ${locked} booked slot${locked === 1 ? " was" : "s were"} kept. Use “I can't make it” for those.` : base);
  });
  refresh();
  return result;
}

const outcomeInput = z.object({
  bookingId: id,
  outcome: z.enum(OUTCOMES),
  studentFeedback: z.string().trim().max(600),
  internalNotes: z.string().trim().max(1000),
  /** Rubric scores keyed by criterion; required for pass and fail. */
  scores: z.record(z.string().max(120), z.number().int().min(1).max(4)).default({}),
});

export async function recordOutcome(input: z.input<typeof outcomeInput>): Promise<ActionResult> {
  const me = await caller("interviewer", "admin");
  if (!me) return FORBIDDEN;
  return recordOutcomeAs(me, input);
}

/**
 * Shared by the interviewer's own screens and the demo's side-by-side view.
 * The rules are identical: the scorecard must be complete for a judgement, and an
 * outcome that disagrees with the rubric needs a written reason.
 */
async function recordOutcomeAs(me: User, input: z.input<typeof outcomeInput>): Promise<ActionResult> {
  const parsed = outcomeInput.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { bookingId, outcome, studentFeedback, internalNotes, scores } = parsed.data;
  // A student who did not clear, or must retake, is owed a reason they can act on.
  if ((outcome === "fail" || outcome === "retake") && studentFeedback.length < 20)
    return fail("FEEDBACK_REQUIRED", "Write at least a sentence of feedback for the student. They will see it with the result.");
  const now = await getNow();

  const result = await write(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return NOT_FOUND;
    if (me.role === "interviewer" && booking.interviewerId !== me.id) return FORBIDDEN;
    if (booking.status !== "scheduled") return fail("ALREADY_RECORDED", "An outcome is already recorded for this interview.");
    const allowed = checkCanRecord(booking.startsAt, outcome, now);
    if (!allowed.ok) return allowed;
    const row = await loadCandidacy(tx, booking.candidacyId);
    if (!row || row.c.status !== "booked") return NOT_FOUND;
    const { c, badge } = row;

    // The scorecard is checked against the badge's real criteria, not whatever the client sent.
    const reqs = await tx.select().from(badgeRequirements).where(eq(badgeRequirements.badgeId, badge.id));
    const criteria = criteriaFor(reqs);
    if (needsScorecard(outcome)) {
      const suggestion = suggestOutcome(criteria, scores);
      if (suggestion.outcome === null) return fail("SCORECARD_INCOMPLETE", `Score all ${criteria.length} criteria before recording a pass or fail.`);
      if (suggestion.outcome !== outcome && internalNotes.length < 10)
        return fail("OVERRIDE_REASON", `The scorecard suggests ${suggestion.outcome}. Add an internal note explaining why you are recording ${outcome}.`);
    }

    const patch = outcomePatch(c, outcome, now);
    await tx
      .update(bookings)
      .set({ status: "completed", outcome, studentFeedback: studentFeedback || null, internalNotes: internalNotes || null, recordedBy: me.id, recordedAt: now })
      .where(eq(bookings.id, booking.id));
    const scored = criteria.filter((k) => typeof scores[k.key] === "number");
    if (scored.length) await tx.insert(bookingScores).values(scored.map((k) => ({ bookingId: booking.id, criterion: k.key, label: k.label, score: scores[k.key]! })));
    await tx.update(candidacies).set(patch).where(eq(candidacies.id, c.id));

    const messages: Record<typeof outcome, [EventType, string, Message]> = {
      pass: ["outcome_pass", "Passed. Badge awarded", notify.pass(badge)],
      fail: ["outcome_fail", "Not cleared", notify.fail(badge, studentFeedback, patch.bookableFrom ?? now)],
      retake: ["outcome_retake", "Retake needed", notify.retake(badge, studentFeedback)],
      no_show: ["outcome_no_show", "Student did not join", notify.noShow(badge, booking.startsAt, patch.bookableFrom ?? now)],
    };
    const [type, summary, message] = messages[outcome];
    await log(tx, c.id, me.id, type, summary, now);
    await tell(tx, c.studentId, c.id, outcome, message, now);
    return done(outcome === "pass" ? "Recorded. The badge has been awarded." : "Recorded. The student has been told.");
  });
  refresh();
  return result;
}

/**
 * The interviewer can no longer take a booked interview.
 * First choice: hand it to a colleague who is free at the same time, so the student's plan holds.
 * Otherwise cancel it at no cost to the student.
 */
export async function releaseBooking(input: { bookingId: string }): Promise<ActionResult> {
  const parsed = z.object({ bookingId: id }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("interviewer", "admin");
  if (!me) return FORBIDDEN;
  const now = await getNow();

  let result: ActionResult;
  try {
    result = await write(async (tx) => {
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
      if (!booking || booking.status !== "scheduled") return NOT_FOUND;
      if (me.role === "interviewer" && booking.interviewerId !== me.id) return FORBIDDEN;
      if (now >= booking.startsAt) return fail("ALREADY_STARTED", "This interview has started. Record an outcome instead.");
      const row = await loadCandidacy(tx, booking.candidacyId);
      if (!row) return NOT_FOUND;

      await tx.update(slots).set({ active: false }).where(eq(slots.id, booking.slotId));
      const cover = await pickOpenSlot(tx, booking.startsAt, { exclude: booking.interviewerId });
      if (cover) {
        await tx.update(bookings).set({ slotId: cover.id, interviewerId: cover.interviewerId }).where(eq(bookings.id, booking.id));
        await log(tx, booking.candidacyId, me.id, "reassigned", `Interviewer changed to ${cover.name}`, now);
        await tell(tx, booking.studentId, booking.candidacyId, "reassigned", notify.reassigned(row.badge, booking.startsAt, cover.name), now);
        return done(`Handed over to ${cover.name}, who is free at that time. The student keeps the same slot.`);
      }
      await tx.update(bookings).set({ status: "cancelled", cancelledBy: "team", cancelReason: "Interviewer unavailable" }).where(eq(bookings.id, booking.id));
      await tx.update(candidacies).set(unbookedPatch()).where(eq(candidacies.id, booking.candidacyId));
      await log(tx, booking.candidacyId, me.id, "cancelled_by_team", `Interviewer unavailable for ${fmtDayTime(booking.startsAt)}`, now);
      await tell(tx, booking.studentId, booking.candidacyId, "team_cancelled", notify.teamCancelled(row.badge, booking.startsAt), now);
      return done("Nobody else is free at that time, so the interview was cancelled and the student asked to rebook.");
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    result = fail("RETRY", "The schedule changed while you were doing that. Please try again.");
  }
  refresh();
  return result;
}

/* --------------------------------------------------------------------- team */

export async function flagCandidacy(input: { candidacyId: string; reason: string }): Promise<ActionResult> {
  const parsed = z.object({ candidacyId: id, reason: z.string().trim().min(10).max(500) }).safeParse(input);
  if (!parsed.success) return fail("REASON_REQUIRED", "Give a reason of at least 10 characters. It is kept on the audit trail.");
  const me = await caller("admin");
  if (!me) return FORBIDDEN;
  const now = await getNow();

  const result = await write(async (tx) => {
    const row = await loadCandidacy(tx, parsed.data.candidacyId);
    if (!row) return NOT_FOUND;
    const { c, badge } = row;
    const patch = flagPatch(c);
    if (!patch) return fail("ALREADY_FLAGGED", "This student is already flagged for this badge.");

    const current = await liveBooking(tx, c.id);
    if (current)
      await tx.update(bookings).set({ status: "cancelled", cancelledBy: "system", cancelReason: "Malpractice review" }).where(eq(bookings.id, current.id));
    await tx.update(candidacies).set({ ...patch, flagReason: parsed.data.reason, flaggedAt: now }).where(eq(candidacies.id, c.id));

    const nullified = patch.status === "nullified";
    await log(tx, c.id, me.id, "flagged", nullified ? "Flagged for malpractice. Badge nullified" : "Flagged for malpractice. Booking blocked", now);
    await tell(tx, c.studentId, c.id, nullified ? "nullified" : "blocked", nullified ? notify.nullified(badge) : notify.blocked(badge, current?.startsAt ?? null), now);
    return done(nullified ? "Badge nullified and Miles reversed. The student has been told." : "Booking blocked. The student has been told.");
  });
  refresh();
  return result;
}

export async function clearFlag(input: { candidacyId: string }): Promise<ActionResult> {
  const parsed = z.object({ candidacyId: id }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("admin");
  if (!me) return FORBIDDEN;
  const now = await getNow();

  const result = await write(async (tx) => {
    const row = await loadCandidacy(tx, parsed.data.candidacyId);
    if (!row) return NOT_FOUND;
    const patch = clearFlagPatch(row.c);
    if (!patch) return fail("NOT_FLAGGED", "This student is not flagged.");
    await tx.update(candidacies).set({ ...patch, flagReason: null, flaggedAt: null }).where(eq(candidacies.id, row.c.id));
    const restored = patch.status === "passed";
    await log(tx, row.c.id, me.id, "flag_cleared", restored ? "Flag cleared. Badge restored" : "Flag cleared. Booking reopened", now);
    await tell(tx, row.c.studentId, row.c.id, "flag_cleared", notify.flagCleared(row.badge, restored), now);
    return done(restored ? "Flag cleared and badge restored." : "Flag cleared. The student can book again.");
  });
  refresh();
  return result;
}

/** Remind an eligible student who has not booked. Limited to one reminder a day per student. */
export async function nudgeStudent(input: { candidacyId: string }): Promise<ActionResult> {
  const parsed = z.object({ candidacyId: id }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const me = await caller("admin");
  if (!me) return FORBIDDEN;
  const now = await getNow();

  const result = await write(async (tx) => {
    const row = await loadCandidacy(tx, parsed.data.candidacyId);
    if (!row) return NOT_FOUND;
    const { c, badge } = row;
    const state = deriveState(c, await liveBooking(tx, c.id), now);
    if (state !== "ELIGIBLE" && state !== "RETAKE_READY") return fail("NOT_WAITING", "This student is not waiting to book.");
    if (c.lastNudgedAt && now - c.lastNudgedAt < POLICY.nudgeGapHours * MS.HOUR)
      return fail("NUDGED_RECENTLY", `Already reminded in the last ${POLICY.nudgeGapHours} hours.`);
    await tx.update(candidacies).set({ lastNudgedAt: now }).where(eq(candidacies.id, c.id));
    await log(tx, c.id, me.id, "nudged", "Reminder sent", now);
    await tell(tx, c.studentId, c.id, "nudge", notify.nudge(badge, c.eligibleAt, now), now);
    return done("Reminder sent.");
  });
  refresh();
  return result;
}

/* --------------------------------------------------------------- demo shell */

/**
 * Demo clock. Moves "now" forward for every page and action in this browser, so a
 * reviewer can watch a booked interview start, finish, and go overdue.
 */
async function writeClock(offset: number): Promise<ActionResult> {
  const value = clampOffset(offset);
  (await cookies()).set(CLOCK_COOKIE, String(value), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  refresh();
  return done(value ? `Clock moved to ${fmtDayTime(Date.now() + value)} IST.` : "Clock is back to real time.");
}

export async function setClock(input: { offsetMs: number }): Promise<ActionResult> {
  const parsed = z.object({ offsetMs: z.number().finite() }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  return writeClock(parsed.data.offsetMs);
}

export async function shiftClock(input: { byMs: number }): Promise<ActionResult> {
  const parsed = z.object({ byMs: z.number().finite() }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  return writeClock((await getClockOffset()) + parsed.data.byMs);
}

export async function jumpClockTo(input: { at: number }): Promise<ActionResult> {
  const parsed = z.object({ at: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const offset = parsed.data.at - Date.now();
  if (offset < 0) return fail("PAST", "That moment has already passed.");
  return writeClock(offset);
}

/**
 * Demo only: the side-by-side view records an outcome as the interview's own
 * interviewer, with exactly the same rules. (The persona picker already lets anyone
 * act as anyone; this adds no new access, and is removed with it.)
 */
export async function recordOutcomeForDemo(input: z.input<typeof outcomeInput>): Promise<ActionResult> {
  const parsed = z.object({ bookingId: id }).safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const [row] = await db.select({ u: users }).from(bookings).innerJoin(users, eq(users.id, bookings.interviewerId)).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
  if (!row) return NOT_FOUND;
  return recordOutcomeAs(row.u, input);
}

export async function signInAs(formData: FormData) {
  const userId = z.string().min(1).max(80).safeParse(formData.get("userId"));
  if (!userId.success) redirect("/");
  const [user] = await db.select().from(users).where(eq(users.id, userId.data)).limit(1);
  if (!user) redirect("/");
  (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  redirect(homeFor(user.role));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function resetDemo() {
  await seedDemo(db);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CLOCK_COOKIE);
  refresh();
  redirect("/?reset=1");
}

export type { Badge, Candidacy };
