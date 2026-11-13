/**
 * Every tunable rule of the interview flow lives here.
 * The GRIT site does not define these, so they are assumptions made explicit:
 * changing a number here changes the behaviour, the copy and the tests together.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const POLICY = {
  /** Length of one interview slot. */
  slotMinutes: 30,
  /** How far ahead a student can book. */
  horizonDays: 14,
  /** A slot starting sooner than this cannot be booked. */
  minNoticeHours: 4,
  /** Cancel / reschedule is allowed until this long before the start. */
  changeCutoffHours: 12,
  /** Free reschedules per attempt. */
  reschedulesPerAttempt: 1,
  /** Wait after a fail. Mirrors the 5-day gap GRIT uses for contest re-attempts. */
  failCooldownDays: 5,
  /** Wait after a no-show. */
  noShowCooldownDays: 3,
  /** An interviewer can mark a no-show only this long after the start. */
  noShowGraceMinutes: 10,
  /** The join link is shown this long before the start. */
  joinWindowMinutes: 10,
  /** The team sees an outcome as overdue after this. */
  outcomeSlaHours: 24,
  /** Minimum gap between reminder nudges to the same student. */
  nudgeGapHours: 24,
  /** Earliest and latest slot start an interviewer can offer (IST, 24h clock). */
  dayStartHour: 9,
  dayEndHour: 19,
  /** "Earn at least one badge in any track by December 2026" — 31 Dec 2026, 23:59 IST. */
  qualifierDeadline: Date.UTC(2026, 11, 31, 18, 29, 59),
  /** Rubric: a pass is suggested at or above this average score (1–4 scale)… */
  rubricPassAverage: 2.75,
  /** …provided no criterion is scored below this. */
  rubricMinScore: 2,
  /** An interviewer's pass rate this many points away from the team's is flagged for calibration. */
  calibrationGapPoints: 25,
  /** Below this many decided interviews, a pass rate is too small a sample to judge. */
  calibrationMinSample: 5,
  /** Demo only: how far the prototype's clock can be moved forward. */
  demoClockMaxDays: 14,
} as const;

export const MS = { MINUTE, HOUR, DAY } as const;
