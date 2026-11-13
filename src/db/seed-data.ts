/**
 * Demo data. Every time is relative to "now", so whenever the prototype is opened
 * there is an interview in progress, one awaiting a result, and so on.
 * Each student persona sits in a different journey state.
 */
import { MS, POLICY } from "@/domain/policy";
import { criteriaFor, suggestOutcome, type Criterion } from "@/domain/rubric";
import { notify, type Message } from "@/lib/messages";
import { istHour, startOfDay } from "@/lib/time";
import type { Db, Tx } from "./client";
import * as s from "./schema";

const SLOT = POLICY.slotMinutes * MS.MINUTE;

const BADGES: (typeof s.badges.$inferInsert & { reqs: [string, number][] })[] = [
  {
    id: "product-novice",
    track: "AI Product Mastery",
    tier: "Novice",
    bonusMiles: 500,
    reqs: [
      ["Computational Thinking", 1],
      ["CS Fundamentals", 1],
      ["Applied Gen AI Development", 1],
      ["UI Engineering", 2],
    ],
  },
  {
    id: "systems-novice",
    track: "AI Systems Mastery",
    tier: "Novice",
    bonusMiles: 500,
    reqs: [
      ["Computational Thinking", 1],
      ["CS Fundamentals", 1],
      ["Server-Side Engineering", 1],
      ["SQL", 2],
    ],
  },
];

const STAFF: (typeof s.users.$inferInsert)[] = [
  { id: "int-priya", role: "interviewer", name: "Priya Krishnan", email: "priya.krishnan@niat.example" },
  { id: "int-rahul", role: "interviewer", name: "Rahul Deshmukh", email: "rahul.deshmukh@niat.example" },
  { id: "int-farah", role: "interviewer", name: "Farah Khan", email: "farah.khan@niat.example" },
  { id: "admin-sandeep", role: "admin", name: "Sandeep Kulkarni", email: "sandeep.kulkarni@niat.example" },
];

type Scenario =
  | { kind: "not_eligible" }
  | { kind: "eligible"; daysAgo: number }
  | { kind: "booked"; interviewer: string; offsetMin?: number; inDays?: number; atHour?: number }
  | { kind: "done"; interviewer: string; hoursAgo: number; outcome: "pass" | "fail" | "retake" | "no_show"; feedback?: string; nullified?: boolean };

