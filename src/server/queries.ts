/** Read models. Pages call these; nothing here writes. */
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { badgeRequirements, badges, bookingScores, bookings, candidacies, events, notifications, skillClearances, slots, users } from "@/db/schema";
import { STORY_STUDENT_IDS } from "@/db/seed-data";
import type { Badge, Booking, Candidacy, EventRow, NotificationRow, User } from "@/db/schema";
import { checkCanChange, checkCanReschedule, deriveState, type JourneyState } from "@/domain/journey";
import { MS, POLICY } from "@/domain/policy";
import { prepPackFor, type PrepPack } from "@/domain/prep";
import { journeyCopy, type JourneyCopy } from "@/lib/messages";

export interface Requirement {
  skill: string;
  level: number;
  cleared: boolean;
}

export interface JourneyView {
  candidacyId: string | null;
  badge: Badge;
  state: JourneyState;
  copy: JourneyCopy;
  requirements: Requirement[];
  booking: { id: string; startsAt: number; endsAt: number; interviewer: string; meetingUrl: string } | null;
  canCancel: boolean;
  canReschedule: boolean;
  bookableFrom: number | null;
  attemptCount: number;
  events: EventRow[];
  /** What to prepare, while there is still time to. Null when not relevant. */
  prep: PrepPack | null;
}

export interface Standing {
  miles: number;
  badgesHeld: number;
  rank: number;
  of: number;
}

/** Miles = contest Miles + bonus Miles of badges currently held. A nullified badge stops counting at once. */
export async function getStandings(): Promise<Map<string, Standing>> {
  const students = await db.select().from(users).where(eq(users.role, "student"));
  const held = await db
    .select({ studentId: candidacies.studentId, bonus: badges.bonusMiles })
    .from(candidacies)
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .where(eq(candidacies.status, "passed"));
  const rows = students.map((u) => {
    const mine = held.filter((h) => h.studentId === u.id);
    return { id: u.id, miles: u.baseMiles + mine.reduce((n, h) => n + h.bonus, 0), badgesHeld: mine.length };
  });
  rows.sort((a, b) => b.miles - a.miles || b.badgesHeld - a.badgesHeld || a.id.localeCompare(b.id));
  return new Map(rows.map((r, i) => [r.id, { miles: r.miles, badgesHeld: r.badgesHeld, rank: i + 1, of: rows.length }]));
}

