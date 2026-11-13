/**
 * The interview journey as a pure state machine.
 *
 * Stored status (5 values) is deliberately smaller than the journey state a person
 * sees (10 values). Anything that depends on the clock is derived here, so there is
 * no background job that can fall behind and no two screens that can disagree.
 */
import { MS, POLICY } from "./policy";

export const CANDIDACY_STATUSES = ["eligible", "booked", "passed", "blocked", "nullified"] as const;
export type CandidacyStatus = (typeof CANDIDACY_STATUSES)[number];

export const OUTCOMES = ["pass", "fail", "retake", "no_show"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type JourneyState =
  | "NOT_ELIGIBLE" // skills still pending for this badge
  | "ELIGIBLE" // can book a first interview
  | "BOOKED" // interview scheduled, in the future
  | "IN_PROGRESS" // inside the interview window
  | "AWAITING_RESULT" // interview window over, outcome not recorded yet
  | "PASSED" // badge awarded
  | "COOLDOWN" // failed or missed; cannot rebook yet
  | "RETAKE_READY" // can book again
  | "BLOCKED" // flagged for malpractice before earning the badge
  | "NULLIFIED"; // flagged after earning the badge; badge taken back

export interface CandidacySnapshot {
  status: CandidacyStatus;
  lastOutcome: Outcome | null;
  bookableFrom: number | null;
  attemptCount: number;
  noShowCount: number;
  reschedulesUsed: number;
  statusBeforeFlag: CandidacyStatus | null;
}

export interface BookingWindow {
  startsAt: number;
  endsAt: number;
}

export function deriveState(
  candidacy: Pick<CandidacySnapshot, "status" | "lastOutcome" | "bookableFrom"> | null,
  liveBooking: BookingWindow | null,
  now: number,
): JourneyState {
  if (!candidacy) return "NOT_ELIGIBLE";
  switch (candidacy.status) {
    case "nullified":
      return "NULLIFIED";
    case "blocked":
      return "BLOCKED";
    case "passed":
      return "PASSED";
    case "booked":
      // A booked candidacy always has a live booking (enforced in one transaction).
      // If it somehow does not, fail safe: let the student book again.
      if (!liveBooking) return candidacy.lastOutcome ? "RETAKE_READY" : "ELIGIBLE";
      if (now < liveBooking.startsAt) return "BOOKED";
      if (now < liveBooking.endsAt) return "IN_PROGRESS";
      return "AWAITING_RESULT";
    case "eligible":
      if (candidacy.bookableFrom !== null && candidacy.bookableFrom > now) return "COOLDOWN";
      return candidacy.lastOutcome ? "RETAKE_READY" : "ELIGIBLE";
  }
}

export const STATE_LABEL: Record<JourneyState, string> = {
  NOT_ELIGIBLE: "Skills pending",
  ELIGIBLE: "Ready to book",
  BOOKED: "Interview booked",
  IN_PROGRESS: "Interview in progress",
  AWAITING_RESULT: "Awaiting result",
  PASSED: "Badge earned",
  COOLDOWN: "Waiting period",
  RETAKE_READY: "Ready to rebook",
  BLOCKED: "On hold",
  NULLIFIED: "Badge nullified",
};

/* ------------------------------------------------------------------ guards */

export type RuleCode =
  | "NOT_BOOKABLE"
  | "TOO_SOON"
  | "TOO_FAR"
  | "OFF_GRID"
  | "CHANGE_CUTOFF"
  | "NO_RESCHEDULES_LEFT"
  | "NOT_STARTED"
  | "NO_SHOW_TOO_EARLY";

export type Check = { ok: true } | { ok: false; code: RuleCode; message: string };
const ok: Check = { ok: true };
const no = (code: RuleCode, message: string): Check => ({ ok: false, code, message });

export function checkCanBook(state: JourneyState): Check {
  if (state === "ELIGIBLE" || state === "RETAKE_READY") return ok;
  const why: Partial<Record<JourneyState, string>> = {
    NOT_ELIGIBLE: "Clear every skill for this badge before booking the interview.",
    BOOKED: "You already have an interview booked for this badge.",
    IN_PROGRESS: "Your interview is in progress.",
    AWAITING_RESULT: "Your result is being recorded. You can book again only if a retake is needed.",
    PASSED: "You have already earned this badge.",
    COOLDOWN: "You can book again once your waiting period ends.",
    BLOCKED: "Booking is on hold while your account is under review.",
    NULLIFIED: "This badge was nullified. Booking is closed.",
  };
  return no("NOT_BOOKABLE", why[state] ?? "Booking is not available right now.");
}

export function checkSlotTime(startsAt: number, now: number): Check {
  if (startsAt % (POLICY.slotMinutes * MS.MINUTE) !== 0)
    return no("OFF_GRID", "That is not a valid slot time.");
  if (startsAt < now + POLICY.minNoticeHours * MS.HOUR)
    return no("TOO_SOON", `Slots must be booked at least ${POLICY.minNoticeHours} hours ahead.`);
  if (startsAt > now + POLICY.horizonDays * MS.DAY)
    return no("TOO_FAR", `You can book up to ${POLICY.horizonDays} days ahead.`);
  return ok;
}

export function checkCanChange(startsAt: number, now: number): Check {
  if (now > startsAt - POLICY.changeCutoffHours * MS.HOUR)
    return no(
      "CHANGE_CUTOFF",
      `Changes close ${POLICY.changeCutoffHours} hours before the interview. Please attend at the booked time.`,
    );
  return ok;
}

export function checkCanReschedule(
  candidacy: Pick<CandidacySnapshot, "reschedulesUsed">,
  startsAt: number,
  now: number,
): Check {
  const change = checkCanChange(startsAt, now);
  if (!change.ok) return change;
  if (candidacy.reschedulesUsed >= POLICY.reschedulesPerAttempt)
    return no("NO_RESCHEDULES_LEFT", "You have already used your one reschedule for this interview.");
  return ok;
}

export function checkCanRecord(startsAt: number, outcome: Outcome, now: number): Check {
  if (now < startsAt) return no("NOT_STARTED", "An outcome can be recorded once the interview has started.");
  if (outcome === "no_show" && now < startsAt + POLICY.noShowGraceMinutes * MS.MINUTE)
    return no(
      "NO_SHOW_TOO_EARLY",
      `Wait ${POLICY.noShowGraceMinutes} minutes after the start before marking a no-show.`,
    );
  return ok;
}

/* ------------------------------------------------------------- transitions */

export type CandidacyPatch = Partial<CandidacySnapshot> & { awardedAt?: number | null };

/** Student books a slot. */
export function bookedPatch(): CandidacyPatch {
  return { status: "booked" };
}

/** Booking removed without an interview taking place (student cancel or team cancel). */
export function unbookedPatch(): CandidacyPatch {
  return { status: "eligible" };
}

/** Interviewer records the outcome. */
export function outcomePatch(c: CandidacySnapshot, outcome: Outcome, now: number): CandidacyPatch {
  switch (outcome) {
    case "pass":
      return {
        status: "passed",
        lastOutcome: "pass",
        attemptCount: c.attemptCount + 1,
        bookableFrom: null,
        reschedulesUsed: 0,
        awardedAt: now,
      };
    case "fail":
      return {
        status: "eligible",
        lastOutcome: "fail",
        attemptCount: c.attemptCount + 1,
        bookableFrom: now + POLICY.failCooldownDays * MS.DAY,
        reschedulesUsed: 0,
      };
    case "retake":
      // Inconclusive interview: not counted as an attempt, no waiting period.
      return { status: "eligible", lastOutcome: "retake", bookableFrom: null, reschedulesUsed: 0 };
    case "no_show":
      return {
        status: "eligible",
        lastOutcome: "no_show",
        noShowCount: c.noShowCount + 1,
        bookableFrom: now + POLICY.noShowCooldownDays * MS.DAY,
        reschedulesUsed: 0,
      };
  }
}

/** Malpractice flag. A passed badge is nullified; anything else is blocked. */
export function flagPatch(c: CandidacySnapshot): CandidacyPatch | null {
  if (c.status === "blocked" || c.status === "nullified") return null;
  return {
    status: c.status === "passed" ? "nullified" : "blocked",
    statusBeforeFlag: c.status,
  };
}

/** Flag withdrawn after review. A nullified badge comes back; otherwise the student can book again. */
export function clearFlagPatch(c: CandidacySnapshot): CandidacyPatch | null {
  if (c.status !== "blocked" && c.status !== "nullified") return null;
  return {
    status: c.statusBeforeFlag === "passed" ? "passed" : "eligible",
    statusBeforeFlag: null,
  };
}