const STUDENTS: { id: string; name: string; campus: string; miles: number; badge: string; scenario: Scenario }[] = [
  { id: "stu-aarav", name: "Aarav Sharma", campus: "Hyderabad", miles: 1840, badge: "product-novice", scenario: { kind: "eligible", daysAgo: 2 } },
  { id: "stu-ishaan", name: "Ishaan Gupta", campus: "Pune", miles: 1620, badge: "systems-novice", scenario: { kind: "eligible", daysAgo: 12 } },
  { id: "stu-diya", name: "Diya Reddy", campus: "Hyderabad", miles: 2110, badge: "product-novice", scenario: { kind: "booked", interviewer: "int-rahul", inDays: 2, atHour: 11 } },
  { id: "stu-tara", name: "Tara Menon", campus: "Bengaluru", miles: 1975, badge: "product-novice", scenario: { kind: "booked", interviewer: "int-priya", offsetMin: 120 } },
  { id: "stu-nikhil", name: "Nikhil Bose", campus: "Chennai", miles: 1710, badge: "systems-novice", scenario: { kind: "booked", interviewer: "int-priya", offsetMin: 180 } },
  { id: "stu-kabir", name: "Kabir Mehta", campus: "Pune", miles: 2260, badge: "product-novice", scenario: { kind: "booked", interviewer: "int-priya", offsetMin: 0 } },
  { id: "stu-ananya", name: "Ananya Iyer", campus: "Chennai", miles: 2035, badge: "product-novice", scenario: { kind: "booked", interviewer: "int-priya", offsetMin: -90 } },
  { id: "stu-zoya", name: "Zoya Khan", campus: "Bengaluru", miles: 1890, badge: "systems-novice", scenario: { kind: "booked", interviewer: "int-farah", offsetMin: -26 * 60 } },
  { id: "stu-rohan", name: "Rohan Verma", campus: "Hyderabad", miles: 2390, badge: "product-novice", scenario: { kind: "done", interviewer: "int-farah", hoursAgo: 48, outcome: "pass", feedback: "Clear thinking on the product trade-offs and a clean walkthrough of the UI Engineering project." } },
  { id: "stu-sneha", name: "Sneha Pillai", campus: "Pune", miles: 1780, badge: "product-novice", scenario: { kind: "done", interviewer: "int-rahul", hoursAgo: 24, outcome: "fail", feedback: "Your Gen AI project works, but you couldn't explain how the prompt chain handles bad inputs. Revise error handling and be ready to walk through your own code line by line." } },
  { id: "stu-vikram", name: "Vikram Nair", campus: "Chennai", miles: 1930, badge: "systems-novice", scenario: { kind: "done", interviewer: "int-priya", hoursAgo: 22, outcome: "retake", feedback: "Your connection dropped twice and we lost 15 minutes, so I couldn't cover the SQL section. Please rebook from a stable network." } },
  { id: "stu-dev", name: "Dev Patel", campus: "Bengaluru", miles: 1540, badge: "systems-novice", scenario: { kind: "done", interviewer: "int-farah", hoursAgo: 20, outcome: "no_show" } },
  { id: "stu-arjun", name: "Arjun Rao", campus: "Hyderabad", miles: 2480, badge: "product-novice", scenario: { kind: "done", interviewer: "int-rahul", hoursAgo: 6 * 24, outcome: "pass", nullified: true, feedback: "Solid fundamentals and a confident project demo." } },
  { id: "stu-meera", name: "Meera Joshi", campus: "Pune", miles: 1210, badge: "product-novice", scenario: { kind: "not_eligible" } },
];

/** The students offered on the persona picker. Everyone else is background history for the team views. */
export const STORY_STUDENT_IDS = STUDENTS.map((st) => st.id);

/** Deterministic pseudo-random numbers, so every reset produces the same demo. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A believable scorecard for a recorded outcome. `override` produces a pass the rubric
 * would have called a fail, as a lenient interviewer might record.
 */
function scorecard(rand: () => number, criteria: Criterion[], outcome: "pass" | "fail", override = false): Record<string, number> {
  const pick = (options: number[]) => options[Math.floor(rand() * options.length)]!;
  const scores: Record<string, number> = {};
  criteria.forEach((c, i) => (scores[c.key] = override ? (i % 2 ? 3 : 2) : outcome === "pass" ? pick([3, 3, 4, 4, 4]) : pick([2, 2, 3])));
  if (outcome === "fail" && suggestOutcome(criteria, scores).outcome !== "fail") scores[criteria[Math.floor(rand() * criteria.length)]!.key] = 1;
  return scores;
}

/** Background cohort: decided interviews over the past month, spread so calibration has something to find. */
const BACKGROUND_NAMES = [
  "Aditya Kulkarni", "Bhavya Shah", "Chirag Malhotra", "Deepika Rao", "Eshan Banerjee", "Fatima Sheikh", "Gaurav Sinha", "Harini Subramanian",
  "Imran Qureshi", "Jahnavi Nair", "Karan Arora", "Lavanya Reddy", "Manav Jain", "Neha Kapoor", "Omkar Patil", "Pooja Hegde",
  "Rehan Siddiqui", "Riya Das", "Siddharth Menon", "Tanvi Deshpande", "Uday Chandra", "Varsha Iyer", "Yash Agarwal", "Zainab Ali",
  "Arnav Bhatt", "Kavya Pillai", "Pranav Joshi", "Sanya Mehra", "Tejas Gowda",
];
const CAMPUSES = ["Hyderabad", "Bengaluru", "Pune", "Chennai"];
/** [interviewer, outcome, override] for each decided background interview. Rahul passes nearly everyone; Farah rarely does. */
const HISTORY: [string, "pass" | "fail", boolean?][] = [
  ...Array.from({ length: 8 }, (_, i) => ["int-rahul", "pass", i < 2] as [string, "pass", boolean]),
  ["int-farah", "pass"], ["int-farah", "pass"], ...Array.from({ length: 6 }, () => ["int-farah", "fail"] as [string, "fail"]),
  ["int-priya", "pass"], ["int-priya", "pass"], ["int-priya", "pass"], ["int-priya", "pass"], ["int-priya", "fail"], ["int-priya", "fail"], ["int-priya", "fail"],
];