export async function getStudentHome(student: User, now: number) {
  const [cands, allBadges, reqs, cleared, bks, notes, standings] = await Promise.all([
    db.select().from(candidacies).where(eq(candidacies.studentId, student.id)),
    db.select().from(badges),
    db.select().from(badgeRequirements),
    db.select().from(skillClearances).where(eq(skillClearances.studentId, student.id)),
    db
      .select({ b: bookings, interviewer: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.interviewerId))
      .where(eq(bookings.studentId, student.id))
      .orderBy(desc(bookings.startsAt)),
    db.select().from(notifications).where(eq(notifications.userId, student.id)).orderBy(desc(notifications.createdAt)).limit(12),
    getStandings(),
  ]);
  // The most recent completed attempt per badge, and its scorecard (for the prep pack's focus areas).
  const lastDone = new Map<string, Booking>();
  for (const k of bks) if (k.b.status === "completed" && !lastDone.has(k.b.candidacyId)) lastDone.set(k.b.candidacyId, k.b);
  const lastIds = [...lastDone.values()].map((b) => b.id);
  const [evts, lastScores] = await Promise.all([
    cands.length ? db.select().from(events).where(inArray(events.candidacyId, cands.map((c) => c.id))).orderBy(desc(events.createdAt)) : [],
    lastIds.length ? db.select().from(bookingScores).where(inArray(bookingScores.bookingId, lastIds)) : [],
  ]);

  const journeys: JourneyView[] = [];
  for (const badge of allBadges) {
    const requirements: Requirement[] = reqs
      .filter((r) => r.badgeId === badge.id)
      .map((r) => ({ skill: r.skill, level: r.level, cleared: cleared.some((c) => c.skill === r.skill && c.level >= r.level) }));
    const cand = cands.find((c) => c.badgeId === badge.id) ?? null;
    const clearedCount = requirements.filter((r) => r.cleared).length;
    if (!cand && clearedCount === 0) continue; // a track the student has not started

    const live = cand ? bks.find((k) => k.b.candidacyId === cand.id && k.b.status === "scheduled") : undefined;
    const last = cand ? bks.find((k) => k.b.candidacyId === cand.id && k.b.status === "completed") : undefined;
    const state = deriveState(cand, live?.b ?? null, now);
    const canCancel = state === "BOOKED" && !!live && checkCanChange(live.b.startsAt, now).ok;
    const canReschedule = state === "BOOKED" && !!live && !!cand && checkCanReschedule(cand, live.b.startsAt, now).ok;

    journeys.push({
      candidacyId: cand?.id ?? null,
      badge,
      state,
      requirements,
      booking: live ? { id: live.b.id, startsAt: live.b.startsAt, endsAt: live.b.endsAt, interviewer: live.interviewer, meetingUrl: live.b.meetingUrl } : null,
      canCancel,
      canReschedule,
      bookableFrom: cand?.bookableFrom ?? null,
      attemptCount: cand?.attemptCount ?? 0,
      events: evts.filter((e) => e.candidacyId === cand?.id),
      prep: prepPackFor({
        state,
        requirements,
        last: last
          ? {
              outcome: last.b.outcome,
              feedback: last.b.studentFeedback,
              startsAt: last.b.startsAt,
              scores: Object.fromEntries(lastScores.filter((r) => r.bookingId === last.b.id).map((r) => [r.criterion, r.score])),
            }
          : null,
      }),
      copy: journeyCopy(state, {
        badge,
        now,
        progress: { cleared: clearedCount, total: requirements.length },
        booking: live ? { startsAt: live.b.startsAt, endsAt: live.b.endsAt, interviewer: live.interviewer } : null,
        lastOutcome: cand?.lastOutcome,
        lastFeedback: last?.b.studentFeedback,
        lastStartsAt: last?.b.startsAt,
        bookableFrom: cand?.bookableFrom,
        canChange: canCancel,
      }),
    });
  }
  // What needs the student's attention comes first.
  const weight: Record<JourneyState, number> = { IN_PROGRESS: 0, ELIGIBLE: 1, RETAKE_READY: 1, BOOKED: 2, AWAITING_RESULT: 3, COOLDOWN: 4, BLOCKED: 5, NULLIFIED: 5, PASSED: 6, NOT_ELIGIBLE: 7 };
  journeys.sort((a, b) => weight[a.state] - weight[b.state]);

  return { journeys, notifications: notes, standing: standings.get(student.id) ?? { miles: student.baseMiles, badgesHeld: 0, rank: 0, of: 0 } };
}

export interface OpenTime {
  startsAt: number;
  endsAt: number;
  interviewers: number;
}

/** Start times a student can book: at least one active slot with no live booking, inside the booking window. */
export async function getOpenTimes(studentId: string, now: number): Promise<OpenTime[]> {
  const rows = await db
    .select({ startsAt: slots.startsAt, endsAt: slots.endsAt, interviewers: count() })
    .from(slots)
    .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
    .where(
      and(
        eq(slots.active, true),
        isNull(bookings.id),
        gte(slots.startsAt, now + POLICY.minNoticeHours * MS.HOUR),
        lte(slots.startsAt, now + POLICY.horizonDays * MS.DAY),
      ),
    )
    .groupBy(slots.startsAt, slots.endsAt)
    .orderBy(asc(slots.startsAt));
  // Hide times that clash with an interview the student already has for another badge.
  const mine = await db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(eq(bookings.studentId, studentId), eq(bookings.status, "scheduled")));
  return rows.filter((r) => !mine.some((m) => r.startsAt < m.endsAt && r.endsAt > m.startsAt));
}

export async function getCandidacyForStudent(candidacyId: string, studentId: string) {
  const [row] = await db
    .select({ c: candidacies, badge: badges })
    .from(candidacies)
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .where(and(eq(candidacies.id, candidacyId), eq(candidacies.studentId, studentId)))
    .limit(1);
  if (!row) return null;
  const [live] = await db
    .select({ b: bookings, interviewer: users.name })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.interviewerId))
    .where(and(eq(bookings.candidacyId, candidacyId), eq(bookings.status, "scheduled")))
    .limit(1);
  return { ...row, live: live ?? null };
}