/** Replace all data with the demo set, atomically: readers see the old data or the new, never half. */
export async function seedDemo(db: Db, now = Date.now()) {
  return db.transaction((tx) => fill(tx, now));
}

async function fill(db: Tx, now: number) {
  // Children first, so foreign keys stay satisfied.
  for (const table of [s.notifications, s.events, s.bookingScores, s.bookings, s.slots, s.candidacies, s.skillClearances, s.badgeRequirements, s.badges, s.users])
    await db.delete(table);

  const grid = Math.floor(now / SLOT) * SLOT;
  const today = startOfDay(now);
  const badgeById = new Map(BADGES.map((b) => [b.id, b]));
  const staffName = new Map(STAFF.map((u) => [u.id, u.name]));

  await db.insert(s.badges).values(BADGES.map(({ reqs: _reqs, ...b }) => b));
  await db.insert(s.badgeRequirements).values(BADGES.flatMap((b) => b.reqs.map(([skill, level]) => ({ badgeId: b.id, skill, level }))));
  await db.insert(s.users).values([
    ...STAFF,
    ...STUDENTS.map((u) => ({
      id: u.id,
      role: "student" as const,
      name: u.name,
      email: `${u.name.toLowerCase().replace(" ", ".")}@student.niat.example`,
      campus: u.campus,
      baseMiles: u.miles,
    })),
  ]);

  /* ---- availability: a believable fortnight for three interviewers ---- */
  const slotRows = new Map<string, typeof s.slots.$inferInsert>();
  const ensureSlot = (interviewerId: string, startsAt: number) => {
    const key = `${interviewerId}|${startsAt}`;
    let row = slotRows.get(key);
    if (!row) {
      row = { id: `slot-${interviewerId}-${startsAt / SLOT}`, interviewerId, startsAt, endsAt: startsAt + SLOT, createdAt: now - 3 * MS.DAY };
      slotRows.set(key, row);
    }
    return row;
  };
  const hours: Record<string, [number, number][]> = {
    "int-priya": [[10, 13], [15, 17]],
    "int-rahul": [[11, 13], [14, 18]],
    "int-farah": [[9.5, 12], [16, 19]],
  };
  for (let d = 0; d <= POLICY.horizonDays; d++) {
    const dayStart = today + d * MS.DAY;
    const weekday = new Date(dayStart + 12 * MS.HOUR).getUTCDay();
    if (weekday === 0) continue; // nobody offers Sundays
    for (const [interviewerId, ranges] of Object.entries(hours)) {
      if (interviewerId === "int-farah" && d % 2 === 1) continue; // Farah works alternate days
      for (const [from, to] of ranges)
        for (let h = from; h < to; h += 0.5) {
          const startsAt = dayStart + h * MS.HOUR;
          if (startsAt > now) ensureSlot(interviewerId, startsAt);
        }
    }
  }

  /* ---- journeys ---- */
  const clearances: (typeof s.skillClearances.$inferInsert)[] = [];
  const candidacies: (typeof s.candidacies.$inferInsert)[] = [];
  const bookings: (typeof s.bookings.$inferInsert)[] = [];
  const events: (typeof s.events.$inferInsert)[] = [];
  const notes: (typeof s.notifications.$inferInsert)[] = [];
  const scores: (typeof s.bookingScores.$inferInsert)[] = [];
  const rand = rng(2026);
  const criteriaOf = new Map(BADGES.map((b) => [b.id, criteriaFor(b.reqs.map(([skill, level]) => ({ skill, level })))]));
  const addScores = (bookingId: string, badgeId: string, outcome: "pass" | "fail", override = false) => {
    const criteria = criteriaOf.get(badgeId)!;
    const card = scorecard(rand, criteria, outcome, override);
    for (const c of criteria) scores.push({ bookingId, criterion: c.key, label: c.label, score: card[c.key]! });
  };
  let seq = 0;
  const event = (candidacyId: string, actorId: string | null, type: s.EventType, summary: string, createdAt: number) =>
    events.push({ id: `evt-${++seq}`, candidacyId, actorId, type, summary, createdAt });
  const note = (userId: string, candidacyId: string, kind: string, m: Message, createdAt: number) =>
    notes.push({ id: `ntf-${++seq}`, userId, candidacyId, kind, ...m, createdAt });

  for (const st of STUDENTS) {
    const badge = badgeById.get(st.badge)!;
    const sc = st.scenario;
    const reqs = sc.kind === "not_eligible" ? badge.reqs.slice(0, 3) : badge.reqs;

    // When did the interview (if any) start, and when did the student become eligible?
    let startsAt: number | null = null;
    if (sc.kind === "booked")
      startsAt = sc.inDays !== undefined ? today + sc.inDays * MS.DAY + (sc.atHour ?? 11) * MS.HOUR : grid + (sc.offsetMin ?? 0) * MS.MINUTE;
    if (sc.kind === "done") startsAt = grid - sc.hoursAgo * MS.HOUR;
    const eligibleAt = sc.kind === "eligible" ? now - sc.daysAgo * MS.DAY - 3 * MS.HOUR : (startsAt ?? now) - 4 * MS.DAY;

    reqs.forEach(([skill, level], i) => {
      for (let l = 1; l <= level; l++)
        clearances.push({ studentId: st.id, skill, level: l, result: (i + l) % 3 === 0 ? "silver" : "gold", clearedAt: eligibleAt - (reqs.length - i) * 6 * MS.DAY - (level - l) * 5 * MS.DAY });
    });
    if (sc.kind === "not_eligible") continue;

    const cid = `cand-${st.id.slice(4)}`;
    const cand: typeof s.candidacies.$inferInsert = { id: cid, studentId: st.id, badgeId: badge.id, status: "eligible", eligibleAt };
    event(cid, null, "eligible", `Cleared every skill for ${badge.tier} · ${badge.track}`, eligibleAt);
    note(st.id, cid, "eligible", notify.eligible(badge), eligibleAt);

    if (startsAt !== null && sc.kind !== "eligible") {
      const slot = ensureSlot(sc.interviewer, startsAt);
      const interviewer = staffName.get(sc.interviewer)!;
      const bookedAt = Math.max(eligibleAt + 5 * MS.HOUR, startsAt - 3 * MS.DAY);
      const booking: typeof s.bookings.$inferInsert = {
        id: `bkg-${st.id.slice(4)}`,
        candidacyId: cid,
        slotId: slot.id!,
        studentId: st.id,
        interviewerId: sc.interviewer,
        startsAt,
        endsAt: startsAt + SLOT,
        attemptNo: 1,
        status: "scheduled",
        meetingUrl: `/call/bkg-${st.id.slice(4)}`,
        createdAt: bookedAt,
      };
      event(cid, st.id, "booked", `Booked ${interviewer}`, bookedAt);
      note(st.id, cid, "booked", notify.booked(badge, startsAt, startsAt + SLOT, interviewer), bookedAt);

      if (sc.kind === "booked") cand.status = "booked";
      if (sc.kind === "done") {
        const recordedAt = startsAt + 40 * MS.MINUTE;
        Object.assign(booking, { status: "completed", outcome: sc.outcome, studentFeedback: sc.feedback ?? null, recordedBy: sc.interviewer, recordedAt });
        cand.lastOutcome = sc.outcome;
        if (sc.outcome === "pass" || sc.outcome === "fail") addScores(booking.id!, badge.id, sc.outcome);
        if (sc.outcome === "pass") {
          Object.assign(cand, { status: "passed", attemptCount: 1, awardedAt: recordedAt });
          event(cid, sc.interviewer, "outcome_pass", "Passed. Badge awarded", recordedAt);
          note(st.id, cid, "pass", notify.pass(badge), recordedAt);
        } else if (sc.outcome === "fail") {
          const from = recordedAt + POLICY.failCooldownDays * MS.DAY;
          Object.assign(cand, { attemptCount: 1, bookableFrom: from });
          event(cid, sc.interviewer, "outcome_fail", "Not cleared", recordedAt);
          note(st.id, cid, "fail", notify.fail(badge, sc.feedback ?? "", from), recordedAt);
        } else if (sc.outcome === "retake") {
          event(cid, sc.interviewer, "outcome_retake", "Retake needed", recordedAt);
          note(st.id, cid, "retake", notify.retake(badge, sc.feedback ?? ""), recordedAt);
        } else {
          const from = recordedAt + POLICY.noShowCooldownDays * MS.DAY;
          Object.assign(cand, { noShowCount: 1, bookableFrom: from });
          event(cid, sc.interviewer, "outcome_no_show", "Student did not join", recordedAt);
          note(st.id, cid, "no_show", notify.noShow(badge, startsAt, from), recordedAt);
        }
        if (sc.nullified) {
          const flaggedAt = now - 20 * MS.HOUR;
          Object.assign(cand, { status: "nullified", statusBeforeFlag: "passed", flagReason: "Proctoring review: second person visible during the UI Engineering L2 contest.", flaggedAt });
          event(cid, "admin-sandeep", "flagged", "Flagged for malpractice. Badge nullified", flaggedAt);
          note(st.id, cid, "nullified", notify.nullified(badge), flaggedAt);
        }
      }
      bookings.push(booking);
    }
    candidacies.push(cand);
  }

  /* ---- background cohort: history for the team's funnel, capacity and calibration views ---- */
  const usedSlots = new Set(bookings.map((b) => b.slotId));
  const background: (typeof s.users.$inferInsert)[] = [];
  const workingStart = (dayStart: number, interviewerId: string) => {
    // A free half hour inside the interviewer's usual hours on that day.
    const ranges = hours[interviewerId]!;
    for (let tries = 0; tries < 40; tries++) {
      const [from, to] = ranges[Math.floor(rand() * ranges.length)]!;
      const h = from + Math.floor(rand() * ((to - from) * 2)) / 2;
      const startsAt = dayStart + h * MS.HOUR;
      const slot = ensureSlot(interviewerId, startsAt);
      if (!usedSlots.has(slot.id)) {
        usedSlots.add(slot.id);
        return slot;
      }
    }
    throw new Error("Seed could not find a free slot");
  };

  BACKGROUND_NAMES.forEach((name, i) => {
    const id = `stu-bg${String(i + 1).padStart(2, "0")}`;
    const badge = BADGES[i % 2]!;
    const campus = CAMPUSES[i % CAMPUSES.length]!;
    background.push({ id, role: "student", name, email: `${name.toLowerCase().replace(" ", ".")}@student.niat.example`, campus, baseMiles: 1300 + Math.floor(rand() * 1100) });
    const history = HISTORY[i];
    // Interviews 3–30 days ago for the decided cohort; the rest are waiting or booked ahead.
    const daysAgo = history ? 3 + Math.floor(rand() * 27) : 0;
    const eligibleAt = history ? today - (daysAgo + 2 + Math.floor(rand() * 4)) * MS.DAY + 10 * MS.HOUR : now - (1 + Math.floor(rand() * 9)) * MS.DAY;
    badge.reqs.forEach(([skill, level], r) => {
      for (let l = 1; l <= level; l++)
        clearances.push({ studentId: id, skill, level: l, result: rand() < 0.7 ? "gold" : "silver", clearedAt: eligibleAt - (badge.reqs.length - r) * 5 * MS.DAY - (level - l) * 4 * MS.DAY });
    });
    const cid = `cand-${id.slice(4)}`;
    const cand: typeof s.candidacies.$inferInsert = { id: cid, studentId: id, badgeId: badge.id, status: "eligible", eligibleAt };
    event(cid, null, "eligible", `Cleared every skill for ${badge.tier} · ${badge.track}`, eligibleAt);

    if (history) {
      const [interviewerId, outcome, override] = history;
      let dayStart = today - daysAgo * MS.DAY;
      if (new Date(dayStart + 12 * MS.HOUR).getUTCDay() === 0) dayStart -= MS.DAY;
      const slot = workingStart(dayStart, interviewerId);
      const recordedAt = slot.startsAt + 45 * MS.MINUTE;
      const bookingId = `bkg-${id.slice(4)}`;
      bookings.push({
        id: bookingId, candidacyId: cid, slotId: slot.id!, studentId: id, interviewerId, startsAt: slot.startsAt, endsAt: slot.startsAt + SLOT, attemptNo: 1,
        status: "completed", outcome, recordedBy: interviewerId, recordedAt, meetingUrl: `/call/${bookingId}`, createdAt: slot.startsAt - 2 * MS.DAY,
        studentFeedback: outcome === "pass" ? "Good command of the fundamentals and a clear walkthrough of your own project." : "Revisit the fundamentals we discussed and practise explaining your own code out loud.",
        internalNotes: override ? "Rubric suggested fail. Passed on the strength of the project demo." : null,
      });
      addScores(bookingId, badge.id, outcome, override);
      event(cid, id, "booked", `Booked ${staffName.get(interviewerId)}`, slot.startsAt - 2 * MS.DAY);
      cand.lastOutcome = outcome;
      cand.attemptCount = 1;
      if (outcome === "pass") {
        Object.assign(cand, { status: "passed", awardedAt: recordedAt });
        event(cid, interviewerId, "outcome_pass", "Passed. Badge awarded", recordedAt);
      } else {
        cand.bookableFrom = recordedAt + POLICY.failCooldownDays * MS.DAY;
        event(cid, interviewerId, "outcome_fail", "Not cleared", recordedAt);
      }
    } else if (i % 2 === 0) {
      // Booked ahead, on one of the next working days.
      const interviewerId = ["int-priya", "int-rahul", "int-farah"][i % 3]!;
      let d = 1 + (i % 6);
      if (interviewerId === "int-farah" && d % 2 === 1) d++;
      let dayStart = today + d * MS.DAY;
      if (new Date(dayStart + 12 * MS.HOUR).getUTCDay() === 0) dayStart += 2 * MS.DAY;
      const slot = workingStart(dayStart, interviewerId);
      bookings.push({
        id: `bkg-${id.slice(4)}`, candidacyId: cid, slotId: slot.id!, studentId: id, interviewerId, startsAt: slot.startsAt, endsAt: slot.startsAt + SLOT, attemptNo: 1,
        status: "scheduled", meetingUrl: `/call/bkg-${id.slice(4)}`, createdAt: now - MS.DAY,
      });
      cand.status = "booked";
      event(cid, id, "booked", `Booked ${staffName.get(interviewerId)}`, now - MS.DAY);
    }
    candidacies.push(cand);
  });
  await db.insert(s.users).values(background);

  // Keep the demo's "today" realistic: drop generated open slots that fall outside working hours.
  const slotList = [...slotRows.values()].filter((r) => {
    const h = istHour(r.startsAt);
    return bookings.some((b) => b.slotId === r.id) || (h >= POLICY.dayStartHour && h < POLICY.dayEndHour);
  });

  const chunk = <T,>(rows: T[], size = 80) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  await db.insert(s.skillClearances).values(clearances);
  await db.insert(s.candidacies).values(candidacies);
  for (const rows of chunk(slotList)) await db.insert(s.slots).values(rows);
  for (const rows of chunk(bookings)) await db.insert(s.bookings).values(rows);
  for (const rows of chunk(scores)) await db.insert(s.bookingScores).values(rows);
  for (const rows of chunk(events)) await db.insert(s.events).values(rows);
  await db.insert(s.notifications).values(notes);

  return { students: STUDENTS.length, slots: slotList.length, bookings: bookings.length };
}