/* ------------------------------------------------------------- interviewer */

export interface ScheduleRow {
  booking: Booking;
  student: Pick<User, "id" | "name" | "campus">;
  badge: Badge;
  candidacy: Pick<Candidacy, "attemptCount" | "noShowCount" | "lastOutcome">;
  previousFeedback: string | null;
}

async function scheduleRows(where: ReturnType<typeof and>): Promise<ScheduleRow[]> {
  const rows = await db
    .select({
      booking: bookings,
      student: { id: users.id, name: users.name, campus: users.campus },
      badge: badges,
      candidacy: { attemptCount: candidacies.attemptCount, noShowCount: candidacies.noShowCount, lastOutcome: candidacies.lastOutcome },
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.studentId))
    .innerJoin(candidacies, eq(candidacies.id, bookings.candidacyId))
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .where(where)
    .orderBy(asc(bookings.startsAt));
  if (!rows.length) return [];
  // Feedback from the student's earlier attempt, so the interviewer can pick up where it left off.
  const earlier = await db
    .select({ candidacyId: bookings.candidacyId, startsAt: bookings.startsAt, feedback: bookings.studentFeedback })
    .from(bookings)
    .where(and(inArray(bookings.candidacyId, rows.map((r) => r.booking.candidacyId)), eq(bookings.status, "completed")))
    .orderBy(desc(bookings.startsAt));
  return rows.map((r) => ({
    ...r,
    previousFeedback: earlier.find((e) => e.candidacyId === r.booking.candidacyId && e.startsAt < r.booking.startsAt)?.feedback ?? null,
  }));
}

export async function getInterviewerSchedule(interviewerId: string, dayStart: number, now: number) {
  const [day, pending] = await Promise.all([
    scheduleRows(
      and(
        eq(bookings.interviewerId, interviewerId),
        inArray(bookings.status, ["scheduled", "completed"]),
        gte(bookings.startsAt, dayStart),
        lte(bookings.startsAt, dayStart + MS.DAY - 1),
      ),
    ),
    // Interviews that have started and still have no outcome, from any day.
    scheduleRows(and(eq(bookings.interviewerId, interviewerId), eq(bookings.status, "scheduled"), lte(bookings.startsAt, now))),
  ]);
  return { day, pending };
}

export async function getInterviewerSlots(interviewerId: string, from: number, to: number) {
  return db
    .select({ startsAt: slots.startsAt, booked: sql<boolean>`count(${bookings.id}) > 0` })
    .from(slots)
    .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
    .where(and(eq(slots.interviewerId, interviewerId), eq(slots.active, true), gte(slots.startsAt, from), lte(slots.startsAt, to)))
    .groupBy(slots.id)
    .orderBy(asc(slots.startsAt));
}

/* -------------------------------------------------------------------- team */

export interface PipelineRow {
  candidacy: Candidacy;
  student: Pick<User, "id" | "name" | "campus" | "email">;
  badge: Badge;
  state: JourneyState;
  live: { id: string; startsAt: number; endsAt: number; interviewer: string } | null;
  last: { startsAt: number; interviewer: string; outcome: Booking["outcome"]; recordedAt: number | null } | null;
  outcomeOverdue: boolean;
}

export async function getPipeline(now: number): Promise<PipelineRow[]> {
  const [cands, bks] = await Promise.all([
    db
      .select({ candidacy: candidacies, student: { id: users.id, name: users.name, campus: users.campus, email: users.email }, badge: badges })
      .from(candidacies)
      .innerJoin(users, eq(users.id, candidacies.studentId))
      .innerJoin(badges, eq(badges.id, candidacies.badgeId)),
    db
      .select({ b: bookings, interviewer: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.interviewerId))
      .where(inArray(bookings.status, ["scheduled", "completed"]))
      .orderBy(desc(bookings.startsAt)),
  ]);
  return cands.map((row) => {
    const live = bks.find((k) => k.b.candidacyId === row.candidacy.id && k.b.status === "scheduled");
    const last = bks.find((k) => k.b.candidacyId === row.candidacy.id && k.b.status === "completed");
    const state = deriveState(row.candidacy, live?.b ?? null, now);
    return {
      ...row,
      state,
      live: live ? { id: live.b.id, startsAt: live.b.startsAt, endsAt: live.b.endsAt, interviewer: live.interviewer } : null,
      last: last ? { startsAt: last.b.startsAt, interviewer: last.interviewer, outcome: last.b.outcome, recordedAt: last.b.recordedAt } : null,
      outcomeOverdue: state === "AWAITING_RESULT" && !!live && now - live.b.endsAt > POLICY.outcomeSlaHours * MS.HOUR,
    };
  });
}

/** Personas for the picker: staff, and the story students (background cohort excluded). */
export async function getPersonas(now: number) {
  const story = new Set(STORY_STUDENT_IDS);
  const [all, pipeline] = await Promise.all([db.select().from(users).orderBy(asc(users.name)), getPipeline(now)]);
  const stateOf = new Map(pipeline.map((p) => [p.student.id, p.state]));
  return all
    .filter((u) => u.role !== "student" || story.has(u.id))
    .map((u) => ({ ...u, state: u.role === "student" ? (stateOf.get(u.id) ?? ("NOT_ELIGIBLE" as JourneyState)) : null }));
}

/* ------------------------------------------------------------- demo clock */

export interface ClockMark {
  at: number;
  label: string;
}

/**
 * Moments worth jumping to: the next interview starts, results falling overdue, waiting
 * periods ending. A signed-in student's own moments come first.
 */
export async function getClockMarks(now: number, focusUserId?: string): Promise<ClockMark[]> {
  const story = new Set(STORY_STUDENT_IDS);
  const [live, cooling] = await Promise.all([
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt, studentId: bookings.studentId, name: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.studentId))
      .where(eq(bookings.status, "scheduled"))
      .orderBy(asc(bookings.startsAt)),
    db
      .select({ at: candidacies.bookableFrom, studentId: candidacies.studentId, name: users.name })
      .from(candidacies)
      .innerJoin(users, eq(users.id, candidacies.studentId))
      .where(and(eq(candidacies.status, "eligible"), gte(candidacies.bookableFrom, now))),
  ]);
  const first = (n: string) => n.split(" ")[0];
  const marks: (ClockMark & { mine: boolean })[] = [];
  for (const b of live.filter((b) => story.has(b.studentId))) {
    const mine = b.studentId === focusUserId;
    if (b.startsAt > now) marks.push({ at: b.startsAt + MS.MINUTE, label: `${first(b.name)}’s interview starts`, mine });
    else if (b.endsAt > now) marks.push({ at: b.endsAt + MS.MINUTE, label: `${first(b.name)}’s interview ends`, mine });
    const sla = b.endsAt + POLICY.outcomeSlaHours * MS.HOUR;
    if (sla > now) marks.push({ at: sla + MS.MINUTE, label: `${first(b.name)}’s result goes overdue`, mine });
  }
  for (const c of cooling.filter((c) => story.has(c.studentId))) if (c.at) marks.push({ at: c.at + MS.MINUTE, label: `${first(c.name)} can rebook`, mine: c.studentId === focusUserId });
  return marks
    .filter((m) => m.at > now && m.at < now + POLICY.demoClockMaxDays * MS.DAY)
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.at - b.at)
    .slice(0, 6)
    .map(({ at, label }) => ({ at, label }));
}

/* ---------------------------------------------------------- interview room */

export interface RoomAttempt {
  id: string;
  startsAt: number;
  interviewer: string;
  outcome: Booking["outcome"];
  studentFeedback: string | null;
  internalNotes: string | null;
  scores: { label: string; score: number }[];
}

/** Everything an interviewer needs on one screen, for one interview. Null if it isn't theirs. */
export async function getInterviewRoom(bookingId: string, viewer: User) {
  if (viewer.role === "student") return null;
  const [row] = await db
    .select({ booking: bookings, student: users, candidacy: candidacies, badge: badges })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.studentId))
    .innerJoin(candidacies, eq(candidacies.id, bookings.candidacyId))
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  if (viewer.role === "interviewer" && row.booking.interviewerId !== viewer.id) return null;

  const [reqs, cleared, past, interviewer] = await Promise.all([
    db.select().from(badgeRequirements).where(eq(badgeRequirements.badgeId, row.badge.id)),
    db.select().from(skillClearances).where(eq(skillClearances.studentId, row.student.id)),
    db
      .select({ b: bookings, interviewer: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.interviewerId))
      .where(and(eq(bookings.candidacyId, row.candidacy.id), eq(bookings.status, "completed")))
      .orderBy(desc(bookings.startsAt)),
    db.select({ name: users.name }).from(users).where(eq(users.id, row.booking.interviewerId)).limit(1),
  ]);
  const scoreRows = past.length ? await db.select().from(bookingScores).where(inArray(bookingScores.bookingId, past.map((p) => p.b.id))) : [];
  const skills = reqs.map((r) => {
    const top = cleared.filter((c) => c.skill === r.skill && c.level <= r.level).sort((a, b) => b.level - a.level)[0];
    return { skill: r.skill, level: r.level, result: top?.level === r.level ? top.result : null, clearedAt: top?.level === r.level ? top.clearedAt : null };
  });
  const attempts: RoomAttempt[] = past.map((p) => ({
    id: p.b.id,
    startsAt: p.b.startsAt,
    interviewer: p.interviewer,
    outcome: p.b.outcome,
    studentFeedback: p.b.studentFeedback,
    internalNotes: p.b.internalNotes,
    scores: scoreRows.filter((sr) => sr.bookingId === p.b.id).map((sr) => ({ label: sr.label, score: sr.score })),
  }));
  return { ...row, interviewerName: interviewer[0]?.name ?? "", requirements: reqs, skills, attempts };
}

/* ------------------------------------------------------- interviewer week */

/** Per-day counts for the week strip, plus the open slot times for the day timeline. */
export async function getInterviewerWeek(interviewerId: string, from: number, days: number) {
  const to = from + days * MS.DAY;
  const [mine, booked] = await Promise.all([
    getInterviewerSlots(interviewerId, from, to),
    db
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(and(eq(bookings.interviewerId, interviewerId), inArray(bookings.status, ["scheduled", "completed"]), gte(bookings.startsAt, from), lte(bookings.startsAt, to))),
  ]);
  return Array.from({ length: days }, (_, d) => {
    const start = from + d * MS.DAY;
    const inDay = (t: number) => t >= start && t < start + MS.DAY;
    return {
      dayStart: start,
      interviews: booked.filter((b) => inDay(b.startsAt)).length,
      openStarts: mine.filter((m) => inDay(m.startsAt) && !m.booked).map((m) => m.startsAt),
    };
  });
}

/* ------------------------------------------------------------ team insight */

export interface InterviewerInsight {
  id: string;
  name: string;
  decided: number;
  passed: number;
  passRate: number | null;
  avgScore: number | null;
  overrides: number;
  noShows: number;
  upcoming: number;
  openNext7: number;
  pendingOutcome: number;
  overdue: number;
  calibration: "lenient" | "strict" | "in_line" | "too_few";
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export async function getTeamInsights(now: number, today: number) {
  const [cands, allBookings, scoreRows, interviewers, openSlots] = await Promise.all([
    db.select({ id: candidacies.id, status: candidacies.status, statusBeforeFlag: candidacies.statusBeforeFlag }).from(candidacies),
    db.select().from(bookings),
    db.select({ bookingId: bookingScores.bookingId, score: bookingScores.score }).from(bookingScores),
    db.select().from(users).where(eq(users.role, "interviewer")).orderBy(asc(users.name)),
    db
      .select({ startsAt: slots.startsAt, interviewerId: slots.interviewerId })
      .from(slots)
      .leftJoin(bookings, and(eq(bookings.slotId, slots.id), eq(bookings.status, "scheduled")))
      .where(and(eq(slots.active, true), isNull(bookings.id), gte(slots.startsAt, now + POLICY.minNoticeHours * MS.HOUR), lte(slots.startsAt, now + POLICY.horizonDays * MS.DAY))),
  ]);

  // Funnel: how far every candidacy has got.
  const live = allBookings.filter((b) => b.status !== "cancelled");
  const booked = new Set(live.map((b) => b.candidacyId));
  const assessed = new Set(live.filter((b) => b.outcome === "pass" || b.outcome === "fail").map((b) => b.candidacyId));
  const passed = cands.filter((c) => c.status === "passed" || (c.status === "nullified" && c.statusBeforeFlag === "passed")).length;
  const nullified = cands.filter((c) => c.status === "nullified").length;
  const funnel = [
    { label: "Eligible", value: cands.length, hint: "Cleared every skill for a badge" },
    { label: "Booked", value: booked.size, hint: "Booked an interview at least once" },
    { label: "Assessed", value: assessed.size, hint: "Pass or fail recorded" },
    { label: "Badge earned", value: passed, hint: nullified ? `Includes ${nullified} later nullified` : "None nullified" },
  ];

  // Capacity: the next 10 days, booked against still bookable.
  const capacity = Array.from({ length: 10 }, (_, d) => {
    const start = today + d * MS.DAY;
    const end = start + MS.DAY;
    return {
      dayStart: start,
      booked: allBookings.filter((b) => b.status === "scheduled" && b.startsAt >= Math.max(start, now) && b.startsAt < end).length,
      open: openSlots.filter((o) => o.startsAt >= start && o.startsAt < end).length,
    };
  });

  // Calibration: does anyone pass far more, or far fewer, students than the team does?
  const decidedAll = allBookings.filter((b) => b.outcome === "pass" || b.outcome === "fail");
  const teamRate = decidedAll.length ? decidedAll.filter((b) => b.outcome === "pass").length / decidedAll.length : null;
  const scoreOf = new Map<string, number[]>();
  for (const r of scoreRows) scoreOf.set(r.bookingId, [...(scoreOf.get(r.bookingId) ?? []), r.score]);

  const people: InterviewerInsight[] = interviewers.map((u) => {
    const mine = allBookings.filter((b) => b.interviewerId === u.id);
    const decided = mine.filter((b) => b.outcome === "pass" || b.outcome === "fail");
    const passedN = decided.filter((b) => b.outcome === "pass").length;
    const passRate = decided.length ? passedN / decided.length : null;
    const cards = decided.map((b) => ({ b, v: scoreOf.get(b.id) })).filter((x): x is { b: Booking; v: number[] } => !!x.v?.length);
    const overrides = cards.filter(({ b, v }) => (mean(v) >= POLICY.rubricPassAverage && Math.min(...v) >= POLICY.rubricMinScore) !== (b.outcome === "pass")).length;
    const scheduled = mine.filter((b) => b.status === "scheduled");
    const gap = passRate !== null && teamRate !== null ? (passRate - teamRate) * 100 : 0;
    return {
      id: u.id,
      name: u.name,
      decided: decided.length,
      passed: passedN,
      passRate,
      avgScore: cards.length ? mean(cards.map((c) => mean(c.v))) : null,
      overrides,
      noShows: mine.filter((b) => b.outcome === "no_show").length,
      upcoming: scheduled.filter((b) => b.startsAt > now).length,
      openNext7: openSlots.filter((o) => o.interviewerId === u.id && o.startsAt < now + 7 * MS.DAY).length,
      pendingOutcome: scheduled.filter((b) => b.endsAt <= now).length,
      overdue: scheduled.filter((b) => now - b.endsAt > POLICY.outcomeSlaHours * MS.HOUR).length,
      calibration:
        decided.length < POLICY.calibrationMinSample ? "too_few" : gap >= POLICY.calibrationGapPoints ? "lenient" : gap <= -POLICY.calibrationGapPoints ? "strict" : "in_line",
    };
  });

  return { funnel, capacity, people, teamRate };
}

/** Event history for the team's per-student drawer. */
export async function getEventsFor(candidacyIds: string[]) {
  if (!candidacyIds.length) return [];
  return db.select().from(events).where(inArray(events.candidacyId, candidacyIds)).orderBy(desc(events.createdAt));
}

/** Story students with a live booking, for the side-by-side demo. */
export async function getLiveBookings() {
  const story = new Set(STORY_STUDENT_IDS);
  const rows = await db
    .select({ booking: bookings, student: users.name })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.studentId))
    .where(eq(bookings.status, "scheduled"))
    .orderBy(asc(bookings.startsAt));
  return rows.filter((r) => story.has(r.booking.studentId));
}

export async function getUserById(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

export type { NotificationRow };
